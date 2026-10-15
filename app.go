package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails application API surface.
type App struct {
	ctx             context.Context
	baseDir         string
	defaultBaseDir  string
	hub             *clientHub
	profileMu       sync.Mutex
	profileWarnings []string

	histMu   sync.Mutex
	histPath string
	histFull *SessionDetail
}

const dataDirectoryName = "apitester-data"

// NewApp creates a new App application struct.
func NewApp() *App {
	base := resolveBaseDir()
	a := &App{baseDir: defaultDataDirectory(base), defaultBaseDir: base}
	a.hub = newClientHub(a)
	return a
}

func resolveBaseDir() string {
	// A local Wails build lives in <project>/build/bin. Its data must live at
	// the project root rather than in the disposable build output directory.
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		if filepath.Base(dir) == "bin" && filepath.Base(filepath.Dir(dir)) == "build" {
			return filepath.Dir(filepath.Dir(dir))
		}

		// Prefer executable directory when packaged; fall back to cwd for `wails dev`.
		// wails dev runs from a temp build path; if no data dirs nearby, use cwd.
		for _, name := range []string{dataDirectoryName} {
			if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
				return dir
			}
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}
	return "."
}

func (a *App) serversDir() string {
	return filepath.Join(a.baseDir, "connection-profiles")
}

func (a *App) requestsDir() string {
	return filepath.Join(a.baseDir, "api-requests")
}

type dataLocationConfig struct {
	Directory string `json:"directory"`
}

func dataLocationConfigPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "ApiTester", "data-location.json")
}

func (a *App) selectDataBaseDir() string {
	var pick func() (string, error)
	if a.ctx != nil {
		pick = func() (string, error) {
			return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
				Title: "选择 ApiTester 数据文件夹",
			})
		}
	}
	return a.selectDataDirectory(dataLocationConfigPath(), pick)
}

func defaultDataDirectory(base string) string {
	return filepath.Join(base, dataDirectoryName)
}

func saveDataLocationConfig(path, directory string) error {
	if path == "" {
		return nil
	}
	data, err := json.Marshal(dataLocationConfig{Directory: directory})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return atomicWriteFile(path, data, 0o600)
}

func (a *App) selectDataDirectory(path string, pick func() (string, error)) string {
	if path != "" {
		if raw, err := os.ReadFile(path); err == nil {
			var cfg dataLocationConfig
			if json.Unmarshal(raw, &cfg) == nil && cfg.Directory != "" {
				remembered := a.resolveRememberedDirectory(cfg.Directory)
				if dataDirectoryUsable(remembered) {
					a.rememberDataDirectory(path, remembered)
					return remembered
				}
			}
		}
	}

	base := defaultDataDirectory(a.defaultBaseDir)
	if dataDirectoryUsable(base) {
		a.rememberDataDirectory(path, base)
		return base
	}
	if pick == nil {
		return base
	}
	picked, err := pick()
	// A cancelled/failed dialog must not silently remember a fallback directory.
	if err != nil || picked == "" || !dataDirectoryUsable(filepath.Clean(picked)) {
		return base
	}
	picked = filepath.Clean(picked)
	a.rememberDataDirectory(path, picked)
	return picked
}

// resolveRememberedDirectory turns a saved location into a directory next to
// the program. Relative names stay relative to the program directory. An old
// absolute app-data path is not kept; it maps to apitester-data.
func (a *App) resolveRememberedDirectory(dir string) string {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return ""
	}
	cleaned := filepath.Clean(dir)
	if filepath.IsAbs(cleaned) {
		if filepath.Base(cleaned) == "app-data" || filepath.Base(cleaned) == dataDirectoryName {
			return defaultDataDirectory(a.defaultBaseDir)
		}
		return cleaned
	}
	if cleaned == "app-data" {
		cleaned = dataDirectoryName
	}
	return filepath.Join(a.defaultBaseDir, cleaned)
}

func (a *App) rememberDataDirectory(configPath, dir string) {
	if configPath == "" || dir == "" {
		return
	}
	_ = saveDataLocationConfig(configPath, a.locationToStore(dir))
}

func (a *App) locationToStore(dir string) string {
	dir = filepath.Clean(dir)
	rel, err := filepath.Rel(a.defaultBaseDir, dir)
	if err != nil || rel == "." || filepath.IsAbs(rel) || strings.HasPrefix(rel, "..") {
		return dir
	}
	return rel
}

func dataDirectoryUsable(dir string) bool {
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return false
	}
	probe, err := os.CreateTemp(dir, ".apitester-write-check-*")
	if err != nil {
		return false
	}
	name := probe.Name()
	closeErr := probe.Close()
	removeErr := os.Remove(name)
	return closeErr == nil && removeErr == nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.baseDir = a.selectDataBaseDir()
	_ = os.MkdirAll(a.requestsDir(), 0o755)
	_ = a.ensureServers()
}

func (a *App) shutdown(ctx context.Context) {
	if a.hub != nil {
		a.hub.DisconnectAll()
	}
}

