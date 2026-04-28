package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/xxnuo/vibego/internal/service/aisession"
	"gorm.io/gorm"
)

type AISessionHandler struct {
	service *aisession.Service
}

func NewAISessionHandler(db *gorm.DB) *AISessionHandler {
	return &AISessionHandler{service: aisession.New(db)}
}

func (h *AISessionHandler) Register(r *gin.RouterGroup) {
	g := r.Group("/ai-sessions")
	g.GET("", h.List)
	g.GET("/overview", h.Overview)
	g.POST("/rescan", h.Rescan)
	g.POST("/messages", h.Messages)
	g.POST("/delete", h.Delete)
	g.POST("/delete-batch", h.DeleteBatch)
	g.GET("/config", h.GetConfig)
	g.POST("/config", h.SetConfig)
}

func (h *AISessionHandler) Overview(c *gin.Context) {
	result, err := h.service.Overview()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AISessionHandler) List(c *gin.Context) {
	result, err := h.service.List(false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AISessionHandler) Rescan(c *gin.Context) {
	result, err := h.service.Rescan()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

type aiSessionMessagesRequest struct {
	ProviderID string `json:"providerId" binding:"required"`
	SourcePath string `json:"sourcePath" binding:"required"`
}

type aiSessionDeleteRequest struct {
	ProviderID string `json:"providerId" binding:"required"`
	SessionID  string `json:"sessionId" binding:"required"`
	SourcePath string `json:"sourcePath" binding:"required"`
}

func (h *AISessionHandler) Messages(c *gin.Context) {
	var req aiSessionMessagesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.GetMessages(req.ProviderID, req.SourcePath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AISessionHandler) Delete(c *gin.Context) {
	var req aiSessionDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.DeleteSession(req.ProviderID, req.SessionID, req.SourcePath); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AISessionHandler) DeleteBatch(c *gin.Context) {
	var req []aiSessionDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	items := make([]aisession.DeleteOutcome, 0, len(req))
	for _, item := range req {
		items = append(items, h.service.DeleteSessionOutcome(item.ProviderID, item.SessionID, item.SourcePath))
	}
	c.JSON(http.StatusOK, items)
}

func (h *AISessionHandler) GetConfig(c *gin.Context) {
	cfg, err := h.service.GetConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *AISessionHandler) SetConfig(c *gin.Context) {
	var cfg aisession.Config
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	saved, err := h.service.SaveConfig(cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, saved)
}
