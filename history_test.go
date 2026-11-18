package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestParseLogNameAcceptsHTTPAndWSFiles(t *testing.T) {
	day, host := parseLogName("http-2026-11-18-example.test.jsonl")
	if day != "2026-11-18" || host != "example.test" {
		t.Fatalf("http file = %s %s", day, host)
	}
	day, host = parseLogName("ws-2026-11-18-example.test.jsonl")
	if day != "2026-11-18" || host != "example.test" {
		t.Fatalf("ws file = %s %s", day, host)
	}
	day, host = parseLogName("ws-2026-11-18.jsonl")
	if day != "2026-11-18" || host != "" {
		t.Fatalf("ws file without host = %s %q", day, host)
	}
	day, host = parseLogName("session-old.jsonl")
	if day != "" || host != "" {
		t.Fatalf("legacy file = %s %s", day, host)
	}
}

func TestPeekSessionURLStopsEarly(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ws-2026-08-17-uapis.cn.jsonl")
	var b strings.Builder
	b.WriteString(`{"kind":"meta","event":"session_start","url":"https://uapis.cn/redirect/1"}` + "\n")
	pad := strings.Repeat("x", 2000)
	for i := 0; i < 200; i++ {
		b.WriteString(`{"kind":"msg","dir":"in","text":"` + pad + `","url":"https://should-not-scan.example"}` + "\n")
	}
	if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
		t.Fatal(err)
	}
	got := peekSessionURL(path)
	if got != "https://uapis.cn/redirect/1" {
		t.Fatalf("url = %q", got)
	}
}

func TestLoadSessionSlimsBodies(t *testing.T) {
	dir := t.TempDir()
	a := NewApp()
	a.baseDir = dir
	logDir := a.requestsDir()
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatal(err)
	}
	body := strings.Repeat("{\"k\":1}", 4000)
	line := `{"kind":"msg","dir":"in","ts":"12:00:00","text":` + jsonQuote(body) + `,"bytes":` + strconv.Itoa(len(body)) + `,"exchange":{"method":"GET","url":"https://uapis.cn/redirect/1","status":"200 OK","statusCode":200,"resBody":` + jsonQuote(body) + `}}` + "\n"
	name := "ws-2026-08-17-uapis.cn.jsonl"
	if err := os.WriteFile(filepath.Join(logDir, name), []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}
	d, err := a.LoadSession(name)
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Messages) != 1 {
		t.Fatalf("msgs = %d", len(d.Messages))
	}
	m := d.Messages[0]
	if !m.Slim {
		t.Fatal("expected slim list row")
	}
	if m.Exchange == nil || len(m.Exchange.ResBody) >= len(body) {
		t.Fatalf("list body not clipped: %d", len(m.Exchange.ResBody))
	}
	full, err := a.LoadSessionMessage(m.ID)
	if err != nil {
		t.Fatal(err)
	}
	if full.Exchange == nil || full.Exchange.ResBody != body {
		t.Fatalf("full body = %d want %d", len(full.Exchange.ResBody), len(body))
	}
}

func TestBinaryPayloadRoundTripsThroughHistory(t *testing.T) {
	a := NewApp()
	a.baseDir = t.TempDir()
	payload := []byte{0xff, 0x00, 0x01}
	dataURL := binaryDataURL("application/pdf", payload)
	label := binaryBodyLabel("application/pdf", len(payload), false)
	logger, err := newSessionLogger(a.requestsDir(), "http://example.test/file", "")
	if err != nil {
		t.Fatal(err)
	}
	logger.WriteMsg(Msg{
		Dir:    "in",
		Text:   label,
		Pretty: label,
		Data:   dataURL,
		Bytes:  len(payload),
		Exchange: &HTTPExchange{
			Method:  "GET",
			URL:     "http://example.test/file",
			ResBody: label,
			ResData: dataURL,
		},
	})
	logger.Close()

	d, err := a.LoadSession(filepath.Base(logger.Path()))
	if err != nil {
		t.Fatal(err)
	}
	var m Msg
	for _, item := range d.Messages {
		if item.Exchange != nil {
			m = item
			break
		}
	}
	if m.ID == 0 {
		t.Fatal("binary message missing from history")
	}
	if m.Data != "" || m.Exchange.ResData != "" {
		t.Fatal("list row kept the binary payload")
	}
	full, err := a.LoadSessionMessage(m.ID)
	if err != nil {
		t.Fatal(err)
	}
	if full.Data != dataURL || full.Exchange == nil || full.Exchange.ResData != dataURL {
		t.Fatalf("full data missing: %#v", full)
	}
	if !bytes.Equal(decodeDataURL(t, full.Exchange.ResData), payload) {
		t.Fatal("history payload mismatch")
	}
}

func jsonQuote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
