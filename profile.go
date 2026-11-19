package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (a *App) ensureServers() error {
	return os.MkdirAll(a.serversDir(), 0o755)
}

func parseDialishURL(raw string) *url.URL {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if !hasURLScheme(raw) {
		raw = "ws://" + strings.TrimPrefix(raw, "//")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil
	}
	return u
}

func defaultPort(scheme string) string {
	switch strings.ToLower(scheme) {
	case "http", "ws":
		return "80"
	case "https", "wss":
		return "443"
	default:
		return ""
	}
}

// urlHostname is the request host (IP or domain), without port or scheme.
func urlHostname(raw string) string {
	u := parseDialishURL(raw)
	if u == nil {
		return ""
	}
	return strings.TrimSpace(u.Hostname())
}

// urlHostPort is host[:port], omitting the scheme's default port.
func urlHostPort(raw string) string {
	u := parseDialishURL(raw)
	if u == nil {
		return ""
	}
	host := strings.TrimSpace(u.Hostname())
	if host == "" {
		return ""
	}
	port := u.Port()
	if port == "" || port == defaultPort(u.Scheme) {
		return host
	}
	if strings.Contains(host, ":") {
		return "[" + host + "]:" + port
	}
	return host + ":" + port
}

// profileNameFromURL is "scheme://host[:port]". Missing scheme defaults to ws.
func profileNameFromURL(raw string) string {
	host := urlHostPort(raw)
	if host == "" {
		return ""
	}
	scheme := "ws"
	if hasURLScheme(raw) {
		if s := urlSchemeOf(raw); s != "" {
			scheme = s
		}
	}
	return scheme + "://" + host
}

func profileFileName(name string) string {
	name = strings.TrimSpace(name)
	if i := strings.Index(name, "://"); i > 0 {
		scheme := strings.ToLower(strings.TrimSpace(name[:i]))
		host := strings.TrimSpace(name[i+3:])
		if scheme != "" && host != "" {
			return sanitizeName(scheme) + "-" + sanitizeName(host) + ".json"
		}
	}
	return sanitizeName(name) + ".json"
}

// profileStorageFileName uses the project name for on-disk storage. The URL
// remains in Profile.Name so connections and requests can still be addressed
// by their scheme and host.
func profileStorageFileName(p Profile) string {
	if project := strings.TrimSpace(p.Project); project != "" {
		return encodeProjectFileName(project) + ".json"
	}
	return profileFileName(p.Name)
}

// encodeProjectFileName keeps ordinary project names readable while escaping
// every Windows-unsafe or ambiguous character reversibly. Unlike sanitizeName,
// slash/colon/etc. project names cannot collapse onto the same file name.
func encodeProjectFileName(project string) string {
	project = strings.TrimSpace(project)
	if project == "" {
		return "project"
	}
	runes := []rune(project)
	var b strings.Builder
	for i, r := range runes {
		unsafe := r < 0x20 || strings.ContainsRune(`<>:"/\\|?*~`, r)
		if i == len(runes)-1 && (r == '.' || r == ' ') {
			unsafe = true
		}
		if unsafe {
			for _, raw := range []byte(string(r)) {
				fmt.Fprintf(&b, "~%02X", raw)
			}
			continue
		}
		b.WriteRune(r)
	}
	encoded := b.String()
	stem := encoded
	if i := strings.IndexByte(stem, '.'); i >= 0 {
		stem = stem[:i]
	}
	switch strings.ToUpper(stem) {
	case "CON", "PRN", "AUX", "NUL",
		"COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
		"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9":
		encoded = "~00" + encoded
	}
	return encoded
}

