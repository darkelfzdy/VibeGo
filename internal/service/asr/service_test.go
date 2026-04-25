package asr

import "testing"

func TestNewWithDefaults(t *testing.T) {
	svc := New(Config{})
	info := svc.Info()
	if !info.Enabled {
		t.Fatalf("expected enabled info, got %#v", info)
	}
	if info.Source != "auto" {
		t.Fatalf("source = %q", info.Source)
	}
	if len(info.Sources) != 6 {
		t.Fatalf("sources = %#v", info.Sources)
	}
	if info.BaseURL != "/api/asr-assets/sense-voice-official/" {
		t.Fatalf("base url = %q", info.BaseURL)
	}
	if info.WasmURL != "/api/asr-assets/sense-voice-official/"+defaultWasmFile {
		t.Fatalf("wasm url = %q", info.WasmURL)
	}
	if info.DataURL != "/api/asr-assets/sense-voice-official/"+defaultDataFile {
		t.Fatalf("data url = %q", info.DataURL)
	}
	if url, ok := svc.AssetURL("sense-voice-official", defaultWasmFile); !ok || url != defaultOfficialBaseURL+defaultWasmFile {
		t.Fatalf("asset url = %q, %v", url, ok)
	}
}

func TestNewWithSelectedChinaSource(t *testing.T) {
	svc := New(Config{Source: "sense-voice-china"})
	info := svc.Info()
	if info.Source != "sense-voice-china" {
		t.Fatalf("source = %q", info.Source)
	}
	if info.BaseURL != "/api/asr-assets/sense-voice-china/" {
		t.Fatalf("base url = %q", info.BaseURL)
	}
	if info.WasmURL != "/api/asr-assets/sense-voice-china/"+defaultWasmFile {
		t.Fatalf("wasm url = %q", info.WasmURL)
	}
	if url, ok := svc.AssetURL("sense-voice-china", defaultMainScriptFile); !ok || url != defaultChinaBaseURL+defaultMainScriptFile {
		t.Fatalf("asset url = %q, %v", url, ok)
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
	if len(info.Sources) != 1 || info.Sources[0].ID != "custom" {
		t.Fatalf("sources = %#v", info.Sources)
	}
	if info.WasmURL != "/api/asr-assets/custom/"+defaultWasmFile {
		t.Fatalf("wasm url = %q", info.WasmURL)
	}
	if info.DataURL != "/api/asr-assets/custom/"+defaultDataFile {
		t.Fatalf("data url = %q", info.DataURL)
	}
	if url, ok := svc.AssetURL("custom", defaultWasmFile); !ok || url != "https://cdn.example.com/asr.wasm" {
		t.Fatalf("asset url = %q, %v", url, ok)
	}
}

func TestNewWithExtraSources(t *testing.T) {
	svc := New(Config{
		Source:           "edge",
		ExtraSourcesJSON: `[{"id":"edge","label":"Edge","region":"custom","baseUrl":"https://cdn.example.com/asr"}]`,
	})
	info := svc.Info()
	if len(info.Sources) != 7 {
		t.Fatalf("sources = %#v", info.Sources)
	}
	if info.BaseURL != "/api/asr-assets/edge/" {
		t.Fatalf("base url = %q", info.BaseURL)
	}
	if info.WasmURL != "/api/asr-assets/edge/"+defaultWasmFile {
		t.Fatalf("wasm url = %q", info.WasmURL)
	}
	if url, ok := svc.AssetURL("edge", defaultWasmFile); !ok || url != "https://cdn.example.com/asr/"+defaultWasmFile {
		t.Fatalf("asset url = %q, %v", url, ok)
	}
}
