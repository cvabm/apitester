package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type postmanCollection struct {
	Info     postmanInfo     `json:"info"`
	Item     []postmanItem   `json:"item"`
	Variable []postmanKeyVal `json:"variable"`
}

type postmanInfo struct {
	Name        string `json:"name"`
	Description any    `json:"description"`
	Schema      string `json:"schema"`
}

type postmanItem struct {
	Name        string          `json:"name"`
	Description any             `json:"description"`
	Item        []postmanItem   `json:"item"`
	Request     json.RawMessage `json:"request"`
}

type postmanRequest struct {
	Method      string          `json:"method"`
	Header      []postmanHeader `json:"header"`
	Body        *postmanBody    `json:"body"`
	URL         json.RawMessage `json:"url"`
	Description any             `json:"description"`
	Auth        *postmanAuth    `json:"auth"`
}

type postmanHeader struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled"`
	Enabled  *bool  `json:"enabled"`
}

type postmanBody struct {
	Mode       string              `json:"mode"`
	Raw        string              `json:"raw"`
	Urlencoded []postmanKeyVal     `json:"urlencoded"`
	Formdata   []postmanFormData   `json:"formdata"`
	GraphQL    *postmanGraphQL     `json:"graphql"`
	Options    *postmanBodyOptions `json:"options"`
}

type postmanFormData struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Type     string `json:"type"`
	Disabled bool   `json:"disabled"`
	Enabled  *bool  `json:"enabled"`
}

type postmanGraphQL struct {
	Query     string `json:"query"`
	Variables string `json:"variables"`
}

type postmanBodyOptions struct {
	Raw *struct {
		Language string `json:"language"`
	} `json:"raw"`
}

type postmanKeyVal struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled"`
	Enabled  *bool  `json:"enabled"`
}

type postmanAuth struct {
	Type   string          `json:"type"`
	Bearer []postmanKeyVal `json:"bearer"`
	Basic  []postmanKeyVal `json:"basic"`
}

type postmanURL struct {
	Raw      string          `json:"raw"`
	Protocol string          `json:"protocol"`
	Host     json.RawMessage `json:"host"`
	Path     json.RawMessage `json:"path"`
	Port     string          `json:"port"`
	Query    []postmanKeyVal `json:"query"`
}

