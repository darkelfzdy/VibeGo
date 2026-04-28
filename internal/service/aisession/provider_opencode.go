package aisession

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type openCodeProvider struct{}

func newOpenCodeProvider() provider {
	return &openCodeProvider{}
}

func (p *openCodeProvider) ID() string {
	return string(ProviderOpenCode)
}

func (p *openCodeProvider) DefaultRoots() []string {
	return []string{filepath.Join(defaultXDGDataHome(), "opencode", "storage")}
}

func (p *openCodeProvider) Scan(root string) ([]SessionMeta, error) {
	sessionRoot := filepath.Join(root, "session")
	paths, err := collectFiles(sessionRoot, func(path string, entry os.DirEntry) bool {
		return filepath.Ext(path) == ".json"
	})
	if err != nil {
		return nil, err
	}
	result := make([]SessionMeta, 0, len(paths))
	for _, path := range paths {
		result = append(result, scanPath(p.ID(), path, func() (SessionMeta, error) {
			return p.parseSession(root, path)
		}))
	}
	return result, nil
}

func (p *openCodeProvider) LoadMessages(sourcePath string) ([]SessionMessage, error) {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("message directory not found")
	}
	storageRoot := filepath.Dir(filepath.Dir(sourcePath))
	messageFiles, err := collectFiles(sourcePath, func(path string, entry os.DirEntry) bool {
		return filepath.Ext(path) == ".json"
	})
	if err != nil {
		return nil, err
	}
	type messageEntry struct {
		Timestamp int64
		Role      string
		Content   string
	}
	entries := make([]messageEntry, 0, len(messageFiles))
	for _, path := range messageFiles {
		value, err := readJSONFile(path)
		if err != nil {
			continue
		}
		messageID := asString(value["id"])
		if messageID == "" {
			continue
		}
		role := asString(value["role"])
		if role == "" {
			role = "unknown"
		}
		content := p.collectPartsText(filepath.Join(storageRoot, "part", messageID))
		if content == "" {
			continue
		}
		entries = append(entries, messageEntry{
			Timestamp: parseTimestampToMillis(asMap(value["time"])["created"]),
			Role:      role,
			Content:   content,
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Timestamp == entries[j].Timestamp {
			return entries[i].Content < entries[j].Content
		}
		return entries[i].Timestamp < entries[j].Timestamp
	})
	messages := make([]SessionMessage, 0, len(entries))
	for _, entry := range entries {
		messages = append(messages, SessionMessage{
			Role:    entry.Role,
			Content: entry.Content,
			Ts:      entry.Timestamp,
		})
	}
	return messages, nil
}

func (p *openCodeProvider) parseSession(storageRoot, path string) (SessionMeta, error) {
	value, err := readJSONFile(path)
	if err != nil {
		return SessionMeta{}, err
	}
	sessionID := asString(value["id"])
	if sessionID == "" {
		return SessionMeta{}, fmt.Errorf("missing session id")
	}
	projectDir := asString(value["directory"])
	title := asString(value["title"])
	if title == "" {
		title = pathBasename(projectDir)
	}
	messageDir := filepath.Join(storageRoot, "message", sessionID)
	messageCount := p.countMessages(messageDir)
	summary := asString(value["title"])
	if summary == "" {
		summary = p.firstUserSummary(storageRoot, sessionID)
	}
	return SessionMeta{
		SessionID:     sessionID,
		Title:         title,
		Summary:       summary,
		ProjectDir:    projectDir,
		ResumeCommand: fmt.Sprintf("opencode session resume %s", sessionID),
		CreatedAt:     parseTimestampToMillis(asMap(value["time"])["created"]),
		LastActiveAt:  parseTimestampToMillis(asMap(value["time"])["updated"]),
		SourcePath:    messageDir,
		MessageCount:  messageCount,
	}, nil
}

func (p *openCodeProvider) countMessages(messageDir string) int {
	paths, err := collectFiles(messageDir, func(path string, entry os.DirEntry) bool {
		return filepath.Ext(path) == ".json"
	})
	if err != nil {
		return 0
	}
	count := 0
	for _, path := range paths {
		value, err := readJSONFile(path)
		if err != nil {
			continue
		}
		if asString(value["id"]) == "" {
			continue
		}
		count++
	}
	return count
}

func (p *openCodeProvider) firstUserSummary(storageRoot, sessionID string) string {
	messageDir := filepath.Join(storageRoot, "message", sessionID)
	paths, err := collectFiles(messageDir, func(path string, entry os.DirEntry) bool {
		return filepath.Ext(path) == ".json"
	})
	if err != nil {
		return ""
	}
	type userEntry struct {
		Timestamp int64
		MessageID string
	}
	entries := make([]userEntry, 0)
	for _, path := range paths {
		value, err := readJSONFile(path)
		if err != nil {
			continue
		}
		if asString(value["role"]) != "user" {
			continue
		}
		messageID := asString(value["id"])
		if messageID == "" {
			continue
		}
		entries = append(entries, userEntry{
			Timestamp: parseTimestampToMillis(asMap(value["time"])["created"]),
			MessageID: messageID,
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Timestamp == entries[j].Timestamp {
			return entries[i].MessageID < entries[j].MessageID
		}
		return entries[i].Timestamp < entries[j].Timestamp
	})
	if len(entries) == 0 {
		return ""
	}
	return truncateSummary(p.collectPartsText(filepath.Join(storageRoot, "part", entries[0].MessageID)), 160)
}

func (p *openCodeProvider) collectPartsText(partDir string) string {
	paths, err := collectFiles(partDir, func(path string, entry os.DirEntry) bool {
		return filepath.Ext(path) == ".json"
	})
	if err != nil {
		return ""
	}
	parts := make([]string, 0)
	for _, path := range paths {
		value, err := readJSONFile(path)
		if err != nil {
			continue
		}
		if asString(value["type"]) != "text" {
			continue
		}
		text := strings.TrimSpace(asString(value["text"]))
		if text == "" {
			continue
		}
		parts = append(parts, text)
	}
	return strings.Join(parts, "\n")
}

func (p *openCodeProvider) Delete(root, sourcePath, sessionID string) error {
	if filepath.Base(sourcePath) != sessionID {
		return fmt.Errorf("opencode session path does not match session ID: expected %s, found %s", sessionID, sourcePath)
	}
	messageFiles, err := collectFiles(sourcePath, func(path string, entry os.DirEntry) bool {
		return filepath.Ext(path) == ".json"
	})
	if err != nil {
		return err
	}
	messageIDs := make([]string, 0, len(messageFiles))
	for _, path := range messageFiles {
		value, err := readJSONFile(path)
		if err != nil {
			continue
		}
		messageID := asString(value["id"])
		if messageID != "" {
			messageIDs = append(messageIDs, messageID)
		}
	}
	partRoot := filepath.Join(root, "part")
	for _, messageID := range messageIDs {
		if err := removeAllIfExists(filepath.Join(partRoot, messageID)); err != nil {
			return err
		}
	}
	if err := removeFileIfExists(filepath.Join(root, "session_diff", sessionID+".json")); err != nil {
		return err
	}
	if err := removeAllIfExists(sourcePath); err != nil {
		return err
	}
	return removeFileIfExists(filepath.Join(root, "session", sessionID+".json"))
}
