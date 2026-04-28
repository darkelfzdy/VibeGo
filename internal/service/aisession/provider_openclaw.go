package aisession

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type openClawProvider struct{}

func stripOpenClawMessageIDSuffix(text string) string {
	if index := strings.LastIndex(text, "\n[message_id:"); index >= 0 {
		return strings.TrimSpace(text[:index])
	}
	return strings.TrimSpace(text)
}

func newOpenClawProvider() provider {
	return &openClawProvider{}
}

func (p *openClawProvider) ID() string {
	return string(ProviderOpenClaw)
}

func (p *openClawProvider) DefaultRoots() []string {
	return []string{filepath.Join(defaultHomeDir(), ".openclaw", "agents")}
}

func (p *openClawProvider) Scan(root string) ([]SessionMeta, error) {
	agentEntries, err := os.ReadDir(root)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	result := make([]SessionMeta, 0)
	for _, entry := range agentEntries {
		if !entry.IsDir() {
			continue
		}
		sessionsDir := filepath.Join(root, entry.Name(), "sessions")
		displayNames := p.loadDisplayNames(sessionsDir)
		paths, _ := collectFiles(sessionsDir, func(path string, entry os.DirEntry) bool {
			return filepath.Ext(path) == ".jsonl" && entry.Name() != "sessions.json"
		})
		for _, path := range paths {
			result = append(result, scanPath(p.ID(), path, func() (SessionMeta, error) {
				return p.parseSession(path, displayNames)
			}))
		}
	}
	return result, nil
}

func (p *openClawProvider) LoadMessages(sourcePath string) ([]SessionMessage, error) {
	messages := make([]SessionMessage, 0)
	err := readJSONLines(sourcePath, func(value map[string]any) bool {
		if asString(value["type"]) != "message" {
			return true
		}
		messageValue := asMap(value["message"])
		if messageValue == nil {
			return true
		}
		content := stripOpenClawMessageIDSuffix(extractText(messageValue["content"]))
		if content == "" {
			return true
		}
		role := asString(messageValue["role"])
		if role == "toolResult" {
			role = "tool"
		}
		if role == "" {
			role = "unknown"
		}
		messages = append(messages, SessionMessage{
			Role:    role,
			Content: content,
			Ts:      parseTimestampToMillis(value["timestamp"]),
		})
		return true
	})
	return messages, err
}

func (p *openClawProvider) parseSession(path string, displayNames map[string]string) (SessionMeta, error) {
	head, tail, err := readHeadTailLines(path, 10, 30)
	if err != nil {
		return SessionMeta{}, err
	}
	var sessionID string
	var projectDir string
	var createdAt int64
	var summary string
	var firstUserMessage string
	for _, line := range head {
		var value map[string]any
		if err := json.Unmarshal([]byte(line), &value); err != nil {
			continue
		}
		if createdAt == 0 {
			createdAt = parseTimestampToMillis(value["timestamp"])
		}
		switch asString(value["type"]) {
		case "session":
			if sessionID == "" {
				sessionID = asString(value["id"])
			}
			if projectDir == "" {
				projectDir = asString(value["cwd"])
			}
		case "message":
			messageValue := asMap(value["message"])
			if messageValue == nil {
				continue
			}
			text := stripOpenClawMessageIDSuffix(extractText(messageValue["content"]))
			if text == "" {
				continue
			}
			if summary == "" {
				summary = truncateSummary(text, 160)
			}
			if firstUserMessage == "" && asString(messageValue["role"]) == "user" {
				firstUserMessage = truncateSummary(text, titleMaxChars)
			}
		}
	}
	var lastActiveAt int64
	for index := len(tail) - 1; index >= 0; index-- {
		var value map[string]any
		if err := json.Unmarshal([]byte(tail[index]), &value); err != nil {
			continue
		}
		lastActiveAt = parseTimestampToMillis(value["timestamp"])
		if lastActiveAt != 0 {
			break
		}
	}
	if sessionID == "" {
		sessionID = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	if sessionID == "" {
		return SessionMeta{}, fmt.Errorf("missing session id")
	}
	messageCount, _ := p.countMessages(path)
	return SessionMeta{
		SessionID:    sessionID,
		Title:        firstNonEmpty(displayNames[sessionID], firstUserMessage, pathBasename(projectDir)),
		Summary:      summary,
		ProjectDir:   projectDir,
		CreatedAt:    createdAt,
		LastActiveAt: lastActiveAt,
		SourcePath:   path,
		MessageCount: messageCount,
	}, nil
}

func (p *openClawProvider) Delete(root, sourcePath, sessionID string) error {
	meta, err := p.parseSession(sourcePath, nil)
	if err != nil {
		return err
	}
	if meta.SessionID != sessionID {
		return fmt.Errorf("openclaw session ID mismatch: expected %s, found %s", sessionID, meta.SessionID)
	}
	if err := p.pruneSessionsIndex(filepath.Join(filepath.Dir(sourcePath), "sessions.json"), sessionID, sourcePath); err != nil {
		return err
	}
	return removeFileIfExists(sourcePath)
}

func (p *openClawProvider) countMessages(path string) (int, error) {
	count := 0
	err := readJSONLines(path, func(value map[string]any) bool {
		if asString(value["type"]) != "message" {
			return true
		}
		if extractText(asMap(value["message"])["content"]) == "" {
			return true
		}
		count++
		return true
	})
	return count, err
}

func (p *openClawProvider) loadDisplayNames(sessionsDir string) map[string]string {
	value, err := readJSONFile(filepath.Join(sessionsDir, "sessions.json"))
	if err != nil {
		return nil
	}
	result := make(map[string]string)
	for _, entry := range value {
		entryMap := asMap(entry)
		if entryMap == nil {
			continue
		}
		sessionID := asString(entryMap["sessionId"])
		displayName := strings.TrimSpace(asString(entryMap["displayName"]))
		if sessionID == "" || displayName == "" {
			continue
		}
		result[sessionID] = truncateSummary(displayName, titleMaxChars)
	}
	return result
}

func (p *openClawProvider) pruneSessionsIndex(indexPath, sessionID, sourcePath string) error {
	value, err := readJSONFile(indexPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for key, entry := range value {
		entryMap := asMap(entry)
		if entryMap == nil {
			continue
		}
		if asString(entryMap["sessionId"]) == sessionID || asString(entryMap["sessionFile"]) == sourcePath {
			delete(value, key)
		}
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return os.WriteFile(indexPath, data, 0644)
}