func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".apitester-profile-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func (a *App) saveProfileFile(p Profile) error {
	if err := a.ensureServers(); err != nil {
		return err
	}
	path := filepath.Join(a.serversDir(), profileStorageFileName(p))
	if strings.TrimSpace(p.Project) != "" {
		if raw, err := os.ReadFile(path); err == nil {
			var existing Profile
			if err := json.Unmarshal(raw, &existing); err != nil {
				return fmt.Errorf("existing project file %q is invalid: %w", filepath.Base(path), err)
			}
			existingProject := strings.TrimSpace(existing.Project)
			project := strings.TrimSpace(p.Project)
			if existingProject != "" && existingProject != project {
				return fmt.Errorf("project file name conflict: %q and %q", existingProject, project)
			}
			if name := profileNameFromURL(existing.URL); name != "" {
				existing.Name = name
			}
			if existing.Name != "" && existing.Name != p.Name && existingProject == project {
				p = mergeProjectCatalogs(existing, p)
			}
		} else if !os.IsNotExist(err) {
			return err
		}
	}
	if p.Headers == nil {
		p.Headers = map[string]string{}
	}
	// A request names its folder, so saving one is also how that folder comes
	// to exist. Both the request and the folder list are normalised, or the two
	// would spell the same path differently and the request would fall out of
	// its folder.
	mods := append([]string{}, p.Modules...)
	for i := range p.Requests {
		m := normalizeModulePath(p.Requests[i].Module)
		p.Requests[i].Module = m
		if m != "" {
			mods = append(mods, m)
		}
	}
	p.Modules = normalizeModules(mods)
	p = finishProfileEnvs(p)
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(path, data, 0o644)
}

func (a *App) loadProfiles() ([]Profile, error) {
	if err := a.ensureServers(); err != nil {
		return nil, err
	}
	_ = a.migrateLegacyNamedProfiles()
	entries, err := os.ReadDir(a.serversDir())
	if err != nil {
		return nil, err
	}
	var list []Profile
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(a.serversDir(), e.Name()))
		if err != nil {
			a.profileWarnings = append(a.profileWarnings, fmt.Sprintf("%s 读取失败: %v", e.Name(), err))
			continue
		}
		var p Profile
		if err := json.Unmarshal(raw, &p); err != nil {
			a.profileWarnings = append(a.profileWarnings, fmt.Sprintf("%s 格式错误: %v", e.Name(), err))
			continue
		}
		if name := profileNameFromURL(p.URL); name != "" {
			p.Name = name
		} else if p.Name == "" {
			p.Name = strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		}
		if p.Headers == nil {
			p.Headers = map[string]string{}
		}
		list = append(list, p)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	return list, nil
}

// migrateLegacyNamedProfiles rewrites old named or host-only presets to scheme://host[:port] files.
func (a *App) migrateLegacyNamedProfiles() error {
	dir := a.serversDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".json") {
			continue
		}
		path := filepath.Join(dir, e.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var p Profile
		if err := json.Unmarshal(raw, &p); err != nil {
			continue
		}
		if name := profileNameFromURL(p.URL); name != "" {
			p.Name = name
		}
		want := profileStorageFileName(p)
		if strings.EqualFold(e.Name(), want) {
			continue
		}
		if err := a.saveProfileFile(p); err != nil {
			continue
		}
		if !strings.EqualFold(e.Name(), want) {
			_ = os.Remove(path)
		}
	}
	return nil
}

func (a *App) deleteProfile(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("名称不能为空")
	}
	if n := profileNameFromURL(name); n != "" {
		name = n
	}
	dir, err := filepath.Abs(a.serversDir())
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	p, loadErr := a.loadProfileByName(name)
	fileName := profileFileName(name)
	if loadErr == nil {
		fileName = profileStorageFileName(p)
	}
	path, err := filepath.Abs(filepath.Join(dir, fileName))
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(dir, path)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
		return fmt.Errorf("invalid profile")
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func sanitizeName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "profile"
	}
	repl := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "-", "?", "-", "\"", "", "<", "", ">", "", "|", "-")
	return repl.Replace(s)
}

func resolveProfileName(hint string) string {
	hint = strings.TrimSpace(hint)
	if hint == "" {
		return ""
	}
	if name := profileNameFromURL(hint); name != "" {
		return name
	}
	return hint
}

func newRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func (a *App) loadProfileByName(name string) (Profile, error) {
	name = resolveProfileName(name)
	if name == "" {
		return Profile{}, fmt.Errorf("需要项目配置")
	}
	if err := a.ensureServers(); err != nil {
		return Profile{}, err
	}
	list, err := a.loadProfiles()
	if err != nil {
		return Profile{}, err
	}
	for _, p := range list {
		if p.Name == name {
			return p, nil
		}
	}
	return Profile{}, os.ErrNotExist
}

