package aisession

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/xxnuo/vibego/internal/model"
	"gorm.io/gorm"
)

type Service struct {
	db      *gorm.DB
	configs *configStore
}

func New(db *gorm.DB) *Service {
	return &Service{
		db:      db,
		configs: newConfigStore(db),
	}
}

func (s *Service) GetConfig() (Config, error) {
	return s.configs.Get()
}

func (s *Service) SaveConfig(cfg Config) (Config, error) {
	normalized := normalizeConfig(cfg)
	if err := s.configs.Set(normalized); err != nil {
		return Config{}, err
	}
	if !normalized.CacheEnabled {
		if err := s.db.Where("1 = 1").Delete(&model.AISessionIndex{}).Error; err != nil {
			return Config{}, err
		}
	}
	return normalized, nil
}

func (s *Service) Overview() (Overview, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return Overview{}, err
	}
	rows, err := s.loadCacheRows(enabledProviderIDs(cfg))
	if err != nil {
		return Overview{}, err
	}
	statuses, scannedAt := buildStatusesFromRows(cfg, rows)
	total := 0
	for _, row := range rows {
		if row.ParseError != "" && !cfg.ShowParseErrors {
			continue
		}
		total++
	}
	enabledCount := 0
	for _, status := range statuses {
		if status.Enabled {
			enabledCount++
		}
	}
	return Overview{
		TotalSessions:    total,
		EnabledProviders: enabledCount,
		ScannedAt:        scannedAt,
		FromCache:        len(rows) > 0,
		ProviderStatus:   statuses,
	}, nil
}

func (s *Service) List(forceRescan bool) (ListResult, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return ListResult{}, err
	}
	shouldRescan := forceRescan || !cfg.CacheEnabled
	if !shouldRescan && cfg.CacheEnabled {
		rows, err := s.loadCacheRows(enabledProviderIDs(cfg))
		if err != nil {
			return ListResult{}, err
		}
		if len(rows) == 0 {
			shouldRescan = true
		} else {
			sessions := rowsToSessions(rows, cfg.ShowParseErrors)
			statuses, scannedAt := buildStatusesFromRows(cfg, rows)
			return ListResult{
				Sessions:       sessions,
				ProviderStatus: statuses,
				FromCache:      true,
				ScannedAt:      scannedAt,
				Config:         cfg,
			}, nil
		}
	}
	return s.RescanWithConfig(cfg)
}

func (s *Service) Rescan() (ListResult, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return ListResult{}, err
	}
	return s.RescanWithConfig(cfg)
}

func (s *Service) RescanWithConfig(cfg Config) (ListResult, error) {
	now := time.Now().UnixMilli()
	scanned, statuses := s.scanAll(cfg, now)
	if cfg.CacheEnabled {
		if err := s.replaceCache(scanned, cfg, now); err != nil {
			return ListResult{}, err
		}
	}
	return ListResult{
		Sessions:       filterParseErrors(scanned, cfg.ShowParseErrors),
		ProviderStatus: statuses,
		FromCache:      false,
		ScannedAt:      now,
		Config:         cfg,
	}, nil
}

func (s *Service) GetMessages(providerID, sourcePath string) (MessagesResult, error) {
	item := providerByID(providerID)
	if item == nil {
		return MessagesResult{}, fmt.Errorf("unsupported provider: %s", providerID)
	}
	rows, err := s.loadCacheRows([]string{providerID})
	if err != nil {
		return MessagesResult{}, err
	}
	var session SessionMeta
	for _, row := range rows {
		if row.ProviderID == providerID && row.SourcePath == sourcePath {
			session = sessionFromRow(row)
			break
		}
	}
	if session.SourcePath == "" {
		session = SessionMeta{
			ProviderID: providerID,
			SourcePath: sourcePath,
			SessionID:  fallbackSessionID(sourcePath),
			Title:      pathBasename(sourcePath),
		}
	}
	messages, err := item.LoadMessages(sourcePath)
	if err != nil {
		return MessagesResult{
			Session:       session,
			Messages:      []SessionMessage{},
			ParseWarnings: []string{err.Error()},
		}, nil
	}
	return MessagesResult{
		Session:       session,
		Messages:      messages,
		ParseWarnings: nil,
	}, nil
}

