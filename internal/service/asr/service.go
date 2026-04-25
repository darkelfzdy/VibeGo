package asr

import (
	"strings"
)

const BaseURL = "/sherpa/"
const DefaultVersion = "1.12.36"
const defaultOfficialRevision = "946a732f862b70f4cd1ab094abd907c01f1ccff8"
const defaultOfficialBaseURL = "https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-ja-ko-cantonese-sense-voice/resolve/" + defaultOfficialRevision + "/"
const defaultWasmFile = "sherpa-onnx-wasm-main-vad-asr.wasm"
const defaultDataFile = "sherpa-onnx-wasm-main-vad-asr.data"

type Config struct {
	Version string
	WasmURL string
	DataURL string
}

type Info struct {
	Enabled bool   `json:"enabled"`
	Version string `json:"version,omitempty"`
	BaseURL string `json:"baseUrl,omitempty"`
	WasmURL string `json:"wasmUrl,omitempty"`
	DataURL string `json:"dataUrl,omitempty"`
	Message string `json:"message,omitempty"`
}

type Service struct {
	info Info
}

func New(cfg Config) *Service {
	info := discover(cfg)
	return &Service{info: info}
}

func (s *Service) Info() Info {
	return s.info
}

func discover(cfg Config) Info {
	ver := strings.TrimSpace(cfg.Version)
	if ver == "" {
		ver = DefaultVersion
	}
	wasmURL := strings.TrimSpace(cfg.WasmURL)
	if wasmURL == "" {
		wasmURL = defaultOfficialBaseURL + defaultWasmFile
	}
	dataURL := strings.TrimSpace(cfg.DataURL)
	if dataURL == "" {
		dataURL = defaultOfficialBaseURL + defaultDataFile
	}

	return Info{
		Enabled: true,
		Version: ver,
		BaseURL: defaultOfficialBaseURL,
		WasmURL: wasmURL,
		DataURL: dataURL,
	}
}
