package handler

import "os/exec"

func newGitCommand(args ...string) *exec.Cmd {
	cmd := exec.Command("git", args...)
	cmd.Env = fixedGitEnv(cmd.Environ())
	return cmd
}

func fixedGitEnv(base []string) []string {
	env := make([]string, 0, len(base)+3)
	for _, item := range base {
		switch {
		case len(item) >= 7 && item[:7] == "LC_ALL=":
			continue
		case len(item) >= 5 && item[:5] == "LANG=":
			continue
		case len(item) >= 9 && item[:9] == "LANGUAGE=":
			continue
		default:
			env = append(env, item)
		}
	}
	env = append(env, "LC_ALL=C", "LANG=C", "LANGUAGE=C")
	return env
}
