package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Keep the format identifier stable so existing exported catalogs remain readable.
const catalogBundleKind = "ws-desk-catalogs"

type catalogBundle struct {
	Kind     string    `json:"kind"`
	Profiles []Profile `json:"profiles"`
}

func catalogExportFileName(name string) string {
	base := strings.TrimSuffix(profileFileName(name), ".json")
	if base == "" || base == "profile" {
		return "catalog.json"
	}
	return base + "-catalog.json"
}

func catalogBundleFileName() string {
	return "apitest-catalogs.json"
}

func catalogExportProfile(p Profile) Profile {
	if p.Headers == nil {
		p.Headers = map[string]string{}
	}
	if name := profileNameFromURL(p.URL); name != "" {
		p.Name = name
	}
	p.Modules = normalizeModules(p.Modules)
	return p
}

func parseCatalogFile(raw []byte) (Profile, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return Profile{}, fmt.Errorf("文件为空")
	}
	var p Profile
	if err := json.Unmarshal(raw, &p); err != nil {
		return Profile{}, fmt.Errorf("JSON 无效")
	}
	return p, nil
}

func parseImportFile(raw []byte) (Profile, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return Profile{}, fmt.Errorf("文件为空")
	}
	if isPostmanCollection(raw) {
		return parsePostmanCollection(raw)
	}
	if isApizzaProject(raw) {
		return parseApizzaProject(raw)
	}
	if isOpenAPIDocument(raw) {
		return parseOpenAPIDocument(raw)
	}
	return parseCatalogFile(raw)
}

func parseCatalogBundle(raw []byte) ([]Profile, bool) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return nil, false
	}
	var wrap catalogBundle
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return nil, false
	}
	if strings.TrimSpace(wrap.Kind) != catalogBundleKind || len(wrap.Profiles) == 0 {
		return nil, false
	}
	return wrap.Profiles, true
}

func normalizeSavedRequest(r SavedRequest) SavedRequest {
	r.ID = strings.TrimSpace(r.ID)
	r.Name = clipRunes(r.Name, 80)
	r.Title = clipRunes(r.Title, 80)
	r.Description = clipRunes(r.Description, 200)
	r.Module = clipRunes(r.Module, 80)
	r.URL = strings.TrimSpace(r.URL)
	r.Method = strings.TrimSpace(r.Method)
	r.Kind = strings.ToLower(strings.TrimSpace(r.Kind))
	if r.Kind != "http" && r.Kind != "ws" {
		r.Kind = ""
	}
	if r.Name == "" {
		if r.Title != "" {
			r.Name = r.Title
		} else {
			r.Name = "未命名"
		}
	}
	return r
}

func mergeVariables(dst, src []HeaderItem) []HeaderItem {
	seen := make(map[string]int, len(dst)+len(src))
	out := make([]HeaderItem, 0, len(dst)+len(src))
	for _, list := range [][]HeaderItem{dst, src} {
		for _, row := range list {
			key := strings.TrimSpace(row.Key)
			if key == "" {
				continue
			}
			row.Key = key
			if i, ok := seen[key]; ok {
				out[i] = row
				continue
			}
			seen[key] = len(out)
			out = append(out, row)
		}
	}
	return out
}

func mergeImportedCatalog(dst, src Profile) Profile {
	dst.Requests = mergeDedupedRequests(dst.Requests, src.Requests)
	mods := append([]string{}, dst.Modules...)
	mods = append(mods, src.Modules...)
	for _, r := range src.Requests {
		if m := clipRunes(r.Module, 80); m != "" {
			mods = append(mods, m)
		}
	}
	dst.Modules = normalizeModules(mods)
	if strings.TrimSpace(dst.Project) == "" {
		dst.Project = clipRunes(src.Project, 80)
	}
	srcEnvs, srcActive := normalizeEnvironments(src.Environments, src.ActiveEnv, src.VariableList)
	if len(dst.Environments) == 0 && strings.TrimSpace(dst.ActiveEnv) == "" && len(normalizeVarRows(dst.VariableList)) == 0 {
		dst.Environments = srcEnvs
		dst.ActiveEnv = srcActive
	} else {
		dstEnvs, active := normalizeEnvironments(dst.Environments, dst.ActiveEnv, dst.VariableList)
		dst.Environments = mergeEnvironments(dstEnvs, srcEnvs)
		dst.ActiveEnv = active
	}
	dst.VariableList = activeEnvVars(dst.Environments, dst.ActiveEnv)
	return dst
}

