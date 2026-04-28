package handler

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type BranchStatusInfo struct {
	Branch   string `json:"branch"`
	Upstream string `json:"upstream"`
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
}

type BranchesSnapshot struct {
	Branches       []string `json:"branches"`
	RemoteBranches []string `json:"remoteBranches"`
	CurrentBranch  string   `json:"currentBranch"`
}

func collectFileStatus(repoRoot string) []FileStatus {
	cmd := newGitCommand("status", "--porcelain=v1", "-z")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return []FileStatus{}
	}
	files := []FileStatus{}
	entries := strings.Split(string(output), "\x00")
	for i := 0; i < len(entries); i++ {
		line := entries[i]
		if line == "" || len(line) < 3 {
			continue
		}
		x := line[0]
		y := line[1]
		if x == '!' && y == '!' {
			continue
		}
		path := line[3:]
		if (x == 'R' || x == 'C') && i+1 < len(entries) {
			path = entries[i+1]
			i++
		}
		if path == "" {
			continue
		}
		if x == '?' && y == '?' {
			files = append(files, FileStatus{Path: path, Status: "?", Staged: false})
			continue
		}
		if x != ' ' && x != '?' {
			files = append(files, FileStatus{Path: path, Status: string(x), Staged: true})
		}
		if y != ' ' && y != '?' {
			files = append(files, FileStatus{Path: path, Status: string(y), Staged: false})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files
}

func collectStatusFingerprint(repoRoot string) string {
	cmd := newGitCommand("status", "--porcelain=v1", "-z", "--untracked-files=all")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return string(output)
}

func collectCommitLog(repoRoot string, limit int) []CommitInfo {
	if limit <= 0 {
		limit = 20
	}
	format := strings.Join([]string{"%H", "%s", "%an", "%ae", "%aI", "%P"}, "%x00")
	cmd := newGitCommand("log", "-n", strconv.Itoa(limit),
		fmt.Sprintf("--format=%s", format), "--no-decorate")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return []CommitInfo{}
	}
	var commits []CommitInfo
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\x00", 6)
		if len(parts) < 6 {
			continue
		}
		parentCount := 0
		if strings.TrimSpace(parts[5]) != "" {
			parentCount = len(strings.Fields(parts[5]))
		}
		commits = append(commits, CommitInfo{
			Hash:        parts[0],
			Message:     parts[1],
			Author:      parts[2],
			AuthorEmail: parts[3],
			Date:        parts[4],
			ParentCount: parentCount,
		})
	}
	return commits
}

func collectHeadHash(repoRoot string) string {
	cmd := newGitCommand("rev-parse", "HEAD")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func collectBranchStatus(repoRoot string) *BranchStatusInfo {
	info := &BranchStatusInfo{}

	cmd := newGitCommand("branch", "--show-current")
	cmd.Dir = repoRoot
	out, err := cmd.Output()
	if err != nil {
		return info
	}
	info.Branch = strings.TrimSpace(string(out))
	if info.Branch == "" {
		return info
	}

	cmd = newGitCommand("rev-parse", "--abbrev-ref", info.Branch+"@{upstream}")
	cmd.Dir = repoRoot
	out, err = cmd.Output()
	if err != nil {
		return info
	}
	info.Upstream = strings.TrimSpace(string(out))

	cmd = newGitCommand("rev-list", "--left-right", "--count", info.Upstream+"...HEAD")
	cmd.Dir = repoRoot
	out, err = cmd.Output()
	if err != nil {
		return info
	}
	parts := strings.Fields(strings.TrimSpace(string(out)))
	if len(parts) >= 2 {
		info.Behind, _ = strconv.Atoi(parts[0])
		info.Ahead, _ = strconv.Atoi(parts[1])
	}
	return info
}

func collectBranchesSnapshot(repoRoot string) BranchesSnapshot {
	currentBranch := ""
	cmd := newGitCommand("branch", "--show-current")
	cmd.Dir = repoRoot
	out, err := cmd.Output()
	if err == nil {
		currentBranch = strings.TrimSpace(string(out))
	}

	cmd = newGitCommand("branch", "--format=%(refname:short)")
	cmd.Dir = repoRoot
	out, err = cmd.Output()
	if err != nil {
		return BranchesSnapshot{CurrentBranch: currentBranch}
	}

	var branchList []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line != "" {
			branchList = append(branchList, line)
		}
	}
	sort.Strings(branchList)

	return BranchesSnapshot{
		Branches:       branchList,
		RemoteBranches: collectRemoteBranches(repoRoot),
		CurrentBranch:  currentBranch,
	}
}

func collectConflictFiles(repoRoot string) []string {
	cmd := newGitCommand("diff", "--name-only", "--diff-filter=U")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return nil
	}
	var conflicts []string
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if line != "" {
			conflicts = append(conflicts, line)
		}
	}
	sort.Strings(conflicts)
	return conflicts
}

func collectRemoteBranches(repoRoot string) []string {
	cmd := newGitCommand("branch", "-r", "--format=%(refname:short)")
	cmd.Dir = repoRoot
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	var remote []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line != "" && !strings.HasSuffix(line, "/HEAD") {
			remote = append(remote, line)
		}
	}
	sort.Strings(remote)
	return remote
}

func collectRemoteInfos(repoRoot string) []RemoteInfo {
	cmd := newGitCommand("remote")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	names := strings.Split(strings.TrimSpace(string(output)), "\n")
	result := make([]RemoteInfo, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		urlCmd := newGitCommand("remote", "get-url", "--all", name)
		urlCmd.Dir = repoRoot
		urlOut, err := urlCmd.Output()
		if err != nil {
			continue
		}
		var urls []string
		for _, u := range strings.Split(strings.TrimSpace(string(urlOut)), "\n") {
			if u != "" {
				urls = append(urls, u)
			}
		}
		sort.Strings(urls)
		result = append(result, RemoteInfo{
			Name: name,
			URLs: urls,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result
}

func collectStashEntries(repoRoot string) []StashEntry {
	cmd := newGitCommand("stash", "list")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var entries []StashEntry
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for i, line := range lines {
		if line == "" {
			continue
		}
		entries = append(entries, StashEntry{
			Index:   i,
			Message: line,
		})
	}

	return entries
}
