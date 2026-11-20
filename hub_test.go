package main

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// newTestHub builds a hub over a temp data dir so a request can write its log
// without touching the real one. Every session it creates is disconnected at
// cleanup: each holds an open log file, and Windows refuses to remove the temp
// directory while one is still open.
func newTestHub(t *testing.T) *clientHub {
	t.Helper()
	a := NewApp()
	a.baseDir = t.TempDir()
	h := newClientHub(a)
	t.Cleanup(h.DisconnectAll)
	return h
}

// activeOf reports the hub's active pointer under its own lock, the same way
// Status and Messages read it.
func activeOf(h *clientHub) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.active
}

func okServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	t.Cleanup(srv.Close)
	return srv
}

// Sending must not change which session the window is watching. The active
// pointer is read by Status, Messages, Clear and ClearCookies; a request that
// moved it would make the state bar and message list follow whatever was sent
// last instead of what the user has selected.
func TestRequestHTTPDoesNotMoveActiveProfile(t *testing.T) {
	h := newTestHub(t)
	a := okServer(t)
	b := okServer(t)

	h.Select(profileNameFromURL(a.URL))
	before := activeOf(h)
	if before == "" {
		t.Fatal("setup: active profile not set")
	}

	if _, err := h.RequestHTTP(ConnectOptions{URL: b.URL, Method: "GET"}, ""); err != nil {
		t.Fatalf("RequestHTTP: %v", err)
	}

	if after := activeOf(h); after != before {
		t.Fatalf("active moved from %q to %q after sending to another host", before, after)
	}
	if got := h.Status().Profile; got != before {
		t.Fatalf("Status reports profile %q, want the active one %q", got, before)
	}
}

// Two requests in flight at once, each to a different host, must leave the
// active pointer exactly where it was. This is the case that made a folder run
// crossing hosts flicker the state bar: every response used to re-point the
// shared pointer, so the last writer won.
func TestConcurrentRequestHTTPKeepsActiveStable(t *testing.T) {
	h := newTestHub(t)
	a := okServer(t)
	b := okServer(t)

	h.Select(profileNameFromURL(a.URL))
	want := activeOf(h)

	const rounds = 24
	var wg sync.WaitGroup
	for i := 0; i < rounds; i++ {
		target := b.URL
		if i%2 == 0 {
			target = a.URL
		}
		wg.Add(1)
		go func(url string) {
			defer wg.Done()
			if _, err := h.RequestHTTP(ConnectOptions{URL: url, Method: "GET"}, ""); err != nil {
				t.Errorf("RequestHTTP %s: %v", url, err)
			}
		}(target)
	}
	wg.Wait()

	if got := activeOf(h); got != want {
		t.Fatalf("active moved to %q during concurrent sends, want %q", got, want)
	}
}

// Each host keeps its own session, so a request routed by URL lands in that
// host's history and nowhere else.
func TestRequestHTTPRoutesByURLNotByActive(t *testing.T) {
	h := newTestHub(t)
	a := okServer(t)
	b := okServer(t)

	keyA := profileNameFromURL(a.URL)
	keyB := profileNameFromURL(b.URL)
	h.Select(keyA)

	if _, err := h.RequestHTTP(ConnectOptions{URL: b.URL, Method: "GET"}, ""); err != nil {
		t.Fatalf("RequestHTTP: %v", err)
	}

	// The active session is still A, so its own message list must not have
	// picked up the exchange that went to B.
	for _, m := range h.Messages(0, 100) {
		if m.Profile != keyA {
			t.Fatalf("session %q holds a message for %q", keyA, m.Profile)
		}
	}

	h.Select(keyB)
	found := false
	for _, m := range h.Messages(0, 100) {
		if m.Profile != keyB {
			t.Fatalf("session %q holds a message for %q", keyB, m.Profile)
		}
		found = true
	}
	if !found {
		t.Fatalf("host %q has no recorded exchange", keyB)
	}
}

// Selecting is still how the active session is chosen; the fix removed the
// side effect from sending, not the ability to switch.
func TestSelectStillSetsActiveProfile(t *testing.T) {
	h := newTestHub(t)
	a := okServer(t)
	key := profileNameFromURL(a.URL)
	h.Select(key)
	if got := activeOf(h); got != key {
		t.Fatalf("active = %q, want %q", got, key)
	}
	if got := h.Status().Profile; got != key {
		t.Fatalf("Status profile = %q, want %q", got, key)
	}
}
