package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

func isOpenAPIDocument(raw []byte) bool {
	doc, ok := decodeSpecDocument(raw)
	if !ok {
		return false
	}
	if s, _ := doc["openapi"].(string); strings.HasPrefix(strings.TrimSpace(s), "3") {
		return true
	}
	if s, _ := doc["swagger"].(string); strings.HasPrefix(strings.TrimSpace(s), "2.") {
		return true
	}
	return false
}

func parseOpenAPIDocument(raw []byte) (Profile, error) {
	return parseOpenAPIDocumentFrom(raw, "")
}

// parseOpenAPIDocumentFrom resolves a relative or missing server URL against
// sourceURL (the address the document was downloaded from). An empty sourceURL
// keeps the strict local-file behaviour.
func parseOpenAPIDocumentFrom(raw []byte, sourceURL string) (Profile, error) {
	doc, ok := decodeSpecDocument(raw)
	if !ok || !isOpenAPIDocument(raw) {
		return Profile{}, fmt.Errorf("invalid openapi document")
	}
	base := openAPIServerURL(doc, sourceURL)
	if strings.TrimSpace(base) == "" {
		base = openAPIOriginFallback(doc, sourceURL)
	}
	if strings.TrimSpace(base) == "" {
		return Profile{}, fmt.Errorf("OpenAPI 没有 servers 或 host，无法判断主机")
	}
	info, _ := asMap(doc["info"])
	title := clipRunes(strings.TrimSpace(specString(info["title"])), 80)
	if title == "" {
		title = "OpenAPI"
	}
	globalSecurity := doc["security"]
	schemes := openAPISecuritySchemes(doc)
	paths, _ := asMap(doc["paths"])
	pathKeys := make([]string, 0, len(paths))
	for path := range paths {
		pathKeys = append(pathKeys, path)
	}
	sort.Strings(pathKeys)

	p := Profile{
		Project: title,
		Headers: map[string]string{},
		Environments: []Environment{{
			Name:      "默认",
			Variables: []HeaderItem{{Key: "BASE_URL", Value: strings.TrimRight(base, "/"), Enabled: true}},
		}},
		ActiveEnv: "默认",
	}
	for _, path := range pathKeys {
		item, _ := asMap(paths[path])
		if item == nil {
			continue
		}
		pathParams := specParamList(item["parameters"])
		for _, method := range []string{"get", "post", "put", "patch", "delete", "head", "options"} {
			op, _ := asMap(item[method])
			if op == nil {
				continue
			}
			req := openAPIOperation(doc, base, path, strings.ToUpper(method), op, append(pathParams, specParamList(op["parameters"])...), globalSecurity, schemes)
			p.Requests = append(p.Requests, req)
			if req.Module != "" {
				p.Modules = append(p.Modules, req.Module)
			}
		}
	}
	p.Modules = normalizeModules(p.Modules)
	if len(p.Requests) == 0 {
		return Profile{}, fmt.Errorf("OpenAPI 里没有接口")
	}
	return p, nil
}

func openAPIOperation(doc map[string]any, base, path, method string, op map[string]any, params []map[string]any, globalSecurity any, schemes map[string]map[string]any) SavedRequest {
	resolved := make([]map[string]any, 0, len(params))
	for _, param := range params {
		resolved = append(resolved, resolveSpecMap(doc, param, 0))
	}
	query := url.Values{}
	var headers []HeaderItem
	var form []HeaderItem
	for _, param := range resolved {
		name := strings.TrimSpace(specString(param["name"]))
		if name == "" {
			continue
		}
		where := strings.ToLower(specString(param["in"]))
		value := specExampleString(param)
		switch where {
		case "query":
			query.Add(name, value)
		case "path":
			if value != "" {
				path = strings.ReplaceAll(path, "{"+name+"}", value)
			}
		case "formdata":
			form = append(form, HeaderItem{Key: name, Value: value, Enabled: true})
		case "header":
			if strings.EqualFold(name, "content-type") || strings.EqualFold(name, "authorization") {
				continue
			}
			headers = append(headers, HeaderItem{Key: name, Value: value, Enabled: true})
		}
	}
	bodyType, body := openAPIRequestBody(doc, op)
	example := openAPIResponseExample(doc, op)
	title := strings.TrimSpace(specString(op["summary"]))
	if title == "" {
		title = strings.TrimSpace(specString(op["operationId"]))
	}
	module := ""
	if tags, ok := op["tags"].([]any); ok && len(tags) > 0 {
		module = clipRunes(strings.TrimSpace(specString(tags[0])), 80)
	}
	authType := openAPIAuthType(op["security"], globalSecurity, schemes)
	applyOpenAPIAPIKey(op["security"], globalSecurity, schemes, query, &headers)
	full := strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
	if enc := query.Encode(); enc != "" {
		full += "?" + enc
	}
	if len(form) > 0 && strings.TrimSpace(body) == "" {
		bodyType = "form"
	}
	return SavedRequest{
		Name:        clipRunes(method+" "+path, 80),
		Title:       clipRunes(title, 80),
		Description: clipRunes(strings.TrimSpace(specString(op["description"])), 200),
		Module:      module,
		Kind:        "http",
		URL:         full,
		Method:      method,
		HeaderList:  headers,
		AuthType:    authType,
		BodyType:    bodyType,
		Body:        body,
		FormList:    form,
		Example:     example,
	}
}

