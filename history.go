package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SessionInfo is a daily log file summary for the history list.
type SessionInfo struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	ModTime    string `json:"modTime"`
	URL        string `json:"url,omitempty"`
	Host       string `json:"host,omitempty"`
	Day        string `json:"day,omitempty"`
	MatchCount int    `json:"matchCount,omitempty"`
	MatchHint  string `json:"matchHint,omitempty"`
}

// SessionDetail is a fully loaded jsonl day (or legacy session) file.
type SessionDetail struct {
	Info     SessionInfo `json:"info"`
	URL      string      `json:"url"`
	Protocol string      `json:"protocol"`
	Messages []Msg       `json:"messages"`
	Notes    []string    `json:"notes"`
}

// ListSessions returns daily log files under the log directory (newest first).
func (a *App) ListSessions() ([]SessionInfo, error) {
	return a.listSessions("")
}

// SearchSessions filters daily logs by keyword (file name, url, content).
func (a *App) SearchSessions(keyword string) ([]SessionInfo, error) {
	return a.listSessions(keyword)
}

func (a *App) listSessions(keyword string) ([]SessionInfo, error) {
	dir := a.requestsDir()
	_ = os.MkdirAll(dir, 0o755)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	kw := strings.ToLower(strings.TrimSpace(keyword))
	var list []SessionInfo
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		low := strings.ToLower(name)
		if !strings.HasSuffix(low, ".jsonl") {
			continue
		}
		// Daily files are http-YYYY-MM-DD[-host].jsonl and ws-YYYY-MM-DD[-host].jsonl.
		// Older HTTP traffic may still be in a ws- file. Legacy session-*.jsonl stays visible.
		info, err := e.Info()
		if err != nil {
			continue
		}
		path := filepath.Join(dir, name)
		day, fileHost := parseLogName(name)
		si := SessionInfo{
			Name:    name,
			Path:    path,
			Size:    info.Size(),
			ModTime: info.ModTime().In(beijingLocation()).Format("2006-01-02 15:04:05"),
			Day:     day,
			Host:    fileHost,
		}
		si.URL = peekSessionURL(path)
		if h := urlHostPort(si.URL); h != "" {
			si.Host = h
		}

		if kw != "" {
			nameHit := strings.Contains(strings.ToLower(si.Name), kw) ||
				strings.Contains(strings.ToLower(si.Day), kw) ||
				strings.Contains(strings.ToLower(si.Host), kw)
			urlHit := strings.Contains(strings.ToLower(si.URL), kw)
			count, hint := scanKeywordHits(path, kw)
			si.MatchCount = count
			si.MatchHint = hint
			if !nameHit && !urlHit && count == 0 {
				continue
			}
		}
		list = append(list, si)
	}
	sort.Slice(list, func(i, j int) bool {
		di, dj := list[i].Day, list[j].Day
		if di != "" && dj != "" && di != dj {
			return di > dj
		}
		if kw != "" && list[i].MatchCount != list[j].MatchCount {
			return list[i].MatchCount > list[j].MatchCount
		}
		hi, hj := list[i].Host, list[j].Host
		if hi != hj {
			return hi < hj
		}
		return list[i].ModTime > list[j].ModTime
	})
	return list, nil
}

// parseLogName understands http- and ws- daily files, with or without a host.
func parseLogName(name string) (day, host string) {
	base := strings.TrimSuffix(name, filepath.Ext(name))
	var rest string
	switch {
	case strings.HasPrefix(base, "http-"):
		rest = strings.TrimPrefix(base, "http-")
	case strings.HasPrefix(base, "ws-"):
		rest = strings.TrimPrefix(base, "ws-")
	default:
		return "", ""
	}
	if len(rest) < 10 {
		return "", ""
	}
	if _, err := time.ParseInLocation("2006-01-02", rest[:10], beijingLocation()); err != nil {
		return "", ""
	}
	day = rest[:10]
	if len(rest) > 11 && rest[10] == '-' {
		host = rest[11:]
	}
	return day, host
}

