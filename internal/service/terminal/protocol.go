package terminal

const (
	MsgTypeInput      = "input"
	MsgTypeResize     = "resize"
	MsgTypeAck        = "ack"
	MsgTypeOutput     = "output"
	MsgTypeReplay     = "replay"
	MsgTypeReplayDone = "replay_done"
	MsgTypeState      = "state"
	MsgTypePtyExited  = "pty_exited"
)

type WSMessage struct {
	Type                string               `json:"type"`
	Data                string               `json:"data,omitempty"`
	Cols                int                  `json:"cols,omitempty"`
	Rows                int                  `json:"rows,omitempty"`
	Cursor              uint64               `json:"cursor,omitempty"`
	Reset               bool                 `json:"reset,omitempty"`
	Status              string               `json:"status,omitempty"`
	ExitCode            int                  `json:"exit_code,omitempty"`
	RuntimeType         string               `json:"runtime_type,omitempty"`
	Readonly            bool                 `json:"readonly,omitempty"`
	Capabilities        TerminalCapabilities `json:"capabilities,omitempty"`
	CurrentCwd          string               `json:"current_cwd,omitempty"`
	ShellType           string               `json:"shell_type,omitempty"`
	ShellState          string               `json:"shell_state,omitempty"`
	ShellIntegration    bool                 `json:"shell_integration,omitempty"`
	LastCommand         string               `json:"last_command,omitempty"`
	LastCommandExitCode *int                 `json:"last_command_exit_code,omitempty"`
}

type ResizeMessage struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}
