package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCatalogExportFileName(t *testing.T) {
	got := catalogExportFileName("https://uapis.cn")
	if got != "https-uapis.cn-catalog.json" {
		t.Fatalf("name = %q", got)
	}
	if catalogExportFileName("") != "catalog.json" {
		t.Fatalf("empty name = %q", catalogExportFileName(""))
	}
	if catalogBundleFileName() != "apitest-catalogs.json" {
		t.Fatalf("bundle name = %q", catalogBundleFileName())
	}
}

func TestParseCatalogBundle(t *testing.T) {
	list, ok := parseCatalogBundle([]byte(`{
	  "kind": "ws-desk-catalogs",
	  "profiles": [
	    {"name":"https://a.example","url":"https://a.example/x","project":"甲","requests":[{"id":"1","title":"A"}]},
	    {"name":"wss://b.example","url":"wss://b.example/im","project":"乙","requests":[{"id":"2","title":"B"}]}
	  ]
	}`))
	if !ok || len(list) != 2 {
		t.Fatalf("bundle = ok=%v len=%d", ok, len(list))
	}
	if list[0].Project != "甲" || list[1].Name != "wss://b.example" {
		t.Fatalf("profiles = %#v", list)
	}
	if _, ok := parseCatalogBundle([]byte(`{"name":"https://a.example","url":"https://a.example"}`)); ok {
		t.Fatal("single catalog should not parse as bundle")
	}
}

