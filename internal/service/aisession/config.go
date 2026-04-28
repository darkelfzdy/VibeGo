package aisession

import (
	"encoding/json"
	"path/filepath"

	"github.com/xxnuo/vibego/internal/service/settings"
	"gorm.io/gorm"
)

const configKey = "ai_session_manager_config"

type configStore struct {
	store *settings.Store
}

func newConfigStore(db *gorm.DB) *configStore {
	return &configStore{store: settings.New(db)}
}

func defaultConfig() Config {
	return Config{
		Providers: map[string]ProviderConfig{
			string(ProviderClaude): {
				Enabled: true,
				Paths:   []string{filepath.Join(defaultHomeDir(), ".claude", "projects")},
			},
			string(ProviderCodex): {
				Enabled: true,
				Paths:   []string{filepath.Join(defaultHomeDir(), ".codex", "sessions")},
			},
			string(ProviderGemini): {
				Enabled: true,
				Paths:   []string{filepath.Join(defaultHomeDir(), ".gemini", "tmp")},
			},
			string(ProviderOpenCode): {
				Enabled: true,
				Paths:   []string{filepath.Join(defaultXDGDataHome(), "opencode", "storage")},
			},
			string(ProviderOpenClaw): {
				Enabled: true,
				Paths:   []string{filepath.Join(defaultHomeDir(), ".openclaw", "agents")},
			},
		},
		AutoRescanOnOpen: false,
		CacheEnabled:     true,
		ShowParseErrors:  true,
	}
}

func normalizeConfig(cfg Config) Config {
	defaults := defaultConfig()
	normalized := defaults
	normalized.AutoRescanOnOpen = cfg.AutoRescanOnOpen
	normalized.CacheEnabled = cfg.CacheEnabled
	normalized.ShowParseErrors = cfg.ShowParseErrors
	if normalized.Providers == nil {
		normalized.Providers = make(map[string]ProviderConfig, len(defaults.Providers))
	}
	for providerID, defaultProvider := range defaults.Providers {
		value := cfg.Providers[providerID]
		enabled := value.Enabled
		if _, ok := cfg.Providers[providerID]; !ok {
			enabled = defaultProvider.Enabled
		}
		paths := normalizePaths(value.Paths)
		if len(paths) == 0 {
			paths = normalizePaths(defaultProvider.Paths)
		}
		normalized.Providers[providerID] = ProviderConfig{
			Enabled: enabled,
			Paths:   paths,
		}
	}
	return normalized
}

func (s *configStore) Get() (Config, error) {
	defaults := defaultConfig()
	value, err := s.store.Get(configKey)
	if err != nil || value == "" {
		return defaults, nil
	}
	var cfg Config
	if err := json.Unmarshal([]byte(value), &cfg); err != nil {
		return defaults, nil
	}
	return normalizeConfig(cfg), nil
}

func (s *configStore) Set(cfg Config) error {
	normalized := normalizeConfig(cfg)
	data, err := json.Marshal(normalized)
	if err != nil {
		return err
	}
	return s.store.Set(configKey, string(data))
}
