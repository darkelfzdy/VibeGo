package terminal

import (
	"context"
)

type TerminalCapabilities struct {
	Resume           bool `json:"resume"`
	Snapshot         bool `json:"snapshot"`
	ShellIntegration bool `json:"shell_integration"`
	Durable          bool `json:"durable"`
}

type ShellState struct {
	CurrentCwd          string
	ShellType           string
	ShellState          string
	ShellIntegration    bool
	LastCommand         string
	LastCommandExitCode *int
}

type TerminalRuntime interface {
	Type() string
	Capabilities() TerminalCapabilities
	Read(p []byte) (int, error)
	Write(p []byte) (int, error)
	Resize(cols, rows int) error
	Close() error
	ExitCode() int
	Wait(ctx context.Context) error
}

type LocalPTYRuntime struct {
	cmd *localCommand
}

func NewLocalPTYRuntime(cmd *localCommand) *LocalPTYRuntime {
	return &LocalPTYRuntime{cmd: cmd}
}

func (r *LocalPTYRuntime) Type() string {
	return "local"
}

func (r *LocalPTYRuntime) Capabilities() TerminalCapabilities {
	return TerminalCapabilities{
		Resume:           true,
		Snapshot:         true,
		ShellIntegration: false,
		Durable:          false,
	}
}

func (r *LocalPTYRuntime) Read(p []byte) (int, error) {
	return r.cmd.Read(p)
}

func (r *LocalPTYRuntime) Write(p []byte) (int, error) {
	return r.cmd.Write(p)
}

func (r *LocalPTYRuntime) Resize(cols, rows int) error {
	return r.cmd.ResizeTerminal(cols, rows)
}

func (r *LocalPTYRuntime) Close() error {
	return r.cmd.Close()
}

func (r *LocalPTYRuntime) ExitCode() int {
	return r.cmd.ExitCode()
}

func (r *LocalPTYRuntime) Wait(ctx context.Context) error {
	select {
	case <-r.cmd.ptyClosed:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