// openAPIServerURL resolves the first usable server URL. A relative server URL
// (common in Spring/Gateway documents) is resolved against sourceURL per
// RFC 3986, because the spec resolves it against the document location.
func openAPIServerURL(doc map[string]any, sourceURL string) string {
	if servers, ok := doc["servers"].([]any); ok {
		for _, item := range servers {
			server, _ := asMap(item)
			raw := strings.TrimSpace(specString(server["url"]))
			if raw == "" {
				continue
			}
			if vars, ok := asMap(server["variables"]); ok {
				for name, spec := range vars {
					variable, _ := asMap(spec)
					def := specString(variable["default"])
					raw = strings.ReplaceAll(raw, "{"+name+"}", def)
				}
			}
			if strings.Contains(raw, "{") {
				continue
			}
			if resolved, ok := resolveServerURL(raw, sourceURL); ok {
				return resolved
			}
		}
	}
	host := strings.TrimSpace(specString(doc["host"]))
	if host == "" {
		return ""
	}
	scheme := "https"
	if schemes, ok := doc["schemes"].([]any); ok {
		for _, item := range schemes {
			s := strings.ToLower(specString(item))
			if s == "http" || s == "https" {
				scheme = s
				break
			}
		}
	}
	basePath := strings.TrimSpace(specString(doc["basePath"]))
	if basePath == "" {
		basePath = "/"
	}
	return strings.TrimRight(scheme+"://"+host+strings.TrimRight(basePath, "/"), "/")
}

// resolveServerURL turns a spec server URL into an absolute http(s) base.
// Without a usable sourceURL only scheme-qualified URLs resolve, which keeps
// local-file imports from inventing a host.
func resolveServerURL(raw, sourceURL string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	src, srcErr := url.Parse(strings.TrimSpace(sourceURL))
	srcOK := srcErr == nil && src != nil && src.Host != ""
	if hasURLScheme(raw) {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return "", false
		}
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
		default:
			return "", false
		}
		return strings.TrimRight(u.String(), "/"), true
	}
	if !srcOK {
		if strings.HasPrefix(raw, "/") {
			return "", false
		}
		raw = "https://" + strings.TrimPrefix(raw, "//")
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return "", false
		}
		return strings.TrimRight(u.String(), "/"), true
	}
	ref, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	// A document URL points at a file; relative servers resolve against its
	// directory, exactly as a browser would resolve a relative link.
	base := *src
	if !strings.HasSuffix(base.Path, "/") {
		base.Path = base.Path[:strings.LastIndex(base.Path, "/")+1]
	}
	base.RawQuery = ""
	base.Fragment = ""
	out := base.ResolveReference(ref)
	switch strings.ToLower(out.Scheme) {
	case "http", "https":
	default:
		return "", false
	}
	if out.Host == "" {
		return "", false
	}
	return strings.TrimRight(out.String(), "/"), true
}