func importVarMap(p Profile) map[string]string {
	out := map[string]string{}
	add := func(rows []HeaderItem) {
		for _, row := range rows {
			if k := strings.TrimSpace(row.Key); k != "" {
				out[k] = row.Value
			}
		}
	}
	add(p.VariableList)
	active := strings.TrimSpace(p.ActiveEnv)
	var activeRows []HeaderItem
	for _, e := range p.Environments {
		if active != "" && strings.TrimSpace(e.Name) == active {
			activeRows = e.Variables
			continue
		}
		add(e.Variables)
	}
	add(activeRows)
	return out
}

func substituteImportVars(s string, vars map[string]string) string {
	if s == "" || !strings.Contains(s, "{{") || len(vars) == 0 {
		return s
	}
	keys := make([]string, 0, len(vars))
	for k := range vars {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return len(keys[i]) > len(keys[j]) })
	for _, k := range keys {
		s = strings.ReplaceAll(s, "{{"+k+"}}", vars[k])
		s = strings.ReplaceAll(s, "{{ "+k+" }}", vars[k])
	}
	return s
}

func importHostFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !hasURLScheme(raw) {
		raw = "https://" + strings.TrimPrefix(raw, "//")
	}
	switch strings.ToLower(urlSchemeOf(raw)) {
	case "http", "https", "ws", "wss":
		name := profileNameFromURL(raw)
		if name == "" || strings.ContainsAny(name, "{}") {
			return ""
		}
		return name
	default:
		return ""
	}
}

func fileHostFromProfile(p Profile) string {
	if n := importHostFromURL(p.URL); n != "" {
		return n
	}
	return importHostFromURL(p.Name)
}

func hostFromBaseVars(vars map[string]string) string {
	for _, key := range []string{"baseUrl", "base_url", "baseURL", "host", "url", "Host"} {
		if n := importHostFromURL(vars[key]); n != "" {
			return n
		}
	}
	return ""
}

func requestURLOnHost(resolved, host string) string {
	resolved = strings.TrimSpace(resolved)
	if n := importHostFromURL(resolved); n == host && hasURLScheme(resolved) {
		return resolved
	}
	path := pathFromRequestURL(resolved)
	suffix := ""
	if i := strings.IndexAny(resolved, "?#"); i >= 0 {
		suffix = resolved[i:]
	}
	if path == "" || path == "/" {
		return host + suffix
	}
	return host + path + suffix
}

func envHostPairs(src Profile) [][2]string {
	seen := map[string]struct{}{}
	out := make([][2]string, 0, len(src.Environments))
	add := func(full string) {
		full = strings.TrimSpace(full)
		host := importHostFromURL(full)
		if host == "" {
			return
		}
		if _, ok := seen[host]; ok {
			return
		}
		seen[host] = struct{}{}
		out = append(out, [2]string{host, full})
	}
	add(src.URL)
	for _, e := range src.Environments {
		add(apizzaHostFromVars(e.Variables))
	}
	add(hostFromBaseVars(importVarMap(src)))
	return out
}

func projectImportProfile(src Profile, fallback string) (Profile, error) {
	u := strings.TrimSpace(src.URL)
	name := importHostFromURL(u)
	if name == "" {
		for _, pair := range envHostPairs(src) {
			if pair[0] == "" {
				continue
			}
			name = pair[0]
			if strings.TrimSpace(pair[1]) != "" {
				u = pair[1]
			} else {
				u = pair[0]
			}
			break
		}
	}
	if name == "" {
		name = fallback
	}
	if name == "" {
		return Profile{}, fmt.Errorf("无法从文件判断主机（需要完整 URL 或 baseUrl）")
	}
	if importHostFromURL(u) == "" {
		u = name
	}
	reqs := make([]SavedRequest, 0, len(src.Requests))
	vars := importVarMap(src)
	for _, r := range src.Requests {
		r = normalizeSavedRequest(r)
		resolved := substituteImportVars(r.URL, vars)
		if importHostFromURL(r.URL) == "" && name != "" {
			r.URL = requestURLOnHost(resolved, name)
		}
		reqs = append(reqs, r)
	}
	return Profile{
		Name:         name,
		URL:          u,
		Project:      src.Project,
		Requests:     reqs,
		Modules:      src.Modules,
		Environments: src.Environments,
		VariableList: src.VariableList,
		ActiveEnv:    src.ActiveEnv,
	}, nil
}

func savedRequestKind(r SavedRequest) string {
	if r.Kind == "http" || r.Kind == "ws" {
		return r.Kind
	}
	switch urlSchemeOf(r.URL) {
	case "http", "https":
		return "http"
	default:
		return "ws"
	}
}

func requestDedupeKey(r SavedRequest) string {
	r = normalizeSavedRequest(r)
	title := r.Title
	if title == "" {
		title = r.Name
	}
	extra := r.Name
	if savedRequestKind(r) == "http" {
		extra = strings.ToUpper(strings.TrimSpace(r.Method)) + " " + pathFromRequestURL(r.URL)
	}
	return strings.ToLower(r.Module + "\t" + title + "\t" + extra)
}

