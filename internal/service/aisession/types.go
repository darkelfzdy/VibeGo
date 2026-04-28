package aisession

type ProviderID string

const (
	ProviderClaude   ProviderID = "claude"
	ProviderCodex    ProviderID = "codex"
	ProviderGemini   ProviderID = "gemini"
	ProviderOpenCode ProviderID = "opencode"
	ProviderOpenClaw ProviderID = "openclaw"
)

type SessionMeta struct {
	ProviderID    string `json:"providerId"`
	SessionID     string `json:"sessionId"`
	Title         string `json:"title,omitempty"`
	Summary       string `json:"summary,omitempty"`
	ProjectDir    string `json:"projectDir,omitempty"`
	ResumeCommand string `json:"resumeCommand,omitempty"`
	CreatedAt     int64  `json:"createdAt,omitempty"`
	LastActiveAt  int64  `json:"lastActiveAt,omitempty"`
	SourcePath    string `json:"sourcePath"`
	MessageCount  int    `json:"messageCount,omitempty"`
	ParseError    string `json:"parseError,omitempty"`
	FileSize      int64  `json:"fileSize,omitempty"`
	FileModTime   int64  `json:"fileModTime,omitempty"`
	ScannedAt     int64  `json:"scannedAt,omitempty"`
}

type SessionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Ts      int64  `json:"ts,omitempty"`
}

type ProviderConfig struct {
	Enabled bool     `json:"enabled"`
	Paths   []string `json:"paths"`
}

type Config struct {
	Providers        map[string]ProviderConfig `json:"providers"`
	AutoRescanOnOpen bool                      `json:"autoRescanOnOpen"`
	CacheEnabled     bool                      `json:"cacheEnabled"`
	ShowParseErrors  bool                      `json:"showParseErrors"`
}

type ProviderStatus struct {
	ProviderID   string   `json:"providerId"`
	Enabled      bool     `json:"enabled"`
	Paths        []string `json:"paths"`
	Available    bool     `json:"available"`
	SessionCount int      `json:"sessionCount"`
	ErrorCount   int      `json:"errorCount"`
	LastScanAt   int64    `json:"lastScanAt,omitempty"`
}

type Overview struct {
	TotalSessions    int              `json:"totalSessions"`
	EnabledProviders int              `json:"enabledProviders"`
	ScannedAt        int64            `json:"scannedAt,omitempty"`
	FromCache        bool             `json:"fromCache"`
	ProviderStatus   []ProviderStatus `json:"providerStatus"`
}

type ListResult struct {
	Sessions       []SessionMeta    `json:"sessions"`
	ProviderStatus []ProviderStatus `json:"providerStatus"`
	FromCache      bool             `json:"fromCache"`
	ScannedAt      int64            `json:"scannedAt,omitempty"`
	Config         Config           `json:"config"`
}

type MessagesResult struct {
	Session       SessionMeta      `json:"session"`
	Messages      []SessionMessage `json:"messages"`
	ParseWarnings []string         `json:"parseWarnings"`
}

type DeleteOutcome struct {
	ProviderID string `json:"providerId"`
	SessionID  string `json:"sessionId"`
	SourcePath string `json:"sourcePath"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
}
