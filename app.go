package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
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
	needsDataDir    bool
	dataMu          sync.RWMutex // baseDir and needsDataDir
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
	a := &App{defaultBaseDir: base, needsDataDir: true}
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

func (a *App) setDataDirectory(dir string, needed bool) {
	a.dataMu.Lock()
	a.baseDir = dir
	a.needsDataDir = needed
	a.dataMu.Unlock()
}

func (a *App) currentBaseDir() string {
	a.dataMu.RLock()
	defer a.dataMu.RUnlock()
	return a.baseDir
}

func (a *App) serversDir() string {
	return filepath.Join(a.currentBaseDir(), "connection-profiles")
}

func (a *App) requestsDir() string {
	return filepath.Join(a.currentBaseDir(), "api-requests")
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

func (a *App) readRememberedDataDirectory(configPath string) string {
	if configPath == "" {
		return ""
	}
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return ""
	}
	var cfg dataLocationConfig
	if json.Unmarshal(raw, &cfg) != nil || cfg.Directory == "" {
		return ""
	}
	return a.resolveRememberedDirectory(cfg.Directory)
}

// selectDataDirectory resolves a remembered location. It never opens a system
// folder dialog and never silently adopts a nearby default folder.
func (a *App) selectDataDirectory(path string, pick func() (string, error)) string {
	if remembered := a.readRememberedDataDirectory(path); remembered != "" && dataDirectoryUsable(remembered) {
		a.rememberDataDirectory(path, remembered)
		return remembered
	}
	if pick == nil {
		return ""
	}
	picked, err := pick()
	// A cancelled/failed dialog must not silently fall back to a sibling folder.
	if err != nil || picked == "" {
		return ""
	}
	picked = normalizeDataDirectoryChoice(picked)
	if err := ensureDataDirectoryLayout(picked); err != nil || !dataDirectoryUsable(picked) {
		return ""
	}
	a.rememberDataDirectory(path, picked)
	return picked
}

func normalizeDataDirectoryChoice(dir string) string {
	dir = filepath.Clean(dir)
	base := filepath.Base(dir)
	if base == "connection-profiles" || base == "api-requests" {
		return filepath.Dir(dir)
	}
	return dir
}

func ensureDataDirectoryLayout(dir string) error {
	if err := os.MkdirAll(filepath.Join(dir, "connection-profiles"), 0o755); err != nil {
		return err
	}
	return os.MkdirAll(filepath.Join(dir, "api-requests"), 0o755)
}

// resolveRememberedDirectory turns a saved location into an absolute path.
// Relative names stay relative to the program directory. An old absolute
// app-data folder is renamed in place to apitester-data; other absolute paths
// (including an explicitly chosen apitester-data) are kept as-is.
func (a *App) resolveRememberedDirectory(dir string) string {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return ""
	}
	cleaned := filepath.Clean(dir)
	if filepath.IsAbs(cleaned) {
		if filepath.Base(cleaned) == "app-data" {
			return filepath.Join(filepath.Dir(cleaned), dataDirectoryName)
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
	configPath := dataLocationConfigPath()
	if remembered := a.readRememberedDataDirectory(configPath); remembered != "" && dataDirectoryUsable(remembered) {
		a.setDataDirectory(remembered, false)
		a.rememberDataDirectory(configPath, remembered)
		_ = os.MkdirAll(a.requestsDir(), 0o755)
		_ = a.ensureServers()
		return
	}
	// No remembered path: wait for the in-app prompt. Do not open the system
	// folder dialog here, and do not silently adopt a nearby apitester-data.
	a.setDataDirectory("", true)
}

// NeedsDataDirectory reports whether the UI must ask the user to pick a folder.
func (a *App) NeedsDataDirectory() bool {
	a.dataMu.RLock()
	defer a.dataMu.RUnlock()
	return a.needsDataDir
}

// OpenDataDir reveals the data root in Explorer.
func (a *App) OpenDataDir() error {
	a.dataMu.RLock()
	dir := a.baseDir
	missing := a.needsDataDir || strings.TrimSpace(dir) == ""
	a.dataMu.RUnlock()
	if missing {
		return fmt.Errorf("尚未选择数据目录")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return exec.Command("explorer", dir).Start()
}

// PickDataDirectory opens the system folder dialog after the in-app prompt.
func (a *App) PickDataDirectory() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("应用尚未就绪")
	}
	picked, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 ApiTester 数据文件夹",
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(picked) == "" {
		return "", fmt.Errorf("已取消")
	}
	picked = normalizeDataDirectoryChoice(picked)
	if err := ensureDataDirectoryLayout(picked); err != nil {
		return "", err
	}
	if !dataDirectoryUsable(picked) {
		return "", fmt.Errorf("目录不可写：%s", picked)
	}
	a.setDataDirectory(picked, false)
	a.rememberDataDirectory(dataLocationConfigPath(), picked)
	_ = a.ensureServers()
	return picked, nil
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
		return fmt.Errorf("需要项目名或地址主机")
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

// ImportCatalog writes a picked catalog, Postman collection, ApiZza project, or OpenAPI document onto the hosts in the file.
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
	dir := a.currentBaseDir()
	return map[string]string{
		"base":     dir,
		"requests": filepath.Join(dir, "api-requests"),
		"servers":  filepath.Join(dir, "connection-profiles"),
	}
}

// FormatJSON pretty-prints JSON or returns the original text.
func (a *App) FormatJSON(text string) string {
	return prettyJSON(text)
}
