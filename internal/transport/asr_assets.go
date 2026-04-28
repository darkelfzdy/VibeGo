package transport

import (
	"io/fs"
	"net/http"
	pathpkg "path"
	"strings"

	"github.com/gin-gonic/gin"
)

func RegisterASRAssets(r gin.IRoutes, baseURL string, distFS fs.FS) {
	if distFS == nil {
		return
	}
	cleanBase := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if cleanBase == "" {
		cleanBase = "/sherpa"
	}
	prefix := cleanBase + "/"
	fileServer := http.FileServer(http.FS(distFS))

	r.GET(prefix+"*filepath", func(c *gin.Context) {
		relPath := strings.TrimPrefix(c.Param("filepath"), "/")
		if relPath == "" {
			c.Status(http.StatusNotFound)
			return
		}
		cleanRelPath := pathpkg.Clean("/" + relPath)
		if cleanRelPath == "/" || cleanRelPath == "/.." || strings.HasPrefix(cleanRelPath, "/../") {
			c.Status(http.StatusNotFound)
			return
		}
		assetPath := pathpkg.Clean("sherpa" + cleanRelPath)
		if !strings.HasPrefix(assetPath, "sherpa/") {
			c.Status(http.StatusNotFound)
			return
		}
		if _, err := fs.Stat(distFS, assetPath); err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		cacheControl := "public, max-age=3600"
		if strings.TrimSpace(c.Query("v")) != "" {
			cacheControl = "public, max-age=31536000, immutable"
		}
		c.Header("Cache-Control", cacheControl)
		c.Request.URL.Path = "/" + assetPath
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}
