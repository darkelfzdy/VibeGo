package model

type AISessionIndex struct {
	UserID        string `gorm:"column:user_id;primaryKey"`
	ProviderID    string `gorm:"column:provider_id;primaryKey;index:idx_ai_session_provider_active"`
	SourcePath    string `gorm:"column:source_path;primaryKey;type:text"`
	SessionID     string `gorm:"column:session_id;index"`
	Title         string `gorm:"column:title"`
	Summary       string `gorm:"column:summary;type:text"`
	ProjectDir    string `gorm:"column:project_dir;type:text"`
	ResumeCommand string `gorm:"column:resume_command;type:text"`
	CreatedAt     int64  `gorm:"column:created_at"`
	LastActiveAt  int64  `gorm:"column:last_active_at;index:idx_ai_session_provider_active"`
	MessageCount  int    `gorm:"column:message_count"`
	ParseError    string `gorm:"column:parse_error;type:text"`
	FileSize      int64  `gorm:"column:file_size"`
	FileModTime   int64  `gorm:"column:file_mod_time"`
	ScannedAt     int64  `gorm:"column:scanned_at;index"`
}

func (AISessionIndex) TableName() string {
	return "ai_session_indices"
}
