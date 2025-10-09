package handlers

import (
	"net/http"
	"strings"

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

func ValidateHandler(c *gin.Context) {
	var req ValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": err.Error()})
		return
	}

	dec := yaml.NewDecoder(strings.NewReader(req.Content))
	errs := []ValidationError{}
	for {
		var node yaml.Node
		if err := dec.Decode(&node); err != nil {
			if err.Error() == "EOF" || strings.Contains(err.Error(), "EOF") {
				break
			}
			// Try to extract line/column from error string if present
			ve := ValidationError{
				Line:     0,
				Column:   0,
				Message:  err.Error(),
				Severity: "error",
				Type:     "syntax",
			}
			errs = append(errs, ve)
			break
		}
	}

	resp := ValidateResponse{
		IsValid:    len(errs) == 0,
		Errors:     errs,
		CanAutoFix: true,
	}

	c.JSON(http.StatusOK, resp)
}

type FixRequest struct {
	Content string   `json:"content" binding:"required"`
	Fixes   []string `json:"fixTypes"`
}

func FixHandler(c *gin.Context) {
	var req FixRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": err.Error()})
		return
	}

	// Simple auto-fix: re-marshal parsed YAML to normalize indentation and quotes
	var parsed any
	if err := yaml.Unmarshal([]byte(req.Content), &parsed); err != nil {
		c.JSON(http.StatusOK, ValidateResponse{
			IsValid:    false,
			Errors:     []ValidationError{{Message: err.Error(), Severity: "error", Type: "syntax"}},
			CanAutoFix: false,
		})
		return
	}

	// Marshal back with yaml.Encoder to get consistent formatting
	var b strings.Builder
	enc := yaml.NewEncoder(&b)
	enc.SetIndent(2)
	if err := enc.Encode(parsed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode fixed yaml"})
		return
	}

	fixed := b.String()

	c.JSON(http.StatusOK, ValidateResponse{
		IsValid:     true,
		Errors:      []ValidationError{},
		Fixed:       fixed,
		CanAutoFix:  true,
		Explanation: "Auto-fixed common formatting issues (indentation, quoting).",
	})
}
