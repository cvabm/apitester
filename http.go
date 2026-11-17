package main

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"
)

const (
	maxHTTPBody     = 2 << 20
	httpReqTimeout  = 30 * time.Second
	httpDialTimeout = 10 * time.Second
)

// tlsConfig verifies certificates unless the user explicitly enables lab mode.
func tlsConfig(insecure bool) *tls.Config {
	return &tls.Config{
		InsecureSkipVerify: insecure,
		MinVersion:         tls.VersionTLS12,
	}
}

func newCookieJar() http.CookieJar {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil
	}
	return jar
}

func newHTTPDoer() *http.Client {
	return newHTTPDoerWithTLS(false)
}

func newHTTPDoerWithTLS(insecure bool) *http.Client {
	return &http.Client{
		Timeout: httpReqTimeout,
		Jar:     newCookieJar(),
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   httpDialTimeout,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          16,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			TLSClientConfig:       tlsConfig(insecure),
		},
	}
}

// httpDoerFor shares Transport and CookieJar with base. noFollow returns 3xx as-is.
func httpDoerFor(base *http.Client, noFollow bool) *http.Client {
	if base == nil || !noFollow {
		return base
	}
	clone := *base
	clone.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &clone
}

func snapshotJarCookies(headers map[string]string, jar http.CookieJar, rawURL string) {
	if jar == nil || headers == nil {
		return
	}
	for k, v := range headers {
		if strings.EqualFold(k, "Cookie") && strings.TrimSpace(v) != "" {
			return
		}
	}
	u, err := url.Parse(rawURL)
	if err != nil || u == nil {
		return
	}
	cs := jar.Cookies(u)
	if len(cs) == 0 {
		return
	}
	parts := make([]string, 0, len(cs))
	for _, ck := range cs {
		if ck == nil {
			continue
		}
		parts = append(parts, ck.Name+"="+ck.Value)
	}
	if len(parts) > 0 {
		headers["Cookie"] = strings.Join(parts, "; ")
	}
}

func normalizeHTTPMethod(method, body string) string {
	m := strings.ToUpper(strings.TrimSpace(method))
	if m == "" {
		if strings.TrimSpace(body) == "" {
			return http.MethodGet
		}
		return http.MethodPost
	}
	return m
}

func methodOmitsBody(method string) bool {
	switch strings.ToUpper(method) {
	case http.MethodGet, http.MethodHead:
		return true
	default:
		return false
	}
}

func looksLikeJSON(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" {
		return false
	}
	return (t[0] == '{' && strings.HasSuffix(t, "}")) || (t[0] == '[' && strings.HasSuffix(t, "]"))
}

func applyHTTPHeaders(req *http.Request, headers map[string]string, body string) {
	for k, v := range headers {
		if k == "" {
			continue
		}
		// Go treats Host specially; setting Header["Host"] has no wire effect.
		if strings.EqualFold(k, "Host") {
			req.Host = v
			continue
		}
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "ApiTester")
	}
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json, text/plain, */*")
	}
	if body != "" && req.Header.Get("Content-Type") == "" {
		if looksLikeJSON(body) {
			req.Header.Set("Content-Type", "application/json")
		} else {
			req.Header.Set("Content-Type", "text/plain")
		}
	}
}

func responseImageType(contentType string, body []byte) string {
	if len(body) == 0 {
		return ""
	}
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.Index(ct, ";"); i >= 0 {
		ct = strings.TrimSpace(ct[:i])
	}
	if strings.HasPrefix(ct, "image/") {
		return ct
	}
	switch {
	case bytes.HasPrefix(body, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png"
	case bytes.HasPrefix(body, []byte("\xff\xd8\xff")):
		return "image/jpeg"
	case bytes.HasPrefix(body, []byte("GIF87a")), bytes.HasPrefix(body, []byte("GIF89a")):
		return "image/gif"
	case len(body) >= 12 && bytes.HasPrefix(body, []byte("RIFF")) && bytes.Equal(body[8:12], []byte("WEBP")):
		return "image/webp"
	default:
		return ""
	}
}

func readHTTPBody(r io.Reader) (string, int64, bool, error) {
	limited := io.LimitReader(r, maxHTTPBody+1)
	b, err := io.ReadAll(limited)
	if err != nil {
		return "", 0, false, err
	}
	truncated := int64(len(b)) > maxHTTPBody
	if truncated {
		b = b[:maxHTTPBody]
	}
	return string(b), int64(len(b)), truncated, nil
}

func formatHTTPOut(method, rawURL, body string) string {
	if strings.TrimSpace(body) == "" {
		return method + " " + rawURL
	}
	return body
}

func formatHTTPIn(status string, body string, truncated bool) string {
	if strings.TrimSpace(body) == "" {
		return "HTTP " + status + " (empty body)"
	}
	if truncated {
		return body + fmt.Sprintf("\n\n… truncated at %d bytes", maxHTTPBody)
	}
	return body
}

func flattenHeader(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for k, vs := range h {
		out[k] = strings.Join(vs, ", ")
	}
	return out
}
