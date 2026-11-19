package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The command shapes people actually paste: browser "Copy as cURL" (bash and
// cmd), curl's own PowerShell form, and hand-written one-liners.

func parseCurl(t *testing.T, text string) (Profile, []string) {
	t.Helper()
	p, warnings, err := parseCurlCommand(text, "")
	if err != nil {
		t.Fatalf("parse %q: %v", text, err)
	}
	return p, warnings
}

func onlyRequest(t *testing.T, p Profile) SavedRequest {
	t.Helper()
	if len(p.Requests) != 1 {
		t.Fatalf("want 1 request, got %d", len(p.Requests))
	}
	return p.Requests[0]
}

func TestCurlReadsTheShellsQuoting(t *testing.T) {
	// Chrome's "Copy as cURL (bash)" is one line with single quotes and a
	// backslash-escaped continuation.
	cmd := "curl 'https://api.test/v1/users?page=2' \\\n" +
		"  -H 'accept: application/json' \\\n" +
		"  -H 'x-trace: a b' \\\n" +
		"  --data-raw '{\"name\":\"o'\\''neil\"}'"

	p, warnings := parseCurl(t, cmd)
	req := onlyRequest(t, p)

	if req.Method != "POST" {
		// A body with no -X is a POST.
		t.Fatalf("method = %q, want POST", req.Method)
	}
	if req.URL != "https://api.test/v1/users?page=2" {
		t.Fatalf("url = %q", req.URL)
	}
	if req.Body != `{"name":"o'neil"}` {
		t.Fatalf("body = %q, want the JSON with a literal quote", req.Body)
	}
	if req.BodyType != "json" {
		t.Fatalf("bodyType = %q, want json (no Content-Type, so it is guessed)", req.BodyType)
	}
	if len(req.HeaderList) != 2 {
		t.Fatalf("headers = %v", req.HeaderList)
	}
	if req.HeaderList[1].Key != "x-trace" || req.HeaderList[1].Value != "a b" {
		t.Fatalf("header = %v, want the value with its space kept", req.HeaderList[1])
	}
	// No -L on a browser copy, so the import must not follow either.
	if !p.NoFollowRedirects {
		t.Fatal("a command without -L must not follow redirects")
	}
	if len(warnings) != 0 {
		t.Fatalf("unexpected warnings: %v", warnings)
	}
}

func TestCurlReadsCmdContinuationsAndAttachedFlags(t *testing.T) {
	// Windows "Copy as cURL (cmd)": `^` continuations, and `-X` glued to its value.
	cmd := "curl.exe -XPUT \"https://api.test/v1/orders/7\" ^\r\n" +
		"  -H \"Content-Type: application/json\" ^\r\n" +
		"  -H \"Authorization: Bearer t-1\" ^\r\n" +
		"  --data-raw \"{\\\"qty\\\":3}\""

	p, _ := parseCurl(t, cmd)
	req := onlyRequest(t, p)

	if req.Method != "PUT" {
		t.Fatalf("method = %q, want PUT from -XPUT", req.Method)
	}
	if req.URL != "https://api.test/v1/orders/7" {
		t.Fatalf("url = %q", req.URL)
	}
	if req.Body != `{"qty":3}` {
		t.Fatalf("body = %q", req.Body)
	}
	if req.BodyType != "json" {
		t.Fatalf("bodyType = %q, want json from Content-Type", req.BodyType)
	}
	// A sparse map sends nothing, so the first Content-Type row survives on the
	// list where the editor reads it.
	found := false
	for _, h := range req.HeaderList {
		if strings.EqualFold(h.Key, "Content-Type") && h.Value == "application/json" {
			found = true
		}
	}
	if !found {
		t.Fatalf("Content-Type was dropped: %v", req.HeaderList)
	}
}

func TestCurlKeepsBasicAuthOutOfTheHeaderList(t *testing.T) {
	p, _ := parseCurl(t, "curl -u me:s3cret https://api.test/private")
	req := onlyRequest(t, p)

	if req.AuthType != "basic" || req.AuthUser != "me" || req.AuthPass != "s3cret" {
		t.Fatalf("auth = %q %q %q", req.AuthType, req.AuthUser, req.AuthPass)
	}
	if req.Method != "GET" {
		t.Fatalf("method = %q", req.Method)
	}
	// The editor's Basic field writes the header at send time; a stored
	// Authorization row would then be sent twice.
	for _, h := range req.HeaderList {
		if strings.EqualFold(h.Key, "Authorization") {
			t.Fatal("Authorization should be in the auth fields, not the header list")
		}
	}
}

func TestCurlMovesDataIntoTheQueryWithG(t *testing.T) {
	p, _ := parseCurl(t, "curl -G https://api.test/search -d q=rust -d 'page=2'")
	req := onlyRequest(t, p)

	if req.Method != "GET" {
		t.Fatalf("method = %q, want GET", req.Method)
	}
	if req.Body != "" || req.BodyType != "none" {
		t.Fatalf("body = %q / %q, want none after -G", req.Body, req.BodyType)
	}
	if req.URL != "https://api.test/search?q=rust&page=2" {
		t.Fatalf("url = %q, want the data in the query", req.URL)
	}
}

func TestCurlReadsAFormBodyIntoRows(t *testing.T) {
	p, _ := parseCurl(t, "curl https://api.test/login -H 'Content-Type: application/x-www-form-urlencoded' -d 'user=ann&pw=a%20b'")
	req := onlyRequest(t, p)

	if req.BodyType != "form" {
		t.Fatalf("bodyType = %q, want form", req.BodyType)
	}
	if len(req.FormList) != 2 {
		t.Fatalf("formList = %v", req.FormList)
	}
	if req.FormList[0].Key != "user" || req.FormList[0].Value != "ann" {
		t.Fatalf("row 0 = %v", req.FormList[0])
	}
	if req.FormList[1].Value != "a b" {
		t.Fatalf("row 1 = %v, want the %%20 decoded", req.FormList[1])
	}
}

func TestCurlReportsWhatItCannotKeep(t *testing.T) {
	// A GET with a body cannot be a GET in this editor, and a file upload
	// cannot be one either. Both are said out loud rather than dropped.
	p, warnings := parseCurl(t, "curl -XGET https://api.test/x -d '{}'")
	if got := onlyRequest(t, p).Method; got != "POST" {
		t.Fatalf("method = %q, want POST so the body survives", got)
	}
	if len(warnings) == 0 || !strings.Contains(strings.Join(warnings, "|"), "POST") {
		t.Fatalf("warnings = %v, want one about the method change", warnings)
	}

	_, warnings = parseCurl(t, "curl https://api.test/up -F 'note=hi' -F 'file=@/tmp/a.png'")
	if !strings.Contains(strings.Join(warnings, "|"), "/tmp/a.png") {
		t.Fatalf("warnings = %v, want one naming the file field", warnings)
	}
}

func TestCurlCarriesTheConnectionSwitches(t *testing.T) {
	p, _ := parseCurl(t, "curl -k -L https://127.0.0.1:8443/x")
	if !p.InsecureSkipVerify {
		t.Fatal("-k must skip certificate checks")
	}
	if p.NoFollowRedirects {
		t.Fatal("-L must follow redirects")
	}
	if want := "https://127.0.0.1:8443"; p.Name != want {
		t.Fatalf("profile name = %q, want %q", p.Name, want)
	}
}

func TestCurlRejectsWhatIsNotACommand(t *testing.T) {
	if _, _, err := parseCurlCommand("wget https://api.test/x", ""); err == nil {
		t.Fatal("wget is not curl")
	}
	if _, _, err := parseCurlCommand("curl -H 'a: b'", ""); err == nil {
		t.Fatal("a command with no address has nothing to import")
	}
	if _, _, err := parseCurlCommand("", ""); err == nil {
		t.Fatal("empty input")
	}
}

func TestCurlReadsABareDataFlagAsTheFormCurlSends(t *testing.T) {
	// `-d` without a Content-Type is application/x-www-form-urlencoded: that is
	// what curl puts on the wire, so that is what the import has to be.
	p, _ := parseCurl(t, "curl https://api.test/token -d 'grant_type=password' -d 'user=ann'")
	req := onlyRequest(t, p)

	if req.BodyType != "form" {
		t.Fatalf("bodyType = %q, want form", req.BodyType)
	}
	if len(req.FormList) != 2 {
		t.Fatalf("formList = %v", req.FormList)
	}
	if req.FormList[0].Key != "grant_type" || req.FormList[0].Value != "password" {
		t.Fatalf("row 0 = %v", req.FormList[0])
	}
	if req.FormList[1].Key != "user" || req.FormList[1].Value != "ann" {
		t.Fatalf("row 1 = %v", req.FormList[1])
	}
}

func TestCurlLeavesTextThatIsNotAFormAlone(t *testing.T) {
	// A body with no `=` must not become a one-row form whose key is the whole
	// body: that would send `%7B%22a%22%3A1%7D=` on the wire.
	p, _ := parseCurl(t, "curl https://api.test/x -d 'hello there'")
	req := onlyRequest(t, p)
	if req.BodyType != "text" {
		t.Fatalf("bodyType = %q, want text", req.BodyType)
	}
	if req.Body != "hello there" {
		t.Fatalf("body = %q", req.Body)
	}
	if len(req.FormList) != 0 {
		t.Fatalf("formList = %v, want none", req.FormList)
	}
}

func TestCurlKeepsAnXMLBodyWhereTheEditorCanShowIt(t *testing.T) {
	// The body-type radios are none / json / text / form, so an XML body has to
	// land in text; the Content-Type row it came with is what goes on the wire.
	p, _ := parseCurl(t, "curl https://api.test/x -H 'Content-Type: application/xml' -d '<a>1</a>'")
	req := onlyRequest(t, p)

	if req.BodyType != "text" {
		t.Fatalf("bodyType = %q, want text", req.BodyType)
	}
	if req.Body != "<a>1</a>" {
		t.Fatalf("body = %q", req.Body)
	}
	found := false
	for _, h := range req.HeaderList {
		if strings.EqualFold(h.Key, "Content-Type") && h.Value == "application/xml" {
			found = true
		}
	}
	if !found {
		t.Fatalf("Content-Type was dropped: %v", req.HeaderList)
	}
}

func TestCurlDefaultsTheSchemeToHTTPS(t *testing.T) {
	p, _ := parseCurl(t, "curl api.test/health")
	if got := onlyRequest(t, p).URL; got != "https://api.test/health" {
		t.Fatalf("url = %q, want https:// put in front", got)
	}
}

// The imported request is sent for real, so this proves the parse yields
// something the app can use, not merely something that looks right.
func TestCurlImportedRequestSendsWhatTheCommandSaid(t *testing.T) {
	type seen struct {
		method, path, query string
		header              http.Header
		body                string
	}
	got := make(chan seen, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		got <- seen{r.Method, r.URL.Path, r.URL.RawQuery, r.Header.Clone(), string(body)}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	// A shell-escaped single quote inside JSON: the quote has to survive both
	// the shell word split and the JSON body.
	cmd := "curl '" + srv.URL + "/v1/orders?page=2' -X PUT " +
		"-H 'Content-Type: application/json' -H 'X-Trace: abc' " +
		"--data-raw '{\"qty\":3,\"note\":\"o'\\''neil\"}'"

	p, warnings := parseCurl(t, cmd)
	if len(warnings) != 0 {
		t.Fatalf("warnings: %v", warnings)
	}
	req := onlyRequest(t, p)

	headers := map[string]string{}
	for _, h := range req.HeaderList {
		if h.Enabled {
			headers[h.Key] = h.Value
		}
	}
	client := &wsClient{profile: p.Name, app: &App{}}
	ex, err := client.doHTTP(ConnectOptions{
		URL:      req.URL,
		Protocol: "http",
		Method:   req.Method,
		Headers:  headers,
	}, newHTTPDoer(), req.Body)
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if ex.Error != "" {
		t.Fatalf("send error: %s", ex.Error)
	}
	if ex.StatusCode != 200 {
		t.Fatalf("status = %d", ex.StatusCode)
	}

	select {
	case s := <-got:
		if s.method != "PUT" {
			t.Errorf("method = %q", s.method)
		}
		if s.path != "/v1/orders" {
			t.Errorf("path = %q", s.path)
		}
		if s.query != "page=2" {
			t.Errorf("query = %q", s.query)
		}
		if s.header.Get("X-Trace") != "abc" {
			t.Errorf("X-Trace = %q", s.header.Get("X-Trace"))
		}
		if s.header.Get("Content-Type") != "application/json" {
			t.Errorf("Content-Type = %q", s.header.Get("Content-Type"))
		}
		var body map[string]any
		if err := json.Unmarshal([]byte(s.body), &body); err != nil {
			t.Fatalf("body is not JSON: %q (%v)", s.body, err)
		}
		if body["note"] != "o'neil" {
			t.Errorf("note = %v, want the quote kept", body["note"])
		}
		if body["qty"] != float64(3) {
			t.Errorf("qty = %v", body["qty"])
		}
	default:
		t.Fatal("the server saw no request")
	}
}

func TestCurlRoundTripsWhatTheAppItselfGenerates(t *testing.T) {
	// 「复制为 cURL」 writes this shape; pasting it back must give the same
	// request, or the two features disagree.
	generated := `curl.exe -L "https://api.example.test/login" -H "Content-Type: application/json" -H "X-Trace: abc" --data-raw "{\"user\":\"ann\"}"`

	p, warnings := parseCurl(t, generated)
	req := onlyRequest(t, p)

	if req.Method != "POST" {
		t.Fatalf("method = %q", req.Method)
	}
	if req.URL != "https://api.example.test/login" {
		t.Fatalf("url = %q", req.URL)
	}
	if req.BodyType != "json" || req.Body != `{"user":"ann"}` {
		t.Fatalf("body = %q / %q", req.BodyType, req.Body)
	}
	if len(warnings) != 0 {
		t.Fatalf("a command this app wrote should import cleanly: %v", warnings)
	}
	if p.NoFollowRedirects {
		t.Fatal("-L was in the command, so redirects must be followed")
	}
	if len(req.HeaderList) != 2 {
		t.Fatalf("headers = %v", req.HeaderList)
	}
}
