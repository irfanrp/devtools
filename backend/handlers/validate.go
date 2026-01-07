package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	// "regexp" (unused in handlers)
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"

	"devformat/backend/internal/ai"
	"devformat/backend/internal/fixer"
	"devformat/backend/internal/parser"
	sugg "devformat/backend/internal/suggestions"
	"devformat/backend/internal/types"
)

// Note: Parser functions (SplitYAML, DetectFormat, PreprocessYAML, ContainsHelmTemplate)
// have been moved to the internal `parser` package. Handlers should call
// parser.SplitYAML, parser.DetectFormat, parser.PreprocessYAML, and
// parser.ContainsHelmTemplate instead of the local versions.

// Note: TryFixYAML, TryFixJSON and CanAutoFixContent have been moved to
// the internal `fixer` package. Handlers should call fixer.TryFixYAML,
// fixer.TryFixJSON and fixer.CanAutoFixContent instead of the local versions.

// Suggestion helpers have been moved into internal/suggestions and are
// available as the aliased package `sugg`.

// Note: TryFixYAML, TryFixJSON and CanAutoFixContent have been moved to
// the internal `fixer` package. Handlers should call fixer.TryFixYAML,
// fixer.TryFixJSON and fixer.CanAutoFixContent instead of the local versions.

// Suggestion helpers moved to internal/suggestions package. Use suggestions.SuggestYAML,
// suggestions.GenerateBackendSuggestion and suggestions.DetectBackendMisindent instead.

// Backend suggestion helpers moved to internal/suggestions package.

// detectBackendMisindent targets specific Ingress pattern detection

// detectBackendMisindent looks for a common Ingress pattern where `backend:` is present
// but the following keys (serviceName/servicePort) are not indented under it. Returns
// a single conservative suggestion snippet when detected.
// detectBackendMisindent moved to internal/suggestions package.

// callGeminiSuggest has been moved to backend/internal/ai.CallGeminiSuggest

// getMaxPayloadBytes returns the maximum allowed request payload size in bytes.
// It can be configured with environment variables:
// - MAX_PAYLOAD_BYTES (absolute bytes)
// - MAX_PAYLOAD_MB (size in megabytes)
// Defaults to 2 MiB.
func getMaxPayloadBytes() int64 {
	if v, ok := os.LookupEnv("MAX_PAYLOAD_BYTES"); ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n
		}
	}
	if v, ok := os.LookupEnv("MAX_PAYLOAD_MB"); ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n * 1024 * 1024
		}
	}
	return int64(2 * 1024 * 1024) // 2 MiB default
}

func ValidateHandler(c *gin.Context) {
	var req types.ValidateRequest
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

	if parser.ContainsHelmTemplate(req.Content) {
		resp := types.ValidateResponse{
			IsValid:     false,
			Errors:      []types.ValidationError{{Message: "Detected Helm template markers - not supported for auto-fix.", Severity: "warning", Type: "template"}},
			CanAutoFix:  false,
			Explanation: "Content contains Helm template markers.",
		}
		c.JSON(http.StatusOK, resp)
		return
	}

	format := parser.DetectFormat(req.Content)
	errs := []types.ValidationError{}
	canAutoFix := true

	if format == "json" {
		var parsed any
		if err := json.Unmarshal([]byte(req.Content), &parsed); err != nil {
			errs = append(errs, types.ValidationError{
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
				errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: fmt.Sprintf("Invalid JSON schema: %s", err.Error()), Severity: "warning", Type: "schema"})
			}
		}
	} else {
		docs := parser.SplitYAML(req.Content)
		for i, doc := range docs {
			trimmed := strings.TrimSpace(doc)
			if trimmed == "" {
				continue
			}

			var parsed any
			if err := yaml.Unmarshal([]byte(doc), &parsed); err != nil {
				errs = append(errs, types.ValidationError{
					Line:     0,
					Column:   0,
					Message:  fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()),
					Severity: "error",
					Type:     "syntax",
				})
				canAutoFix = false
				// produce suggested fixes for UI guidance
				suggs, _ := sugg.SuggestYAML(doc, err)
				if len(suggs) > 0 {
					// attach suggestions to the response via a temporary field on the first error
					// Build a minimal response and return early with suggestedFixes
					resp := types.ValidateResponse{
						IsValid:        false,
						Errors:         errs,
						CanAutoFix:     false,
						Explanation:    fmt.Sprintf("YAML syntax error in document %d", i+1),
						SuggestedFixes: suggs,
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
								errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: "missing required field: apiVersion", Severity: "error", Type: "schema"})
							}
							if _, has := m["kind"]; !has {
								errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: "missing required field: kind", Severity: "error", Type: "schema"})
							}
							if md, ok := m["metadata"]; !ok {
								errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: "missing required field: metadata", Severity: "error", Type: "schema"})
							} else if mdm, mok := md.(map[string]any); !mok || mdm["name"] == nil {
								errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: "metadata.name is required", Severity: "error", Type: "schema"})
							}
						}
					}

					if req.Schema == "helm" {
						// For helm, if template markers are present, we mark as warning (templates not auto-fixable)
						if parser.ContainsHelmTemplate(doc) {
							errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: "Detected Helm template markers - template rendering may be required", Severity: "warning", Type: "template"})
						} else {
							// ensure valid YAML
							var tmp any
							if yerr := yaml.Unmarshal([]byte(doc), &tmp); yerr != nil {
								errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: fmt.Sprintf("Helm/values YAML error: %s", yerr.Error()), Severity: "error", Type: "schema"})
							}
						}
					}

					if req.Schema == "custom" && strings.TrimSpace(req.SchemaContent) != "" {
						// validate that schema content parses either as JSON or YAML
						var js map[string]any
						if jerr := json.Unmarshal([]byte(req.SchemaContent), &js); jerr != nil {
							var yv any
							if yerr := yaml.Unmarshal([]byte(req.SchemaContent), &yv); yerr != nil {
								errs = append(errs, types.ValidationError{Line: 0, Column: 0, Message: fmt.Sprintf("Invalid custom schema: %s", yerr.Error()), Severity: "warning", Type: "schema"})
							}
						}
					}
				}
				// try backend fallback generator if no suggestions were found
				fb := sugg.GenerateBackendSuggestion(doc)
				if len(fb) > 0 {
					resp := types.ValidateResponse{
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
				if det := sugg.DetectBackendMisindent(doc); len(det) > 0 {
					resp := types.ValidateResponse{
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
					if aiSug := ai.CallGeminiSuggest(doc); len(aiSug) > 0 {
						resp := types.ValidateResponse{
							IsValid:        false,
							Errors:         errs,
							CanAutoFix:     false,
							Explanation:    fmt.Sprintf("YAML syntax error in document %d", i+1),
							SuggestedFixes: aiSug,
						}
						c.JSON(http.StatusOK, resp)
						return
					}
				}
			}
		}
	}
	// After processing all documents, build response
	resp := types.ValidateResponse{
		IsValid:     len(errs) == 0,
		Errors:      errs,
		CanAutoFix:  canAutoFix,
		Explanation: fmt.Sprintf("Validated as %s format", format),
	}

	// If there are errors and no suggested fixes were already returned earlier,
	// run a conservative backend suggestion over the entire document and attach it.
	if len(errs) > 0 {
		if fb := sugg.GenerateBackendSuggestion(req.Content); len(fb) > 0 {
			resp.SuggestedFixes = fb
		}
	}

	log.Printf("ValidateHandler: returning %d errors and %d suggested fixes", len(resp.Errors), len(resp.SuggestedFixes))
	c.JSON(http.StatusOK, resp)
}

