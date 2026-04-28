package aisession

import (
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

type provider interface {
	ID() string
	DefaultRoots() []string
	Scan(root string) ([]SessionMeta, error)
	LoadMessages(sourcePath string) ([]SessionMessage, error)
	Delete(root, sourcePath, sessionID string) error
}

func providers() []provider {
	return []provider{
		newClaudeProvider(),
		newCodexProvider(),
		newGeminiProvider(),
		newOpenCodeProvider(),
		newOpenClawProvider(),
	}
}

func providerByID(id string) provider {
	for _, item := range providers() {
		if item.ID() == id {
			return item
		}
	}
	return nil
}

func scanPath(providerID, path string, parser func() (SessionMeta, error)) SessionMeta {
	size, modTime := fileInfo(path)
	meta, err := parser()
	if err == nil {
		if meta.SessionID == "" {
			meta.SessionID = fallbackSessionID(path)
		}
		if meta.SourcePath == "" {
			meta.SourcePath = path
		}
		meta.ProviderID = providerID
		if meta.FileSize == 0 {
			meta.FileSize = size
		}
		if meta.FileModTime == 0 {
			meta.FileModTime = modTime
		}
		return meta
	}
	return SessionMeta{
		ProviderID:  providerID,
		SessionID:   fallbackSessionID(path),
		Title:       pathBasename(path),
		SourcePath:  path,
		ParseError:  err.Error(),
		FileSize:    size,
		FileModTime: modTime,
	}
}

func fallbackSessionID(path string) string {
	base := stringsTrimSuffix(filepath.Base(path), filepath.Ext(path))
	if base != "" {
		return base
	}
	return "invalid-" + uuid.NewString()
}

func stringsTrimSuffix(value, suffix string) string {
	if suffix == "" {
		return value
	}
	return value[:len(value)-len(suffix)]
}

func pathExists(path string) bool {
	if path == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}
