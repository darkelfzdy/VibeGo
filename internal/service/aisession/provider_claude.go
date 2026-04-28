package aisession

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type claudeProvider struct{}

func newClaudeProvider() provider {
	return &claudeProvider{}
}

func (p *claudeProvider) ID() string {
	return string(ProviderClaude)
}

func (p *claudeProvider) DefaultRoots() []string {
	return []string{filepath.Join(defaultHomeDir(), ".claude", "projects")}
}

func (p *claudeProvider) Scan(root string) ([]SessionMeta, error) {
	paths, err := collectFiles(root, func(path string, entry os.DirEntry) bool {
		return filepath.Ext(path) == ".jsonl" && !strings.HasPrefix(entry.Name(), "agent-")
	})
	if err != nil {
		return nil, err
	}
	result := make([]SessionMeta, 0, len(paths))
	for _, path := range paths {
		result = append(result, scanPath(p.ID(), path, func() (SessionMeta, error) {
			return p.parseSession(path)
		}))
	}
	return result, nil
}

func (p *claudeProvider) LoadMessages(sourcePath string) ([]SessionMessage, error) {
	messages := make([]SessionMessage, 0)
	err := readJSONLines(sourcePath, func(value map[string]any) bool {
		if asBool(value["isMeta"]) {
			return true
		}
		messageValue := asMap(value["message"])
		if messageValue == nil {
			return true
		}
		content := extractText(messageValue["content"])
		if content == "" {
			return true
		}
		role := asString(messageValue["role"])
		if role == "user" {
			items := asArray(messageValue["content"])
			if len(items) > 0 {
				allToolResults := true
				for _, item := range items {
					itemMap := asMap(item)
					if itemMap == nil || asString(itemMap["type"]) != "tool_result" {
						allToolResults = false
						break
					}
				}
				if allToolResults {
					role = "tool"
				}
			}
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

func (p *claudeProvider) parseSession(path string) (SessionMeta, error) {
	head, tail, err := readHeadTailLines(path, 10, 30)
	if err != nil {
		return SessionMeta{}, err
	}

	var sessionID string
	var projectDir string
	var createdAt int64
	var firstUserMessage string
	for _, line := range head {
		var value map[string]any
		if err := json.Unmarshal([]byte(line), &value); err != nil {
			continue
		}
		if sessionID == "" {
			sessionID = asString(value["sessionId"])
		}
		if projectDir == "" {
			projectDir = asString(value["cwd"])
		}
		if createdAt == 0 {
			createdAt = parseTimestampToMillis(value["timestamp"])
		}
		if firstUserMessage == "" {
			isUser := asString(value["type"]) == "user"
			if !isUser {
				messageValue := asMap(value["message"])
				isUser = asString(messageValue["role"]) == "user"
			}
			if isUser {
				messageValue := asMap(value["message"])
				text := strings.TrimSpace(extractText(messageValue["content"]))
				if text != "" && !strings.Contains(text, "<local-command-caveat>") && !strings.HasPrefix(text, "<command-name>") {
					firstUserMessage = truncateSummary(text, titleMaxChars)
				}
			}
		}
	}

	var lastActiveAt int64
	var summary string
	var customTitle string
	for index := len(tail) - 1; index >= 0; index-- {
		var value map[string]any
		if err := json.Unmarshal([]byte(tail[index]), &value); err != nil {
			continue
		}
		if lastActiveAt == 0 {
			lastActiveAt = parseTimestampToMillis(value["timestamp"])
		}
		if customTitle == "" && asString(value["type"]) == "custom-title" {
			customTitle = strings.TrimSpace(asString(value["customTitle"]))
			if customTitle != "" {
				customTitle = truncateSummary(customTitle, titleMaxChars)
			}
		}
		if summary == "" && !asBool(value["isMeta"]) {
			messageValue := asMap(value["message"])
			if messageValue != nil {
				text := extractText(messageValue["content"])
				if text != "" {
					summary = truncateSummary(text, 160)
				}
			}
		}
		if lastActiveAt != 0 && summary != "" {
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
		SessionID:     sessionID,
		Title:         firstNonEmpty(customTitle, firstUserMessage, pathBasename(projectDir)),
		Summary:       summary,
		ProjectDir:    projectDir,
		ResumeCommand: fmt.Sprintf("claude --resume %s", sessionID),
		CreatedAt:     createdAt,
		LastActiveAt:  lastActiveAt,
		SourcePath:    path,
		MessageCount:  messageCount,
	}, nil
}

func (p *claudeProvider) Delete(root, sourcePath, sessionID string) error {
	meta, err := p.parseSession(sourcePath)
	if err != nil {
		return err
	}
	if meta.SessionID != sessionID {
		return fmt.Errorf("claude session ID mismatch: expected %s, found %s", sessionID, meta.SessionID)
	}
	sidecar := strings.TrimSuffix(sourcePath, filepath.Ext(sourcePath))
	if err := removeAllIfExists(sidecar); err != nil {
		return err
	}
	return removeFileIfExists(sourcePath)
}

func (p *claudeProvider) countMessages(path string) (int, error) {
	count := 0
	err := readJSONLines(path, func(value map[string]any) bool {
		if asBool(value["isMeta"]) {
			return true
		}
		messageValue := asMap(value["message"])
		if messageValue == nil {
			return true
		}
		if extractText(messageValue["content"]) == "" {
			return true
		}
		count++
		return true
	})
	return count, err
}
