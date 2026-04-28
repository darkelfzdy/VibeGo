package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/gorilla/websocket"
	"github.com/xxnuo/vibego/internal/model"
	"github.com/xxnuo/vibego/internal/service/terminal"
	"gorm.io/gorm"
)

func setupTestHandler(t *testing.T) (*TerminalHandler, func()) {
	tmpDir := t.TempDir()

	db, err := gorm.Open(sqlite.Open(tmpDir+"/test.db"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}

	if err := db.AutoMigrate(&model.UserSession{}, &model.TerminalSession{}, &model.TerminalHistory{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	mgr := terminal.NewManager(db, &terminal.ManagerConfig{Shell: os.Getenv("SHELL")})
	handler := &TerminalHandler{manager: mgr}

	cleanup := func() {
		sessions, _ := mgr.List("", "")
		for _, s := range sessions {
			mgr.Close(s.ID)
		}
	}

	return handler, cleanup
}

func TestTerminalHandlerNew(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := NewTerminalRequest{
		Name: "test",
		Cols: 80,
		Rows: 24,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["ok"] != true {
		t.Error("expected ok=true")
	}
	if resp["id"] == "" {
		t.Error("expected non-empty id")
	}
}

func TestTerminalHandlerList(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info1, _ := handler.manager.Create(terminal.CreateOptions{Name: "test1", Cols: 80, Rows: 24})
	info2, _ := handler.manager.Create(terminal.CreateOptions{Name: "test2", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	req := httptest.NewRequest("GET", "/api/terminal", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string][]TerminalInfo
	json.Unmarshal(w.Body.Bytes(), &resp)

	terminals := resp["terminals"]
	if len(terminals) < 2 {
		t.Errorf("expected at least 2 terminals, got %d", len(terminals))
	}

	found := false
	for _, term := range terminals {
		if term.ID == info1.ID || term.ID == info2.ID {
			found = true
			if term.Status != model.StatusRunning {
				t.Errorf("expected status %s, got %s", model.StatusRunning, term.Status)
			}
		}
	}

	if !found {
		t.Error("created sessions not found in list")
	}
}

func TestTerminalHandlerCreateWithWorkspaceMetadata(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := NewTerminalRequest{
		Name:               "meta",
		Cols:               80,
		Rows:               24,
		WorkspaceSessionID: "session-1",
		GroupID:            "group-1",
		ParentID:           "root-1",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/terminal", nil)
	router.ServeHTTP(w, req)

	var resp map[string][]TerminalInfo
	json.Unmarshal(w.Body.Bytes(), &resp)

	found := false
	for _, term := range resp["terminals"] {
		if term.Name != "meta" {
			continue
		}
		found = true
		if term.WorkspaceSessionID != "session-1" {
			t.Fatalf("expected workspace_session_id session-1, got %s", term.WorkspaceSessionID)
		}
		if term.GroupID != "group-1" {
			t.Fatalf("expected group_id group-1, got %s", term.GroupID)
		}
		if term.ParentID != "root-1" {
			t.Fatalf("expected parent_id root-1, got %s", term.ParentID)
		}
	}

	if !found {
		t.Fatal("created session with metadata not found")
	}
}

func TestTerminalHandlerSyncWorkspace(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info1, _ := handler.manager.Create(terminal.CreateOptions{Name: "test1", Cols: 80, Rows: 24})
	info2, _ := handler.manager.Create(terminal.CreateOptions{Name: "test2", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	body := map[string]any{
		"workspace_session_id": "session-1",
		"terminals": []map[string]string{
			{"id": info1.ID, "group_id": "group-1"},
			{"id": info2.ID, "group_id": "group-1", "parent_id": info1.ID},
		},
	}
	reqBody, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/terminal/sync-workspace", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/terminal?workspace_session_id=session-1&group_id=group-1", nil)
	router.ServeHTTP(w, req)

	var resp map[string][]TerminalInfo
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp["terminals"]) != 2 {
		t.Fatalf("expected 2 terminals, got %d", len(resp["terminals"]))
	}
}

func TestTerminalHandlerSyncWorkspaceUpdatesSessionState(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	now := time.Now().Unix()
	err := handler.manager.DB().Create(&model.UserSession{
		ID:           "session-1",
		Name:         "Session",
		State:        `{"openGroups":[],"openTools":[],"terminalsByGroup":{},"activeTerminalByGroup":{},"listManagerOpenByGroup":{},"terminalLayouts":{},"focusedIdByGroup":{},"settingsOpen":false,"activeGroupId":null,"fileManagerByGroup":{}}`,
		CreatedAt:    now,
		UpdatedAt:    now,
		LastActiveAt: now,
	}).Error
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	info1, _ := handler.manager.Create(terminal.CreateOptions{Name: "test1", Cols: 80, Rows: 24})
	info2, _ := handler.manager.Create(terminal.CreateOptions{Name: "test2", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	body := map[string]any{
		"workspace_session_id": "session-1",
		"terminals": []map[string]string{
			{"id": info1.ID, "group_id": "group-1"},
			{"id": info2.ID, "group_id": "group-1", "parent_id": info1.ID},
		},
		"workspace_state": map[string]any{
			"terminalsByGroup": map[string]any{
				"group-1": []map[string]any{
					{"id": info1.ID, "name": "test1"},
					{"id": info2.ID, "name": "test2", "parentId": info1.ID},
				},
			},
			"activeTerminalByGroup":  map[string]any{"group-1": info1.ID},
			"listManagerOpenByGroup": map[string]any{"group-1": false},
			"terminalLayouts": map[string]any{
				info1.ID: map[string]any{"type": "terminal", "terminalId": info1.ID},
			},
			"focusedIdByGroup": map[string]any{"group-1": info2.ID},
		},
	}
	reqBody, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/terminal/sync-workspace", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var session model.UserSession
	if err := handler.manager.DB().First(&session, "id = ?", "session-1").Error; err != nil {
		t.Fatalf("failed to load session: %v", err)
	}

	if !strings.Contains(session.State, `"group-1"`) {
		t.Fatalf("expected session state to contain group-1, got %s", session.State)
	}
	if !strings.Contains(session.State, info2.ID) {
		t.Fatalf("expected session state to contain focused terminal id, got %s", session.State)
	}
}

func TestTerminalHandlerListByWorkspaceSession(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	_, _ = handler.manager.Create(terminal.CreateOptions{
		Name:               "session-1-terminal",
		Cols:               80,
		Rows:               24,
		WorkspaceSessionID: "session-1",
		GroupID:            "group-1",
	})
	_, _ = handler.manager.Create(terminal.CreateOptions{
		Name:               "session-2-terminal",
		Cols:               80,
		Rows:               24,
		WorkspaceSessionID: "session-2",
		GroupID:            "group-2",
	})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	req := httptest.NewRequest("GET", "/api/terminal?workspace_session_id=session-1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp map[string][]TerminalInfo
	json.Unmarshal(w.Body.Bytes(), &resp)
	terminals := resp["terminals"]
	if len(terminals) != 1 {
		t.Fatalf("expected 1 terminal, got %d", len(terminals))
	}
	if terminals[0].WorkspaceSessionID != "session-1" {
		t.Fatalf("expected workspace_session_id session-1, got %s", terminals[0].WorkspaceSessionID)
	}
}

func TestTerminalHandlerClose(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := CloseTerminalRequest{ID: info.ID}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal/close", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	_, ok := handler.manager.Get(info.ID)
	if ok {
		t.Error("expected session to be closed")
	}
}

func TestTerminalHandlerRename(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := RenameTerminalRequest{ID: info.ID, Name: "renamed"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal/rename", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	sessions, _ := handler.manager.List("", "")
	found := false
	for _, session := range sessions {
		if session.ID == info.ID {
			found = true
			if session.Name != "renamed" {
				t.Errorf("expected renamed terminal, got %s", session.Name)
			}
		}
	}

	if !found {
		t.Fatal("renamed session not found")
	}
}

func TestTerminalHandlerWebSocket(t *testing.T) {
	handler, cleanup := setupTestHandler(t)

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	server := httptest.NewServer(router)

	wsURL := "ws" + server.URL[4:] + "/api/terminal/ws/" + info.ID

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to connect websocket: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	_, ok := handler.manager.Get(info.ID)
	if !ok {
		t.Fatal("session not found")
	}

	conn.Close()
	cleanup()
	server.Close()
	time.Sleep(200 * time.Millisecond)
}

func TestTerminalHistoryPersistence(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	sessions, _ := handler.manager.List("", "")
	var found *terminal.TerminalInfo
	for i, s := range sessions {
		if s.ID == info.ID {
			found = &sessions[i]
			break
		}
	}

	if found == nil {
		t.Fatal("session not found")
	}

	if found.Status != model.StatusRunning {
		t.Errorf("expected status %s, got %s", model.StatusRunning, found.Status)
	}
}
