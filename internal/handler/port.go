package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xxnuo/vibego/internal/service/port"
)

type PortHandler struct {
	service *port.Service
}

func NewPortHandler() *PortHandler {
	return &PortHandler{
		service: port.New(),
	}
}

func (h *PortHandler) Register(r *gin.RouterGroup) {
	g := r.Group("/port")
	g.GET("", h.ListPorts)
	g.POST("/kill", h.KillProcess)
	g.GET("/forwards", h.ListForwards)
	g.POST("/forwards", h.AddForward)
	g.DELETE("/forwards/:id", h.RemoveForward)
	g.PUT("/forwards/:id/toggle", h.ToggleForward)
}

func (h *PortHandler) ListPorts(c *gin.Context) {
	ports, err := h.service.GetListeningPorts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ports": ports})
}

type PortKillRequest struct {
	PID int32 `json:"pid" binding:"required"`
}

func (h *PortHandler) KillProcess(c *gin.Context) {
	var req PortKillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.KillProcess(req.PID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type AddForwardRequest struct {
	ListenPort int    `json:"listenPort" binding:"required"`
	Protocol   string `json:"protocol" binding:"required"`
	TargetAddr string `json:"targetAddr" binding:"required"`
	Enabled    bool   `json:"enabled"`
}

func (h *PortHandler) AddForward(c *gin.Context) {
	var req AddForwardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule := port.ForwardRule{
		ID:         fmt.Sprintf("fwd-%d", time.Now().UnixNano()),
		ListenPort: req.ListenPort,
		Protocol:   req.Protocol,
		TargetAddr: req.TargetAddr,
		Enabled:    req.Enabled,
	}

	if err := h.service.AddForward(rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rule)
}

func (h *PortHandler) RemoveForward(c *gin.Context) {
	id := c.Param("id")
	if err := h.service.RemoveForward(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type ToggleForwardRequest struct {
	Enabled bool `json:"enabled"`
}

func (h *PortHandler) ToggleForward(c *gin.Context) {
	id := c.Param("id")
	var req ToggleForwardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.ToggleForward(id, req.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *PortHandler) ListForwards(c *gin.Context) {
	forwards := h.service.ListForwards()
	c.JSON(http.StatusOK, gin.H{"forwards": forwards})
}
