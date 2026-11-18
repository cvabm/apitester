package main

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestTLSConfigRequiresExplicitOptIn(t *testing.T) {
	for _, insecure := range []bool{false, true} {
		cfg := tlsConfig(insecure)
		if cfg.InsecureSkipVerify != insecure || cfg.MinVersion != tls.VersionTLS12 {
			t.Fatalf("unexpected TLS config: %#v", cfg)
		}
	}
}

func TestDoHTTPNetworkErrorReturnsExchange(t *testing.T) {
	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: "http://127.0.0.1:1/", Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatalf("doHTTP err = %v, want nil so UI can render the exchange", err)
	}
	if ex == nil || ex.Error == "" {
		t.Fatalf("expected exchange with Error set, got %#v", ex)
	}
	if ex.Method != http.MethodGet {
		t.Fatalf("method = %q", ex.Method)
	}
}

func TestDoHTTPMissingClientReturnsExchange(t *testing.T) {
	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: "http://example.com", Method: "GET"}, nil, "")
	if err != nil {
		t.Fatalf("doHTTP err = %v, want nil", err)
	}
	if ex == nil || ex.Error == "" {
		t.Fatalf("expected exchange with Error set, got %#v", ex)
	}
}

func TestDoHTTPImageRendersAsDataURL(t *testing.T) {
	png := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 'I', 'H', 'D', 'R'}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatalf("doHTTP err = %v", err)
	}
	if ex.Error != "" {
		t.Fatalf("unexpected Error %q", ex.Error)
	}
	if !strings.HasPrefix(ex.ResImage, "data:image/png;base64,") {
		t.Fatalf("resImage = %q", ex.ResImage)
	}
	if strings.Contains(ex.ResBody, "IHDR") {
		t.Fatalf("raw image leaked into text body: %q", ex.ResBody)
	}
}

func TestDoHTTPBinarySurvivesJSON(t *testing.T) {
	payload := []byte{0x00, 0xff, 0xfe, 'A'}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream; charset=binary")
		_, _ = w.Write(payload)
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatal(err)
	}
	if ex.Error != "" {
		t.Fatalf("unexpected Error %q", ex.Error)
	}
	if !utf8.ValidString(ex.ResBody) || strings.ContainsRune(ex.ResBody, '\uFFFD') {
		t.Fatalf("label is not intact text: %q", ex.ResBody)
	}
	if !strings.HasPrefix(ex.ResData, "data:application/octet-stream;base64,") {
		t.Fatalf("resData = %q", ex.ResData)
	}
	encoded, err := json.Marshal(ex)
	if err != nil {
		t.Fatal(err)
	}
	var back HTTPExchange
	if err := json.Unmarshal(encoded, &back); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decodeDataURL(t, back.ResData), payload) {
		t.Fatalf("round trip = %x", decodeDataURL(t, back.ResData))
	}
}

func decodeDataURL(t *testing.T, raw string) []byte {
	t.Helper()
	const marker = ";base64,"
	i := strings.Index(raw, marker)
	if i < 0 || !strings.HasPrefix(raw, "data:") {
		t.Fatalf("not a data URL: %q", raw)
	}
	b, err := base64.StdEncoding.DecodeString(raw[i+len(marker):])
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestDoHTTPSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatalf("doHTTP err = %v", err)
	}
	if ex.Error != "" {
		t.Fatalf("unexpected Error %q", ex.Error)
	}
	if ex.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", ex.StatusCode)
	}
	if !strings.Contains(ex.ResBody, "ok") {
		t.Fatalf("body = %q", ex.ResBody)
	}
}

func TestDoHTTPDeleteAndOptionsSendBodies(t *testing.T) {
	for _, method := range []string{http.MethodDelete, http.MethodOptions} {
		t.Run(method, func(t *testing.T) {
			var received string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				receivedBytes, _ := io.ReadAll(r.Body)
				received = string(receivedBytes)
				w.WriteHeader(http.StatusNoContent)
			}))
			t.Cleanup(srv.Close)

			c := newWSClient(NewApp())
			ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Method: method}, newHTTPDoer(), `{"id":1}`)
			if err != nil {
				t.Fatal(err)
			}
			if ex.Error != "" || received != `{"id":1}` {
				t.Fatalf("exchange error %q, body = %q", ex.Error, received)
			}
		})
	}
}

