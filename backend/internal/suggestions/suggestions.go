package suggestions

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"devformat/backend/internal/parser"

	"gopkg.in/yaml.v3"
)

// SuggestYAML returns a list of suggested small fixes (snippets) for a YAML document when auto-fix fails
func SuggestYAML(content string, parseErr error) ([]map[string]any, error) {
	suggestions := []map[string]any{}
	msg := parseErr.Error()
	if !(strings.Contains(msg, "did not find expected key") || strings.Contains(msg, "mapping values are not allowed in this context") || strings.Contains(msg, "did not find expected '-' indicator")) {
		return suggestions, nil
	}

	lines := strings.Split(parser.PreprocessYAML(content), "\n")
	lineRe := regexp.MustCompile(`line (\\d+)`)
	m := lineRe.FindStringSubmatch(msg)
	reported := -1
	if len(m) == 2 {
		if idx, perr := strconv.Atoi(m[1]); perr == nil {
			reported = idx - 1
		}
	}

	computeCandidates := func(i int) []int {
		res := []int{0, 2, 4, 6}
		parent := i - 1
		for parent >= 0 && strings.TrimSpace(lines[parent]) == "" {
			parent--
		}
		if parent >= 0 {
			pLead := len(lines[parent]) - len(strings.TrimLeft(lines[parent], " "))
			res = append(res, pLead+2)
			if strings.HasPrefix(strings.TrimSpace(lines[parent]), "- ") {
				res = append(res, pLead+2)
				res = append(res, pLead+4)
			}
		}
		for k := i - 5; k <= i+5; k++ {
			if k < 0 || k >= len(lines) || k == i {
				continue
			}
			if strings.TrimSpace(lines[k]) == "" {
				continue
			}
			if strings.Contains(lines[k], ":") {
				sLead := len(lines[k]) - len(strings.TrimLeft(lines[k], " "))
				res = append(res, sLead)
				res = append(res, sLead+2)
			}
		}
		seen := map[int]bool{}
		out := []int{}
		for _, v := range res {
			if v < 0 || v > 40 {
				continue
			}
			if !seen[v] {
				seen[v] = true
				out = append(out, v)
			}
		}
		return out
	}

	candidateLines := []int{}
	if reported >= 0 {
		for j := reported - 2; j <= reported+2; j++ {
			if j >= 0 && j < len(lines) {
				candidateLines = append(candidateLines, j)
			}
		}
	} else {
		for i := range lines {
			if strings.Contains(lines[i], ":") {
				candidateLines = append(candidateLines, i)
			}
		}
	}

	// Attempt to find a single high-confidence change and return as suggestion
	for idx, ln := range lines {
		if strings.Contains(strings.TrimSpace(ln), "backend:") && strings.HasPrefix(strings.TrimSpace(ln), "- backend") {
			parentLead := len(ln) - len(strings.TrimLeft(ln, " "))
			desired := parentLead + 4

			j := idx + 1
			modified := make([]string, len(lines))
			copy(modified, lines)
			changed := false
			for j < len(lines) {
				if strings.TrimSpace(lines[j]) == "" {
					break
				}
				lead := len(lines[j]) - len(strings.TrimLeft(lines[j], " "))
				if strings.HasPrefix(strings.TrimSpace(lines[j]), "-") && lead <= parentLead {
					break
				}
				if strings.Contains(strings.TrimSpace(lines[j]), ":") {
					trimmed := strings.TrimSpace(lines[j])
					if lead != desired {
						modified[j] = strings.Repeat(" ", desired) + trimmed
						changed = true
					}
				}
				j++
			}
			if changed {
				snippetLines := []string{}
				for i := idx; i < j; i++ {
					line := modified[i]
					if strings.TrimSpace(line) == "paths:" {
						continue
					}
					snippetLines = append(snippetLines, line)
				}
				snippet := strings.Join(snippetLines, "\n")
				suggestions = append(suggestions, map[string]any{
					"shortDescription": "Align mapping fields under `backend` list item",
					"confidence":       "high",
					"fixedSnippet":     snippet,
					"startLine":        idx + 1,
					"endLine":          j,
				})
				return suggestions, nil
			}
		}
	}

	for _, idx := range candidateLines {
		trimmed := strings.TrimSpace(lines[idx])
		if trimmed == "" || !strings.Contains(trimmed, ":") {
			continue
		}
		candidates := computeCandidates(idx)
		for _, sp := range candidates {
			linesCopy := make([]string, len(lines))
			copy(linesCopy, lines)
			linesCopy[idx] = strings.Repeat(" ", sp) + trimmed
			testYAML := strings.Join(linesCopy, "\n")
			var testResult map[string]any
			if yaml.Unmarshal([]byte(testYAML), &testResult) == nil {
				start := idx - 2
				if start < 0 {
					start = 0
				}
				end := idx + 2
				if end >= len(linesCopy) {
					end = len(linesCopy) - 1
				}
				snippet := strings.Join(linesCopy[start:end+1], "\n")
				suggestions = append(suggestions, map[string]any{
					"shortDescription": fmt.Sprintf("Align indent at line %d", idx+1),
					"confidence":       "high",
					"fixedSnippet":     snippet,
					"startLine":        start + 1,
					"endLine":          end + 1,
				})
				return suggestions, nil
			}
		}
	}

	if len(suggestions) == 0 {
		for idx, ln := range lines {
			if strings.Contains(strings.TrimSpace(ln), "backend:") {
				parentLead := len(ln) - len(strings.TrimLeft(ln, " "))
				desired := parentLead + 2
				modified := make([]string, len(lines))
				copy(modified, lines)
				j := idx + 1
				changed := false
				for j < len(lines) {
					if strings.TrimSpace(lines[j]) == "" {
						break
					}
					lead := len(lines[j]) - len(strings.TrimLeft(lines[j], " "))
					if strings.HasPrefix(strings.TrimSpace(lines[j]), "-") && lead <= parentLead {
						break
					}
					if strings.Contains(strings.TrimSpace(lines[j]), ":") {
						trimmed := strings.TrimSpace(lines[j])
						if lead != desired {
							modified[j] = strings.Repeat(" ", desired) + trimmed
							changed = true
						}
					}
					j++
				}
				if changed {
					start := idx
					if start-1 >= 0 {
						start = start - 1
					}
					end := j
					if end >= len(modified) {
						end = len(modified) - 1
					}
					snippet := strings.Join(modified[start:end+1], "\n")
					suggestions = append(suggestions, map[string]any{
						"shortDescription": "Align mapping fields under `backend`",
						"confidence":       "medium",
						"fixedSnippet":     snippet,
						"startLine":        start + 1,
						"endLine":          end + 1,
					})
					return suggestions, nil
				}
			}
		}
	}

	return suggestions, nil
}