func FixHandler(c *gin.Context) {
	var req types.FixRequest
	// Enforce maximum payload size to avoid resource exhaustion
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, getMaxPayloadBytes())
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": err.Error()})
		return
	}

	if parser.ContainsHelmTemplate(req.Content) {
		c.JSON(http.StatusOK, gin.H{
			"fixedContent": nil,
			"changes":      []any{},
			"isValid":      false,
			"errors":       []types.ValidationError{{Message: "Helm templates not supported for auto-fix.", Severity: "warning", Type: "template"}},
			"canAutoFix":   false,
			"explanation":  "Helm templates cannot be auto-fixed.",
		})
		return
	}

	// Determine whether auto-fix is allowed for this content
	autoFixAllowed := true
	if ok, reason := fixer.CanAutoFixContent(req.Content); !ok {
		autoFixAllowed = false
		_ = reason
	}

	docs := parser.SplitYAML(req.Content)
	var outBuilder strings.Builder
	changes := []map[string]any{}
	anyFixed := false

	for i, doc := range docs {
		trimmed := strings.TrimSpace(doc)
		if trimmed == "" {
			continue
		}

		m, err := fixer.TryFixYAML(doc)
		if err != nil {
			// try to produce suggestions instead of outright failing
			suggestions, _ := sugg.SuggestYAML(doc, err)
			if len(suggestions) > 0 {
				c.JSON(http.StatusOK, gin.H{
					"fixedContent":   nil,
					"changes":        []any{},
					"isValid":        false,
					"errors":         []types.ValidationError{{Message: fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()), Severity: "error", Type: "syntax"}},
					"canAutoFix":     false,
					"suggestedFixes": suggestions,
					"explanation":    "Auto-fix could not be applied automatically. Suggestions are provided for manual review.",
				})
				return
			}

			// If no heuristic suggestions and user requested AI, try AI
			if len(suggestions) == 0 && req.UseAI {
				if aiSug := ai.CallGeminiSuggest(doc); len(aiSug) > 0 {
					c.JSON(http.StatusOK, gin.H{
						"fixedContent":   nil,
						"changes":        []any{},
						"isValid":        false,
						"errors":         []types.ValidationError{{Message: fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()), Severity: "error", Type: "syntax"}},
						"canAutoFix":     false,
						"suggestedFixes": aiSug,
						"explanation":    "Auto-fix could not be applied automatically. AI suggestions are provided for manual review.",
					})
					return
				}
			}

			c.JSON(http.StatusOK, gin.H{
				"fixedContent": nil,
				"changes":      []any{},
				"isValid":      false,
				"errors":       []types.ValidationError{{Message: fmt.Sprintf("YAML syntax error in document %d: %s", i+1, err.Error()), Severity: "error", Type: "syntax"}},
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
				"errors":         []types.ValidationError{{Message: "auto-fix disabled for this content. Suggestions provided.", Severity: "warning", Type: "autofix"}},
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
					"errors":       []types.ValidationError{{Message: "auto-fix refused: `metadata` is null. Please correct the document manually.", Severity: "warning", Type: "autofix"}},
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
					"errors":       []types.ValidationError{{Message: "auto-fix refused: top-level `name` detected. Move `name` into `metadata.name` manually.", Severity: "warning", Type: "autofix"}},
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