func (s *Service) DeleteSession(providerID, sessionID, sourcePath string) error {
	outcome := s.DeleteSessionOutcome(providerID, sessionID, sourcePath)
	if outcome.Success {
		return nil
	}
	return fmt.Errorf("%s", outcome.Error)
}

func (s *Service) DeleteSessionOutcome(providerID, sessionID, sourcePath string) DeleteOutcome {
	outcome := DeleteOutcome{
		ProviderID: providerID,
		SessionID:  sessionID,
		SourcePath: sourcePath,
	}
	item := providerByID(providerID)
	if item == nil {
		outcome.Error = fmt.Sprintf("unsupported provider: %s", providerID)
		return outcome
	}
	cfg, err := s.GetConfig()
	if err != nil {
		outcome.Error = err.Error()
		return outcome
	}
	providerCfg := cfg.Providers[providerID]
	roots := normalizePaths(providerCfg.Paths)
	if len(roots) == 0 {
		roots = normalizePaths(item.DefaultRoots())
	}
	if len(roots) == 0 {
		outcome.Error = "provider root not configured"
		return outcome
	}
	validatedSource, root, err := validateSessionPath(roots, sourcePath)
	if err != nil {
		outcome.Error = err.Error()
		return outcome
	}
	if err := item.Delete(root, validatedSource, sessionID); err != nil {
		outcome.Error = err.Error()
		return outcome
	}
	if err := s.db.Where("provider_id = ? AND source_path = ?", providerID, sourcePath).Delete(&model.AISessionIndex{}).Error; err != nil {
		outcome.Error = err.Error()
		return outcome
	}
	outcome.Success = true
	return outcome
}

func (s *Service) scanAll(cfg Config, scannedAt int64) ([]SessionMeta, []ProviderStatus) {
	result := make([]SessionMeta, 0)
	statuses := make([]ProviderStatus, 0, len(cfg.Providers))
	for _, item := range providers() {
		providerCfg := cfg.Providers[item.ID()]
		paths := normalizePaths(providerCfg.Paths)
		if len(paths) == 0 {
			paths = normalizePaths(item.DefaultRoots())
		}
		status := ProviderStatus{
			ProviderID: item.ID(),
			Enabled:    providerCfg.Enabled,
			Paths:      paths,
			LastScanAt: scannedAt,
		}
		if !providerCfg.Enabled {
			statuses = append(statuses, status)
			continue
		}
		seen := make(map[string]SessionMeta)
		for _, root := range paths {
			if pathExists(root) {
				status.Available = true
			}
			items, err := item.Scan(root)
			if err != nil {
				status.ErrorCount++
				continue
			}
			for _, session := range items {
				if session.SourcePath == "" {
					continue
				}
				session.ProviderID = item.ID()
				session.ScannedAt = scannedAt
				seen[session.SourcePath] = session
			}
		}
		for _, session := range seen {
			if session.ParseError != "" {
				status.ErrorCount++
			} else {
				status.SessionCount++
			}
			result = append(result, session)
		}
		statuses = append(statuses, status)
	}
	sortSessions(result)
	return result, statuses
}

