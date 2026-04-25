package handler

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xxnuo/vibego/internal/service/asr"
)

type ASRHandler struct {
	service *asr.Service
}

func NewASRHandler(service *asr.Service) *ASRHandler {
	return &ASRHandler{service: service}
}

func (h *ASRHandler) Register(r *gin.RouterGroup) {
	r.GET("/asr/info", h.Info)
	r.GET("/asr-assets/:source/*filepath", h.Asset)
}

func (h *ASRHandler) Info(c *gin.Context) {
	if h.service == nil {
		c.JSON(http.StatusOK, gin.H{"enabled": false, "message": "speech assets are unavailable"})
		return
	}
	info := h.service.Info()
	c.JSON(http.StatusOK, info)
}

func (h *ASRHandler) Asset(c *gin.Context) {
	if h.service == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "speech assets are unavailable"})
		return
	}

	filename := strings.TrimPrefix(c.Param("filepath"), "/")
	assetURL, ok := h.service.AssetURL(c.Param("source"), filename)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "speech asset not found"})
		return
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, assetURL, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "invalid speech asset url"})
		return
	}
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch speech asset"})
		return
	}
	defer resp.Body.Close()

	for _, name := range []string{"Content-Type", "Content-Length", "Accept-Ranges", "Content-Range", "ETag"} {
		if value := resp.Header.Get(name); value != "" {
			c.Header(name, value)
		}
	}
	c.Header("Cache-Control", "public, max-age=3600")
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}
