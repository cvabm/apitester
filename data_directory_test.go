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

func TestStaleAbsoluteAppDataRenamesInPlace(t *testing.T) {
	root := t.TempDir()
	staleParent := filepath.Join(root, "old", "ws-desk")
	if err := os.MkdirAll(staleParent, 0o700); err != nil {
		t.Fatal(err)
	}
	stale := filepath.Join(staleParent, "app-data")
	if err := os.Mkdir(stale, 0o700); err != nil {
		t.Fatal(err)
	}
	migrated := filepath.Join(staleParent, "apitester-data")
	if err := os.Mkdir(migrated, 0o700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "settings", "data-location.json")
	if err := saveDataLocationConfig(config, stale); err != nil {
		t.Fatal(err)
	}
	a := &App{defaultBaseDir: root}
	got := a.selectDataDirectory(config, func() (string, error) {
		t.Fatal("usable migrated path should not prompt")
		return "", nil
	})
	if got != migrated {
		t.Fatalf("got %s", got)
	}
}

func TestAbsoluteApitesterDataIsKept(t *testing.T) {
	root := t.TempDir()
	chosen := filepath.Join(root, "work", "apitester-data")
	if err := os.MkdirAll(chosen, 0o700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "data-location.json")
	if err := saveDataLocationConfig(config, chosen); err != nil {
		t.Fatal(err)
	}
	a := &App{defaultBaseDir: filepath.Join(root, "app")}
	got := a.selectDataDirectory(config, func() (string, error) {
		t.Fatal("remembered absolute path should not prompt")
		return "", nil
	})
	if got != chosen {
		t.Fatalf("got %s want %s", got, chosen)
	}
}

func TestMissingConfigDoesNotAdoptNearbyDefault(t *testing.T) {
	root := t.TempDir()
	nearby := filepath.Join(root, "apitester-data")
	if err := os.Mkdir(nearby, 0o700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "data-location.json")
	a := &App{defaultBaseDir: root}
	got := a.selectDataDirectory(config, nil)
	if got != "" {
		t.Fatalf("expected empty path, got %s", got)
	}
	if _, err := os.Stat(config); !os.IsNotExist(err) {
		t.Fatal("nearby default must not be remembered without an explicit choice")
	}
}

func TestCancelledOrFailedDirectorySelectionIsNotRemembered(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "not-a-dir")
	if err := os.WriteFile(filePath, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, choice := range []struct {
		name string
		path string
		err  error
	}{
		{name: "cancelled"},
		{name: "failed", err: errors.New("dialog failure")},
		{name: "file", path: filePath},
	} {
		t.Run(choice.name, func(t *testing.T) {
			root := t.TempDir()
			config := filepath.Join(root, "data-location.json")
			a := &App{defaultBaseDir: root}
			got := a.selectDataDirectory(config, func() (string, error) { return choice.path, choice.err })
			if got != "" {
				t.Fatalf("unexpected temporary fallback %s", got)
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

func TestNormalizeDataDirectoryChoiceAcceptsNestedFolders(t *testing.T) {
	root := t.TempDir()
	profiles := filepath.Join(root, "connection-profiles")
	if got := normalizeDataDirectoryChoice(profiles); got != root {
		t.Fatalf("got %s", got)
	}
	logs := filepath.Join(root, "api-requests")
	if got := normalizeDataDirectoryChoice(logs); got != root {
		t.Fatalf("got %s", got)
	}
}
