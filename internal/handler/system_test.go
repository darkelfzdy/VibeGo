package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/xxnuo/vibego/internal/service/asr"
)

func setupTestSystemHandler() (*SystemHandler, *gin.Engine) {
	gin.SetMode(gin.TestMode)
	h := NewSystemHandler()
	r := gin.New()
	h.Register(r)
	return h, r
}

func TestSystemVersion(t *testing.T) {
	_, r := setupTestSystemHandler()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/version", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "version")
}

func TestSystemHealth(t *testing.T) {
	_, r := setupTestSystemHandler()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/health", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "ok")
}

func TestSystemHeartbeat(t *testing.T) {
	_, r := setupTestSystemHandler()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/__heartbeat__", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "Ready", w.Body.String())
}

func TestSystemLBHeartbeat(t *testing.T) {
	_, r := setupTestSystemHandler()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/__lbheartbeat__", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "Ready", w.Body.String())
}

func TestASRInfoEnabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewASRHandler(asr.New(asr.Config{}))
	h.Register(r.Group("/api"))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/asr/info", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "enabled")
	assert.Contains(t, w.Body.String(), "true")
	assert.Contains(t, w.Body.String(), "/api/asr-assets/official/")
}
