package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xxnuo/vibego/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupTestAISessionHandler(t *testing.T) (*AISessionHandler, *gin.Engine) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.AISessionIndex{}, &model.UserSetting{}))
	handler := NewAISessionHandler(db)
	router := gin.New()
	handler.Register(router.Group("/api"))
	return handler, router
}

func TestAISessionRescanAndMessages(t *testing.T) {
	_, router := setupTestAISessionHandler(t)
	root := t.TempDir()
	sessionPath := filepath.Join(root, "session-1.jsonl")
	require.NoError(t, os.MkdirAll(filepath.Dir(sessionPath), 0755))
	require.NoError(
		t,
		os.WriteFile(
			sessionPath,
			[]byte("{\"timestamp\":\"2026-03-06T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session-1\",\"cwd\":\"/tmp/demo\"}}\n{\"timestamp\":\"2026-03-06T10:01:00Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":\"hello vibego\"}}\n"),
			0644,
		),
	)

	configBody := map[string]any{
		"providers": map[string]any{
			"claude":   map[string]any{"enabled": false, "paths": []string{}},
			"codex":    map[string]any{"enabled": true, "paths": []string{root}},
			"gemini":   map[string]any{"enabled": false, "paths": []string{}},
			"opencode": map[string]any{"enabled": false, "paths": []string{}},
			"openclaw": map[string]any{"enabled": false, "paths": []string{}},
		},
		"autoRescanOnOpen": true,
		"cacheEnabled":     true,
		"showParseErrors":  true,
	}
	configJSON, err := json.Marshal(configBody)
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/api/ai-sessions/config", bytes.NewReader(configJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	req = httptest.NewRequest("POST", "/api/ai-sessions/rescan", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var listResp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &listResp))
	sessions := listResp["sessions"].([]any)
	require.Len(t, sessions, 1)

	session := sessions[0].(map[string]any)
	assert.Equal(t, "codex-session-1", session["sessionId"])

	req = httptest.NewRequest("GET", "/api/ai-sessions/overview", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var overview map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &overview))
	assert.Equal(t, float64(1), overview["totalSessions"])

	messageJSON, err := json.Marshal(map[string]string{
		"providerId": "codex",
		"sourcePath": sessionPath,
	})
	require.NoError(t, err)

	req = httptest.NewRequest("POST", "/api/ai-sessions/messages", bytes.NewReader(messageJSON))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var messagesResp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &messagesResp))
	messages := messagesResp["messages"].([]any)
	require.Len(t, messages, 1)
}

func TestAISessionDeleteAndBatchDelete(t *testing.T) {
	_, router := setupTestAISessionHandler(t)
	root := t.TempDir()
	sessionA := filepath.Join(root, "session-a.jsonl")
	sessionB := filepath.Join(root, "session-b.jsonl")
	require.NoError(t, os.WriteFile(sessionA, []byte("{\"timestamp\":\"2026-03-06T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session-a\",\"cwd\":\"/tmp/demo\"}}\n"), 0644))
	require.NoError(t, os.WriteFile(sessionB, []byte("{\"timestamp\":\"2026-03-06T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session-b\",\"cwd\":\"/tmp/demo\"}}\n"), 0644))

	configBody := map[string]any{
		"providers": map[string]any{
			"claude":   map[string]any{"enabled": false, "paths": []string{}},
			"codex":    map[string]any{"enabled": true, "paths": []string{root}},
			"gemini":   map[string]any{"enabled": false, "paths": []string{}},
			"opencode": map[string]any{"enabled": false, "paths": []string{}},
			"openclaw": map[string]any{"enabled": false, "paths": []string{}},
		},
		"autoRescanOnOpen": true,
		"cacheEnabled":     true,
		"showParseErrors":  true,
	}
	configJSON, err := json.Marshal(configBody)
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/api/ai-sessions/config", bytes.NewReader(configJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	req = httptest.NewRequest("POST", "/api/ai-sessions/rescan", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	deleteBody, err := json.Marshal(map[string]string{
		"providerId": "codex",
		"sessionId":  "codex-session-a",
		"sourcePath": sessionA,
	})
	require.NoError(t, err)

	req = httptest.NewRequest("POST", "/api/ai-sessions/delete", bytes.NewReader(deleteBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	_, err = os.Stat(sessionA)
	require.True(t, os.IsNotExist(err))

	batchBody, err := json.Marshal([]map[string]string{
		{
			"providerId": "codex",
			"sessionId":  "codex-session-b",
			"sourcePath": sessionB,
		},
		{
			"providerId": "codex",
			"sessionId":  "missing",
			"sourcePath": filepath.Join(root, "missing.jsonl"),
		},
	})
	require.NoError(t, err)

	req = httptest.NewRequest("POST", "/api/ai-sessions/delete-batch", bytes.NewReader(batchBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var outcomes []map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &outcomes))
	require.Len(t, outcomes, 2)
	assert.Equal(t, true, outcomes[0]["success"])
	assert.Equal(t, false, outcomes[1]["success"])
	_, err = os.Stat(sessionB)
	require.True(t, os.IsNotExist(err))
}