// A module is a path, so the stored list has to agree with the tree the UI
// draws: every ancestor of a listed path is itself listed, and a parent always
// comes before its children. Doing it here means an import, an old file, or a
// hand-edited one all come back in the same shape.
func normalizeModules(list []string) []string {
	if list == nil {
		return nil
	}
	seen := make(map[string]struct{}, len(list))
	out := make([]string, 0, len(list))
	var add func(path string)
	add = func(path string) {
		path = normalizeModulePath(path)
		if path == "" {
			return
		}
		parts := strings.Split(path, moduleSep)
		for i := 1; i <= len(parts); i++ {
			parent := strings.Join(parts[:i], moduleSep)
			if _, ok := seen[parent]; ok {
				continue
			}
			seen[parent] = struct{}{}
			out = append(out, parent)
		}
	}
	for _, name := range list {
		add(name)
	}
	return out
}

func (a *App) mergeProfileRequests(p Profile) Profile {
	needReq := p.Requests == nil
	needMod := p.Modules == nil
	needEnv := p.Environments == nil
	if !needReq && !needMod && !needEnv {
		p.Modules = normalizeModules(p.Modules)
		return p
	}
	existing, err := a.loadProfileByName(p.Name)
	if err != nil {
		p.Modules = normalizeModules(p.Modules)
		return p
	}
	if needReq {
		p.Requests = existing.Requests
	}
	if needMod {
		p.Modules = existing.Modules
	}
	if needEnv {
		p.Environments = existing.Environments
		if p.ActiveEnv == "" {
			p.ActiveEnv = existing.ActiveEnv
		}
	}
	p.Modules = normalizeModules(p.Modules)
	return p
}

func upsertSavedRequest(list []SavedRequest, req SavedRequest) ([]SavedRequest, SavedRequest) {
	if req.ID != "" {
		for i, r := range list {
			if r.ID == req.ID {
				list[i] = req
				return list, req
			}
		}
	}
	for i, r := range list {
		if r.Name == req.Name {
			if req.ID == "" {
				req.ID = r.ID
			}
			list[i] = req
			return list, req
		}
	}
	if req.ID == "" {
		req.ID = newRequestID()
	}
	return append(list, req), req
}

// A module is a path ("用户 / 登录"), so it is clipped per segment rather than as
// one string: cutting the whole path at 80 runes would sever it mid-way and
// invent a parent folder nobody created. Each segment is bounded instead, and
// the depth is capped so a hand-written path cannot grow without limit.
const (
	moduleSep      = " / "
	moduleSegMax   = 40
	moduleMaxDepth = 6
)

func normalizeModulePath(s string) string {
	parts := strings.Split(strings.TrimSpace(s), "/")
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

func clipRunes(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 {
		return s
	}
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

func (a *App) saveRequestOnProfile(profileHint string, req SavedRequest) (SavedRequest, error) {
	req.Name = clipRunes(req.Name, 80)
	if req.Name == "" {
		return SavedRequest{}, fmt.Errorf("名称不能为空")
	}
	req.Title = clipRunes(req.Title, 80)
	req.Description = clipRunes(req.Description, 200)
	req.Module = normalizeModulePath(req.Module)
	if req.UpdatedAt <= 0 {
		req.UpdatedAt = time.Now().UnixMilli()
	}
	req.URL = strings.TrimSpace(req.URL)
	req.ID = strings.TrimSpace(req.ID)
	name := resolveProfileName(profileHint)
	if name == "" {
		name = profileNameFromURL(req.URL)
	}
	if name == "" {
		return SavedRequest{}, fmt.Errorf("需要项目配置")
	}
	p, err := a.loadProfileByName(name)
	if err != nil {
		if !os.IsNotExist(err) {
			return SavedRequest{}, err
		}
		p = Profile{Name: name, URL: req.URL, Headers: map[string]string{}}
		if p.URL == "" {
			p.URL = name
		}
	}
	var saved SavedRequest
	p.Requests, saved = upsertSavedRequest(p.Requests, req)
	if err := a.saveProfileFile(p); err != nil {
		return SavedRequest{}, err
	}
	return saved, nil
}

func (a *App) deleteRequestOnProfile(profileHint, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("缺少编号")
	}
	p, err := a.loadProfileByName(profileHint)
	if err != nil {
		return err
	}
	out := make([]SavedRequest, 0, len(p.Requests))
	for _, r := range p.Requests {
		if r.ID != id {
			out = append(out, r)
		}
	}
	p.Requests = out
	return a.saveProfileFile(p)
}