// openAPIOriginFallback uses the download address as the host when the document
// declares no server at all, so relative-path documents still import.
func openAPIOriginFallback(doc map[string]any, sourceURL string) string {
	if strings.TrimSpace(sourceURL) == "" {
		return ""
	}
	u, err := url.Parse(strings.TrimSpace(sourceURL))
	if err != nil || u.Host == "" {
		return ""
	}
	origin := u.Scheme + "://" + u.Host
	basePath := strings.TrimSpace(specString(doc["basePath"]))
	if basePath != "" && basePath != "/" {
		return strings.TrimRight(origin+"/"+strings.Trim(basePath, "/"), "/")
	}
	return strings.TrimRight(origin, "/")
}

func openAPISecuritySchemes(doc map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	components, _ := asMap(doc["components"])
	schemes, _ := asMap(components["securitySchemes"])
	if schemes == nil {
		schemes, _ = asMap(doc["securityDefinitions"])
	}
	for name, spec := range schemes {
		if item, ok := asMap(spec); ok {
			out[name] = resolveSpecMap(doc, item, 0)
		}
	}
	return out
}

func applyOpenAPIAPIKey(opSecurity, global any, schemes map[string]map[string]any, query url.Values, headers *[]HeaderItem) {
	chosen := opSecurity
	if chosen == nil {
		chosen = global
	}
	list, ok := chosen.([]any)
	if !ok {
		return
	}
	for _, item := range list {
		req, _ := asMap(item)
		for name := range req {
			scheme := schemes[name]
			if strings.ToLower(specString(scheme["type"])) != "apikey" {
				continue
			}
			keyName := strings.TrimSpace(specString(scheme["name"]))
			if keyName == "" {
				keyName = name
			}
			where := strings.ToLower(specString(scheme["in"]))
			if where == "query" {
				query.Set(keyName, "")
				continue
			}
			*headers = append(*headers, HeaderItem{Key: keyName, Value: "", Enabled: true})
		}
	}
}

func openAPIAuthType(opSecurity, global any, schemes map[string]map[string]any) string {
	chosen := opSecurity
	if chosen == nil {
		chosen = global
	}
	list, ok := chosen.([]any)
	if !ok {
		return "none"
	}
	for _, item := range list {
		req, _ := asMap(item)
		for name := range req {
			scheme := schemes[name]
			kind := strings.ToLower(specString(scheme["type"]))
			httpScheme := strings.ToLower(specString(scheme["scheme"]))
			if kind == "http" && httpScheme == "bearer" {
				return "bearer"
			}
			if kind == "http" && httpScheme == "basic" {
				return "basic"
			}
			if kind == "basic" {
				return "basic"
			}
		}
	}
	return "none"
}

func openAPIRequestBody(doc map[string]any, op map[string]any) (string, string) {
	if params := specParamList(op["parameters"]); len(params) > 0 {
		for _, param := range params {
			param = resolveSpecMap(doc, param, 0)
			if strings.EqualFold(specString(param["in"]), "body") {
				raw := specExampleString(param)
				if raw == "" {
					raw = specExampleString(param["schema"])
				}
				if strings.TrimSpace(raw) == "" {
					return "json", ""
				}
				return bodyTypeFromExample(raw), raw
			}
		}
	}
	body := resolveSpecMap(doc, asMapValue(op["requestBody"]), 0)
	content, _ := asMap(body["content"])
	media, raw := preferredMedia(content)
	if media == nil && strings.TrimSpace(raw) == "" {
		return "none", ""
	}
	example := specExampleString(media)
	if example == "" {
		example = specExampleString(resolveSpecMap(doc, asMapValue(media["schema"]), 0))
	}
	switch {
	case strings.Contains(raw, "json"):
		return "json", example
	case strings.Contains(raw, "xml"):
		return "xml", example
	case strings.Contains(raw, "form-urlencoded"), strings.Contains(raw, "form-data"):
		return "form", example
	case strings.Contains(raw, "text"):
		return "text", example
	default:
		if example == "" {
			return "none", ""
		}
		return bodyTypeFromExample(example), example
	}
}

