package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/xxnuo/vibego/internal/model"
	"gorm.io/gorm"
)

type SessionHandler struct {
	db *gorm.DB
}

func NewSessionHandler(db *gorm.DB) *SessionHandler {
	return &SessionHandler{db: db}
}

func (h *SessionHandler) Register(r *gin.RouterGroup) {
	g := r.Group("/session")
	g.GET("", h.List)
	g.POST("", h.Create)
	g.GET("/:id", h.Get)
	g.PUT("/:id", h.Update)
	g.PATCH("/:id/workspace", h.PatchWorkspace)
	g.DELETE("/:id", h.Delete)
}

type SessionInfo struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

type SessionDetail struct {
	ID             string         `json:"id"`
	UserID         string         `json:"user_id"`
	Name           string         `json:"name"`
	State          string         `json:"state"`
	WorkspaceState WorkspaceState `json:"workspace_state"`
	LastActiveAt   int64          `json:"last_active_at"`
	ExpiredAt      int64          `json:"expired_at"`
	CreatedAt      int64          `json:"created_at"`
	UpdatedAt      int64          `json:"updated_at"`
}

func (h *SessionHandler) List(c *gin.Context) {
	page := 1
	pageSize := 50
	if p := c.Query("page"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n > 0 {
			page = n
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if n, err := strconv.Atoi(ps); err == nil && n > 0 && n <= 100 {
			pageSize = n
		}
	}

	var total int64
	h.db.Model(&model.UserSession{}).Count(&total)

	var sessions []model.UserSession
	offset := (page - 1) * pageSize
	if err := h.db.Order("updated_at DESC").Offset(offset).Limit(pageSize).Find(&sessions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	list := make([]SessionInfo, len(sessions))
	for i, s := range sessions {
		list[i] = SessionInfo{
			ID:        s.ID,
			UserID:    s.UserID,
			Name:      s.Name,
			CreatedAt: s.CreatedAt,
			UpdatedAt: s.UpdatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"sessions":  list,
		"page":      page,
		"page_size": pageSize,
		"total":     total,
	})
}

type CreateSessionRequest struct {
	Name   string `json:"name"`
	UserID string `json:"user_id"`
}

func (h *SessionHandler) Create(c *gin.Context) {
	var req CreateSessionRequest
	c.ShouldBindJSON(&req)

	name := req.Name
	if name == "" {
		name = "Untitled Session"
	}

	now := time.Now().Unix()
	expiredAt := now + 7*24*60*60
	state, err := marshalWorkspaceState(emptyWorkspaceState())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	session := model.UserSession{
		ID:           uuid.New().String(),
		UserID:       req.UserID,
		Name:         name,
		State:        state,
		LastActiveAt: now,
		ExpiredAt:    expiredAt,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := h.db.Create(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ok": true, "id": session.ID})
}

func (h *SessionHandler) Get(c *gin.Context) {
	id := c.Param("id")
	var session model.UserSession
	if err := h.db.First(&session, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	now := time.Now().Unix()
	if session.ExpiredAt > 0 && now > session.ExpiredAt {
		c.JSON(http.StatusGone, gin.H{"error": "session expired"})
		return
	}

	h.db.Model(&session).Update("last_active_at", now)
	session.LastActiveAt = now

	workspaceState, err := parseWorkspaceState(session.State)
	if err != nil {
		workspaceState = emptyWorkspaceState()
	}

	c.JSON(http.StatusOK, SessionDetail{
		ID:             session.ID,
		UserID:         session.UserID,
		Name:           session.Name,
		State:          session.State,
		WorkspaceState: workspaceState,
		LastActiveAt:   session.LastActiveAt,
		ExpiredAt:      session.ExpiredAt,
		CreatedAt:      session.CreatedAt,
		UpdatedAt:      session.UpdatedAt,
	})
}

type UpdateSessionRequest struct {
	Name *string `json:"name,omitempty"`
}

func (h *SessionHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var session model.UserSession
	if err := h.db.First(&session, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	var req UpdateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now().Unix()
	updates := map[string]any{
		"updated_at":     now,
		"last_active_at": now,
	}
	if req.Name != nil {
		updates["name"] = *req.Name
	}

	if err := h.db.Model(&session).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *SessionHandler) PatchWorkspace(c *gin.Context) {
	id := c.Param("id")

	var req WorkspaceStatePatch
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := updateSessionWorkspaceState(h.db, id, req); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *SessionHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	result := h.db.Delete(&model.UserSession{}, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
