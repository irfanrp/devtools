# DevFormat.io - Backend (Go)

This is the Go-based backend for DevFormat.io (YAML Linter & Fixer).

Features:
- HTTP API (Gin) with endpoints for /api/validate and /api/fix
- Uses gopkg.in/yaml.v3 for parsing and normalization

Run locally:

1. Install dependencies:

   make tidy

2. Run the server:

   make run

The server will listen on port 8080 by default. Use `PORT` environment variable to override.