// GetProfiles returns saved connection profiles (one per scheme + host[:port]).
// Reading profiles must never rewrite or remove user data.
func (a *App) GetProfiles() []Profile {
	a.profileMu.Lock()
	defer a.profileMu.Unlock()
	a.profileWarnings = nil
	list, err := a.loadProfiles()
	if err != nil {
		a.profileWarnings = append(a.profileWarnings, err.Error())
		return nil
	}
	return list
}

// GetProfileLoadError reports files that could not be read without hiding
// profiles that were loaded successfully.
func (a *App) GetProfileLoadError() string {
	a.profileMu.Lock()
	defer a.profileMu.Unlock()
	return strings.Join(a.profileWarnings, "\n")
}

// SaveProfile writes a profile keyed by scheme://host[:port].
func (a *App) SaveProfile(p Profile) error {
	a.profileMu.Lock()
	defer a.profileMu.Unlock()
	p.URL = strings.TrimSpace(p.URL)
	if p.URL != "" {
		if name := profileNameFromURL(p.URL); name != "" {
			p.Name = name
		} else if strings.TrimSpace(p.Project) != "" {
			// API paths belong to SavedRequest.URL. A project without an
			// environment must not persist that relative path as its base URL.
			p.URL = ""
		}
	}
	if p.URL == "" && strings.TrimSpace(p.Project) != "" && strings.TrimSpace(p.Name) == "" {
		p.Name = "project:" + strings.TrimSpace(p.Project)
	}
	if p.Name == "" {
		return fmt.Errorf("project or url host is required")
	}
	previous, _ := a.loadProfileByName(p.Name)
	p = a.mergeProfileRequests(p)
	if err := a.saveProfileFile(p); err != nil {
		return err
	}
	if previous.Name != "" && !strings.EqualFold(profileStorageFileName(previous), profileStorageFileName(p)) {
		_ = os.Remove(filepath.Join(a.serversDir(), profileStorageFileName(previous)))
	}
	return nil
}

// SaveRequest upserts a named request bookmark under the host profile.
func (a *App) SaveRequest(profileHint string, req SavedRequest) (SavedRequest, error) {
	a.profileMu.Lock()
	defer a.profileMu.Unlock()
	return a.saveRequestOnProfile(profileHint, req)
}

// DeleteRequest removes a named request bookmark from the host profile.
func (a *App) DeleteRequest(profileHint, id string) error {
	a.profileMu.Lock()
	defer a.profileMu.Unlock()
	return a.deleteRequestOnProfile(profileHint, id)
}

// ExportCatalog writes the current host profile JSON via a save dialog.
func (a *App) ExportCatalog(p Profile) (bool, error) {
	return a.exportCatalog(p)
}

// ExportAllCatalogs writes every local project catalog into one JSON bundle.
func (a *App) ExportAllCatalogs() (bool, error) {
	return a.exportAllCatalogs()
}

// ImportCatalog writes a picked catalog JSON, Postman Collection, or ApiZza project onto the hosts in the file.
func (a *App) ImportCatalog() (*Profile, error) {
	return a.importCatalog()
}

// DeleteProfile removes the saved preset for a scheme://host[:port] (or raw URL).
func (a *App) DeleteProfile(name string) error {
	a.profileMu.Lock()
	defer a.profileMu.Unlock()
	if err := a.deleteProfile(name); err != nil {
		return err
	}
	if a.hub != nil {
		a.hub.Remove(name)
	}
	return nil
}

// ClearCookies drops the in-memory cookie jar for the active host.
func (a *App) ClearCookies() {
	if a.hub != nil {
		a.hub.ClearCookies()
	}
}

// SelectProfile makes this profile the active live session.
func (a *App) SelectProfile(name string) {
	if a.hub != nil {
		a.hub.Select(name)
	}
}

// Connect opens a WebSocket.
func (a *App) Connect(opts ConnectOptions) error {
	return a.hub.Connect(opts)
}

// Disconnect closes the active profile's connection.
func (a *App) Disconnect() {
	a.hub.Disconnect()
}

// Send transmits a WebSocket text frame.
func (a *App) Send(text string) error {
	return a.hub.Send(text)
}

// RequestHTTP sends a one-shot HTTP/HTTPS request. No persistent connection.
func (a *App) RequestHTTP(opts ConnectOptions, body string) (*HTTPExchange, error) {
	return a.hub.RequestHTTP(opts, body)
}

// GetStatus returns the current connection status.
func (a *App) GetStatus() Status {
	return a.hub.Status()
}

// GetMessages returns messages after a given id.
func (a *App) GetMessages(afterID int64, limit int) []Msg {
	return a.hub.Messages(afterID, limit)
}

// ClearMessages clears the in-memory message buffer.
func (a *App) ClearMessages() {
	a.hub.Clear()
}

// GetPaths returns useful directories for the UI footer.
func (a *App) GetPaths() map[string]string {
	return map[string]string{
		"base":     a.baseDir,
		"requests": a.requestsDir(),
		"servers":  a.serversDir(),
	}
}

// FormatJSON pretty-prints JSON or returns the original text.
func (a *App) FormatJSON(text string) string {
	return prettyJSON(text)
}
