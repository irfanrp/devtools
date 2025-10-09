package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"
)

type ValidateRequest struct {
	Content  string `json:"content" binding:"required"`
	Filename string `json:"filename"`
	Schema   string `json:"schema"`
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
}

type FixRequest struct {
	Content string   `json:"content" binding:"required"`
	Fixes   []string `json:"fixTypes"`
	Schema  string   `json:"schema"`
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

// canAutoFixContent checks if content is safe for auto-fix
func canAutoFixContent(content string) (bool, string) {
	keyRe := regexp.MustCompile(`[A-Za-z0-9_.-]+:`)
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
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

func ValidateHandler(c *gin.Context) {
	var req ValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": err.Error()})
		return
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

	c.JSON(http.StatusOK, resp)
}

func FixHandler(c *gin.Context) {
	var req FixRequest
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

	// Check if content is safe for auto-fix
	if ok, reason := canAutoFixContent(req.Content); !ok {
		c.JSON(http.StatusOK, gin.H{
			"fixedContent": nil,
			"changes":      []any{},
			"isValid":      false,
			"errors":       []ValidationError{{Message: "auto-fix refused: " + reason, Severity: "warning", Type: "autofix"}},
			"canAutoFix":   false,
		})
		return
	}

	format := detectFormat(req.Content)
	changes := []map[string]any{}

	if format == "json" {
		m, err := tryFixJSON(req.Content)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"fixedContent": nil,
				"changes":      []any{},
				"isValid":      false,
				"errors":       []ValidationError{{Message: fmt.Sprintf("JSON syntax error: %s", err.Error()), Severity: "error", Type: "syntax"}},
				"canAutoFix":   false,
			})
			return
		}

		// Re-encode with proper formatting
		fixedBytes, err := json.MarshalIndent(m, "", "  ")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode fixed JSON"})
			return
		}

		changes = append(changes, map[string]any{"line": 1, "description": "fixed JSON formatting"})

		c.JSON(http.StatusOK, gin.H{
			"fixedContent": string(fixedBytes),
			"changes":      changes,
			"isValid":      true,
			"errors":       []any{},
			"canAutoFix":   true,
			"explanation":  "Applied JSON formatting fixes.",
		})
		return
	}

	// YAML handling
	docs := splitYAML(req.Content)
	var outBuilder strings.Builder
	anyFixed := false

	for i, doc := range docs {
		trimmed := strings.TrimSpace(doc)
		if trimmed == "" {
			continue
		}

		m, err := tryFixYAML(doc)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"fixedContent": nil,
				"changes":      []any{},
				"isValid":      false,
				"errors":       []ValidationError{{Message: fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()), Severity: "error", Type: "syntax"}},
				"canAutoFix":   false,
			})
			return
		}

		changes = append(changes, map[string]any{"line": 1, "description": "fixed YAML indentation"})

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