// scanKeywordHits counts case-insensitive substring hits in a jsonl file.
func scanKeywordHits(path, kwLower string) (int, string) {
	if kwLower == "" {
		return 0, ""
	}
	f, err := os.Open(path)
	if err != nil {
		return 0, ""
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	hits := 0
	hint := ""
	for sc.Scan() {
		line := sc.Text()
		low := strings.ToLower(line)
		idx := 0
		for {
			p := strings.Index(low[idx:], kwLower)
			if p < 0 {
				break
			}
			hits++
			if hint == "" {
				abs := idx + p
				start := abs - 40
				if start < 0 {
					start = 0
				}
				end := abs + len(kwLower) + 40
				if end > len(line) {
					end = len(line)
				}
				hint = strings.ReplaceAll(line[start:end], "\t", " ")
				if start > 0 {
					hint = "…" + hint
				}
				if end < len(line) {
					hint = hint + "…"
				}
			}
			idx += p + len(kwLower)
			if idx >= len(low) {
				break
			}
			if hits >= 500 {
				return hits, hint
			}
		}
	}
	return hits, hint
}

// LoadSession loads a log by file name (must be under log dir).
func (a *App) LoadSession(name string) (*SessionDetail, error) {
	if name == "" {
		return nil, fmt.Errorf("名称不能为空")
	}
	logDir, err := filepath.Abs(a.requestsDir())
	if err != nil {
		return nil, err
	}
	// allow only basename to avoid path escape
	path := filepath.Join(logDir, filepath.Base(name))
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	rel, err := filepath.Rel(logDir, abs)
	if err != nil || strings.HasPrefix(rel, "..") {
		return nil, fmt.Errorf("日志必须在日志目录内")
	}
	d, err := loadSessionFile(abs)
	if err != nil {
		return nil, err
	}
	a.setHistCache(abs, d)
	return slimDetail(d), nil
}

// PickAndLoadSession opens a file dialog and loads any .jsonl log.
func (a *App) PickAndLoadSession() (*SessionDetail, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开日志 (.jsonl)",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Lines", Pattern: "*.jsonl"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
		DefaultDirectory: a.requestsDir(),
	})
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil
	}
	d, err := loadSessionFile(path)
	if err != nil {
		return nil, err
	}
	a.setHistCache(path, d)
	return slimDetail(d), nil
}

// LoadSessionMessage returns the full cached history row (after LoadSession).
func (a *App) LoadSessionMessage(id int64) (*Msg, error) {
	a.histMu.Lock()
	defer a.histMu.Unlock()
	if a.histFull == nil {
		return nil, fmt.Errorf("尚未加载历史")
	}
	for i := range a.histFull.Messages {
		if a.histFull.Messages[i].ID == id {
			m := a.histFull.Messages[i]
			if m.Exchange != nil && len(m.Pretty) > 512 {
				m.Pretty = ""
			}
			return &m, nil
		}
	}
	return nil, fmt.Errorf("找不到该消息")
}

func (a *App) setHistCache(path string, d *SessionDetail) {
	a.histMu.Lock()
	a.histPath = path
	a.histFull = d
	a.histMu.Unlock()
}

// OpenLogDir reveals the log folder in Explorer.
func (a *App) OpenLogDir() error {
	dir := a.requestsDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return exec.Command("explorer", dir).Start()
}

func peekSessionURL(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 32*1024), 256*1024)
	url := ""
	for i := 0; i < 80 && sc.Scan(); i++ {
		var row struct {
			Kind string `json:"kind"`
			URL  string `json:"url"`
		}
		if json.Unmarshal(sc.Bytes(), &row) != nil || row.URL == "" {
			continue
		}
		url = row.URL
		if row.Kind == "meta" {
			return url
		}
	}
	return url
}

