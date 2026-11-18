package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type sessionLogger struct {
	mu       sync.Mutex
	file     *os.File
	session  string
	day      string
	host     string
	path     string
	dir      string
	rawURL   string
	protocol string
	family   string
	now      func() time.Time
}

func beijingLocation() *time.Location {
	return time.FixedZone("CST", 8*3600)
}

func beijingDate(t time.Time) string {
	return t.In(beijingLocation()).Format("2006-01-02")
}

// logFamily groups http/https together and ws/wss together. Anything else keeps the historical ws- file.
func logFamily(rawURL string) string {
	switch strings.ToLower(urlSchemeOf(rawURL)) {
	case "http", "https":
		return "http"
	default:
		return "ws"
	}
}

// dailyLogPath returns requests/{http|ws}-YYYY-MM-DD[-host].jsonl (one file per day + host, CST).
func dailyLogPath(logDir string, t time.Time, family, host string) (day, path string) {
	if family != "http" {
		family = "ws"
	}
	day = beijingDate(t)
	name := family + "-" + day
	host = strings.TrimSpace(host)
	if host != "" {
		name += "-" + sanitizeName(host)
	}
	return day, filepath.Join(logDir, name+".jsonl")
}

func newSessionLogger(logDir, rawURL, protocol string) (*sessionLogger, error) {
	l, err := openSessionLogger(logDir, rawURL, protocol, time.Now())
	if l != nil {
		l.now = nil
	}
	return l, err
}

func openSessionLogger(logDir, rawURL, protocol string, now time.Time) (*sessionLogger, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, err
	}
	host := urlHostname(rawURL)
	family := logFamily(rawURL)
	day, path := dailyLogPath(logDir, now, family, host)
	session := now.In(beijingLocation()).Format("150405")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	opened := now
	l := &sessionLogger{
		file:     f,
		session:  session,
		day:      day,
		host:     host,
		path:     path,
		dir:      logDir,
		rawURL:   rawURL,
		protocol: protocol,
		family:   family,
		now:      func() time.Time { return opened },
	}
	_ = l.write(l.sessionStartRow(opened))
	return l, nil
}

func (l *sessionLogger) clock() time.Time {
	if l.now != nil {
		return l.now()
	}
	return time.Now()
}

func (l *sessionLogger) sessionStartRow(now time.Time) map[string]any {
	return map[string]any{
		"v":        1,
		"kind":     "meta",
		"event":    "session_start",
		"ts":       now.In(beijingLocation()).Format(time.RFC3339Nano),
		"url":      l.rawURL,
		"host":     l.host,
		"protocol": l.protocol,
		"session":  l.session,
		"day":      l.day,
	}
}

func (l *sessionLogger) SessionID() string {
	if l == nil {
		return ""
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.host != "" {
		return l.day + "/" + l.host + "/" + l.session
	}
	return l.day + "/" + l.session
}

func (l *sessionLogger) Host() string {
	if l == nil {
		return ""
	}
	return l.host
}

func (l *sessionLogger) Path() string {
	if l == nil {
		return ""
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.path
}

func (l *sessionLogger) WriteMsg(m Msg) {
	if l == nil {
		return
	}
	row := map[string]any{
		"v":       1,
		"kind":    "msg",
		"ts":      m.Time,
		"id":      m.ID,
		"dir":     m.Dir,
		"bytes":   m.Bytes,
		"text":    m.Text,
		"pretty":  m.Pretty,
		"session": "",
		"day":     "",
	}
	if m.Data != "" {
		row["data"] = m.Data
	}
	if m.Exchange != nil {
		row["exchange"] = m.Exchange
	}
	if m.WS != nil {
		row["ws"] = m.WS
	}
	_ = l.write(row)
}

func (l *sessionLogger) WriteSys(event, detail string) {
	if l == nil {
		return
	}
	_ = l.write(map[string]any{
		"v":       1,
		"kind":    "sys",
		"ts":      beijingNow(),
		"event":   event,
		"detail":  detail,
		"session": "",
		"day":     "",
	})
}

func (l *sessionLogger) write(v any) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file == nil {
		return nil
	}
	if err := l.rollUnlocked(l.clock()); err != nil {
		return err
	}
	if row, ok := v.(map[string]any); ok {
		if _, has := row["day"]; has {
			row["day"] = l.day
		}
		if _, has := row["session"]; has {
			row["session"] = l.session
		}
	}
	return l.writeUnlocked(v)
}

func (l *sessionLogger) writeUnlocked(v any) error {
	if l.file == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = l.file.Write(append(b, '\n'))
	return err
}

// rollUnlocked moves a logger that is still open after midnight onto today's file.
// The session id stays the one chosen at open.
func (l *sessionLogger) rollUnlocked(now time.Time) error {
	day := beijingDate(now)
	if l.file == nil || day == l.day {
		return nil
	}
	_, path := dailyLogPath(l.dir, now, l.family, l.host)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_ = l.writeUnlocked(map[string]any{
		"v":       1,
		"kind":    "sys",
		"ts":      now.In(beijingLocation()).Format("2006-01-02 15:04:05.000"),
		"event":   "day_roll",
		"detail":  day,
		"session": l.session,
		"day":     l.day,
	})
	_ = l.file.Close()
	l.file = f
	l.day = day
	l.path = path
	return l.writeUnlocked(l.sessionStartRow(now))
}

func (l *sessionLogger) Close() {
	if l == nil {
		return
	}
	l.WriteSys("session_end", "")
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		_ = l.file.Close()
		l.file = nil
	}
}

func beijingNow() string {
	return time.Now().In(beijingLocation()).Format("2006-01-02 15:04:05.000")
}

func prettyJSON(text string) string {
	var v any
	if err := json.Unmarshal([]byte(text), &v); err != nil {
		return text
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return text
	}
	return string(b)
}

func clipText(s string, n int) string {
	if n <= 0 || len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	if n <= 0 {
		return "…"
	}
	return s[:n] + "…"
}