func TestHTTPDoerRejectsSelfSignedByDefault(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Method: "GET"}, newHTTPDoer(), "")
	if err != nil {
		t.Fatalf("doHTTP err = %v", err)
	}
	if ex.Error == "" {
		t.Fatal("self-signed certificate accepted without explicit opt-in")
	}
	ex, err = c.doHTTP(ConnectOptions{URL: srv.URL, Method: "GET", InsecureSkipVerify: true}, newHTTPDoerWithTLS(true), "")
	if err != nil || ex.Error != "" || ex.StatusCode != http.StatusOK {
		t.Fatalf("explicit lab mode failed: exchange=%#v err=%v", ex, err)
	}
}

func TestHTTPHostOverrideIsSentAndLogged(t *testing.T) {
	var received string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = r.Host
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)
	c := newWSClient(NewApp())
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL, Headers: map[string]string{"hOsT": "virtual.example"}}, newHTTPDoer(), "")
	if err != nil || ex.Error != "" || received != "virtual.example" || ex.ReqHeaders["Host"] != received {
		t.Fatalf("Host override failed: received=%q exchange=%#v err=%v", received, ex, err)
	}
}

func TestHTTPClientTLSToggleAndCookieReset(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "sid", Value: "test"})
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)
	a := NewApp()
	a.baseDir = t.TempDir()
	c := newWSClient(a)
	t.Cleanup(c.Disconnect)
	for _, insecure := range []bool{false, true, false} {
		ex, err := c.RequestHTTP(ConnectOptions{URL: srv.URL, InsecureSkipVerify: insecure}, "")
		if err != nil || (ex.Error == "") != insecure {
			t.Fatalf("insecure=%v exchange=%#v err=%v", insecure, ex, err)
		}
	}
	previous := c.httpDoer
	jar := previous.Jar
	c.ClearCookies()
	if c.httpDoer == previous || c.httpDoer.Jar == jar || previous.Jar != jar {
		t.Fatal("cookie reset must replace the client without mutating in-flight requests")
	}
}

func TestHTTPMessageIsImmutableSnapshot(t *testing.T) {
	c := newWSClient(NewApp())
	ex := &HTTPExchange{StatusCode: 0, ReqHeaders: map[string]string{"X-Test": "before"}}
	c.pushEx("out", "request", ex)
	ex.StatusCode = http.StatusOK
	ex.ReqHeaders["X-Test"] = "after"
	got := c.Messages(0, 1)[0].Exchange
	if got.StatusCode != 0 || got.ReqHeaders["X-Test"] != "before" {
		t.Fatalf("message changed after logging: %#v", got)
	}
}

func TestCookieJarReusesSetCookie(t *testing.T) {
	var secondCookie string
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		if n == 1 {
			http.SetCookie(w, &http.Cookie{Name: "sid", Value: "abc"})
			_, _ = io.WriteString(w, "set")
			return
		}
		secondCookie = r.Header.Get("Cookie")
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	doer := newHTTPDoer()
	if _, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/", Method: "GET"}, doer, ""); err != nil {
		t.Fatal(err)
	}
	ex, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/", Method: "GET"}, doer, "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(secondCookie, "sid=abc") {
		t.Fatalf("second request cookie = %q", secondCookie)
	}
	if !strings.Contains(ex.ReqHeaders["Cookie"], "sid=abc") {
		t.Fatalf("logged Cookie = %#v", ex.ReqHeaders)
	}
}

func TestHTTPRedirectFollowToggle(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/go", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/dest", http.StatusFound)
	})
	mux.HandleFunc("/dest", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "arrived")
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := newWSClient(NewApp())
	doer := newHTTPDoer()
	stop, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/go", Method: "GET"}, httpDoerFor(doer, true), "")
	if err != nil {
		t.Fatal(err)
	}
	if stop.StatusCode != http.StatusFound {
		t.Fatalf("no-follow status = %d", stop.StatusCode)
	}
	follow, err := c.doHTTP(ConnectOptions{URL: srv.URL + "/go", Method: "GET"}, httpDoerFor(doer, false), "")
	if err != nil {
		t.Fatal(err)
	}
	if follow.StatusCode != http.StatusOK || !strings.Contains(follow.ResBody, "arrived") {
		t.Fatalf("follow got %d %q", follow.StatusCode, follow.ResBody)
	}
}