func requestRicher(a, b SavedRequest) bool {
	as := len(strings.TrimSpace(a.Example)) + len(strings.TrimSpace(a.Body)) + len(strings.TrimSpace(a.Description))
	bs := len(strings.TrimSpace(b.Example)) + len(strings.TrimSpace(b.Body)) + len(strings.TrimSpace(b.Description))
	return as > bs
}

func mergeDedupedRequests(dst, src []SavedRequest) []SavedRequest {
	byID := make(map[string]int, len(dst)+len(src))
	seen := make(map[string]int, len(dst)+len(src))
	out := make([]SavedRequest, 0, len(dst)+len(src))
	add := func(r SavedRequest) {
		r = normalizeSavedRequest(r)
		if r.ID != "" {
			if i, ok := byID[r.ID]; ok {
				out[i] = r
				return
			}
		}
		key := requestDedupeKey(r)
		if i, ok := seen[key]; ok {
			if requestRicher(r, out[i]) {
				r.ID = out[i].ID
				out[i] = r
			}
			return
		}
		if r.ID == "" {
			r.ID = newRequestID()
		}
		byID[r.ID] = len(out)
		seen[key] = len(out)
		out = append(out, r)
	}
	for _, r := range dst {
		add(r)
	}
	for _, r := range src {
		add(r)
	}
	return out
}

func mergeProjectCatalogs(dst, src Profile) Profile {
	if strings.TrimSpace(dst.URL) == "" && strings.TrimSpace(src.URL) != "" {
		dst.Name = src.Name
		dst.URL = src.URL
		dst.Protocol = src.Protocol
		dst.Method = src.Method
		dst.Headers = src.Headers
		dst.HeaderList = src.HeaderList
		dst.AuthType = src.AuthType
		dst.AuthToken = src.AuthToken
		dst.AuthUser = src.AuthUser
		dst.AuthPass = src.AuthPass
		dst.BodyType = src.BodyType
		dst.Body = src.Body
		dst.FormList = src.FormList
		dst.Reconnect = src.Reconnect
		dst.PingSec = src.PingSec
		dst.NoFollowRedirects = src.NoFollowRedirects
		dst.InsecureSkipVerify = src.InsecureSkipVerify
	}
	dst.Requests = mergeDedupedRequests(dst.Requests, src.Requests)
	mods := append([]string{}, dst.Modules...)
	mods = append(mods, src.Modules...)
	dst.Modules = normalizeModules(mods)
	dstEnvs, active := normalizeEnvironments(dst.Environments, dst.ActiveEnv, dst.VariableList)
	srcEnvs, _ := normalizeEnvironments(src.Environments, src.ActiveEnv, src.VariableList)
	dst.Environments = mergeEnvironments(dstEnvs, srcEnvs)
	dst.ActiveEnv = active
	dst.VariableList = activeEnvVars(dst.Environments, dst.ActiveEnv)
	if strings.TrimSpace(dst.Project) == "" {
		dst.Project = src.Project
	}
	return dst
}

func splitImportByHost(src Profile) ([]Profile, error) {
	vars := importVarMap(src)
	fallback := fileHostFromProfile(src)
	if fallback == "" {
		fallback = hostFromBaseVars(vars)
	}
	if strings.TrimSpace(src.Project) != "" {
		p, err := projectImportProfile(src, fallback)
		if err != nil {
			return nil, err
		}
		return []Profile{p}, nil
	}
	groups := map[string][]SavedRequest{}
	hostURL := map[string]string{}
	order := make([]string, 0, 4)
	add := func(host string, r SavedRequest) {
		if _, ok := groups[host]; !ok {
			order = append(order, host)
		}
		groups[host] = append(groups[host], r)
	}
	for _, r := range src.Requests {
		r = normalizeSavedRequest(r)
		resolved := substituteImportVars(r.URL, vars)
		host := importHostFromURL(resolved)
		if host == "" {
			host = fallback
		}
		if host == "" {
			continue
		}
		if importHostFromURL(r.URL) == "" {
			r.URL = requestURLOnHost(resolved, host)
		}
		if _, ok := hostURL[host]; !ok && importHostFromURL(resolved) == host {
			hostURL[host] = resolved
		}
		add(host, r)
	}
	if len(order) == 0 {
		if fallback == "" {
			return nil, fmt.Errorf("无法从文件判断主机（需要完整 URL 或 baseUrl）")
		}
		order = []string{fallback}
		groups[fallback] = nil
	}
	out := make([]Profile, 0, len(order))
	for _, host := range order {
		u := host
		if full := strings.TrimSpace(hostURL[host]); importHostFromURL(full) == host {
			u = full
		} else if full := strings.TrimSpace(src.URL); importHostFromURL(full) == host {
			u = full
		}
		active := src.ActiveEnv
		varsList := src.VariableList
		for _, e := range src.Environments {
			if importHostFromURL(apizzaHostFromVars(e.Variables)) == host {
				active = e.Name
				varsList = e.Variables
				break
			}
		}
		out = append(out, Profile{
			Name:         host,
			URL:          u,
			Project:      src.Project,
			Requests:     groups[host],
			Modules:      src.Modules,
			Environments: src.Environments,
			VariableList: varsList,
			ActiveEnv:    active,
		})
	}
	return out, nil
}

