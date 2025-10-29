package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"
)

type ValidateRequest struct {
	// Content is optional if the client supplies a custom schema via SchemaContent.
	Content       string `json:"content"`
	Filename      string `json:"filename"`
	Schema        string `json:"schema"`
	SchemaContent string `json:"schemaContent,omitempty"`
	UseAI         bool   `json:"useAI,omitempty"`
}

type ValidationError struct {
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
	Type     string `json:"type"`
}

type ValidateResponse struct {
	IsValid     bool              `json:"isValid"`
	Errors      []ValidationError `json:"errors"`
	Fixed       string            `json:"fixedContent,omitempty"`
	CanAutoFix  bool              `json:"canAutoFix"`
	Explanation string            `json:"explanation,omitempty"`
	// suggestedFixes is an optional list of small suggested snippets when auto-fix cannot be applied
	SuggestedFixes []map[string]any `json:"suggestedFixes,omitempty"`
}

type FixRequest struct {
	Content       string   `json:"content" binding:"required"`
	Fixes         []string `json:"fixTypes"`
	Schema        string   `json:"schema"`
	SchemaContent string   `json:"schemaContent,omitempty"`
	UseAI         bool     `json:"useAI,omitempty"`
}

// splitYAML splits YAML into documents
func splitYAML(content string) []string {
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

func containsHelmTemplate(content string) bool {
	return strings.Contains(content, "{{") && strings.Contains(content, "}}")
}

// detectFormat detects if content is JSON or YAML
func detectFormat(content string) string {
	trimmed := strings.TrimSpace(content)
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		return "json"
	}
	return "yaml"
}

