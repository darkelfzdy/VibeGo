package asr

import (
	"encoding/json"
	"strings"
)

const BaseURL = "/sherpa/"
const DefaultVersion = "1.12.36"
const defaultOfficialRevision = "946a732f862b70f4cd1ab094abd907c01f1ccff8"
const defaultOfficialBaseURL = "https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-ja-ko-cantonese-sense-voice/resolve/" + defaultOfficialRevision + "/"
const defaultChinaBaseURL = "https://hf-mirror.com/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-ja-ko-cantonese-sense-voice/resolve/" + defaultOfficialRevision + "/"
const defaultParaformerBaseURL = "https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-paraformer/resolve/main/"
const defaultParaformerChinaBaseURL = "https://hf-mirror.com/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-paraformer/resolve/main/"
const defaultParaformerSmallBaseURL = "https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-paraformer-small/resolve/main/"
const defaultParaformerSmallChinaBaseURL = "https://hf-mirror.com/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-paraformer-small/resolve/main/"
const defaultWasmFile = "sherpa-onnx-wasm-main-vad-asr.wasm"
const defaultDataFile = "sherpa-onnx-wasm-main-vad-asr.data"
const defaultVadScriptFile = "sherpa-onnx-vad.js"
const defaultAsrScriptFile = "sherpa-onnx-asr.js"
const defaultMainScriptFile = "sherpa-onnx-wasm-main-vad-asr.js"

type Config struct {
	Version          string
	WasmURL          string
	DataURL          string
	Source           string
	ExtraSourcesJSON string
}

type Source struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Model   string `json:"model,omitempty"`
	Region  string `json:"region,omitempty"`
	BaseURL string `json:"baseUrl"`
	WasmURL string `json:"wasmUrl"`
	DataURL string `json:"dataUrl"`
}

type Info struct {
	Enabled bool     `json:"enabled"`
	Version string   `json:"version,omitempty"`
	Source  string   `json:"source,omitempty"`
	Sources []Source `json:"sources,omitempty"`
	BaseURL string   `json:"baseUrl,omitempty"`
	WasmURL string   `json:"wasmUrl,omitempty"`
	DataURL string   `json:"dataUrl,omitempty"`
	Message string   `json:"message,omitempty"`
}

type Service struct {
	info Info
}

func New(cfg Config) *Service {
	info := discover(cfg)
	return &Service{info: info}
}

func (s *Service) Info() Info {
	info := s.info
	info.Sources = proxySources(info.Sources)
	if selected, ok := selectProxySource(info.Sources, info.Source); ok {
		info.BaseURL = selected.BaseURL
		info.WasmURL = selected.WasmURL
		info.DataURL = selected.DataURL
	} else if len(info.Sources) > 0 {
		info.BaseURL = info.Sources[0].BaseURL
		info.WasmURL = info.Sources[0].WasmURL
		info.DataURL = info.Sources[0].DataURL
	}
	return info
}

func (s *Service) Source(id string) (Source, bool) {
	id = normalizedSource(id)
	for _, source := range s.info.Sources {
		if source.ID == id {
			return source, true
		}
	}
	return Source{}, false
}

func (s *Service) AssetURL(sourceID string, filename string) (string, bool) {
	source, ok := s.Source(sourceID)
	if !ok {
		return "", false
	}
	switch strings.TrimSpace(filename) {
	case defaultWasmFile:
		return source.WasmURL, source.WasmURL != ""
	case defaultDataFile:
		return source.DataURL, source.DataURL != ""
	case defaultVadScriptFile, defaultAsrScriptFile, defaultMainScriptFile:
		return source.BaseURL + filename, source.BaseURL != ""
	default:
		return "", false
	}
}

func discover(cfg Config) Info {
	ver := strings.TrimSpace(cfg.Version)
	if ver == "" {
		ver = DefaultVersion
	}
	wasmURL := strings.TrimSpace(cfg.WasmURL)
	dataURL := strings.TrimSpace(cfg.DataURL)
	if wasmURL != "" || dataURL != "" {
		src := Source{
			ID:      "custom",
			Label:   "Custom",
			Model:   "custom",
			Region:  "custom",
			BaseURL: defaultOfficialBaseURL,
			WasmURL: defaultOfficialBaseURL + defaultWasmFile,
			DataURL: defaultOfficialBaseURL + defaultDataFile,
		}
		if wasmURL != "" {
			src.WasmURL = wasmURL
		}
		if dataURL != "" {
			src.DataURL = dataURL
		}
		return Info{
			Enabled: true,
			Version: ver,
			Source:  src.ID,
			Sources: []Source{src},
			BaseURL: src.BaseURL,
			WasmURL: src.WasmURL,
			DataURL: src.DataURL,
		}
	}

	sources := defaultSources()
	sources = append(sources, parseExtraSources(cfg.ExtraSourcesJSON)...)
	source := normalizedSource(cfg.Source)
	selected := selectSource(sources, source)
	if selected == nil {
		selected = &sources[0]
		if source != "auto" {
			source = "auto"
		}
	}

	return Info{
		Enabled: true,
		Version: ver,
		Source:  source,
		Sources: sources,
		BaseURL: selected.BaseURL,
		WasmURL: selected.WasmURL,
		DataURL: selected.DataURL,
	}
}

