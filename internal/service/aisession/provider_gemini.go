package aisession

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type geminiProvider struct{}

func newGeminiProvider() provider {
	return &geminiProvider{}
}

func (p *geminiProvider) ID() string {
	return string(ProviderGemini)
}

func (p *geminiProvider) DefaultRoots() []string {
	return []string{filepath.Join(defaultHomeDir(), ".gemini", "tmp")}
}

func (p *geminiProvider) Scan(root string) ([]SessionMeta, error) {
	projectEntries, err := os.ReadDir(root)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	result := make([]SessionMeta, 0)
	for _, entry := range projectEntries {
		if !entry.IsDir() {
			continue
		}
		chatsDir := filepath.Join(root, entry.Name(), "chats")
		paths, _ := collectFiles(chatsDir, func(path string, entry os.DirEntry) bool {
			return filepath.Ext(path) == ".json"
		})
		for _, path := range paths {
			result = append(result, scanPath(p.ID(), path, func() (SessionMeta, error) {
				return p.parseSession(path)
			}))
		}
	}
	return result, nil
}

func (p *geminiProvider) LoadMessages(sourcePath string) ([]SessionMessage, error) {
	value, err := readJSONFile(sourcePath)
	if err != nil {
		return nil, err
	}
	items := asArray(value["messages"])
	if items == nil {
		return nil, fmt.Errorf("missing messages")
	}
	messages := make([]SessionMessage, 0, len(items))
	for _, item := range items {
		messageValue := asMap(item)
		if messageValue == nil {
			continue
		}
		content := extractText(messageValue["content"])
		if toolCalls := asArray(messageValue["toolCalls"]); len(toolCalls) > 0 {
			for _, call := range toolCalls {
				callMap := asMap(call)
				if callMap == nil {
					continue
				}
				name := asString(callMap["name"])
				if name == "" {
					continue
				}
				if content != "" {
					content += "\n"
				}
				content += fmt.Sprintf("[Tool: %s]", name)
			}
		}
		if strings.TrimSpace(content) == "" {
			continue
		}
		role := asString(messageValue["type"])
		if role == "gemini" {
			role = "assistant"
		}
		if role == "" {
			role = "unknown"
		}
		messages = append(messages, SessionMessage{
			Role:    role,
			Content: content,
			Ts:      parseTimestampToMillis(messageValue["timestamp"]),
		})
	}
	return messages, nil
}

func (p *geminiProvider) parseSession(path string) (SessionMeta, error) {
	value, err := readJSONFile(path)
	if err != nil {
		return SessionMeta{}, err
	}
	sessionID := asString(value["sessionId"])
	if sessionID == "" {
		return SessionMeta{}, fmt.Errorf("missing session id")
	}
	items := asArray(value["messages"])
	title := ""
	messageCount := 0
	for _, item := range items {
		messageValue := asMap(item)
		if messageValue == nil {
			continue
		}
		content := strings.TrimSpace(extractText(messageValue["content"]))
		if content == "" {
			continue
		}
		messageCount++
		if title == "" && asString(messageValue["type"]) == "user" {
			title = truncateSummary(content, 160)
		}
	}
	lastActiveAt := parseTimestampToMillis(value["lastUpdated"])
	createdAt := parseTimestampToMillis(value["startTime"])
	if lastActiveAt == 0 {
		lastActiveAt = createdAt
	}
	return SessionMeta{
		SessionID:     sessionID,
		Title:         title,
		Summary:       title,
		ResumeCommand: fmt.Sprintf("gemini --resume %s", sessionID),
		CreatedAt:     createdAt,
		LastActiveAt:  lastActiveAt,
		SourcePath:    path,
		MessageCount:  messageCount,
	}, nil
}

func (p *geminiProvider) Delete(root, sourcePath, sessionID string) error {
	meta, err := p.parseSession(sourcePath)
	if err != nil {
		return err
	}
	if meta.SessionID != sessionID {
		return fmt.Errorf("gemini session ID mismatch: expected %s, found %s", sessionID, meta.SessionID)
	}
	return removeFileIfExists(sourcePath)
}
