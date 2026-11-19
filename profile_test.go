package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetProfilesReportsMalformedFilesWithoutChangingThem(t *testing.T) {
	a := NewApp()
	a.baseDir = t.TempDir()
	if err := os.MkdirAll(a.serversDir(), 0o755); err != nil {
		t.Fatal(err)
	}
	badPath := filepath.Join(a.serversDir(), "broken.json")
	badData := []byte(`{"project":`)
	if err := os.WriteFile(badPath, badData, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := a.saveProfileFile(Profile{Name: "project:ok", Project: "ok"}); err != nil {
		t.Fatal(err)
	}

	if got := a.GetProfiles(); len(got) != 1 || got[0].Project != "ok" {
		t.Fatalf("profiles = %#v", got)
	}
	if warning := a.GetProfileLoadError(); !strings.Contains(warning, "broken.json") {
		t.Fatalf("warning = %q", warning)
	}
	if got, err := os.ReadFile(badPath); err != nil || string(got) != string(badData) {
		t.Fatalf("malformed file changed: %q, %v", got, err)
	}
}

func TestSaveEmptyProjectDoesNotStoreRequestPathAsBaseURL(t *testing.T) {
	a := NewApp()
	a.baseDir = t.TempDir()
	p := Profile{Name: "project:gateway", Project: "gateway", URL: "/users"}
	if err := a.SaveProfile(p); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 || got[0].URL != "" || got[0].Project != "gateway" {
		t.Fatalf("profiles = %#v", got)
	}
}

func TestProjectFileNameEncodingDoesNotCollide(t *testing.T) {
	if got := encodeProjectFileName("二广"); got != "二广" {
		t.Fatalf("readable name = %q", got)
	}
	left := encodeProjectFileName("a/b")
	right := encodeProjectFileName("a:b")
	if left == right {
		t.Fatalf("encoded names collided: %q", left)
	}
	if got := encodeProjectFileName("CON"); got == "CON" {
		t.Fatalf("reserved Windows name was not escaped")
	}
}

func TestLegacyProjectFileNameMigrates(t *testing.T) {
	a := NewApp()
	a.baseDir = t.TempDir()
	if err := os.MkdirAll(a.serversDir(), 0o755); err != nil {
		t.Fatal(err)
	}
	p := Profile{Name: "https://example.com", URL: "https://example.com", Project: "a/b"}
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	oldPath := filepath.Join(a.serversDir(), sanitizeName(p.Project)+".json")
	if err := os.WriteFile(oldPath, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	if got := a.GetProfiles(); len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	newPath := filepath.Join(a.serversDir(), profileStorageFileName(p))
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("new project file: %v", err)
	}
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatalf("legacy project file still exists: %v", err)
	}
}

func TestSaveProjectDoesNotOverwriteInvalidExistingFile(t *testing.T) {
	a := NewApp()
	a.baseDir = t.TempDir()
	if err := os.MkdirAll(a.serversDir(), 0o755); err != nil {
		t.Fatal(err)
	}
	p := Profile{Project: "gateway"}
	path := filepath.Join(a.serversDir(), profileStorageFileName(p))
	original := []byte(`{"broken":`)
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(p); err == nil {
		t.Fatal("expected invalid existing file error")
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(original) {
		t.Fatalf("invalid file was overwritten: %q", got)
	}
}

func TestSaveProfileOneFilePerHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(a.serversDir(), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "https://example.com/a", Method: "GET"}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{URL: "https://example.com/b", Method: "POST", Body: `{"x":1}`}); err != nil {
		t.Fatal(err)
	}

	list := a.GetProfiles()
	if len(list) != 1 {
		t.Fatalf("want 1 profile per host, got %d", len(list))
	}
	if list[0].Name != "https://example.com" {
		t.Fatalf("name = %q", list[0].Name)
	}
	if list[0].URL != "https://example.com/b" {
		t.Fatalf("url = %q", list[0].URL)
	}
	entries, err := os.ReadDir(a.serversDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("want 1 file, got %d", len(entries))
	}
	if entries[0].Name() != "https-example.com.json" {
		t.Fatalf("filename = %q", entries[0].Name())
	}
}

