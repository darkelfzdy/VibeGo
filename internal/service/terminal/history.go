package terminal

import (
	"time"

	"github.com/xxnuo/vibego/internal/model"
)

func (m *Manager) flushHistoryToDB(at *activeTerminal) error {
	data := at.historyBuffer.Read()
	_, cursor := at.historyBuffer.CursorRange()

	now := time.Now().Unix()
	if err := m.saveSnapshot(&TerminalSnapshot{
		SessionID:   at.ID,
		Data:        data,
		Cursor:      cursor,
		Cols:        at.Session.Cols,
		Rows:        at.Session.Rows,
		Status:      at.Session.Status,
		ExitCode:    at.Session.ExitCode,
		RuntimeType: at.Session.RuntimeType,
		Readonly:    at.Session.Readonly,
		UpdatedAt:   now,
	}); err != nil {
		return err
	}

	at.Session.HistorySize = int64(len(data))

	if m.historyMaxRecords > 0 {
		m.pruneOldHistoryRecords(at.ID)
	}

	return nil
}

func (m *Manager) pruneOldHistoryRecords(sessionID string) error {
	var count int64
	m.db.Model(&model.TerminalHistory{}).Where("session_id = ?", sessionID).Count(&count)

	if count <= int64(m.historyMaxRecords) {
		return nil
	}

	toDelete := count - int64(m.historyMaxRecords)
	return m.db.Where("session_id = ? AND id IN (SELECT id FROM terminal_history WHERE session_id = ? ORDER BY created_at ASC LIMIT ?)",
		sessionID, sessionID, toDelete).
		Delete(&model.TerminalHistory{}).Error
}

func (m *Manager) CleanupExpiredHistory() error {
	if m.historyMaxAge <= 0 {
		return nil
	}

	cutoff := time.Now().Add(-m.historyMaxAge).Unix()
	return m.db.Where("created_at < ?", cutoff).Delete(&model.TerminalHistory{}).Error
}

func (m *Manager) flushHistory(at *activeTerminal) {
	for {
		select {
		case <-at.flushTicker.C:
			at.historyMu.Lock()
			m.flushHistoryToDB(at)
			at.historyMu.Unlock()
		case <-at.Done:
			return
		}
	}
}

func (m *Manager) loadHistoryFromDB(sessionID string) ([]byte, error) {
	snapshot, err := m.loadSnapshot(sessionID)
	if err != nil {
		return nil, err
	}
	if snapshot == nil {
		return nil, nil
	}
	return snapshot.Data, nil
}
