package aisession

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const titleMaxChars = 80

func defaultHomeDir() string {
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		return home
	}
	if home = os.Getenv("HOME"); home != "" {
		return home
	}
	return "."
}

func defaultXDGDataHome() string {
	if value := os.Getenv("XDG_DATA_HOME"); value != "" {
		return value
	}
	return filepath.Join(defaultHomeDir(), ".local", "share")
}

func normalizePaths(paths []string) []string {
	if len(paths) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(paths))
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			continue
		}
		cleaned := filepath.Clean(trimmed)
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		result = append(result, cleaned)
	}
	sort.Strings(result)
	return result
}

func asMap(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return nil
}

func asArray(value any) []any {
	if typed, ok := value.([]any); ok {
		return typed
	}
	return nil
}

func asString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}

func asBool(value any) bool {
	typed, ok := value.(bool)
	return ok && typed
}

func parseTimestampToMillis(value any) int64 {
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return 0
		}
		if parsed, err := time.Parse(time.RFC3339Nano, typed); err == nil {
			return parsed.UnixMilli()
		}
	case float64:
		whole := int64(typed)
		if whole > 1_000_000_000_000 {
			return whole
		}
		if whole > 1_000_000_000 {
			return whole * 1000
		}
	case int64:
		if typed > 1_000_000_000_000 {
			return typed
		}
		if typed > 1_000_000_000 {
			return typed * 1000
		}
	case json.Number:
		if whole, err := typed.Int64(); err == nil {
			return parseTimestampToMillis(whole)
		}
	}
	return 0
}

func extractText(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			text := extractTextFromItem(item)
			if strings.TrimSpace(text) != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n")
	case map[string]any:
		return asString(typed["text"])
	default:
		return ""
	}
}

func extractTextFromItem(item any) string {
	typed := asMap(item)
	if typed == nil {
		return ""
	}
	if asString(typed["type"]) == "tool_use" {
		name := asString(typed["name"])
		if name == "" {
			name = "unknown"
		}
		return "[Tool: " + name + "]"
	}
	if asString(typed["type"]) == "tool_result" {
		return extractText(typed["content"])
	}
	if text := asString(typed["text"]); text != "" {
		return text
	}
	if text := asString(typed["input_text"]); text != "" {
		return text
	}
	if text := asString(typed["output_text"]); text != "" {
		return text
	}
	return extractText(typed["content"])
}

func truncateSummary(value string, limit int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	runes := []rune(trimmed)
	if len(runes) <= limit {
		return trimmed
	}
	return string(runes[:limit]) + "..."
}

func pathBasename(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	normalized := strings.TrimRight(trimmed, "/\\")
	if normalized == "" {
		return trimmed
	}
	base := filepath.Base(normalized)
	if base == "." || base == string(filepath.Separator) {
		return trimmed
	}
	return base
}

func removeFileIfExists(path string) error {
	err := os.Remove(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func removeAllIfExists(path string) error {
	_, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return os.RemoveAll(path)
}

func canonicalPath(path string) (string, error) {
	if path == "" {
		return "", errors.New("empty path")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		resolved = path
	}
	return filepath.Clean(resolved), nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func sortSessions(sessions []SessionMeta) {
	sort.SliceStable(sessions, func(i, j int) bool {
		left := sessions[i].LastActiveAt
		if left == 0 {
			left = sessions[i].CreatedAt
		}
		right := sessions[j].LastActiveAt
		if right == 0 {
			right = sessions[j].CreatedAt
		}
		if left == right {
			return sessions[i].SourcePath < sessions[j].SourcePath
		}
		return left > right
	})
}

func collectFiles(root string, predicate func(string, os.DirEntry) bool) ([]string, error) {
	paths := make([]string, 0)
	if root == "" {
		return paths, nil
	}
	if _, err := os.Stat(root); errors.Is(err, os.ErrNotExist) {
		return paths, nil
	}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if predicate(path, entry) {
			paths = append(paths, path)
		}
		return nil
	})
	sort.Strings(paths)
	return paths, err
}

func fileInfo(path string) (int64, int64) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, 0
	}
	return info.Size(), info.ModTime().UnixMilli()
}

func readJSONFile(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func readHeadTailLines(path string, headN, tailN int) ([]string, []string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return nil, nil, err
	}
	if info.Size() < 16_384 {
		scanner := newScanner(file)
		all := make([]string, 0)
		for scanner.Scan() {
			all = append(all, scanner.Text())
		}
		if err := scanner.Err(); err != nil {
			return nil, nil, err
		}
		head := append([]string(nil), all[:minInt(len(all), headN)]...)
		start := len(all) - tailN
		if start < 0 {
			start = 0
		}
		tail := append([]string(nil), all[start:]...)
		return head, tail, nil
	}

	headScanner := newScanner(file)
	head := make([]string, 0, headN)
	for len(head) < headN && headScanner.Scan() {
		head = append(head, headScanner.Text())
	}
	if err := headScanner.Err(); err != nil {
		return nil, nil, err
	}

	seekPos := info.Size() - 16_384
	if seekPos < 0 {
		seekPos = 0
	}
	if _, err := file.Seek(seekPos, io.SeekStart); err != nil {
		return nil, nil, err
	}
	tailScanner := newScanner(file)
	allTail := make([]string, 0)
	for tailScanner.Scan() {
		allTail = append(allTail, tailScanner.Text())
	}
	if err := tailScanner.Err(); err != nil {
		return nil, nil, err
	}
	if seekPos > 0 && len(allTail) > 0 {
		allTail = allTail[1:]
	}
	start := len(allTail) - tailN
	if start < 0 {
		start = 0
	}
	tail := append([]string(nil), allTail[start:]...)
	return head, tail, nil
}

func newScanner(reader io.Reader) *bufio.Scanner {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	return scanner
}

func readJSONLines(path string, onLine func(map[string]any) bool) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := newScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var value map[string]any
		if err := json.Unmarshal([]byte(line), &value); err != nil {
			continue
		}
		if !onLine(value) {
			break
		}
	}
	return scanner.Err()
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}