func TestProjectProfileUsesProjectFileName(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := a.SaveProfile(Profile{URL: "https://example.com/a", Project: "gateway"}); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(a.serversDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "gateway.json" {
		t.Fatalf("project file = %#v", entries)
	}
	if _, err := a.loadProfileByName("https://example.com"); err != nil {
		t.Fatalf("load by host: %v", err)
	}
	if err := a.SaveProfile(Profile{URL: "https://example.com/a", Project: "gateway-renamed"}); err != nil {
		t.Fatal(err)
	}
	entries, err = os.ReadDir(a.serversDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "gateway-renamed.json" {
		t.Fatalf("renamed project file = %#v", entries)
	}
}

func TestProjectCanBeSavedWithoutAddress(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := a.SaveProfile(Profile{Project: "gateway"}); err != nil {
		t.Fatal(err)
	}
	profiles := a.GetProfiles()
	if len(profiles) != 1 || profiles[0].Project != "gateway" || profiles[0].URL != "" {
		t.Fatalf("empty project = %#v", profiles)
	}
	entries, err := os.ReadDir(a.serversDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "gateway.json" {
		t.Fatalf("project file = %#v", entries)
	}
}

func TestSavedRequestsStayOnHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "https://example.com/a", Method: "GET"}); err != nil {
		t.Fatal(err)
	}
	login, err := a.SaveRequest("https://example.com", SavedRequest{
		Name: "登录", URL: "https://example.com/login", Method: "POST", Body: `{"u":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if login.ID == "" {
		t.Fatal("expected id")
	}
	list, err := a.SaveRequest("https://example.com/login", SavedRequest{
		Name: "拉列表", URL: "https://example.com/users", Method: "GET",
	})
	if err != nil {
		t.Fatal(err)
	}
	if list.ID == login.ID {
		t.Fatal("ids should differ")
	}

	// last-used overwrite must not drop bookmarks
	if err := a.SaveProfile(Profile{URL: "https://example.com/b", Method: "PUT", Body: "x"}); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	if got[0].URL != "https://example.com/b" || got[0].Method != "PUT" {
		t.Fatalf("last-used = %+v", got[0])
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("requests = %d", len(got[0].Requests))
	}

	again, err := a.SaveRequest("https://example.com", SavedRequest{
		Name: "登录", URL: "https://example.com/login", Method: "POST", Body: `{"u":2}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != login.ID {
		t.Fatalf("upsert id %q want %q", again.ID, login.ID)
	}
	got = a.GetProfiles()
	if len(got[0].Requests) != 2 {
		t.Fatalf("after upsert requests = %d", len(got[0].Requests))
	}
	var loginBody string
	for _, r := range got[0].Requests {
		if r.Name == "登录" {
			loginBody = r.Body
		}
	}
	if loginBody != `{"u":2}` {
		t.Fatalf("login body = %q", loginBody)
	}

	if err := a.DeleteRequest("https://example.com", login.ID); err != nil {
		t.Fatal(err)
	}
	got = a.GetProfiles()
	if len(got[0].Requests) != 1 || got[0].Requests[0].Name != "拉列表" {
		t.Fatalf("after delete = %+v", got[0].Requests)
	}
}

func TestSaveRequestRequiresName(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if _, err := a.SaveRequest("https://example.com", SavedRequest{
		URL: "https://example.com/x", Method: "GET",
	}); err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestSavedRequestsArePerHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if _, err := a.SaveRequest("https://a.example/x", SavedRequest{
		Name: "A", URL: "https://a.example/x", Method: "GET",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SaveRequest("https://b.example/y", SavedRequest{
		Name: "B", URL: "https://b.example/y", Method: "POST",
	}); err != nil {
		t.Fatal(err)
	}
	list := a.GetProfiles()
	if len(list) != 2 {
		t.Fatalf("profiles = %d", len(list))
	}
	for _, p := range list {
		if len(p.Requests) != 1 {
			t.Fatalf("%s requests = %d", p.Name, len(p.Requests))
		}
	}
}

func TestWSSavedMessagesStayOnHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "ws://example.com/ws", Reconnect: true}); err != nil {
		t.Fatal(err)
	}
	login, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "login", Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"login","u":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if login.ID == "" {
		t.Fatal("expected id")
	}
	if _, err := a.SaveRequest("ws://example.com/ws", SavedRequest{
		Name: "ping", Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"ping"}`,
	}); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{URL: "ws://example.com/ws", Body: `{"cmd":"other"}`}); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("requests = %d", len(got[0].Requests))
	}

	again, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "login", Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"login","u":2}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != login.ID {
		t.Fatalf("upsert id %q want %q", again.ID, login.ID)
	}
	got = a.GetProfiles()
	var loginBody, loginKind string
	for _, r := range got[0].Requests {
		if r.Name == "login" {
			loginBody = r.Body
			loginKind = r.Kind
		}
	}
	if loginBody != `{"cmd":"login","u":2}` || loginKind != "ws" {
		t.Fatalf("login = body %q kind %q", loginBody, loginKind)
	}
}

func TestSavedRequestKeepsTitleAndDescription(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	httpReq, err := a.SaveRequest("https://example.com", SavedRequest{
		Name: "POST /login", Title: "登录", Description: "手机号密码",
		URL: "https://example.com/login", Method: "POST", Body: `{"u":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if httpReq.Title != "登录" || httpReq.Description != "手机号密码" {
		t.Fatalf("http = title %q desc %q", httpReq.Title, httpReq.Description)
	}

	wsReq, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "login", Title: "进房", Description: "带房间号",
		Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"login","room":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if wsReq.Title != "进房" || wsReq.Description != "带房间号" {
		t.Fatalf("ws = title %q desc %q", wsReq.Title, wsReq.Description)
	}

	again, err := a.SaveRequest("https://example.com", SavedRequest{
		ID: httpReq.ID, Name: "POST /login", Title: "登录v2", Description: "验证码登录",
		URL: "https://example.com/login", Method: "POST", Body: `{"u":2}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != httpReq.ID {
		t.Fatalf("upsert id %q want %q", again.ID, httpReq.ID)
	}

	got := a.GetProfiles()
	var title, desc string
	for _, p := range got {
		for _, r := range p.Requests {
			if r.ID == httpReq.ID {
				title = r.Title
				desc = r.Description
			}
		}
	}
	if title != "登录v2" || desc != "验证码登录" {
		t.Fatalf("updated http = title %q desc %q", title, desc)
	}
}

func TestSavedRequestKeepsModule(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	login, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "login", Title: "进房", Module: "房间", Kind: "ws",
		URL: "ws://example.com/ws", Body: `{"cmd":"login"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if login.Module != "房间" {
		t.Fatalf("module = %q", login.Module)
	}
	if login.UpdatedAt == 0 {
		t.Fatal("expected updatedAt")
	}
	if _, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "leave", Title: "离房", Module: "房间", Kind: "ws",
		URL: "ws://example.com/ws", Body: `{"cmd":"leave"}`,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SaveRequest("ws://example.com", SavedRequest{
		Name: "ping", Title: "心跳", Kind: "ws",
		URL: "ws://example.com/ws", Body: `{"cmd":"ping"}`,
	}); err != nil {
		t.Fatal(err)
	}

	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	var room, empty int
	for _, r := range got[0].Requests {
		if r.Module == "房间" {
			room++
		}
		if r.Module == "" {
			empty++
		}
	}
	if room != 2 || empty != 1 {
		t.Fatalf("grouped room=%d empty=%d", room, empty)
	}

	again, err := a.SaveRequest("ws://example.com", SavedRequest{
		ID: login.ID, Name: "login", Title: "进房", Module: "房间/进房",
		Kind: "ws", URL: "ws://example.com/ws", Body: `{"cmd":"login","room":2}`,
		UpdatedAt: login.UpdatedAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	// A slash separates folders, so the same request now sits in a subfolder.
	// The separator is normalised to the one the tree uses.
	if want := "房间 / 进房"; again.Module != want {
		t.Fatalf("module after upsert = %q, want %q", again.Module, want)
	}
	// The parent of that subfolder is a folder in its own right.
	var paths []string
	for _, p := range a.GetProfiles() {
		paths = append(paths, p.Modules...)
	}
	joined := strings.Join(paths, ",")
	if !strings.Contains(joined, "房间") || !strings.Contains(joined, "房间 / 进房") {
		t.Fatalf("modules = %#v", paths)
	}
}

func TestProfileKeepsModules(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := a.SaveProfile(Profile{
		URL:     "https://example.com/a",
		Modules: []string{"登录", " 登录 ", "", "用户"},
		Requests: []SavedRequest{{
			Name: "GET /login", URL: "https://example.com/login", Method: "GET", Module: "登录",
		}},
	}); err != nil {
		t.Fatal(err)
	}

	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	if len(got[0].Modules) != 2 || got[0].Modules[0] != "登录" || got[0].Modules[1] != "用户" {
		t.Fatalf("modules = %#v", got[0].Modules)
	}

	if err := a.SaveProfile(Profile{
		URL:    "https://example.com/b",
		Method: "POST",
		Requests: []SavedRequest{{
			Name: "GET /login", URL: "https://example.com/login", Method: "GET", Module: "登录",
		}},
	}); err != nil {
		t.Fatal(err)
	}
	got = a.GetProfiles()
	if len(got[0].Modules) != 2 || got[0].Modules[0] != "登录" || got[0].Modules[1] != "用户" {
		t.Fatalf("modules after omitted save = %#v", got[0].Modules)
	}

	if _, err := a.SaveRequest("https://example.com", SavedRequest{
		Name: "GET /me", URL: "https://example.com/me", Method: "GET", Module: "用户",
	}); err != nil {
		t.Fatal(err)
	}
	got = a.GetProfiles()
	if len(got[0].Modules) != 2 {
		t.Fatalf("modules after SaveRequest = %#v", got[0].Modules)
	}
	if got[0].URL != "https://example.com/b" || got[0].Method != "POST" {
		t.Fatalf("last-used after SaveRequest = %+v", got[0])
	}
}

func TestModulePathIsClippedPerSegment(t *testing.T) {
	// A long path must not be cut in the middle: every folder in it survives
	// whole, or the tree would show a parent nobody created.
	long := strings.Repeat("名", 30)
	got := normalizeModulePath(long + "/" + long + "/" + long)
	want := long + " / " + long + " / " + long
	if got != want {
		t.Fatalf("path = %q, want %q", got, want)
	}

	// Each segment is bounded on its own.
	one := normalizeModulePath(strings.Repeat("名", 60) + "/b")
	parts := strings.Split(one, " / ")
	if len(parts) != 2 || len([]rune(parts[0])) != moduleSegMax || parts[1] != "b" {
		t.Fatalf("segments = %#v", parts)
	}

	// Depth is capped, and the separator is normalised.
	deep := normalizeModulePath("a/b/c/d/e/f/g/h")
	if strings.Count(deep, " / ") != moduleMaxDepth-1 {
		t.Fatalf("deep = %q", deep)
	}
	if normalizeModulePath("a /b/ c") != "a / b / c" {
		t.Fatalf("normalised = %q", normalizeModulePath("a /b/ c"))
	}
}

func TestModulePathsKeepTheirParents(t *testing.T) {
	got := normalizeModules([]string{"a / b / c", "a / d"})
	want := []string{"a", "a / b", "a / b / c", "a / d"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("modules = %#v", got)
	}
}

func TestSubfolderRoundTripKeepsParents(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}

	// A nested path is written with a hand-typed slash, and its parent is not
	// declared anywhere: the save has to make both real.
	if err := a.SaveProfile(Profile{
		URL: "https://example.com/api",
		Requests: []SavedRequest{{
			Name: "GET /token", URL: "https://example.com/token", Method: "GET",
			Module: "用户/登录/刷新",
		}},
	}); err != nil {
		t.Fatal(err)
	}

	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	want := []string{"用户", "用户 / 登录", "用户 / 登录 / 刷新"}
	if strings.Join(got[0].Modules, ",") != strings.Join(want, ",") {
		t.Fatalf("modules = %#v, want %#v", got[0].Modules, want)
	}
	// The request keeps the same path, so it lands in the deepest folder.
	if got[0].Requests[0].Module != "用户 / 登录 / 刷新" {
		t.Fatalf("module = %q", got[0].Requests[0].Module)
	}

	// Reading the file back a second time must not duplicate or reorder anything.
	again := a.GetProfiles()
	if strings.Join(again[0].Modules, ",") != strings.Join(want, ",") {
		t.Fatalf("second read modules = %#v", again[0].Modules)
	}
}
