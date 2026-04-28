package transport

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRegisterASRAssets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "sherpa"), 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "sherpa", "test.bin")
	if err := os.WriteFile(path, []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}

	r := gin.New()
	RegisterASRAssets(r, "/sherpa/", os.DirFS(dir))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/sherpa/test.bin?v=v1", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if got := w.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("cache-control = %q", got)
	}
}

func TestRegisterASRAssetsWithoutVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "sherpa"), 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "sherpa", "test.bin")
	if err := os.WriteFile(path, []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}

	r := gin.New()
	RegisterASRAssets(r, "/sherpa/", os.DirFS(dir))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/sherpa/test.bin", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if got := w.Header().Get("Cache-Control"); got != "public, max-age=3600" {
		t.Fatalf("cache-control = %q", got)
	}
}