func unwrapPostmanRaw(raw []byte) []byte {
	var wrap struct {
		Collection json.RawMessage `json:"collection"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return raw
	}
	inner := bytes.TrimSpace(wrap.Collection)
	if len(inner) == 0 || inner[0] != '{' {
		return raw
	}
	return inner
}

func isJSONArray(raw json.RawMessage) bool {
	raw = bytes.TrimSpace(raw)
	return len(raw) > 0 && raw[0] == '['
}

func isPostmanCollection(raw []byte) bool {
	raw = unwrapPostmanRaw(bytes.TrimSpace(raw))
	var probe struct {
		Info struct {
			Schema string `json:"schema"`
			Name   string `json:"name"`
		} `json:"info"`
		Item     json.RawMessage `json:"item"`
		Requests json.RawMessage `json:"requests"`
	}
	if json.Unmarshal(raw, &probe) != nil || !isJSONArray(probe.Item) {
		return false
	}
	schema := strings.ToLower(probe.Info.Schema)
	if strings.Contains(schema, "postman") || strings.Contains(schema, "collection") {
		return true
	}
	return probe.Info.Name != "" && len(bytes.TrimSpace(probe.Requests)) == 0
}

func parsePostmanCollection(raw []byte) (Profile, error) {
	raw = unwrapPostmanRaw(bytes.TrimSpace(raw))
	var col postmanCollection
	if err := json.Unmarshal(raw, &col); err != nil {
		return Profile{}, fmt.Errorf("invalid postman collection")
	}
	if col.Info.Name == "" && len(col.Item) == 0 {
		return Profile{}, fmt.Errorf("invalid postman collection")
	}
	p := Profile{Headers: map[string]string{}}
	if name := clipRunes(strings.TrimSpace(col.Info.Name), 80); name != "" {
		p.Project = name
	}
	collectPostmanItems(col.Item, nil, &p)
	p.Modules = normalizeModules(p.Modules)
	if vars := postmanVarRows(col.Variable); len(vars) > 0 || strings.TrimSpace(col.Info.Name) != "" {
		name := clipRunes(col.Info.Name, 80)
		if name == "" {
			name = "Postman"
		}
		p.Environments = []Environment{{Name: name, Variables: vars}}
	}
	return p, nil
}

func collectPostmanItems(items []postmanItem, folder []string, p *Profile) {
	for _, it := range items {
		if it.Item != nil {
			next := folder
			if name := strings.TrimSpace(it.Name); name != "" {
				next = append(append([]string{}, folder...), name)
			}
			if path := joinPostmanFolder(next); path != "" {
				p.Modules = append(p.Modules, path)
			}
			collectPostmanItems(it.Item, next, p)
			continue
		}
		req, ok := savedRequestFromPostman(it)
		if !ok {
			continue
		}
		req.Module = joinPostmanFolder(folder)
		req.ID = ""
		req.UpdatedAt = time.Now().UnixMilli()
		p.Requests = append(p.Requests, req)
	}
}

// Each folder name is clipped on its own and the depth is capped, so a deeply
// nested collection keeps whole names all the way down instead of having its
// path cut off partway and an invented parent left behind.
func joinPostmanFolder(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		out = append(out, clipRunes(part, moduleSegMax))
		if len(out) == moduleMaxDepth {
			break
		}
	}
	return strings.Join(out, moduleSep)
}

func savedRequestFromPostman(it postmanItem) (SavedRequest, bool) {
	raw := bytes.TrimSpace(it.Request)
	if len(raw) == 0 || string(raw) == "null" {
		return SavedRequest{}, false
	}
	req := SavedRequest{Kind: "http", AuthType: "none", BodyType: "none"}
	if raw[0] == '"' {
		var url string
		if json.Unmarshal(raw, &url) != nil || strings.TrimSpace(url) == "" {
			return SavedRequest{}, false
		}
		req.Method = "GET"
		req.URL = strings.TrimSpace(url)
		req.BodyType = "none"
	} else {
		var pr postmanRequest
		if json.Unmarshal(raw, &pr) != nil {
			return SavedRequest{}, false
		}
		req.Method = strings.ToUpper(strings.TrimSpace(pr.Method))
		if req.Method == "" {
			req.Method = "GET"
		}
		req.URL = postmanURLString(pr.URL)
		req.Description = postmanText(pr.Description)
		req.AuthType, req.AuthToken, req.AuthUser, req.AuthPass = postmanAuthFields(pr.Auth)
		req.HeaderList = postmanHeaders(pr.Header, req.AuthType)
		req.BodyType, req.Body, req.FormList = convertPostmanBody(pr.Body, req.Method)
	}
	if req.Description == "" {
		req.Description = postmanText(it.Description)
	}
	req.Title = strings.TrimSpace(it.Name)
	req.Name = requestNameFromURL(req.Method, req.URL)
	if req.Title == "" {
		req.Title = req.Name
	}
	return req, true
}

func requestNameFromURL(method, rawURL string) string {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = "GET"
	}
	return method + " " + pathFromRequestURL(rawURL)
}

func pathFromRequestURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "/"
	}
	if i := strings.IndexAny(raw, "?#"); i >= 0 {
		raw = raw[:i]
	}
	if i := strings.Index(raw, "://"); i >= 0 {
		rest := raw[i+3:]
		if j := strings.Index(rest, "/"); j >= 0 {
			if path := rest[j:]; path != "" {
				return path
			}
		}
		return "/"
	}
	if strings.HasPrefix(raw, "/") {
		return raw
	}
	if i := strings.Index(raw, "/"); i >= 0 {
		return raw[i:]
	}
	return "/"
}

func postmanURLString(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	if raw[0] == '"' {
		var s string
		if json.Unmarshal(raw, &s) == nil {
			return strings.TrimSpace(s)
		}
		return ""
	}
	var u postmanURL
	if json.Unmarshal(raw, &u) != nil {
		return ""
	}
	if s := strings.TrimSpace(u.Raw); s != "" {
		return s
	}
	return buildPostmanURL(u)
}

func buildPostmanURL(u postmanURL) string {
	host := joinJSONStringOrArray(u.Host, ".")
	path := joinJSONStringOrArray(u.Path, "/")
	if host == "" && path == "" {
		return ""
	}
	var b strings.Builder
	if strings.Contains(host, "://") {
		b.WriteString(host)
	} else {
		if proto := strings.TrimSpace(u.Protocol); proto != "" {
			b.WriteString(proto)
			b.WriteString("://")
		}
		b.WriteString(host)
		if port := strings.TrimSpace(u.Port); port != "" && !strings.Contains(host, ":") {
			b.WriteByte(':')
			b.WriteString(port)
		}
	}
	if path != "" {
		if !strings.HasPrefix(path, "/") && b.Len() > 0 {
			b.WriteByte('/')
		}
		b.WriteString(path)
	}
	if q := encodePostmanQuery(u.Query); q != "" {
		b.WriteByte('?')
		b.WriteString(q)
	}
	return b.String()
}

func joinJSONStringOrArray(raw json.RawMessage, sep string) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	if raw[0] == '"' {
		var s string
		if json.Unmarshal(raw, &s) == nil {
			return strings.TrimSpace(s)
		}
		return ""
	}
	var parts []string
	if json.Unmarshal(raw, &parts) != nil {
		return ""
	}
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		clean = append(clean, p)
	}
	return strings.Join(clean, sep)
}

func encodePostmanQuery(rows []postmanKeyVal) string {
	var parts []string
	for _, row := range rows {
		if !postmanEnabled(row.Disabled, row.Enabled) {
			continue
		}
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		parts = append(parts, urlQueryEscape(key)+"="+urlQueryEscape(row.Value))
	}
	return strings.Join(parts, "&")
}

func urlQueryEscape(s string) string {
	// Keep {{var}} readable; only encode separators.
	replacer := strings.NewReplacer(" ", "%20", "&", "%26", "=", "%3D", "#", "%23")
	return replacer.Replace(s)
}

func postmanText(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case map[string]any:
		if c, ok := t["content"].(string); ok {
			return strings.TrimSpace(c)
		}
	}
	return ""
}

func postmanEnabled(disabled bool, enabled *bool) bool {
	if enabled != nil {
		return *enabled
	}
	return !disabled
}

func postmanAuthFields(a *postmanAuth) (typ, token, user, pass string) {
	if a == nil {
		return "none", "", "", ""
	}
	switch strings.ToLower(strings.TrimSpace(a.Type)) {
	case "bearer":
		return "bearer", postmanKV(a.Bearer, "token"), "", ""
	case "basic":
		return "basic", "", postmanKV(a.Basic, "username"), postmanKV(a.Basic, "password")
	default:
		return "none", "", "", ""
	}
}

func postmanKV(list []postmanKeyVal, key string) string {
	for _, row := range list {
		if strings.EqualFold(strings.TrimSpace(row.Key), key) {
			return row.Value
		}
	}
	return ""
}

func postmanHeaders(list []postmanHeader, authType string) []HeaderItem {
	skipAuth := authType == "bearer" || authType == "basic"
	out := make([]HeaderItem, 0, len(list))
	for _, h := range list {
		key := strings.TrimSpace(h.Key)
		if key == "" {
			continue
		}
		if skipAuth && strings.EqualFold(key, "Authorization") {
			continue
		}
		out = append(out, HeaderItem{
			Key:     key,
			Value:   h.Value,
			Enabled: postmanEnabled(h.Disabled, h.Enabled),
		})
	}
	return out
}

func postmanVarRows(list []postmanKeyVal) []HeaderItem {
	out := make([]HeaderItem, 0, len(list))
	for _, row := range list {
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		out = append(out, HeaderItem{
			Key:     key,
			Value:   row.Value,
			Enabled: postmanEnabled(row.Disabled, row.Enabled),
		})
	}
	return out
}

func convertPostmanBody(b *postmanBody, method string) (typ, raw string, form []HeaderItem) {
	if b == nil || strings.TrimSpace(b.Mode) == "" {
		if methodOmitsBody(method) {
			return "none", "", nil
		}
		return "json", "", nil
	}
	switch strings.ToLower(strings.TrimSpace(b.Mode)) {
	case "raw":
		return postmanRawBody(b)
	case "urlencoded":
		return "form", "", postmanKeyValRows(b.Urlencoded)
	case "formdata":
		return "form", "", postmanFormDataRows(b.Formdata)
	case "graphql":
		return postmanGraphQLBody(b)
	default:
		if methodOmitsBody(method) {
			return "none", "", nil
		}
		return "json", "", nil
	}
}

func postmanRawBody(b *postmanBody) (string, string, []HeaderItem) {
	lang := ""
	if b.Options != nil && b.Options.Raw != nil {
		lang = strings.ToLower(strings.TrimSpace(b.Options.Raw.Language))
	}
	switch lang {
	case "json":
		return "json", b.Raw, nil
	case "text", "html", "xml", "javascript":
		return "text", b.Raw, nil
	default:
		if looksLikeJSON(b.Raw) {
			return "json", b.Raw, nil
		}
		return "text", b.Raw, nil
	}
}

func postmanGraphQLBody(b *postmanBody) (string, string, []HeaderItem) {
	if b.GraphQL == nil {
		if strings.TrimSpace(b.Raw) != "" {
			if looksLikeJSON(b.Raw) {
				return "json", b.Raw, nil
			}
			return "text", b.Raw, nil
		}
		return "json", "", nil
	}
	payload := map[string]any{"query": b.GraphQL.Query}
	if strings.TrimSpace(b.GraphQL.Variables) != "" {
		var vars any
		if json.Unmarshal([]byte(b.GraphQL.Variables), &vars) == nil {
			payload["variables"] = vars
		} else {
			payload["variables"] = b.GraphQL.Variables
		}
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "text", b.GraphQL.Query, nil
	}
	return "json", string(data), nil
}

func postmanKeyValRows(list []postmanKeyVal) []HeaderItem {
	out := make([]HeaderItem, 0, len(list))
	for _, row := range list {
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		out = append(out, HeaderItem{
			Key:     key,
			Value:   row.Value,
			Enabled: postmanEnabled(row.Disabled, row.Enabled),
		})
	}
	return out
}

func postmanFormDataRows(list []postmanFormData) []HeaderItem {
	out := make([]HeaderItem, 0, len(list))
	for _, row := range list {
		if strings.EqualFold(strings.TrimSpace(row.Type), "file") {
			continue
		}
		key := strings.TrimSpace(row.Key)
		if key == "" {
			continue
		}
		out = append(out, HeaderItem{
			Key:     key,
			Value:   row.Value,
			Enabled: postmanEnabled(row.Disabled, row.Enabled),
		})
	}
	return out
}