func loadSessionFile(path string) (*SessionDetail, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return nil, err
	}

	name := filepath.Base(path)
	day, host := parseLogName(name)
	detail := &SessionDetail{
		Info: SessionInfo{
			Name:    name,
			Path:    path,
			Size:    st.Size(),
			ModTime: st.ModTime().In(beijingLocation()).Format("2006-01-02 15:04:05"),
			Day:     day,
			Host:    host,
		},
		Messages: make([]Msg, 0, 256),
		Notes:    make([]string, 0),
	}

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 256*1024), 16*1024*1024)

	var autoID int64
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var row histRow
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}
		switch row.Kind {
		case "meta":
			if row.URL != "" {
				detail.URL = row.URL
				detail.Info.URL = row.URL
				if h := urlHostPort(row.URL); h != "" {
					detail.Info.Host = h
				}
			}
			if row.Host != "" && detail.Info.Host == "" {
				detail.Info.Host = row.Host
			}
			if row.Protocol != "" {
				detail.Protocol = row.Protocol
			}
			if row.Event != "" {
				detail.Notes = append(detail.Notes, row.Event)
				autoID++
				text := row.Event
				if row.Session != "" {
					text += " #" + row.Session
				}
				if row.URL != "" {
					text += " " + row.URL
				}
				detail.Messages = append(detail.Messages, Msg{
					ID:     autoID,
					Dir:    "sys",
					Time:   row.TS,
					Text:   text,
					Pretty: text,
					Bytes:  len(text),
				})
			}
		case "sys":
			autoID++
			text := row.Event
			if row.Detail != "" {
				if text != "" {
					text += ": "
				}
				text += row.Detail
			}
			if text == "" {
				text = line
			}
			detail.Messages = append(detail.Messages, Msg{
				ID:     autoID,
				Dir:    "sys",
				Time:   row.TS,
				Text:   text,
				Pretty: text,
				Bytes:  len(text),
			})
		case "msg":
			autoID++
			m := Msg{
				ID:       autoID,
				Dir:      row.Dir,
				Time:     row.TS,
				Text:     row.Text,
				Pretty:   row.Pretty,
				Data:     row.Data,
				Bytes:    row.Bytes,
				Exchange: row.Exchange,
				WS:       row.WS,
			}
			if m.Dir == "" {
				m.Dir = "sys"
			}
			if m.Pretty == "" {
				m.Pretty = m.Text
			}
			if m.Bytes == 0 {
				m.Bytes = len(m.Text)
			}
			detail.Messages = append(detail.Messages, m)
		default:
			if row.Text == "" {
				continue
			}
			autoID++
			dir := row.Dir
			if dir == "" {
				dir = "sys"
			}
			detail.Messages = append(detail.Messages, Msg{
				ID:     autoID,
				Dir:    dir,
				Time:   row.TS,
				Text:   row.Text,
				Pretty: row.Text,
				Bytes:  len(row.Text),
			})
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return detail, nil
}

type histRow struct {
	Kind     string        `json:"kind"`
	Dir      string        `json:"dir"`
	TS       string        `json:"ts"`
	Text     string        `json:"text"`
	Pretty   string        `json:"pretty"`
	Data     string        `json:"data,omitempty"`
	Bytes    int           `json:"bytes"`
	URL      string        `json:"url"`
	Host     string        `json:"host"`
	Protocol string        `json:"protocol"`
	Event    string        `json:"event"`
	Detail   string        `json:"detail"`
	Session  string        `json:"session"`
	Exchange *HTTPExchange `json:"exchange"`
	WS       *WSRecord     `json:"ws"`
}

const slimPreview = 480

func slimMsg(m Msg) Msg {
	out := m
	out.Slim = true
	out.Data = ""
	out.Text = clipText(m.Text, slimPreview)
	out.Pretty = clipText(m.Pretty, slimPreview)
	if m.Exchange != nil {
		ex := *m.Exchange
		ex.ReqBody = clipText(ex.ReqBody, slimPreview)
		ex.ResBody = clipText(ex.ResBody, slimPreview)
		ex.ResData = ""
		out.Exchange = &ex
	}
	if m.WS != nil {
		ws := *m.WS
		ws.Out = clipText(ws.Out, slimPreview)
		ws.In = clipText(ws.In, slimPreview)
		out.WS = &ws
	}
	return out
}

func slimDetail(d *SessionDetail) *SessionDetail {
	if d == nil {
		return nil
	}
	out := *d
	out.Messages = make([]Msg, len(d.Messages))
	for i, m := range d.Messages {
		out.Messages[i] = slimMsg(m)
	}
	return &out
}
