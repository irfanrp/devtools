package parser

import (
	"bufio"
	"strings"
)

// SplitYAML splits YAML content into individual documents separated by "---"
func SplitYAML(content string) []string {
	docs := []string{}
	scanner := bufio.NewScanner(strings.NewReader(content))
	var current []string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "---" {
			docs = append(docs, strings.Join(current, "\n"))
			current = []string{}
			continue
		}
		current = append(current, line)
	}
	if len(current) > 0 {
		docs = append(docs, strings.Join(current, "\n"))
	}
	return docs
}

// DetectFormat detects if content is JSON or YAML based on structure
func DetectFormat(content string) string {
	trimmed := strings.TrimSpace(content)
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		return "json"
	}
	return "yaml"
}

// PreprocessYAML normalizes whitespace in YAML content
func PreprocessYAML(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\t", "  ")
	lines := strings.Split(s, "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t")
	}
	return strings.Join(lines, "\n")
}

// ContainsHelmTemplate checks if content contains Helm template markers
func ContainsHelmTemplate(content string) bool {
	return strings.Contains(content, "{{") && strings.Contains(content, "}}")
}