func pickPrimaryImport(list []Profile) Profile {
	if len(list) == 0 {
		return Profile{}
	}
	best := 0
	for i := 1; i < len(list); i++ {
		if len(list[i].Requests) > len(list[best].Requests) {
			best = i
		}
	}
	return list[best]
}

func (a *App) loadOrCreateProfile(name, url, project string) (Profile, error) {
	dst, err := a.loadProfileByName(name)
	if err == nil {
		return dst, nil
	}
	if !os.IsNotExist(err) {
		return Profile{}, err
	}
	if strings.TrimSpace(url) == "" {
		url = name
	}
	return Profile{Name: name, URL: url, Project: clipRunes(project, 80), Headers: map[string]string{}}, nil
}

func (a *App) exportCatalog(p Profile) (bool, error) {
	if a.ctx == nil {
		return false, fmt.Errorf("应用尚未就绪")
	}
	p = catalogExportProfile(p)
	if p.Name == "" && p.URL == "" && len(p.Requests) == 0 {
		return false, fmt.Errorf("没有可导出的内容")
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出接口目录",
		DefaultFilename: catalogExportFileName(p.Name),
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(path) == "" {
		return false, nil
	}
	if !strings.HasSuffix(strings.ToLower(path), ".json") {
		path += ".json"
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return false, err
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) exportAllCatalogs() (bool, error) {
	if a.ctx == nil {
		return false, fmt.Errorf("应用尚未就绪")
	}
	a.profileMu.Lock()
	list, err := a.loadProfiles()
	a.profileMu.Unlock()
	if err != nil {
		return false, err
	}
	out := make([]Profile, 0, len(list))
	for _, p := range list {
		p = catalogExportProfile(p)
		if p.Name == "" && p.URL == "" && len(p.Requests) == 0 {
			continue
		}
		out = append(out, p)
	}
	if len(out) == 0 {
		return false, fmt.Errorf("没有可导出的内容")
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出全部接口",
		DefaultFilename: catalogBundleFileName(),
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(path) == "" {
		return false, nil
	}
	if !strings.HasSuffix(strings.ToLower(path), ".json") {
		path += ".json"
	}
	data, err := json.MarshalIndent(catalogBundle{Kind: catalogBundleKind, Profiles: out}, "", "  ")
	if err != nil {
		return false, err
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) importCatalog() (*Profile, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("应用尚未就绪")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "导入接口目录、Postman、ApiZza 或 OpenAPI",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON / YAML / OpenAPI", Pattern: "*.json;*.yaml;*.yml"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(path) == "" {
		return nil, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	a.profileMu.Lock()
	defer a.profileMu.Unlock()
	return a.applyImportedFile(raw)
}

func (a *App) applyImportedFile(raw []byte) (*Profile, error) {
	if list, ok := parseCatalogBundle(raw); ok {
		return a.applyImportedProfiles(list)
	}
	src, err := parseImportFile(raw)
	if err != nil {
		return nil, err
	}
	return a.applyImportedProfiles([]Profile{src})
}

func (a *App) applyImportedProfiles(list []Profile) (*Profile, error) {
	var buckets []Profile
	for _, src := range list {
		parts, err := splitImportByHost(src)
		if err != nil {
			return nil, err
		}
		buckets = append(buckets, parts...)
	}
	if len(buckets) == 0 {
		return nil, fmt.Errorf("没有可导入的内容")
	}
	focus := pickPrimaryImport(buckets).Name
	var primary Profile
	for _, srcHost := range buckets {
		dst, err := a.loadOrCreateProfile(srcHost.Name, srcHost.URL, srcHost.Project)
		if err != nil {
			return nil, err
		}
		merged := mergeImportedCatalog(dst, srcHost)
		if err := a.saveProfileFile(merged); err != nil {
			return nil, err
		}
		if srcHost.Name == focus {
			primary = merged
		}
	}
	if primary.Name != "" {
		if got, err := a.loadProfileByName(primary.Name); err == nil {
			primary = got
		}
	}
	return &primary, nil
}
