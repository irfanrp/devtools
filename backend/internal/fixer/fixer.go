package fixer

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// CanAutoFixContent checks if content is safe for auto-fix.
// We only count occurrences that look like YAML mappings (e.g. "key: <space>").
// This avoids flagging values that include colons (for example Docker image tags like "nginx:1.14.2").
func CanAutoFixContent(content string) (bool, string) {
	keyRe := regexp.MustCompile(`[A-Za-z0-9_.-]+:\s`)
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		matches := keyRe.FindAllStringIndex(trimmed, -1)
		if len(matches) > 1 {
			return false, fmt.Sprintf("line %d contains multiple key:value pairs", i+1)
		}
	}
	return true, ""
}

// TryFixYAML attempts to fix YAML formatting and returns a parsed map on success.
func TryFixYAML(content string) (map[string]any, error) {
	var m map[string]any
	if err := yaml.Unmarshal([]byte(content), &m); err == nil {
		return m, nil
	}

	content = preprocessYAML(content)
	lines := strings.Split(content, "\n")
	var fixed []string

	for _, raw := range lines {
		if strings.TrimSpace(raw) == "" {
			fixed = append(fixed, "")
			continue
		}

		raw = strings.TrimRight(raw, " \t")
		leading := len(raw) - len(strings.TrimLeft(raw, " "))
		if leading%2 != 0 {
			leading--
		}
		if leading < 0 {
			leading = 0
		}
		trimmed := strings.TrimSpace(raw)

		// If previous line ends with ':', ensure +2 indent
		if len(fixed) > 0 {
			prev := fixed[len(fixed)-1]
			prevLead := len(prev) - len(strings.TrimLeft(prev, " "))
			if strings.HasSuffix(strings.TrimSpace(prev), ":") && leading < prevLead+2 {
				leading = prevLead + 2
			}
		}

		// For list items, align under parent if needed
		if strings.HasPrefix(trimmed, "- ") && len(fixed) > 0 {
			prev := fixed[len(fixed)-1]
			prevLead := len(prev) - len(strings.TrimLeft(prev, " "))
			if strings.HasSuffix(strings.TrimSpace(prev), ":") && leading < prevLead+2 {
				leading = prevLead + 2
			}
		}

		fixed = append(fixed, strings.Repeat(" ", leading)+trimmed)
	}

	fixedContent := strings.Join(fixed, "\n")
	var result map[string]any
	err := yaml.Unmarshal([]byte(fixedContent), &result)
	if err == nil {
		return result, nil
	}

	// targeted heuristic: if parser complains about missing '-' indicator,
	// try inserting a list marker at the reported line aligned under parent
	if strings.Contains(err.Error(), "did not find expected '-' indicator") {
		lineRe := regexp.MustCompile(`line (\d+)`)
		m := lineRe.FindStringSubmatch(err.Error())
		if len(m) == 2 {
			if idx, perr := strconv.Atoi(m[1]); perr == nil {
				i := idx - 1
				if i >= 0 && i < len(lines) {
					prev := i - 1
					for prev >= 0 && strings.TrimSpace(lines[prev]) == "" {
						prev--
					}
					prevLead := 0
					if prev >= 0 {
						prevLead = len(lines[prev]) - len(strings.TrimLeft(lines[prev], " "))
					}
					newLead := prevLead + 2
					if !strings.HasPrefix(strings.TrimSpace(lines[i]), "-") {
						lines[i] = strings.Repeat(" ", newLead) + "- " + strings.TrimSpace(lines[i])
						fixed2 := strings.Join(lines, "\n")
						var result2 map[string]any
						if err2 := yaml.Unmarshal([]byte(fixed2), &result2); err2 == nil {
							return result2, nil
						}
					}
				}
			}
		}
	}

	// FINAL SOLUTION: Smart YAML indentation fixer for "did not find expected key"
	if strings.Contains(err.Error(), "did not find expected key") || strings.Contains(err.Error(), "mapping values are not allowed in this context") {
		log.Printf("TryFixYAML: parser error: %s", err.Error())
		lineRe := regexp.MustCompile(`line (\d+)`)
		m := lineRe.FindStringSubmatch(err.Error())
		reported := -1
		if len(m) == 2 {
			if idx, perr := strconv.Atoi(m[1]); perr == nil {
				reported = idx - 1
			}
		}

		candidatesIdx := []int{}
		if reported >= 0 {
			for j := reported - 2; j <= reported+2; j++ {
				if j >= 0 && j < len(lines) {
					candidatesIdx = append(candidatesIdx, j)
				}
			}
		} else {
			for i := range lines {
				if strings.Contains(lines[i], ":") {
					candidatesIdx = append(candidatesIdx, i)
				}
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

		for _, idx := range candidatesIdx {
			trimmed := strings.TrimSpace(lines[idx])
			if trimmed == "" || !strings.Contains(trimmed, ":") {
				continue
			}
			candidates := computeCandidates(idx)
			log.Printf("TryFixYAML: trying line %d candidates: %v (trimmed=%q)", idx+1, candidates, trimmed)
			for _, sp := range candidates {
				linesCopy := make([]string, len(lines))
				copy(linesCopy, lines)
				linesCopy[idx] = strings.Repeat(" ", sp) + trimmed
				testYAML := strings.Join(linesCopy, "\n")
				var testResult map[string]any
				if yaml.Unmarshal([]byte(testYAML), &testResult) == nil {
					log.Printf("TryFixYAML: success on line %d with indent %d", idx+1, sp)
					return testResult, nil
				}
			}
		}
	}

	return result, err
}

// TryFixJSON attempts to fix JSON formatting
func TryFixJSON(content string) (map[string]any, error) {
	var m map[string]any
	if err := json.Unmarshal([]byte(content), &m); err == nil {
		return m, nil
	}

	// Basic JSON fixes: remove trailing commas, fix quotes
	content = strings.ReplaceAll(content, ",}", "}")
	content = strings.ReplaceAll(content, ",]", "]")
	content = regexp.MustCompile(`'([^']*)':`).ReplaceAllString(content, `"$1":`)

	var result map[string]any
	err := json.Unmarshal([]byte(content), &result)
	return result, err
}

// preprocessYAML normalizes whitespace (internal helper)
func preprocessYAML(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\t", "  ")
	lines := strings.Split(s, "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t")
	}
	return strings.Join(lines, "\n")
}