func defaultSources() []Source {
	return []Source{
		buildSource("sense-voice-official", "sense-voice-zh-en-ja-ko-yue-2024-07-17", "sense-voice", "global", defaultOfficialBaseURL),
		buildSource("sense-voice-china", "sense-voice-zh-en-ja-ko-yue-2024-07-17", "sense-voice", "china", defaultChinaBaseURL),
		buildSource("paraformer-zh-en-official", "paraformer-zh-2023-09-14", "paraformer-zh-en", "global", defaultParaformerBaseURL),
		buildSource("paraformer-zh-en-china", "paraformer-zh-2023-09-14", "paraformer-zh-en", "china", defaultParaformerChinaBaseURL),
		buildSource("paraformer-zh-en-small-official", "paraformer-zh-small-2024-03-09", "paraformer-zh-en-small", "global", defaultParaformerSmallBaseURL),
		buildSource("paraformer-zh-en-small-china", "paraformer-zh-small-2024-03-09", "paraformer-zh-en-small", "china", defaultParaformerSmallChinaBaseURL),
	}
}

func proxySources(sources []Source) []Source {
	proxied := make([]Source, 0, len(sources))
	for _, source := range sources {
		baseURL := "/api/asr-assets/" + source.ID + "/"
		proxied = append(proxied, Source{
			ID:      source.ID,
			Label:   source.Label,
			Model:   source.Model,
			Region:  source.Region,
			BaseURL: baseURL,
			WasmURL: baseURL + defaultWasmFile,
			DataURL: baseURL + defaultDataFile,
		})
	}
	return proxied
}

func selectProxySource(sources []Source, selected string) (Source, bool) {
	source := selectSource(sources, selected)
	if source == nil {
		return Source{}, false
	}
	return *source, true
}

func buildSource(id string, label string, model string, region string, baseURL string) Source {
	baseURL = normalizeBaseURL(baseURL)
	return Source{
		ID:      strings.TrimSpace(id),
		Label:   strings.TrimSpace(label),
		Model:   strings.TrimSpace(model),
		Region:  strings.TrimSpace(region),
		BaseURL: baseURL,
		WasmURL: baseURL + defaultWasmFile,
		DataURL: baseURL + defaultDataFile,
	}
}

func parseExtraSources(raw string) []Source {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var parsed []Source
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil
	}
	sources := make([]Source, 0, len(parsed))
	seen := map[string]bool{"official": true, "china": true, "auto": true}
	for _, src := range parsed {
		src = normalizeSource(src)
		if src.ID == "" || src.BaseURL == "" || seen[src.ID] {
			continue
		}
		seen[src.ID] = true
		sources = append(sources, src)
	}
	return sources
}

func normalizeSource(src Source) Source {
	src.ID = normalizedSource(src.ID)
	src.Label = strings.TrimSpace(src.Label)
	src.Model = normalizedSource(src.Model)
	src.Region = strings.TrimSpace(src.Region)
	src.BaseURL = normalizeBaseURL(src.BaseURL)
	src.WasmURL = strings.TrimSpace(src.WasmURL)
	src.DataURL = strings.TrimSpace(src.DataURL)
	if src.Label == "" {
		src.Label = src.ID
	}
	if src.WasmURL == "" && src.BaseURL != "" {
		src.WasmURL = src.BaseURL + defaultWasmFile
	}
	if src.DataURL == "" && src.BaseURL != "" {
		src.DataURL = src.BaseURL + defaultDataFile
	}
	return src
}

func normalizeBaseURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return strings.TrimRight(value, "/") + "/"
}

func selectSource(sources []Source, selected string) *Source {
	selected = normalizedSource(selected)
	if selected == "" || selected == "auto" {
		return nil
	}
	for i := range sources {
		if sources[i].ID == selected {
			return &sources[i]
		}
	}
	return nil
}

func normalizedSource(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "auto"
	}
	for _, ch := range value {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' {
			continue
		}
		return ""
	}
	return value
}
