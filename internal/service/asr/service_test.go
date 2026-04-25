package asr

import "testing"

func TestNewWithDefaults(t *testing.T) {
	svc := New(Config{})
	info := svc.Info()
	if !info.Enabled {
		t.Fatalf("expected enabled info, got %#v", info)
	}
	if info.BaseURL != defaultOfficialBaseURL {
		t.Fatalf("base url = %q", info.BaseURL)
	}
	if info.WasmURL != defaultOfficialBaseURL+defaultWasmFile {
		t.Fatalf("wasm url = %q", info.WasmURL)
	}
	if info.DataURL != defaultOfficialBaseURL+defaultDataFile {
		t.Fatalf("data url = %q", info.DataURL)
	}
}

func TestNewWithOverrides(t *testing.T) {
	svc := New(Config{
		Version: "custom-version",
		WasmURL: "https://cdn.example.com/asr.wasm",
		DataURL: "https://cdn.example.com/asr.data",
	})
	info := svc.Info()
	if info.Version != "custom-version" {
		t.Fatalf("version = %q", info.Version)
	}
	if info.WasmURL != "https://cdn.example.com/asr.wasm" {
		t.Fatalf("wasm url = %q", info.WasmURL)
	}
	if info.DataURL != "https://cdn.example.com/asr.data" {
		t.Fatalf("data url = %q", info.DataURL)
	}
}
