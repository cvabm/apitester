package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultDataDirectoryUsesNewName(t *testing.T) {
	root := t.TempDir()
	if got := defaultDataDirectory(root); got != filepath.Join(root, "apitester-data") {
		t.Fatalf("unexpected default: %s", got)
	}
}

func TestStaleAbsoluteDataDirectoryUsesApitesterData(t *testing.T) {
	root := t.TempDir()
	preferred := filepath.Join(root, "apitester-data")
	if err := os.Mkdir(preferred, 0o700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "settings", "data-location.json")
	stale := filepath.Join(root, "old", "ws-desk", "app-data")
	if err := saveDataLocationConfig(config, stale); err != nil {
		t.Fatal(err)
	}
	a := &App{defaultBaseDir: root}
	got := a.selectDataDirectory(config, func() (string, error) {
		t.Fatal("usable apitester-data should not prompt")
		return "", nil
	})
	if got != preferred {
		t.Fatalf("got %s", got)
	}
	raw, err := os.ReadFile(config)
	if err != nil {
		t.Fatal(err)
	}
	var cfg dataLocationConfig
	if json.Unmarshal(raw, &cfg) != nil || cfg.Directory != "apitester-data" {
		t.Fatalf("stored location = %#v", cfg.Directory)
	}
}

func TestCancelledOrFailedDirectorySelectionIsNotRemembered(t *testing.T) {
	for _, choice := range []struct {
		name string
		path string
		err  error
	}{
		{name: "cancelled"},
		{name: "failed", err: errors.New("dialog failure")},
		{name: "missing", path: filepath.Join(t.TempDir(), "missing")},
	} {
		t.Run(choice.name, func(t *testing.T) {
			root := t.TempDir()
			config := filepath.Join(root, "data-location.json")
			a := &App{defaultBaseDir: root}
			got := a.selectDataDirectory(config, func() (string, error) { return choice.path, choice.err })
			if got != filepath.Join(root, "apitester-data") {
				t.Fatal("unexpected temporary fallback")
			}
			if _, err := os.Stat(config); !os.IsNotExist(err) {
				t.Fatal("fallback was incorrectly remembered")
			}
		})
	}
}

func TestChosenDataDirectoryIsRemembered(t *testing.T) {
	root := t.TempDir()
	chosen := t.TempDir()
	config := filepath.Join(root, "data-location.json")
	a := &App{defaultBaseDir: root}
	if got := a.selectDataDirectory(config, func() (string, error) { return chosen, nil }); got != chosen {
		t.Fatal("explicit selection ignored")
	}
	if got := a.selectDataDirectory(config, func() (string, error) { t.Fatal("remembered path prompted again"); return "", nil }); got != chosen {
		t.Fatal("saved location ignored")
	}
	raw, err := os.ReadFile(config)
	if err != nil {
		t.Fatal(err)
	}
	var cfg dataLocationConfig
	if json.Unmarshal(raw, &cfg) != nil || cfg.Directory != chosen {
		t.Fatal("external directory should stay an absolute path")
	}
}