func TestImportCatalogBundle(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := a.applyImportedFile([]byte(`{
	  "kind": "ws-desk-catalogs",
	  "profiles": [
	    {"name":"https://a.example","url":"https://a.example/x","project":"甲","requests":[{"id":"a1","title":"登录","url":"https://a.example/login"}]},
	    {"name":"wss://b.example","url":"wss://b.example/im","project":"乙","requests":[{"id":"b1","title":"心跳","url":"wss://b.example/im"}]}
	  ]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Name == "" {
		t.Fatalf("primary = %+v", got)
	}
	list := a.GetProfiles()
	if len(list) != 2 {
		t.Fatalf("profiles = %d %#v", len(list), namesOf(list))
	}
}

func TestMergeImportedCatalog(t *testing.T) {
	dst := Profile{
		Name:    "https://example.com",
		URL:     "https://example.com/keep",
		Method:  "GET",
		Modules: []string{"登录", "用户"},
		Requests: []SavedRequest{
			{ID: "a1", Name: "GET /login", Title: "登录", Module: "登录", Method: "GET", URL: "https://example.com/login"},
			{ID: "a2", Name: "GET /me", Title: "我的", Module: "用户", Method: "GET", URL: "https://example.com/me"},
		},
		VariableList: []HeaderItem{
			{Key: "Token", Value: "old", Enabled: true},
			{Key: "Env", Value: "prod", Enabled: true},
		},
	}
	src := Profile{
		Name:    "https://other.example",
		URL:     "https://other.example/x",
		Modules: []string{"用户", "订单"},
		Requests: []SavedRequest{
			{ID: "a1", Name: "POST /login", Title: "登录-新", Module: "登录", Method: "POST", URL: "https://other.example/login", Body: `{"u":1}`},
			{ID: "b3", Name: "GET /orders", Title: "订单列表", Module: "订单", Method: "GET", URL: "https://other.example/orders"},
			{Name: "GET /anon", Title: "无名", Method: "GET", URL: "https://other.example/anon"},
		},
		VariableList: []HeaderItem{
			{Key: "Token", Value: "new", Enabled: true},
			{Key: "Key", Value: "k", Enabled: false},
			{Key: "  ", Value: "skip", Enabled: true},
		},
	}

	got := mergeImportedCatalog(dst, src)
	if got.URL != "https://example.com/keep" || got.Method != "GET" {
		t.Fatalf("host fields changed: %+v", got)
	}
	if len(got.Requests) != 4 {
		t.Fatalf("requests = %d %#v", len(got.Requests), got.Requests)
	}
	if got.Requests[0].Title != "登录-新" || got.Requests[0].Method != "POST" || got.Requests[0].Body != `{"u":1}` {
		t.Fatalf("id overwrite = %+v", got.Requests[0])
	}
	if got.Requests[1].Title != "我的" {
		t.Fatalf("kept = %+v", got.Requests[1])
	}
	if got.Requests[2].ID != "b3" || got.Requests[2].Title != "订单列表" {
		t.Fatalf("appended = %+v", got.Requests[2])
	}
	if got.Requests[3].ID == "" || got.Requests[3].Title != "无名" {
		t.Fatalf("missing id = %+v", got.Requests[3])
	}
	if len(got.Modules) != 3 || got.Modules[0] != "登录" || got.Modules[1] != "用户" || got.Modules[2] != "订单" {
		t.Fatalf("modules = %#v", got.Modules)
	}
	if len(got.Environments) != 0 || len(got.VariableList) != 0 {
		t.Fatalf("automatic environment = %#v vars=%#v", got.Environments, got.VariableList)
	}
}

func TestMergeImportedCatalogKeepsOrder(t *testing.T) {
	dst := Profile{
		Modules: []string{"B", "A"},
		Requests: []SavedRequest{
			{ID: "2", Name: "GET /b", Title: "B", Module: "B"},
			{ID: "1", Name: "GET /a", Title: "A", Module: "A"},
		},
	}
	src := Profile{
		Modules: []string{"A", "C"},
		Requests: []SavedRequest{
			{ID: "1", Name: "GET /a", Title: "A2", Module: "A"},
			{ID: "3", Name: "GET /c", Title: "C", Module: "C"},
		},
	}
	got := mergeImportedCatalog(dst, src)
	if len(got.Modules) != 3 || got.Modules[0] != "B" || got.Modules[1] != "A" || got.Modules[2] != "C" {
		t.Fatalf("modules = %#v", got.Modules)
	}
	if len(got.Requests) != 3 || got.Requests[0].ID != "2" || got.Requests[1].ID != "1" || got.Requests[2].ID != "3" {
		t.Fatalf("requests = %#v", got.Requests)
	}
	if got.Requests[1].Title != "A2" {
		t.Fatalf("overwrite = %+v", got.Requests[1])
	}
}

func TestParseCatalogFile(t *testing.T) {
	if _, err := parseCatalogFile(nil); err == nil {
		t.Fatal("empty should fail")
	}
	if _, err := parseCatalogFile([]byte("not-json")); err == nil {
		t.Fatal("invalid should fail")
	}
	p, err := parseCatalogFile([]byte(`{"requests":[{"id":"x","name":"GET /a"}],"modules":["A"]}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Requests) != 1 || p.Requests[0].ID != "x" || len(p.Modules) != 1 {
		t.Fatalf("parsed = %+v", p)
	}
}

func TestSplitImportByHostUsesFileHost(t *testing.T) {
	src := Profile{
		Name:    "https://other.example",
		URL:     "https://other.example/x",
		Modules: []string{"用户"},
		Requests: []SavedRequest{
			{ID: "n1", Name: "GET /me", Title: "我的", Module: "用户", Method: "GET", URL: "https://other.example/me"},
			{ID: "n2", Name: "GET /rel", Title: "相对", Module: "用户", Method: "GET", URL: "/rel"},
		},
	}
	got, err := splitImportByHost(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Name != "https://other.example" {
		t.Fatalf("hosts=%#v", got)
	}
	if len(got[0].Requests) != 2 || got[0].Requests[1].URL != "https://other.example/rel" {
		t.Fatalf("reqs=%#v", got[0].Requests)
	}
}

func TestSplitImportByHostSplitsAndSkipsCurrent(t *testing.T) {
	src := Profile{
		URL: "https://should-not-win.example",
		Requests: []SavedRequest{
			{ID: "a", Name: "GET /a", Title: "A", Method: "GET", URL: "https://a.example/a"},
			{ID: "b", Name: "GET /b", Title: "B", Method: "GET", URL: "https://b.example/b"},
			{ID: "c", Name: "GET /c", Title: "C", Method: "GET", URL: "https://a.example/c"},
		},
	}
	got, err := splitImportByHost(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "https://a.example" || got[1].Name != "https://b.example" {
		t.Fatalf("hosts=%#v", namesOf(got))
	}
	if len(got[0].Requests) != 2 || len(got[1].Requests) != 1 {
		t.Fatalf("split=%#v", got)
	}
	if pickPrimaryImport(got).Name != "https://a.example" {
		t.Fatalf("primary=%q", pickPrimaryImport(got).Name)
	}
}

func TestSplitImportByHostPostmanBaseURL(t *testing.T) {
	src, err := parsePostmanCollection([]byte(samplePostmanV21))
	if err != nil {
		t.Fatal(err)
	}
	got, err := splitImportByHost(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Name != "https://example.com" {
		t.Fatalf("hosts=%#v", namesOf(got))
	}
	if got[0].Requests[0].URL != "https://example.com/login?src=app" {
		t.Fatalf("rewritten=%q", got[0].Requests[0].URL)
	}
	if got[0].Requests[1].URL != "https://example.com/health" {
		t.Fatalf("health=%q", got[0].Requests[1].URL)
	}
}

func TestSplitImportByHostNeedsURL(t *testing.T) {
	_, err := splitImportByHost(Profile{
		Requests: []SavedRequest{{Name: "GET /x", Title: "X", URL: "{{baseUrl}}/x"}},
	})
	if err == nil {
		t.Fatal("expected missing host")
	}
}

func TestApplyImportedFileDoesNotTouchOtherHost(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{
		URL:     "https://current.example/keep",
		Modules: []string{"本地"},
		Requests: []SavedRequest{
			{ID: "cur", Name: "GET /keep", Title: "别动", Module: "本地", URL: "https://current.example/keep", Method: "GET"},
		},
	}); err != nil {
		t.Fatal(err)
	}
	merged, err := a.applyImportedFile([]byte(samplePostmanV21))
	if err != nil {
		t.Fatal(err)
	}
	if merged == nil || merged.Name != "https://example.com" {
		t.Fatalf("focused=%+v", merged)
	}
	got := a.GetProfiles()
	if len(got) != 2 {
		t.Fatalf("profiles=%d %#v", len(got), namesOf(got))
	}
	var current, shop Profile
	for _, p := range got {
		switch p.Name {
		case "https://current.example":
			current = p
		case "https://example.com":
			shop = p
		}
	}
	if current.URL != "https://current.example/keep" || len(current.Requests) != 1 || current.Requests[0].Title != "别动" {
		t.Fatalf("current touched: %+v", current)
	}
	if len(shop.Requests) != 2 || shop.Requests[0].Title != "密码登录" {
		t.Fatalf("shop=%#v", shop.Requests)
	}
}

func TestSameProjectProfilesMerge(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	reqs := []SavedRequest{
		{ID: "a1", Name: "login", Title: "login", Module: "接口", Kind: "ws", Body: `{"type":"login"}`},
		{ID: "a2", Name: "list", Title: "list", Module: "接口", Kind: "ws", Body: `{"type":"list"}`, Example: `{"ok":true}`},
	}
	if err := a.SaveProfile(Profile{
		URL:     "ws://10.0.0.1:1/imcp",
		Project: "小京",
		Requests: []SavedRequest{
			{ID: "b1", Name: "login", Title: "login", Module: "接口", Kind: "ws", Body: `{"type":"login"}`},
		},
		Environments: []Environment{
			{Name: "A", Variables: []HeaderItem{{Key: "host", Value: "ws://10.0.0.1:1/imcp", Enabled: true}}},
		},
	}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{
		URL:          "ws://10.0.0.2:1/imcp",
		Project:      "小京",
		Requests:     reqs,
		Environments: []Environment{{Name: "B", Variables: []HeaderItem{{Key: "host", Value: "ws://10.0.0.2:1/imcp", Enabled: true}}}},
	}); err != nil {
		t.Fatal(err)
	}
	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles=%#v", namesOf(got))
	}
	if got[0].Project != "小京" {
		t.Fatalf("project=%q", got[0].Project)
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("reqs=%#v", got[0].Requests)
	}
	if len(got[0].Environments) != 2 {
		t.Fatalf("envs=%#v", got[0].Environments)
	}
}

func namesOf(list []Profile) []string {
	out := make([]string, len(list))
	for i, p := range list {
		out[i] = p.Name
	}
	return out
}

func TestSaveProfileMergesSameProject(t *testing.T) {
	a := NewApp()
	a.baseDir = t.TempDir()
	if err := a.SaveProfile(Profile{URL: "https://one.example", Project: "gateway"}); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{URL: "https://two.example", Project: "gateway"}); err != nil {
		t.Fatal(err)
	}

	profiles := a.GetProfiles()
	if len(profiles) != 1 {
		t.Fatalf("GetProfiles() returned %d profiles, want 1", len(profiles))
	}
	entries, err := os.ReadDir(a.serversDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("same-project save created %d files, want 1", len(entries))
	}
}

func TestImportCatalogMergesOnDisk(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	if err := os.MkdirAll(filepath.Join(dir, "servers"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProfile(Profile{
		URL:     "https://example.com/a",
		Modules: []string{"登录"},
		Requests: []SavedRequest{
			{ID: "keep", Name: "GET /login", Title: "登录", Module: "登录", URL: "https://example.com/login", Method: "GET"},
		},
		VariableList: []HeaderItem{{Key: "Token", Value: "old", Enabled: true}},
	}); err != nil {
		t.Fatal(err)
	}

	dst, err := a.loadProfileByName("https://example.com")
	if err != nil {
		t.Fatal(err)
	}
	src, err := parseCatalogFile([]byte(`{
	  "name": "https://other.example",
	  "url": "https://other.example/x",
	  "modules": ["用户"],
	  "requests": [
	    {"id":"keep","name":"POST /login","title":"登录改","module":"登录","method":"POST","url":"https://other.example/login"},
	    {"id":"new","name":"GET /me","title":"我的","module":"用户","method":"GET","url":"https://other.example/me"}
	  ],
	  "variableList": [{"key":"Token","value":"new","enabled":true}]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	merged := mergeImportedCatalog(dst, src)
	if err := a.saveProfileFile(merged); err != nil {
		t.Fatal(err)
	}

	got := a.GetProfiles()
	if len(got) != 1 {
		t.Fatalf("profiles = %d", len(got))
	}
	if got[0].URL != "https://example.com/a" {
		t.Fatalf("url overwritten: %q", got[0].URL)
	}
	if len(got[0].Requests) != 2 {
		t.Fatalf("requests = %#v", got[0].Requests)
	}
	if got[0].Requests[0].Title != "登录改" || got[0].Requests[0].Method != "POST" {
		t.Fatalf("overwrite = %+v", got[0].Requests[0])
	}
	if got[0].Requests[1].ID != "new" {
		t.Fatalf("added = %+v", got[0].Requests[1])
	}
	if len(got[0].Modules) != 2 || got[0].Modules[1] != "用户" {
		t.Fatalf("modules = %#v", got[0].Modules)
	}
	if len(got[0].Environments) != 0 || len(got[0].VariableList) != 0 {
		t.Fatalf("automatic environment = %#v vars=%#v", got[0].Environments, got[0].VariableList)
	}
}

func newURLImportApp(t *testing.T) *App {
	t.Helper()
	a := NewApp()
	a.setDataDirectory(t.TempDir(), false)
	return a
}

func TestImportCatalogFromURLRelativeServer(t *testing.T) {
	const spec = `{"openapi":"3.0.3","info":{"title":"相对"},"servers":[{"url":"/v1"}],"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, spec)
	}))
	defer srv.Close()

	a := newURLImportApp(t)
	got, err := a.ImportCatalogFromURL(srv.URL+"/v3/api-docs", false)
	if err != nil {
		t.Fatal(err)
	}
	want := srv.URL + "/v1/ping"
	if len(got.Requests) != 1 || got.Requests[0].URL != want {
		t.Fatalf("requests = %#v, want %s", got.Requests, want)
	}
}

func TestImportCatalogFromURLNoServers(t *testing.T) {
	const spec = `{"openapi":"3.0.3","info":{"title":"无服务"},"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, spec)
	}))
	defer srv.Close()

	a := newURLImportApp(t)
	got, err := a.ImportCatalogFromURL(srv.URL+"/openapi.json", false)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != srv.URL || len(got.Requests) != 1 || got.Requests[0].URL != srv.URL+"/ping" {
		t.Fatalf("primary = %+v", got)
	}
}

func TestImportCatalogFromURLUsesRedirectTarget(t *testing.T) {
	// A directory-relative server URL only resolves correctly when the document's
	// real (post-redirect) address is used.
	const spec = `{"openapi":"3.0.3","info":{"title":"跳转"},"servers":[{"url":"v1"}],"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}`
	mux := http.NewServeMux()
	mux.HandleFunc("/spec/openapi.json", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, spec) })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/spec/openapi.json", http.StatusFound)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	a := newURLImportApp(t)
	got, err := a.ImportCatalogFromURL(srv.URL+"/", false)
	if err != nil {
		t.Fatal(err)
	}
	want := srv.URL + "/spec/v1/ping"
	if len(got.Requests) != 1 || got.Requests[0].URL != want {
		t.Fatalf("requests = %#v, want %s", got.Requests, want)
	}
}

func TestImportBOMDocument(t *testing.T) {
	body := append([]byte("\xef\xbb\xbf"), []byte(`{"kind":"ws-desk-catalogs","profiles":[{"name":"https://a.example","url":"https://a.example","requests":[{"id":"1","title":"A","url":"https://a.example/a"}]}]}`)...)
	a := newURLImportApp(t)
	got, err := a.applyImportedFile(body)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Name != "https://a.example" {
		t.Fatalf("primary = %+v", got)
	}

	single := append([]byte("\xef\xbb\xbf"), []byte(`{"openapi":"3.0.3","info":{"title":"BOM"},"servers":[{"url":"https://bom.example"}],"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}`)...)
	got, err = a.applyImportedFile(single)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Name != "https://bom.example" {
		t.Fatalf("single = %+v", got)
	}
}

func TestLocalFileImportKeepsStrictHost(t *testing.T) {
	// A local file has no origin, so a relative server URL must still fail
	// instead of inventing a host.
	const spec = `{"openapi":"3.0.3","info":{"title":"相对"},"servers":[{"url":"/v1"}],"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}`
	a := newURLImportApp(t)
	if _, err := a.applyImportedFile([]byte(spec)); err == nil {
		t.Fatal("expected missing host error for local file")
	}
}

func TestValidateImportURL(t *testing.T) {
	cases := []struct {
		raw     string
		wantErr bool
	}{
		{"  https://example.com/openapi.json  ", false},
		{"http://localhost:8080/v3/api-docs", false},
		{"ftp://example.com/spec.json", true},
		{"example.com/spec.json", true},
		{"https://", true},
	}
	for _, tc := range cases {
		got, err := validateImportURL(tc.raw)
		if tc.wantErr {
			if err == nil {
				t.Fatalf("validateImportURL(%q) = %q, want error", tc.raw, got)
			}
			continue
		}
		if err != nil {
			t.Fatalf("validateImportURL(%q): %v", tc.raw, err)
		}
	}
}

func TestImportCatalogFromURLOpenAPI(t *testing.T) {
	const spec = `{"openapi":"3.0.3","info":{"title":"远程商店"},"servers":[{"url":"https://shop.example/v1"}],"paths":{"/ping":{"get":{"summary":"探活","responses":{"200":{"description":"ok"}}}}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/openapi.json" {
			http.NotFound(w, r)
			return
		}
		if got := r.Header.Get("User-Agent"); got != "ApiTester" {
			t.Errorf("User-Agent = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, spec)
	}))
	defer srv.Close()

	a := newURLImportApp(t)
	got, err := a.ImportCatalogFromURL(srv.URL+"/openapi.json", false)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Name != "https://shop.example" || got.Project != "远程商店" {
		t.Fatalf("primary = %+v", got)
	}
	if len(got.Requests) != 1 || got.Requests[0].URL != "https://shop.example/v1/ping" {
		t.Fatalf("requests = %#v", got.Requests)
	}
	list, err := a.loadProfiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "https://shop.example" {
		t.Fatalf("profiles = %#v", list)
	}
}

func TestImportCatalogFromURLSwaggerYAML(t *testing.T) {
	const spec = "swagger: '2.0'\ninfo:\n  title: 旧文档\nhost: shop.example\nbasePath: /v1\nschemes: [https]\npaths:\n  /ping:\n    get:\n      responses:\n        '200':\n          description: ok\n"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/yaml")
		fmt.Fprint(w, spec)
	}))
	defer srv.Close()

	a := newURLImportApp(t)
	got, err := a.ImportCatalogFromURL(srv.URL+"/swagger.yaml", false)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Name != "https://shop.example" || len(got.Requests) != 1 {
		t.Fatalf("primary = %+v", got)
	}
	if got.Requests[0].URL != "https://shop.example/v1/ping" {
		t.Fatalf("request = %#v", got.Requests[0])
	}
}

func TestImportCatalogFromURLErrors(t *testing.T) {
	t.Run("bad scheme", func(t *testing.T) {
		a := newURLImportApp(t)
		if _, err := a.ImportCatalogFromURL("ftp://example.com/spec.json", false); err == nil {
			t.Fatal("expected error")
		}
	})
	t.Run("no data directory", func(t *testing.T) {
		a := NewApp()
		a.setDataDirectory("", true)
		if _, err := a.ImportCatalogFromURL("https://example.com/spec.json", false); err == nil {
			t.Fatal("expected error")
		}
	})
	t.Run("http error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "missing", http.StatusNotFound)
		}))
		defer srv.Close()
		a := newURLImportApp(t)
		_, err := a.ImportCatalogFromURL(srv.URL+"/missing.json", false)
		if err == nil || !strings.Contains(err.Error(), "404") {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("html page", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, "<html><body>swagger ui</body></html>")
		}))
		defer srv.Close()
		a := newURLImportApp(t)
		_, err := a.ImportCatalogFromURL(srv.URL, false)
		if err == nil || !strings.Contains(err.Error(), "HTML") {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("too large", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, strings.Repeat("a", importURLMaxBytes+1))
		}))
		defer srv.Close()
		a := newURLImportApp(t)
		_, err := a.ImportCatalogFromURL(srv.URL, false)
		if err == nil || !strings.Contains(err.Error(), "文件过大") {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("self signed", func(t *testing.T) {
		srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, `{"openapi":"3.0.0","info":{"title":"x"},"servers":[{"url":"https://tls.example"}],"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}`)
		}))
		defer srv.Close()
		a := newURLImportApp(t)
		if _, err := a.ImportCatalogFromURL(srv.URL, false); err == nil {
			t.Fatal("expected certificate error")
		}
		if _, err := a.ImportCatalogFromURL(srv.URL, true); err != nil {
			t.Fatalf("insecure import: %v", err)
		}
	})
}
