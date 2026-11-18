package main

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLogFilesSplitHTTPAndWebSocket(t *testing.T) {
	dir := t.TempDir()
	now := time.Date(2026, 11, 18, 12, 0, 0, 0, beijingLocation())
	cases := []struct {
		url  string
		name string
	}{
		{"https://example.test/a", "http-2026-11-18-example.test.jsonl"},
		{"http://example.test/a", "http-2026-11-18-example.test.jsonl"},
		{"wss://example.test/a", "ws-2026-11-18-example.test.jsonl"},
		{"ws://example.test/a", "ws-2026-11-18-example.test.jsonl"},
	}
	for _, tc := range cases {
		l, err := openSessionLogger(dir, tc.url, "", now)
		if err != nil {
			t.Fatal(err)
		}
		if got := filepath.Base(l.Path()); got != tc.name {
			t.Fatalf("%s -> %s, want %s", tc.url, got, tc.name)
		}
		l.Close()
	}
}

func TestLoggerRollsToNextBeijingDay(t *testing.T) {
	dir := t.TempDir()
	start := time.Date(2026, 11, 18, 23, 30, 0, 0, beijingLocation())
	l, err := openSessionLogger(dir, "http://example.test/a", "GET", start)
	if err != nil {
		t.Fatal(err)
	}
	l.WriteMsg(Msg{Dir: "in", Text: "tonight"})
	l.now = func() time.Time { return start.Add(2 * time.Hour) }
	l.WriteMsg(Msg{Dir: "in", Text: "tomorrow"})
	l.Close()

	oldRows := readJSONL(t, filepath.Join(dir, "http-2026-11-18-example.test.jsonl"))
	newRows := readJSONL(t, filepath.Join(dir, "http-2026-11-19-example.test.jsonl"))
	if !jsonlHasText(oldRows, "tonight") || jsonlHasText(oldRows, "tomorrow") {
		t.Fatalf("yesterday kept the wrong rows: %#v", oldRows)
	}
	if jsonlHasText(newRows, "tonight") || !jsonlHasText(newRows, "tomorrow") {
		t.Fatalf("today kept the wrong rows: %#v", newRows)
	}
	if got := jsonlEvent(oldRows, "day_roll"); got["detail"] != "2026-11-19" || got["day"] != "2026-11-18" {
		t.Fatalf("day_roll = %#v", got)
	}
	oldStart := jsonlEvent(oldRows, "session_start")
	newStart := jsonlEvent(newRows, "session_start")
	if oldStart["session"] == "" || oldStart["session"] != newStart["session"] {
		t.Fatalf("session changed across midnight: %v -> %v", oldStart["session"], newStart["session"])
	}
	if newStart["url"] != "http://example.test/a" || newStart["day"] != "2026-11-19" {
		t.Fatalf("new session_start = %#v", newStart)
	}
	end := jsonlEvent(newRows, "session_end")
	if end["day"] != "2026-11-19" {
		t.Fatalf("session_end day = %#v", end)
	}
}

func readJSONL(t *testing.T, path string) []map[string]any {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var rows []map[string]any
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var row map[string]any
		if err := json.Unmarshal(sc.Bytes(), &row); err != nil {
			t.Fatal(err)
		}
		rows = append(rows, row)
	}
	if err := sc.Err(); err != nil {
		t.Fatal(err)
	}
	return rows
}

func jsonlHasText(rows []map[string]any, text string) bool {
	for _, row := range rows {
		if row["text"] == text {
			return true
		}
	}
	return false
}

func jsonlEvent(rows []map[string]any, event string) map[string]any {
	for _, row := range rows {
		if row["event"] == event {
			return row
		}
	}
	return nil
}