func (s *Service) replaceCache(sessions []SessionMeta, cfg Config, scannedAt int64) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		for providerID, providerCfg := range cfg.Providers {
			if err := tx.Where("provider_id = ?", providerID).Delete(&model.AISessionIndex{}).Error; err != nil {
				return err
			}
			if !providerCfg.Enabled {
				continue
			}
		}
		for _, session := range sessions {
			row := model.AISessionIndex{
				ProviderID:    session.ProviderID,
				SourcePath:    session.SourcePath,
				SessionID:     session.SessionID,
				Title:         session.Title,
				Summary:       session.Summary,
				ProjectDir:    session.ProjectDir,
				ResumeCommand: session.ResumeCommand,
				CreatedAt:     session.CreatedAt,
				LastActiveAt:  session.LastActiveAt,
				MessageCount:  session.MessageCount,
				ParseError:    session.ParseError,
				FileSize:      session.FileSize,
				FileModTime:   session.FileModTime,
				ScannedAt:     scannedAt,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Service) loadCacheRows(providerIDs []string) ([]model.AISessionIndex, error) {
	rows := make([]model.AISessionIndex, 0)
	query := s.db.Model(&model.AISessionIndex{})
	if len(providerIDs) > 0 {
		query = query.Where("provider_id IN ?", providerIDs)
	}
	err := query.Order("last_active_at DESC, created_at DESC").Find(&rows).Error
	return rows, err
}

func enabledProviderIDs(cfg Config) []string {
	ids := make([]string, 0)
	for providerID, providerCfg := range cfg.Providers {
		if providerCfg.Enabled {
			ids = append(ids, providerID)
		}
	}
	sort.Strings(ids)
	return ids
}

func rowsToSessions(rows []model.AISessionIndex, showParseErrors bool) []SessionMeta {
	sessions := make([]SessionMeta, 0, len(rows))
	for _, row := range rows {
		session := sessionFromRow(row)
		if session.ParseError != "" && !showParseErrors {
			continue
		}
		sessions = append(sessions, session)
	}
	sortSessions(sessions)
	return sessions
}

func sessionFromRow(row model.AISessionIndex) SessionMeta {
	return SessionMeta{
		ProviderID:    row.ProviderID,
		SessionID:     row.SessionID,
		Title:         row.Title,
		Summary:       row.Summary,
		ProjectDir:    row.ProjectDir,
		ResumeCommand: row.ResumeCommand,
		CreatedAt:     row.CreatedAt,
		LastActiveAt:  row.LastActiveAt,
		SourcePath:    row.SourcePath,
		MessageCount:  row.MessageCount,
		ParseError:    row.ParseError,
		FileSize:      row.FileSize,
		FileModTime:   row.FileModTime,
		ScannedAt:     row.ScannedAt,
	}
}

func validateSessionPath(roots []string, sourcePath string) (string, string, error) {
	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		return "", "", err
	}
	validatedSource, err := canonicalPath(sourcePath)
	if err != nil {
		return "", "", err
	}
	if sourceInfo.IsDir() {
		validatedSource = filepath.Clean(validatedSource)
	}
	for _, root := range roots {
		if !pathExists(root) {
			continue
		}
		validatedRoot, err := canonicalPath(root)
		if err != nil {
			continue
		}
		relative, err := filepath.Rel(validatedRoot, validatedSource)
		if err != nil {
			continue
		}
		if relative == "." || (!strings.HasPrefix(relative, ".."+string(filepath.Separator)) && relative != "..") {
			return validatedSource, validatedRoot, nil
		}
	}
	return "", "", fmt.Errorf("session source path is outside provider roots: %s", sourcePath)
}

func filterParseErrors(sessions []SessionMeta, showParseErrors bool) []SessionMeta {
	if showParseErrors {
		sortSessions(sessions)
		return sessions
	}
	filtered := make([]SessionMeta, 0, len(sessions))
	for _, session := range sessions {
		if session.ParseError == "" {
			filtered = append(filtered, session)
		}
	}
	sortSessions(filtered)
	return filtered
}

func buildStatusesFromRows(cfg Config, rows []model.AISessionIndex) ([]ProviderStatus, int64) {
	statusMap := make(map[string]*ProviderStatus, len(cfg.Providers))
	scannedAt := int64(0)
	for _, item := range providers() {
		providerCfg := cfg.Providers[item.ID()]
		paths := normalizePaths(providerCfg.Paths)
		if len(paths) == 0 {
			paths = normalizePaths(item.DefaultRoots())
		}
		status := &ProviderStatus{
			ProviderID: item.ID(),
			Enabled:    providerCfg.Enabled,
			Paths:      paths,
		}
		for _, path := range paths {
			if pathExists(path) {
				status.Available = true
				break
			}
		}
		statusMap[item.ID()] = status
	}
	for _, row := range rows {
		status := statusMap[row.ProviderID]
		if status == nil {
			continue
		}
		if row.ParseError != "" {
			status.ErrorCount++
		} else {
			status.SessionCount++
		}
		if row.ScannedAt > status.LastScanAt {
			status.LastScanAt = row.ScannedAt
		}
		if row.ScannedAt > scannedAt {
			scannedAt = row.ScannedAt
		}
	}
	statuses := make([]ProviderStatus, 0, len(statusMap))
	for _, item := range providers() {
		if status, ok := statusMap[item.ID()]; ok {
			statuses = append(statuses, *status)
		}
	}
	return statuses, scannedAt
}
