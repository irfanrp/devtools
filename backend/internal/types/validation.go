package types

// ValidateRequest represents the request payload for validation endpoint
type ValidateRequest struct {
	// Content is optional if the client supplies a custom schema via SchemaContent.
	Content       string `json:"content"`
	Filename      string `json:"filename"`
	Schema        string `json:"schema"`
	SchemaContent string `json:"schemaContent,omitempty"`
	UseAI         bool   `json:"useAI,omitempty"`
}

// ValidationError represents a single validation error
type ValidationError struct {
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
	Type     string `json:"type"`
}

// ValidateResponse represents the response from validation endpoint
type ValidateResponse struct {
	IsValid     bool              `json:"isValid"`
	Errors      []ValidationError `json:"errors"`
	Fixed       string            `json:"fixedContent,omitempty"`
	CanAutoFix  bool              `json:"canAutoFix"`
	Explanation string            `json:"explanation,omitempty"`
	// suggestedFixes is an optional list of small suggested snippets when auto-fix cannot be applied
	SuggestedFixes []map[string]any `json:"suggestedFixes,omitempty"`
}

// FixRequest represents the request payload for fix endpoint
type FixRequest struct {
	Content       string   `json:"content" binding:"required"`
	Fixes         []string `json:"fixTypes"`
	Schema        string   `json:"schema"`
	SchemaContent string   `json:"schemaContent,omitempty"`
	UseAI         bool     `json:"useAI,omitempty"`
}