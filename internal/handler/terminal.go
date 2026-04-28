package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"github.com/xxnuo/vibego/internal/service/terminal"
	"gorm.io/gorm"
)

type TerminalHandler struct {
	manager  *terminal.Manager
	upgrader websocket.Upgrader
}

func NewTerminalHandler(db *gorm.DB, shell string) *TerminalHandler {
	mgr := terminal.NewManager(db, &terminal.ManagerConfig{Shell: shell})
	mgr.CleanupOnStart()

	return &TerminalHandler{
		manager: mgr,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (h *TerminalHandler) Register(r *gin.RouterGroup) {
	g := r.Group("/terminal")
	g.GET("", h.List)
	g.POST("", h.New)
	g.POST("/sync-workspace", h.SyncWorkspace)
	g.POST("/rename", h.Rename)
	g.POST("/runtime-info", h.UpdateRuntimeInfo)
	g.POST("/close", h.Close)
	g.POST("/delete", h.Delete)
	g.POST("/delete-batch", h.DeleteBatch)
	g.GET("/ws/:id", h.WebSocket)
}

type TerminalInfo struct {
	ID                  string                        `json:"id"`
	Name                string                        `json:"name"`
	Shell               string                        `json:"shell"`
	Cwd                 string                        `json:"cwd"`
	CurrentCwd          string                        `json:"current_cwd"`
	Cols                int                           `json:"cols"`
	Rows                int                           `json:"rows"`
	RuntimeType         string                        `json:"runtime_type"`
	Readonly            bool                          `json:"readonly"`
	Capabilities        terminal.TerminalCapabilities `json:"capabilities"`
	Status              string                        `json:"status"`
	WorkspaceSessionID  string                        `json:"workspace_session_id"`
	GroupID             string                        `json:"group_id"`
	ParentID            string                        `json:"parent_id"`
	ExitCode            int                           `json:"exit_code"`
	HistorySize         int64                         `json:"history_size"`
	ShellType           string                        `json:"shell_type"`
	ShellState          string                        `json:"shell_state"`
	ShellIntegration    bool                          `json:"shell_integration"`
	LastCommand         string                        `json:"last_command"`
	LastCommandExitCode *int                          `json:"last_command_exit_code"`
	CreatedAt           int64                         `json:"created_at"`
	UpdatedAt           int64                         `json:"updated_at"`
}

// List godoc
// @Summary List terminal sessions
// @Tags Terminal
// @Produce json
// @Success 200 {object} map[string][]TerminalInfo
// @Failure 500 {object} map[string]string
// @Router /api/terminal/list [get]
func (h *TerminalHandler) List(c *gin.Context) {
	workspaceSessionID := c.Query("workspace_session_id")
	groupID := c.Query("group_id")
	sessions, err := h.manager.List(workspaceSessionID, groupID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	list := make([]TerminalInfo, len(sessions))
	for i, s := range sessions {
		list[i] = TerminalInfo{
			ID:                  s.ID,
			Name:                s.Name,
			Shell:               s.Shell,
			Cwd:                 s.Cwd,
			CurrentCwd:          s.CurrentCwd,
			Cols:                s.Cols,
			Rows:                s.Rows,
			RuntimeType:         s.RuntimeType,
			Readonly:            s.Readonly,
			Capabilities:        s.Capabilities,
			Status:              s.Status,
			WorkspaceSessionID:  s.WorkspaceSessionID,
			GroupID:             s.GroupID,
			ParentID:            s.ParentID,
			ExitCode:            s.ExitCode,
			HistorySize:         s.HistorySize,
			ShellType:           s.ShellType,
			ShellState:          s.ShellState,
			ShellIntegration:    s.ShellIntegration,
			LastCommand:         s.LastCommand,
			LastCommandExitCode: s.LastCommandExitCode,
			CreatedAt:           s.CreatedAt,
			UpdatedAt:           s.UpdatedAt,
		}
	}
	c.JSON(http.StatusOK, gin.H{"terminals": list})
}

type NewTerminalRequest struct {
	Name               string `json:"name"`
	Cwd                string `json:"cwd"`
	Cols               int    `json:"cols"`
	Rows               int    `json:"rows"`
	UserID             string `json:"user_id"`
	WorkspaceSessionID string `json:"workspace_session_id"`
	GroupID            string `json:"group_id"`
	ParentID           string `json:"parent_id"`
}

// New godoc
// @Summary Create new terminal session
// @Tags Terminal
// @Accept json
// @Produce json
// @Param request body NewTerminalRequest true "Terminal options"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/terminal/new [post]
func (h *TerminalHandler) New(c *gin.Context) {
	var req NewTerminalRequest
	c.ShouldBindJSON(&req)

	info, err := h.manager.Create(terminal.CreateOptions{
		Name:               req.Name,
		Cwd:                req.Cwd,
		Cols:               req.Cols,
		Rows:               req.Rows,
		UserID:             req.UserID,
		WorkspaceSessionID: req.WorkspaceSessionID,
		GroupID:            req.GroupID,
		ParentID:           req.ParentID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": info.ID, "name": info.Name})
}

type CloseTerminalRequest struct {
	ID string `json:"id" binding:"required"`
}

type SyncWorkspaceTerminalRequest struct {
	ID       string `json:"id" binding:"required"`
	GroupID  string `json:"group_id"`
	ParentID string `json:"parent_id"`
}

type SyncWorkspaceStateRequest struct {
	TerminalsByGroup       map[string][]WorkspaceTerminalSession `json:"terminalsByGroup"`
	ActiveTerminalByGroup  map[string]*string                    `json:"activeTerminalByGroup"`
	ListManagerOpenByGroup map[string]bool                       `json:"listManagerOpenByGroup"`
	TerminalLayouts        map[string]WorkspaceLayoutNode        `json:"terminalLayouts"`
	FocusedIDByGroup       map[string]*string                    `json:"focusedIdByGroup"`
}

type SyncWorkspaceRequest struct {
	WorkspaceSessionID string                         `json:"workspace_session_id" binding:"required"`
	Terminals          []SyncWorkspaceTerminalRequest `json:"terminals"`
	WorkspaceState     *SyncWorkspaceStateRequest     `json:"workspace_state,omitempty"`
}

func (h *TerminalHandler) SyncWorkspace(c *gin.Context) {
	var req SyncWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	assignments := make([]terminal.WorkspaceTerminalAssignment, 0, len(req.Terminals))
	for _, item := range req.Terminals {
		assignments = append(assignments, terminal.WorkspaceTerminalAssignment{
			ID:       item.ID,
			GroupID:  item.GroupID,
			ParentID: item.ParentID,
		})
	}

	if err := h.manager.SyncWorkspaceMetadata(req.WorkspaceSessionID, assignments); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.WorkspaceState != nil {
		_, err := updateSessionWorkspaceState(h.manager.DB(), req.WorkspaceSessionID, WorkspaceStatePatch{
			TerminalsByGroup:       &req.WorkspaceState.TerminalsByGroup,
			ActiveTerminalByGroup:  &req.WorkspaceState.ActiveTerminalByGroup,
			ListManagerOpenByGroup: &req.WorkspaceState.ListManagerOpenByGroup,
			TerminalLayouts:        &req.WorkspaceState.TerminalLayouts,
			FocusedIDByGroup:       &req.WorkspaceState.FocusedIDByGroup,
		})
		if err != nil && err != gorm.ErrRecordNotFound {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type RenameTerminalRequest struct {
	ID   string `json:"id" binding:"required"`
	Name string `json:"name" binding:"required"`
}

type UpdateTerminalRuntimeInfoRequest struct {
	ID                  string  `json:"id" binding:"required"`
	CurrentCwd          *string `json:"current_cwd,omitempty"`
	ShellType           *string `json:"shell_type,omitempty"`
	ShellState          *string `json:"shell_state,omitempty"`
	ShellIntegration    *bool   `json:"shell_integration,omitempty"`
	LastCommand         *string `json:"last_command,omitempty"`
	LastCommandExitCode *int    `json:"last_command_exit_code,omitempty"`
}

func (h *TerminalHandler) Rename(c *gin.Context) {
	var req RenameTerminalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if err := h.manager.Rename(req.ID, req.Name); err != nil {
		status := http.StatusInternalServerError
		if err == terminal.ErrTerminalNotFound {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *TerminalHandler) UpdateRuntimeInfo(c *gin.Context) {
	var req UpdateTerminalRuntimeInfoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.manager.UpdateShellMetadata(req.ID, terminal.ShellMetadataUpdate{
		CurrentCwd:          req.CurrentCwd,
		ShellType:           req.ShellType,
		ShellState:          req.ShellState,
		ShellIntegration:    req.ShellIntegration,
		LastCommand:         req.LastCommand,
		LastCommandExitCode: req.LastCommandExitCode,
	})
	if err != nil {
		status := http.StatusInternalServerError
		if err == terminal.ErrTerminalNotFound {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Close godoc
// @Summary Close terminal session
// @Tags Terminal
// @Accept json
// @Produce json
// @Param request body CloseTerminalRequest true "Terminal ID"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/terminal/close [post]
func (h *TerminalHandler) Close(c *gin.Context) {
	var req CloseTerminalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.manager.Close(req.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type DeleteTerminalRequest struct {
	ID string `json:"id" binding:"required"`
}

// Delete godoc
// @Summary Delete terminal session and its history
// @Tags Terminal
// @Accept json
// @Produce json
// @Param request body DeleteTerminalRequest true "Terminal ID"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/terminal/delete [post]
func (h *TerminalHandler) Delete(c *gin.Context) {
	var req DeleteTerminalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.manager.Delete(req.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type DeleteBatchRequest struct {
	IDs []string `json:"ids" binding:"required"`
}

// DeleteBatch godoc
// @Summary Delete multiple terminal sessions and their history
// @Tags Terminal
// @Accept json
// @Produce json
// @Param request body DeleteBatchRequest true "Terminal IDs"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/terminal/delete-batch [post]
func (h *TerminalHandler) DeleteBatch(c *gin.Context) {
	var req DeleteBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	deleted := 0
	for _, id := range req.IDs {
		if err := h.manager.Delete(id); err == nil {
			deleted++
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "deleted": deleted})
}

// WebSocket godoc
// @Summary Connect to terminal websocket
// @Tags Terminal
// @Param id path string true "Terminal ID"
// @Router /api/terminal/ws/{id} [get]
func (h *TerminalHandler) WebSocket(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id is required"})
		return
	}

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to upgrade websocket")
		return
	}

	cursor := uint64(0)
	if raw := c.Query("cursor"); raw != "" {
		if parsed, parseErr := strconv.ParseUint(raw, 10, 64); parseErr == nil {
			cursor = parsed
		}
	}

	termConn, err := h.manager.AttachWithOptions(id, conn, terminal.AttachOptions{Cursor: cursor})
	if err != nil {
		log.Error().Err(err).Str("id", id).Msg("Failed to attach to terminal")
		conn.Close()
		return
	}

	log.Info().Str("id", id).Msg("Terminal attached via WebSocket")

	<-termConn.Done
}
