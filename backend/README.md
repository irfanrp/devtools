# DevFormat.io - Backend (Go)

This is the Go-based backend for DevFormat.io (YAML Linter & Fixer).

Features:
- HTTP API (Gin) with endpoints for /api/validate and /api/fix
- Uses gopkg.in/yaml.v3 for parsing and normalization
- Optional AI-powered suggestions via Gemini

## Getting Started

1. Install dependencies:

   make tidy

2. Set up environment variables (copy .env.example to .env):

   cp ../.env.example ../.env

3. Configure Gemini AI (optional):
   - Get API key from https://aistudio.google.com/app/apikey
   - Set GEMINI_API_KEY in your .env file

4. Run the server:

   make run

The server will listen on port 8080 by default. Use `PORT` environment variable to override.

## API Endpoints

### POST /api/validate
Validates YAML/JSON content and returns suggestions when errors are found.

**Request:**
```json
{
  "content": "apiVersion: v1\nkind: Service\n  name: my-service",
  "filename": "service.yaml",
  "schema": "kubernetes",
  "useAI": true
}
```

**Response:**
```json
{
  "isValid": false,
  "errors": [{"message": "YAML syntax error", "severity": "error"}],
  "canAutoFix": false,
  "suggestedFixes": [{
    "shortDescription": "Align mapping fields",
    "confidence": "high",
    "fixedSnippet": "apiVersion: v1\nkind: Service\nmetadata:\n  name: my-service",
    "startLine": 1,
    "endLine": 3
  }]
}
```

### POST /api/fix
Attempts to automatically fix YAML/JSON formatting issues.

**Request:**
```json
{
  "content": "apiVersion: v1\nkind: Service\n  name: my-service",
  "fixTypes": ["format"],
  "schema": "kubernetes",
  "useAI": true
}
```

## Testing Gemini AI Integration

### Quick curl test:
```bash
# Set your API key
export GEMINI_API_KEY="your-api-key-here"

# Test validation with AI suggestions
curl -X POST http://localhost:8080/api/validate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "apiVersion: v1\nkind: Service\n  name: my-service\n  namespace: default",
    "useAI": true
  }'
```

### Environment Variables for AI:
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Your Google AI API key
- `GEMINI_MODEL` - Model name (default: "gemini-2.5-flash")
- `GEMINI_ENDPOINT` - Custom endpoint URL (optional)

If no API key is set, AI suggestions will be skipped and only heuristic fixes will be provided.
