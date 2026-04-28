package handler

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewGitCommandForcesCLocale(t *testing.T) {
	t.Setenv("LC_ALL", "zh_CN.UTF-8")
	t.Setenv("LANG", "zh_CN.UTF-8")
	t.Setenv("LANGUAGE", "zh_CN:zh")

	cmd := newGitCommand("rev-parse", "--show-toplevel")
	cmd.Dir = t.TempDir()

	output, err := cmd.CombinedOutput()
	require.Error(t, err)
	assert.Contains(t, string(output), "not a git repository")
}