func openAPIResponseExample(doc map[string]any, op map[string]any) string {
	responses, _ := asMap(op["responses"])
	if len(responses) == 0 {
		return ""
	}
	codes := make([]string, 0, len(responses))
	for code := range responses {
		codes = append(codes, code)
	}
	sort.Slice(codes, func(i, j int) bool {
		return responseRank(codes[i]) < responseRank(codes[j])
	})
	for _, code := range codes {
		if responseRank(code) >= 300 {
			continue
		}
		resp := resolveSpecMap(doc, asMapValue(responses[code]), 0)
		content, _ := asMap(resp["content"])
		media, _ := preferredMedia(content)
		var example string
		if media != nil {
			example = specExampleString(media)
		}
		if example == "" && media != nil {
			example = specExampleString(resolveSpecMap(doc, asMapValue(media["schema"]), 0))
		}
		if example == "" {
			if schema, ok := asMap(resp["schema"]); ok {
				example = specExampleString(resolveSpecMap(doc, schema, 0))
			}
		}
		if strings.TrimSpace(example) != "" {
			return example
		}
	}
	return ""
}

func responseRank(code string) int {
	code = strings.TrimSpace(code)
	if code == "200" {
		return 0
	}
	if code == "201" {
		return 1
	}
	if strings.HasPrefix(code, "2") {
		return 2
	}
	if code == "default" {
		return 3
	}
	return 9
}

func preferredMedia(content map[string]any) (map[string]any, string) {
	if len(content) == 0 {
		return nil, ""
	}
	order := []string{"application/json", "application/xml", "text/plain", "application/x-www-form-urlencoded"}
	for _, want := range order {
		for key, value := range content {
			if strings.Contains(strings.ToLower(key), want) || strings.HasPrefix(strings.ToLower(key), want) {
				media, _ := asMap(value)
				return media, strings.ToLower(key)
			}
		}
	}
	for key, value := range content {
		media, _ := asMap(value)
		return media, strings.ToLower(key)
	}
	return nil, ""
}

func bodyTypeFromExample(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "none"
	}
	if strings.HasPrefix(raw, "{") || strings.HasPrefix(raw, "[") {
		return "json"
	}
	return "text"
}

func specExampleString(v any) string {
	node, _ := asMap(v)
	if node == nil {
		return specJSON(v)
	}
	if example, ok := node["example"]; ok && example != nil {
		return specJSON(example)
	}
	if examples, ok := asMap(node["examples"]); ok {
		for _, item := range examples {
			ex, _ := asMap(item)
			if ex == nil {
				if s := specJSON(item); s != "" {
					return s
				}
				continue
			}
			if value, ok := ex["value"]; ok {
				return specJSON(value)
			}
		}
	}
	if schema, ok := asMap(node["schema"]); ok {
		if s := specExampleString(schema); s != "" {
			return s
		}
	}
	return ""
}

func specJSON(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func specParamList(v any) []map[string]any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if m, ok := asMap(item); ok {
			out = append(out, m)
		}
	}
	return out
}

func resolveSpecMap(doc map[string]any, node map[string]any, depth int) map[string]any {
	if node == nil || depth > 6 {
		return node
	}
	ref := strings.TrimSpace(specString(node["$ref"]))
	if ref == "" || !strings.HasPrefix(ref, "#/") {
		return node
	}
	cur := any(doc)
	for _, part := range strings.Split(strings.TrimPrefix(ref, "#/"), "/") {
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		m, ok := asMap(cur)
		if !ok {
			return node
		}
		cur = m[part]
	}
	target, ok := asMap(cur)
	if !ok {
		return node
	}
	return resolveSpecMap(doc, target, depth+1)
}

func asMapValue(v any) map[string]any {
	m, _ := asMap(v)
	return m
}

func asMap(v any) (map[string]any, bool) {
	switch t := v.(type) {
	case map[string]any:
		return t, true
	case map[any]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[fmt.Sprint(k)] = val
		}
		return out, true
	default:
		return nil, false
	}
}

func specString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	default:
		return ""
	}
}

func decodeSpecDocument(raw []byte) (map[string]any, bool) {
	raw = stripBOM(bytes.TrimSpace(raw))
	if len(raw) == 0 {
		return nil, false
	}
	var doc map[string]any
	if raw[0] == '{' {
		if json.Unmarshal(raw, &doc) != nil || doc == nil {
			return nil, false
		}
		return doc, true
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil || doc == nil {
		return nil, false
	}
	return doc, true
}