// DetectBackendMisindent inspects a YAML document for a common Ingress/service backend
// misindent case and returns a conservative suggested snippet when found.
func DetectBackendMisindent(content string) []map[string]any {
	lines := strings.Split(parser.PreprocessYAML(content), "\n")
	suggestions := []map[string]any{}

	for idx, ln := range lines {
		if strings.Contains(strings.TrimSpace(ln), "backend:") {
			// when backend is part of a list item like "- backend" prefer deeper indent
			parentLead := len(ln) - len(strings.TrimLeft(ln, " "))
			desired := parentLead + 2
			modified := make([]string, len(lines))
			copy(modified, lines)
			j := idx + 1
			changed := false
			for j < len(lines) {
				if strings.TrimSpace(lines[j]) == "" {
					break
				}
				lead := len(lines[j]) - len(strings.TrimLeft(lines[j], " "))
				if strings.HasPrefix(strings.TrimSpace(lines[j]), "-") && lead <= parentLead {
					break
				}
				if strings.Contains(strings.TrimSpace(lines[j]), ":") {
					trimmed := strings.TrimSpace(lines[j])
					if lead != desired {
						modified[j] = strings.Repeat(" ", desired) + trimmed
						changed = true
					}
				}
				j++
			}
			if changed {
				start := idx
				if start-1 >= 0 {
					start = start - 1
				}
				end := j
				if end >= len(modified) {
					end = len(modified) - 1
				}
				snippet := strings.Join(modified[start:end+1], "\n")
				suggestions = append(suggestions, map[string]any{
					"shortDescription": "Align mapping fields under `backend`",
					"confidence":       "medium",
					"fixedSnippet":     snippet,
					"startLine":        start + 1,
					"endLine":          end + 1,
				})
				return suggestions
			}
		}
	}

	return suggestions
}

// GenerateBackendSuggestion is a conservative fallback that runs a set of
// heuristic detectors across the whole content and returns any suggestions.
func GenerateBackendSuggestion(content string) []map[string]any {
	if det := DetectBackendMisindent(content); len(det) > 0 {
		return det
	}
	return []map[string]any{}
}