// canAutoFixContent checks if content is safe for auto-fix.
// We only count occurrences that look like YAML mappings (e.g. "key: <space>").
// This avoids flagging values that include colons (for example Docker image tags like "nginx:1.14.2").
func canAutoFixContent(content string) (bool, string) {
	// match token-like keys followed by a colon and whitespace (mapping syntax)
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

// preprocessYAML normalizes whitespace
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

// tryFixYAML attempts to fix YAML formatting
func tryFixYAML(content string) (map[string]any, error) {
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
		// look for `line N` in error
		lineRe := regexp.MustCompile(`line (\d+)`)
		m := lineRe.FindStringSubmatch(err.Error())
		if len(m) == 2 {
			if idx, perr := strconv.Atoi(m[1]); perr == nil {
				i := idx - 1
				if i >= 0 && i < len(lines) {
					// find previous non-empty line to estimate parent indent
					prev := i - 1
					for prev >= 0 && strings.TrimSpace(lines[prev]) == "" {
						prev--
					}
					prevLead := 0
					if prev >= 0 {
						prevLead = len(lines[prev]) - len(strings.TrimLeft(lines[prev], " "))
					}
					newLead := prevLead + 2
					// Only apply if current line is not already a list item
					if !strings.HasPrefix(strings.TrimSpace(lines[i]), "-") {
						lines[i] = strings.Repeat(" ", newLead) + "- " + strings.TrimSpace(lines[i])
						fixed2 := strings.Join(lines, "\n")
						var result2 map[string]any
						if err2 := yaml.Unmarshal([]byte(fixed2), &result2); err2 == nil {
							return result2, nil
						}
						// if still fails, fall through to original error
					}
				}
			}
		}
	}

	// FINAL SOLUTION: Smart YAML indentation fixer for "did not find expected key"
	if strings.Contains(err.Error(), "did not find expected key") || strings.Contains(err.Error(), "mapping values are not allowed in this context") {
		log.Printf("tryFixYAML: parser error: %s", err.Error())
		// parse reported line if available
		lineRe := regexp.MustCompile(`line (\d+)`)
		m := lineRe.FindStringSubmatch(err.Error())
		reported := -1
		if len(m) == 2 {
			if idx, perr := strconv.Atoi(m[1]); perr == nil {
				reported = idx - 1 // zero-based
			}
		}

		// build a small neighborhood to attempt fixes: reported-2 .. reported+2
		candidatesIdx := []int{}
		if reported >= 0 {
			for j := reported - 2; j <= reported+2; j++ {
				if j >= 0 && j < len(lines) {
					candidatesIdx = append(candidatesIdx, j)
				}
			}
		} else {
			// fallback: try only non-empty mapping lines
			for i := range lines {
				if strings.Contains(lines[i], ":") {
					candidatesIdx = append(candidatesIdx, i)
				}
			}
		}

		// helper to compute candidate indents from parent/sibling
		computeCandidates := func(i int) []int {
			res := []int{0, 2, 4, 6}
			// parent: look backward for previous non-empty line
			parent := i - 1
			for parent >= 0 && strings.TrimSpace(lines[parent]) == "" {
				parent--
			}
			if parent >= 0 {
				pLead := len(lines[parent]) - len(strings.TrimLeft(lines[parent], " "))
				// typical child indent
				res = append(res, pLead+2)
				// if parent is a list item, align under its mapping
				if strings.HasPrefix(strings.TrimSpace(lines[parent]), "- ") {
					res = append(res, pLead+2)
					res = append(res, pLead+4)
				}
			}

			// sibling: look forward/backward for mapping siblings with indent
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

			// dedupe and clamp
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

		// Attempt fixes only on candidate lines with computed indents
		for _, idx := range candidatesIdx {
			trimmed := strings.TrimSpace(lines[idx])
			if trimmed == "" || !strings.Contains(trimmed, ":") {
				continue
			}
			candidates := computeCandidates(idx)
			log.Printf("tryFixYAML: trying line %d candidates: %v (trimmed=%q)", idx+1, candidates, trimmed)
			for _, sp := range candidates {
				linesCopy := make([]string, len(lines))
				copy(linesCopy, lines)
				linesCopy[idx] = strings.Repeat(" ", sp) + trimmed
				testYAML := strings.Join(linesCopy, "\n")
				var testResult map[string]any
				if yaml.Unmarshal([]byte(testYAML), &testResult) == nil {
					log.Printf("tryFixYAML: success on line %d with indent %d", idx+1, sp)
					return testResult, nil
				}
			}
		}
	}

	return result, err
}

// tryFixJSON attempts to fix JSON formatting
func tryFixJSON(content string) (map[string]any, error) {
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

// suggestYAML returns a list of suggested small fixes (snippets) for a YAML document when auto-fix fails
func suggestYAML(content string, parseErr error) ([]map[string]any, error) {
	suggestions := []map[string]any{}
	// only attempt for common parser messages
	msg := parseErr.Error()
	log.Printf("suggestYAML: called, parseErr=%s", msg)
	if !(strings.Contains(msg, "did not find expected key") || strings.Contains(msg, "mapping values are not allowed in this context") || strings.Contains(msg, "did not find expected '-' indicator")) {
		return suggestions, nil
	}

	lines := strings.Split(preprocessYAML(content), "\n")
	// attempt to parse reported line
	lineRe := regexp.MustCompile(`line (\d+)`)
	m := lineRe.FindStringSubmatch(msg)
	reported := -1
	if len(m) == 2 {
		if idx, perr := strconv.Atoi(m[1]); perr == nil {
			reported = idx - 1
			log.Printf("suggestYAML: reported line %d", reported+1)
		}
	}

	// helper computeCandidates re-used in tryFixYAML but simplified
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
		// siblings
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
	// Special-case: detect "- backend:" list item and suggest indenting immediate child mapping lines
	for idx, ln := range lines {
		log.Printf("suggestYAML: scanning line %d: %q", idx+1, ln)
		if strings.Contains(strings.TrimSpace(ln), "backend:") && strings.HasPrefix(strings.TrimSpace(ln), "- backend") {
			log.Printf("suggestYAML: found backend at line %d", idx+1)
			parentLead := len(ln) - len(strings.TrimLeft(ln, " "))
			// serviceName/servicePort should be indented deeper than the "- backend:" line
			// "- backend:" is at parentLead, so children should be at parentLead + 4 (2 for list, 2 for mapping)
			desired := parentLead + 4

			// collect following mapping lines until blank or next '-' at same or lower indent
			j := idx + 1
			modified := make([]string, len(lines))
			copy(modified, lines)
			changed := false
			for j < len(lines) {
				if strings.TrimSpace(lines[j]) == "" {
					break
				}
				// stop if next sibling list item or same-level key
				lead := len(lines[j]) - len(strings.TrimLeft(lines[j], " "))
				if strings.HasPrefix(strings.TrimSpace(lines[j]), "-") && lead <= parentLead {
					break
				}
				// if this line is a mapping (contains ':'), align it to desired indent
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
				// build a minimal snippet focusing only on the backend list item and its children
				// to avoid including duplicate paths: lines from the original malformed YAML
				snippetLines := []string{}

				// Start from the backend line itself, not from paths:
				for i := idx; i < j; i++ {
					line := modified[i]
					// Include the backend line and its children, but skip any paths: lines
					if strings.TrimSpace(line) == "paths:" {
						continue // skip paths: lines entirely to avoid duplication
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
				log.Printf("suggestYAML: produced suggestion for backend at line %d", idx+1)
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
				// build a small snippet around the changed line for suggestion preview
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
				// return early with one strong suggestion
				return suggestions, nil
			}
		}
	}

	// Additional fallback: if we still have no suggestions, look for any line containing "backend:"
	// (covers cases where indentation or leading '-' vary) and produce a conservative alignment.
	if len(suggestions) == 0 {
		for idx, ln := range lines {
			if strings.Contains(strings.TrimSpace(ln), "backend:") {
				// estimate parent indent
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
					// stop if we hit a sibling list entry at same or lesser indent
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

// generateBackendSuggestion builds a conservative suggestion aligning mapping fields under
// a detected `backend` line. This is used as a final fallback to ensure the UI gets a suggestion.
func generateBackendSuggestion(content string) []map[string]any {
	lines := strings.Split(preprocessYAML(content), "\n")
	for idx, ln := range lines {
		if strings.Contains(strings.TrimSpace(ln), "backend:") {
			parentLead := len(ln) - len(strings.TrimLeft(ln, " "))
			// If this is a "- backend:" list item, children should be indented deeper
			desired := parentLead + 2
			if strings.HasPrefix(strings.TrimSpace(ln), "- backend") {
				desired = parentLead + 4 // 2 for list marker, 2 for mapping level
			}

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
					modified[j] = strings.Repeat(" ", desired) + trimmed
					changed = true
				}
				j++
			}
			if changed {
				// build a minimal snippet focusing only on backend and its children, avoiding paths:
				snippetLines := []string{}
				for i := idx; i < j; i++ {
					line := modified[i]
					if strings.TrimSpace(line) == "paths:" {
						continue // skip paths: lines entirely
					}
					snippetLines = append(snippetLines, line)
				}

				snippet := strings.Join(snippetLines, "\n")
				return []map[string]any{{"shortDescription": "Align mapping fields under `backend` (fallback)", "confidence": "medium", "fixedSnippet": snippet, "startLine": idx + 1, "endLine": j}}
			}
		}
	}
	return nil
}

// detectBackendMisindent targets specific Ingress pattern detection

// detectBackendMisindent looks for a common Ingress pattern where `backend:` is present
// but the following keys (serviceName/servicePort) are not indented under it. Returns
// a single conservative suggestion snippet when detected.
func detectBackendMisindent(content string) []map[string]any {
	lines := strings.Split(preprocessYAML(content), "\n")
	for idx, ln := range lines {
		trimmed := strings.TrimSpace(ln)
		if trimmed == "backend:" || strings.HasSuffix(trimmed, "backend:") {
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
				// stop if sibling list item at same or smaller indent
				if strings.HasPrefix(strings.TrimSpace(lines[j]), "-") && lead <= parentLead {
					break
				}
				// target serviceName/servicePort (or 'service') keys
				t := strings.TrimSpace(lines[j])
				if strings.HasPrefix(t, "serviceName:") || strings.HasPrefix(t, "servicePort:") || strings.HasPrefix(t, "service:") {
					if lead != desired {
						modified[j] = strings.Repeat(" ", desired) + strings.TrimSpace(lines[j])
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
				return []map[string]any{{"shortDescription": "Indent service fields under backend", "confidence": "high", "fixedSnippet": snippet, "startLine": idx + 1, "endLine": end + 1}}
			}
		}
	}
	return nil
}

func init() {
	// wire up os.LookupEnv implementation
	lookupEnvImpl = os.LookupEnv
}

// callGeminiSuggest calls an external AI service (Gemini) to request a suggested fix.
// It is optional: if GEMINI_ENDPOINT or GEMINI_API_KEY are not present, it returns nil.
func callGeminiSuggest(content string) []map[string]any {
	// Try explicit GEMINI_ENDPOINT first (keeps backwards compatibility)
	explicitEndpoint := strings.TrimSpace(getEnv("GEMINI_ENDPOINT", ""))
	apiKey := strings.TrimSpace(getEnv("GEMINI_API_KEY", getEnv("GOOGLE_API_KEY", "")))
	model := strings.TrimSpace(getEnv("GEMINI_MODEL", "gemini-2.5-flash"))

	prompt := fmt.Sprintf("Input YAML:\n---\n%s\n---\n\nPlease return a minimal YAML snippet (only the corrected block) that fixes the syntax/indentation issue. Include no extra commentary. Respond in YAML only.", content)

	tryRequest := func(url string, body []byte, useKeyQuery bool) (string, error) {
		reqURL := url
		if useKeyQuery && apiKey != "" {
			// add key param
			if strings.Contains(reqURL, "?") {
				reqURL = reqURL + "&key=" + apiKey
			} else {
				reqURL = reqURL + "?key=" + apiKey
			}
		}
		req, err := http.NewRequest("POST", reqURL, strings.NewReader(string(body)))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		// Prefer Authorization header with API key (many endpoints accept Bearer APIKEY)
		if apiKey != "" && !useKeyQuery {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
		client := &http.Client{Timeout: 8 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			b, _ := io.ReadAll(resp.Body)
			return "", fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
		}
		b, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}

	// If user provided a custom endpoint, use it (old behavior)
	if explicitEndpoint != "" && apiKey != "" {
		payload := map[string]any{"model": model, "prompt": prompt, "max_tokens": 512}
		b, _ := json.Marshal(payload)
		body, err := tryRequest(explicitEndpoint, b, false)
		if err == nil && strings.TrimSpace(body) != "" {
			suggested := strings.TrimSpace(body)
			lines := strings.Split(preprocessYAML(content), "\n")
			first := 1
			firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
			for i, l := range lines {
				if strings.Contains(l, firstLineCandidate) {
					first = i + 1
					break
				}
			}
			return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
		}
	}

	// If no explicit endpoint, try several commonly-used Generative Language REST endpoints.
	if apiKey == "" {
		// No API key available -> cannot call public endpoints
		return nil
	}

	// Candidate endpoints to try (model placeholder will be substituted)
	candidates := []string{
		fmt.Sprintf("https://generativelanguage.googleapis.com/v1/models/%s:generateText", model),
		fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta2/models/%s:generateText", model),
		fmt.Sprintf("https://api.generativeai.google/v1/models/%s:generateText", model),
		fmt.Sprintf("https://api.generativeai.google/v1beta2/models/%s:generateText", model),
		fmt.Sprintf("https://gemini.googleapis.com/v1/models/%s:generateText", model),
	}

	// Try multiple payload shapes to match various REST APIs
	payloadVariants := [][]byte{}
	// variant 1: legacy style used by our previous code
	v1, _ := json.Marshal(map[string]any{"model": model, "prompt": prompt, "max_tokens": 512})
	payloadVariants = append(payloadVariants, v1)
	// variant 2: Google GenAI style (input / maxOutputTokens)
	v2, _ := json.Marshal(map[string]any{"input": prompt, "maxOutputTokens": 512})
	payloadVariants = append(payloadVariants, v2)
	// variant 3: alternative field names
	v3, _ := json.Marshal(map[string]any{"prompt": prompt, "maxOutputTokens": 512})
	payloadVariants = append(payloadVariants, v3)

	// Try endpoints and payload shapes; attempt both Authorization header and key query fallback
	for _, ep := range candidates {
		for _, payload := range payloadVariants {
			// try Authorization header first
			body, err := tryRequest(ep, payload, false)
			if err != nil {
				// if the endpoint rejects header-based auth, try key query param
				body, err = tryRequest(ep, payload, true)
			}
			if err != nil {
				log.Printf("callGeminiSuggest: endpoint %s failed: %v", ep, err)
				continue
			}
			if strings.TrimSpace(body) == "" {
				continue
			}

			// Try to parse JSON and extract text candidate fields, otherwise treat as plain YAML/text
			var parsed any
			if jerr := json.Unmarshal([]byte(body), &parsed); jerr == nil {
				// try to locate text in common fields
				if m, ok := parsed.(map[string]any); ok {
					// common patterns: {"candidates": [{"content": "..."}]}, {"output": "..."}, {"text": "..."}
					if cands, ok := m["candidates"].([]any); ok && len(cands) > 0 {
						first := cands[0]
						if fm, ok := first.(map[string]any); ok {
							for _, k := range []string{"content", "output", "text", "message"} {
								if v, ok := fm[k].(string); ok && strings.TrimSpace(v) != "" {
									suggested := strings.TrimSpace(v)
									lines := strings.Split(preprocessYAML(content), "\n")
									firstLine := 1
									firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
									for i, l := range lines {
										if strings.Contains(l, firstLineCandidate) {
											firstLine = i + 1
											break
										}
									}
									return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": firstLine, "endLine": firstLine + len(strings.Split(suggested, "\n")) - 1}}
								}
							}
						}
					}
					if txt, ok := m["output"].(string); ok && strings.TrimSpace(txt) != "" {
						suggested := strings.TrimSpace(txt)
						lines := strings.Split(preprocessYAML(content), "\n")
						first := 1
						firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
						for i, l := range lines {
							if strings.Contains(l, firstLineCandidate) {
								first = i + 1
								break
							}
						}
						return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
					}
					if txt, ok := m["text"].(string); ok && strings.TrimSpace(txt) != "" {
						suggested := strings.TrimSpace(txt)
						lines := strings.Split(preprocessYAML(content), "\n")
						first := 1
						firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
						for i, l := range lines {
							if strings.Contains(l, firstLineCandidate) {
								first = i + 1
								break
							}
						}
						return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
					}
				}
			}

			// Fallback: treat body as plain YAML snippet
			suggested := strings.TrimSpace(body)
			if suggested != "" {
				lines := strings.Split(preprocessYAML(content), "\n")
				first := 1
				firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
				for i, l := range lines {
					if strings.Contains(l, firstLineCandidate) {
						first = i + 1
						break
					}
				}
				return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
			}
		}
	}

	return nil
}

// getEnv reads environment variable or returns default
func getEnv(k, def string) string {
	if v, ok := syscallEnv(k); ok {
		return v
	}
	return def
}

// syscallEnv wraps os.LookupEnv to keep testability
func syscallEnv(k string) (string, bool) {
	return syscallLookupEnv(k)
}

// syscallLookupEnv is a thin wrapper over os.LookupEnv (split for easier testing/mocking)
func syscallLookupEnv(k string) (string, bool) {
	return lookupEnvImpl(k)
}

// lookupEnvImpl is assigned to os.LookupEnv at init
var lookupEnvImpl = func(k string) (string, bool) { return "", false }

// getMaxPayloadBytes returns the maximum allowed request payload size in bytes.
// It can be configured with environment variables:
// - MAX_PAYLOAD_BYTES (absolute bytes)
// - MAX_PAYLOAD_MB (size in megabytes)
// Defaults to 2 MiB.
func getMaxPayloadBytes() int64 {
	if v, ok := syscallEnv("MAX_PAYLOAD_BYTES"); ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n
		}
	}
	if v, ok := syscallEnv("MAX_PAYLOAD_MB"); ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n * 1024 * 1024
		}
	}
	return int64(2 * 1024 * 1024) // 2 MiB default
}

func ValidateHandler(c *gin.Context) {
	var req ValidateRequest
	// Enforce maximum payload size to avoid resource exhaustion
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, getMaxPayloadBytes())
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": err.Error()})
		return
	}

	// If content is empty, allow processing only when schema=="custom" and schemaContent is provided.
	if strings.TrimSpace(req.Content) == "" {
		if strings.TrimSpace(req.Schema) == "custom" && strings.TrimSpace(req.SchemaContent) != "" {
			// ok: client provided schemaContent for custom schema checks
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": "field 'content' is required unless using schema='custom' with schemaContent"})
			return
		}
	}

	if containsHelmTemplate(req.Content) {
		resp := ValidateResponse{
			IsValid:     false,
			Errors:      []ValidationError{{Message: "Detected Helm template markers - not supported for auto-fix.", Severity: "warning", Type: "template"}},
			CanAutoFix:  false,
			Explanation: "Content contains Helm template markers.",
		}
		c.JSON(http.StatusOK, resp)
		return
	}

	format := detectFormat(req.Content)
	errs := []ValidationError{}
	canAutoFix := true

	if format == "json" {
		var parsed any
		if err := json.Unmarshal([]byte(req.Content), &parsed); err != nil {
			errs = append(errs, ValidationError{
				Line:     0,
				Column:   0,
				Message:  fmt.Sprintf("JSON syntax error: %s", err.Error()),
				Severity: "error",
				Type:     "syntax",
			})
			canAutoFix = false
		}

		// If a JSON schema was supplied, do a basic validation: ensure the schema itself parses
		if req.Schema == "json" && strings.TrimSpace(req.SchemaContent) != "" {
			var js map[string]any
			if err := json.Unmarshal([]byte(req.SchemaContent), &js); err != nil {
				errs = append(errs, ValidationError{Line: 0, Column: 0, Message: fmt.Sprintf("Invalid JSON schema: %s", err.Error()), Severity: "warning", Type: "schema"})
			}
		}
	} else {
		docs := splitYAML(req.Content)
		for i, doc := range docs {
			trimmed := strings.TrimSpace(doc)
			if trimmed == "" {
				continue
			}

			var parsed any
			if err := yaml.Unmarshal([]byte(doc), &parsed); err != nil {
				errs = append(errs, ValidationError{
					Line:     0,
					Column:   0,
					Message:  fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()),
					Severity: "error",
					Type:     "syntax",
				})
				canAutoFix = false
				// produce suggested fixes for UI guidance
				suggestions, _ := suggestYAML(doc, err)
				if len(suggestions) > 0 {
					// attach suggestions to the response via a temporary field on the first error
					// Build a minimal response and return early with suggestedFixes
					resp := ValidateResponse{
						IsValid:        false,
						Errors:         errs,
						CanAutoFix:     false,
						Explanation:    fmt.Sprintf("YAML syntax error in document %d", i+1),
						SuggestedFixes: suggestions,
					}
					c.JSON(http.StatusOK, resp)
					return
				}

				// Schema-specific lightweight checks (only run when a schema parameter is provided)
				if req.Schema != "" {
					if req.Schema == "kubernetes" {
						// parsed is already unmarshaled: assert map
						if m, ok := parsed.(map[string]any); ok {
							if _, has := m["apiVersion"]; !has {
								errs = append(errs, ValidationError{Line: 0, Column: 0, Message: "missing required field: apiVersion", Severity: "error", Type: "schema"})
							}
							if _, has := m["kind"]; !has {
								errs = append(errs, ValidationError{Line: 0, Column: 0, Message: "missing required field: kind", Severity: "error", Type: "schema"})
							}
							if md, ok := m["metadata"]; !ok {
								errs = append(errs, ValidationError{Line: 0, Column: 0, Message: "missing required field: metadata", Severity: "error", Type: "schema"})
							} else if mdm, mok := md.(map[string]any); !mok || mdm["name"] == nil {
								errs = append(errs, ValidationError{Line: 0, Column: 0, Message: "metadata.name is required", Severity: "error", Type: "schema"})
							}
						}
					}

					if req.Schema == "helm" {
						// For helm, if template markers are present, we mark as warning (templates not auto-fixable)
						if containsHelmTemplate(doc) {
							errs = append(errs, ValidationError{Line: 0, Column: 0, Message: "Detected Helm template markers - template rendering may be required", Severity: "warning", Type: "template"})
						} else {
							// ensure valid YAML
							var tmp any
							if yerr := yaml.Unmarshal([]byte(doc), &tmp); yerr != nil {
								errs = append(errs, ValidationError{Line: 0, Column: 0, Message: fmt.Sprintf("Helm/values YAML error: %s", yerr.Error()), Severity: "error", Type: "schema"})
							}
						}
					}

					if req.Schema == "custom" && strings.TrimSpace(req.SchemaContent) != "" {
						// validate that schema content parses either as JSON or YAML
						var js map[string]any
						if jerr := json.Unmarshal([]byte(req.SchemaContent), &js); jerr != nil {
							var yv any
							if yerr := yaml.Unmarshal([]byte(req.SchemaContent), &yv); yerr != nil {
								errs = append(errs, ValidationError{Line: 0, Column: 0, Message: fmt.Sprintf("Invalid custom schema: %s", yerr.Error()), Severity: "warning", Type: "schema"})
							}
						}
					}
				}
				// try backend fallback generator if no suggestions were found
				fb := generateBackendSuggestion(doc)
				if len(fb) > 0 {
					resp := ValidateResponse{
						IsValid:        false,
						Errors:         errs,
						CanAutoFix:     false,
						Explanation:    fmt.Sprintf("YAML syntax error in document %d", i+1),
						SuggestedFixes: fb,
					}
					c.JSON(http.StatusOK, resp)
					return
				}
				// try a targeted detection for serviceName/servicePort misindent under backend
				if det := detectBackendMisindent(doc); len(det) > 0 {
					resp := ValidateResponse{
						IsValid:        false,
						Errors:         errs,
						CanAutoFix:     false,
						Explanation:    fmt.Sprintf("YAML syntax error in document %d", i+1),
						SuggestedFixes: det,
					}
					c.JSON(http.StatusOK, resp)
					return
				}
				// If user requested AI suggestions, try Gemini before giving up
				if req.UseAI {
					if ai := callGeminiSuggest(doc); len(ai) > 0 {
						resp := ValidateResponse{
							IsValid:        false,
							Errors:         errs,
							CanAutoFix:     false,
							Explanation:    fmt.Sprintf("YAML syntax error in document %d", i+1),
							SuggestedFixes: ai,
						}
						c.JSON(http.StatusOK, resp)
						return
					}
				}
			}
		}
	}

	// Check if content is safe for auto-fix
	if ok, reason := canAutoFixContent(req.Content); !ok {
		canAutoFix = false
		errs = append(errs, ValidationError{
			Line: 0, Column: 0,
			Message:  "auto-fix disabled: " + reason,
			Severity: "warning", Type: "autofix",
		})
	}

	resp := ValidateResponse{
		IsValid:     len(errs) == 0,
		Errors:      errs,
		CanAutoFix:  canAutoFix,
		Explanation: fmt.Sprintf("Validated as %s format", format),
	}

	// If there are errors and no suggested fixes were already returned earlier,
	// run a conservative backend suggestion over the entire document and attach it.
	if len(errs) > 0 {
		if fb := generateBackendSuggestion(req.Content); len(fb) > 0 {
			resp.SuggestedFixes = fb
		}
	}
	log.Printf("ValidateHandler: returning %d errors and %d suggested fixes", len(resp.Errors), len(resp.SuggestedFixes))
	c.JSON(http.StatusOK, resp)
}

func FixHandler(c *gin.Context) {
	var req FixRequest
	// Enforce maximum payload size to avoid resource exhaustion
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, getMaxPayloadBytes())
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": err.Error()})
		return
	}

	if containsHelmTemplate(req.Content) {
		c.JSON(http.StatusOK, gin.H{
			"fixedContent": nil,
			"changes":      []any{},
			"isValid":      false,
			"errors":       []ValidationError{{Message: "Helm templates not supported for auto-fix.", Severity: "warning", Type: "template"}},
			"canAutoFix":   false,
			"explanation":  "Helm templates cannot be auto-fixed.",
		})
		return
	}

	// Determine whether auto-fix is allowed for this content
	autoFixAllowed := true
	if ok, reason := canAutoFixContent(req.Content); !ok {
		autoFixAllowed = false
		_ = reason
	}

	docs := splitYAML(req.Content)
	var outBuilder strings.Builder
	changes := []map[string]any{}
	anyFixed := false

	for i, doc := range docs {
		trimmed := strings.TrimSpace(doc)
		if trimmed == "" {
			continue
		}

		m, err := tryFixYAML(doc)
		if err != nil {
			// try to produce suggestions instead of outright failing
			suggestions, _ := suggestYAML(doc, err)
			if len(suggestions) > 0 {
				c.JSON(http.StatusOK, gin.H{
					"fixedContent":   nil,
					"changes":        []any{},
					"isValid":        false,
					"errors":         []ValidationError{{Message: fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()), Severity: "error", Type: "syntax"}},
					"canAutoFix":     false,
					"suggestedFixes": suggestions,
					"explanation":    "Auto-fix could not be applied automatically. Suggestions are provided for manual review.",
				})
				return
			}

			// If no heuristic suggestions and user requested AI, try AI
			if len(suggestions) == 0 && req.UseAI {
				if ai := callGeminiSuggest(doc); len(ai) > 0 {
					c.JSON(http.StatusOK, gin.H{
						"fixedContent":   nil,
						"changes":        []any{},
						"isValid":        false,
						"errors":         []ValidationError{{Message: fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()), Severity: "error", Type: "syntax"}},
						"canAutoFix":     false,
						"suggestedFixes": ai,
						"explanation":    "Auto-fix could not be applied automatically. AI suggestions are provided for manual review.",
					})
					return
				}
			}

			c.JSON(http.StatusOK, gin.H{
				"fixedContent": nil,
				"changes":      []any{},
				"isValid":      false,
				"errors":       []ValidationError{{Message: fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()), Severity: "error", Type: "syntax"}},
				"canAutoFix":   false,
			})
			return
		}

		// If auto-fix is not allowed for this content, return the suggested snippet instead
		if !autoFixAllowed {
			var tmpBuilder strings.Builder
			enc := yaml.NewEncoder(&tmpBuilder)
			enc.SetIndent(2)
			_ = enc.Encode(m)
			snippet := tmpBuilder.String()
			suggestions := []map[string]any{{"shortDescription": "Suggested fixes (auto-fix disabled)", "confidence": "medium", "fixedSnippet": snippet, "line": 1}}
			c.JSON(http.StatusOK, gin.H{
				"fixedContent":   nil,
				"changes":        []any{},
				"isValid":        false,
				"errors":         []ValidationError{{Message: "auto-fix disabled for this content. Suggestions provided.", Severity: "warning", Type: "autofix"}},
				"canAutoFix":     false,
				"suggestedFixes": suggestions,
				"explanation":    "Auto-fix disabled for safety. Please review suggestions before applying.",
			})
			return
		}

		// Refuse to auto-fix structural issues that require human judgement:
		if val, ok := m["metadata"]; ok {
			if val == nil {
				c.JSON(http.StatusOK, gin.H{
					"fixedContent": nil,
					"changes":      []any{},
					"isValid":      false,
					"errors":       []ValidationError{{Message: "auto-fix refused: `metadata` is null. Please correct the document manually.", Severity: "warning", Type: "autofix"}},
					"canAutoFix":   false,
				})
				return
			}
		}

		if _, hasName := m["name"]; hasName {
			if md, ok := m["metadata"].(map[string]any); !ok || md == nil || md["name"] == nil {
				c.JSON(http.StatusOK, gin.H{
					"fixedContent": nil,
					"changes":      []any{},
					"isValid":      false,
					"errors":       []ValidationError{{Message: "auto-fix refused: top-level `name` detected. Move `name` into `metadata.name` manually.", Severity: "warning", Type: "autofix"}},
					"canAutoFix":   false,
				})
				return
			}
		}

		// Optional schema-aware fixes for Kubernetes
		if req.Schema == "kubernetes" {
			if _, ok := m["metadata"]; !ok {
				name := fmt.Sprintf("autofix-%d-%d", time.Now().Unix(), i+1)
				m["metadata"] = map[string]any{"name": name}
				anyFixed = true
				changes = append(changes, map[string]any{"line": 1, "description": fmt.Sprintf("added metadata.name: %s", name)})
			} else {
				if mm, ok := m["metadata"].(map[string]any); ok {
					if _, ok := mm["name"]; !ok {
						name := fmt.Sprintf("autofix-%d-%d", time.Now().Unix(), i+1)
						mm["name"] = name
						anyFixed = true
						changes = append(changes, map[string]any{"line": 1, "description": fmt.Sprintf("added metadata.name: %s", name)})
					}
				}
			}
		}

		enc := yaml.NewEncoder(&outBuilder)
		enc.SetIndent(2)
		if err := enc.Encode(m); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode fixed YAML"})
			return
		}
		if i < len(docs)-1 {
			outBuilder.WriteString("---\n")
		}
	}

	fixed := outBuilder.String()
	explanation := "Applied YAML formatting fixes."
	if req.Schema == "kubernetes" && anyFixed {
		explanation = "Applied YAML formatting fixes and added missing Kubernetes metadata."
	}

	c.JSON(http.StatusOK, gin.H{
		"fixedContent": fixed,
		"changes":      changes,
		"isValid":      true,
		"errors":       []any{},
		"canAutoFix":   true,
		"explanation":  explanation,
	})
}
