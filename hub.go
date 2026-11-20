package main

import (
	"fmt"
	"strings"
	"sync"
)

// clientHub keeps one live session per profile (scheme://host[:port]).
type clientHub struct {
	app    *App
	mu     sync.Mutex
	active string
	items  map[string]*wsClient
}

func newClientHub(app *App) *clientHub {
	return &clientHub{app: app, items: map[string]*wsClient{}}
}

func normalizeProfileKey(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if name := profileNameFromURL(raw); name != "" {
		return name
	}
	return raw
}

func (h *clientHub) getOrCreate(key string) *wsClient {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c, ok := h.items[key]; ok {
		return c
	}
	c := newWSClient(h.app)
	c.profile = key
	if strings.HasPrefix(key, "http://") || strings.HasPrefix(key, "https://") {
		c.kind = kindHTTP
		c.state = "idle"
	} else {
		c.kind = kindWS
	}
	h.items[key] = c
	return c
}

func (h *clientHub) forURL(raw string) (*wsClient, error) {
	key := normalizeProfileKey(raw)
	if key == "" {
		return nil, fmt.Errorf("地址需要包含主机")
	}
	return h.getOrCreate(key), nil
}

func (h *clientHub) Select(name string) {
	key := normalizeProfileKey(name)
	if key == "" {
		return
	}
	h.getOrCreate(key)
	h.mu.Lock()
	h.active = key
	h.mu.Unlock()
}

func (h *clientHub) current() *wsClient {
	h.mu.Lock()
	key := h.active
	h.mu.Unlock()
	if key == "" {
		return nil
	}
	return h.getOrCreate(key)
}

func (h *clientHub) Connect(opts ConnectOptions) error {
	c, err := h.forURL(opts.URL)
	if err != nil {
		return err
	}
	h.Select(c.profile)
	return c.Connect(opts)
}

func (h *clientHub) Disconnect() {
	if c := h.current(); c != nil {
		c.Disconnect()
	}
}

func (h *clientHub) DisconnectAll() {
	h.mu.Lock()
	list := make([]*wsClient, 0, len(h.items))
	for _, c := range h.items {
		list = append(list, c)
	}
	h.mu.Unlock()
	for _, c := range list {
		c.Disconnect()
	}
}

func (h *clientHub) Send(text string) error {
	c := h.current()
	if c == nil {
		return fmt.Errorf("未连接")
	}
	return c.Send(text)
}

// RequestHTTP sends one request to the host named by opts.URL and returns its
// exchange. It deliberately does not move the active profile.
//
// It used to call Select, which reads like bookkeeping but is a shared-state
// write: the active pointer is what Status, Messages, Clear and ClearCookies
// read. Any request therefore changed which session the whole window was
// looking at, and two requests in flight at once — a folder run crossing hosts,
// or anything that sends before the other finishes — fought over it, so the
// state bar and message list flickered between hosts. A request is a pure
// function of its options; who the window is watching is the caller's decision,
// made once when the user activates a request.
func (h *clientHub) RequestHTTP(opts ConnectOptions, body string) (*HTTPExchange, error) {
	c, err := h.forURL(opts.URL)
	if err != nil {
		return nil, err
	}
	return c.RequestHTTP(opts, body)
}

func (h *clientHub) Status() Status {
	if c := h.current(); c != nil {
		return c.Status()
	}
	return Status{State: "idle"}
}

func (h *clientHub) Messages(afterID int64, limit int) []Msg {
	if c := h.current(); c != nil {
		return c.Messages(afterID, limit)
	}
	return nil
}

func (h *clientHub) Clear() {
	if c := h.current(); c != nil {
		c.Clear()
	}
}

func (h *clientHub) Remove(name string) {
	key := normalizeProfileKey(name)
	if key == "" {
		return
	}
	h.mu.Lock()
	c := h.items[key]
	if h.active == key {
		h.active = ""
	}
	delete(h.items, key)
	h.mu.Unlock()
	if c != nil {
		c.Disconnect()
	}
}

func (h *clientHub) ClearCookies() {
	if c := h.current(); c != nil {
		c.ClearCookies()
	}
}
