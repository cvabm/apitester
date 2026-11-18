package main

import (
	"fmt"
	"net/url"
	"strings"
)

const (
	kindWS   = "ws"
	kindHTTP = "http"
)

// parseDialURL accepts ws, wss, http, https. fallbackScheme is used when raw has no scheme.
func parseDialURL(raw, fallbackScheme string) (kind, canon string, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", fmt.Errorf("请填写地址")
	}
	if !hasURLScheme(raw) {
		fb := strings.ToLower(strings.TrimSpace(fallbackScheme))
		if fb == "" {
			fb = "ws"
		}
		raw = fb + "://" + strings.TrimPrefix(raw, "//")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", "", fmt.Errorf("地址无效：%w", err)
	}
	if u.Host == "" {
		return "", "", fmt.Errorf("地址无效：需要主机（ws://、wss://、http:// 或 https://）")
	}
	switch strings.ToLower(u.Scheme) {
	case "ws", "wss":
		u.Scheme = strings.ToLower(u.Scheme)
		return kindWS, u.String(), nil
	case "http", "https":
		u.Scheme = strings.ToLower(u.Scheme)
		return kindHTTP, u.String(), nil
	default:
		return "", "", fmt.Errorf("不支持的协议 %q（请用 ws、wss、http、https）", u.Scheme)
	}
}

func hasURLScheme(raw string) bool {
	i := strings.Index(raw, "://")
	if i <= 0 {
		return false
	}
	for _, c := range raw[:i] {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '+' || c == '.' || c == '-' {
			continue
		}
		return false
	}
	return true
}

func urlSchemeOf(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	return strings.ToLower(u.Scheme)
}
