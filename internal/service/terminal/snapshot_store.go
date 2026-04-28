package terminal

import (
	"time"

	"github.com/xxnuo/vibego/internal/model"
	"gorm.io/gorm"
)

type TerminalSnapshot struct {
	SessionID   string
	Data        []byte
	Cursor      uint64
	Cols        int
	Rows        int
	Status      string
	ExitCode    int
	RuntimeType string
	Readonly    bool
	UpdatedAt   int64
}

type TerminalSnapshotStore interface {
	Load(sessionID string) (*TerminalSnapshot, error)
	Save(snapshot *TerminalSnapshot) error
	Delete(sessionID string) error
}

type DBTerminalSnapshotStore struct {
	db *gorm.DB
}

func NewDBTerminalSnapshotStore(db *gorm.DB) *DBTerminalSnapshotStore {
	return &DBTerminalSnapshotStore{db: db}
}

func (s *DBTerminalSnapshotStore) Load(sessionID string) (*TerminalSnapshot, error) {
	if sessionID == "" {
		return nil, nil
	}

	var session model.TerminalSession
	if err := s.db.Where("id = ?", sessionID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}

	var history model.TerminalHistory
	if err := s.db.Where("session_id = ?", sessionID).Order("created_at DESC").First(&history).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return &TerminalSnapshot{
				SessionID:   sessionID,
				Cols:        session.Cols,
				Rows:        session.Rows,
				Status:      session.Status,
				ExitCode:    session.ExitCode,
				RuntimeType: session.RuntimeType,
				Readonly:    session.Readonly,
				UpdatedAt:   session.UpdatedAt,
			}, nil
		}
		return nil, err
	}

	return &TerminalSnapshot{
		SessionID:   sessionID,
		Data:        history.Data,
		Cursor:      uint64(len(history.Data)),
		Cols:        session.Cols,
		Rows:        session.Rows,
		Status:      session.Status,
		ExitCode:    session.ExitCode,
		RuntimeType: session.RuntimeType,
		Readonly:    session.Readonly,
		UpdatedAt:   session.UpdatedAt,
	}, nil
}

func (s *DBTerminalSnapshotStore) Save(snapshot *TerminalSnapshot) error {
	if snapshot == nil || snapshot.SessionID == "" {
		return nil
	}

	now := snapshot.UpdatedAt
	if now == 0 {
		now = time.Now().Unix()
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if len(snapshot.Data) > 0 {
			if err := tx.Where("session_id = ?", snapshot.SessionID).Delete(&model.TerminalHistory{}).Error; err != nil {
				return err
			}
			if err := tx.Create(&model.TerminalHistory{
				SessionID: snapshot.SessionID,
				Data:      snapshot.Data,
				CreatedAt: now,
			}).Error; err != nil {
				return err
			}
		}

		updates := map[string]any{
			"cols":         snapshot.Cols,
			"rows":         snapshot.Rows,
			"status":       snapshot.Status,
			"exit_code":    snapshot.ExitCode,
			"runtime_type": snapshot.RuntimeType,
			"readonly":     snapshot.Readonly,
			"history_size": int64(len(snapshot.Data)),
			"updated_at":   now,
		}
		return tx.Model(&model.TerminalSession{}).Where("id = ?", snapshot.SessionID).Updates(updates).Error
	})
}

func (s *DBTerminalSnapshotStore) Delete(sessionID string) error {
	if sessionID == "" {
		return nil
	}
	return s.db.Where("session_id = ?", sessionID).Delete(&model.TerminalHistory{}).Error
}
