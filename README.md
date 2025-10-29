# DevFormat.io — DevOps formatter & generator (Monorepo)

This repository contains a small toolset to validate, auto-fix and generate
infrastructure snippets (YAML / JSON / Terraform). It has two main services:

- `backend/` — Go (Gin) API server that performs validation and auto-fix logic.
- `frontend/` — Next.js app providing the UI.

Quick start (recommended): Docker Compose

1) Build and start services (detached):

```bash
docker compose up -d --build
```

- Frontend (dev server) -> http://localhost:3000
- Backend API -> http://localhost:8080

Running locally (without Docker)

Backend (Go):

```bash
cd backend
go build ./...
PORT=8080 ./backend
```

Frontend (Next.js):

```bash
cd frontend
npm ci
npm run dev    # starts Next dev server on :3000
# or for production build
npm run build && npm run start
```

Environment variables

- `PORT` — backend listen port (default `8080`)
- `MAX_PAYLOAD_BYTES` or `MAX_PAYLOAD_MB` — limit request payload size for handlers.
   If unset the backend defaults to 2 MiB (useful to avoid large uploads/OOM).
- `GEMINI_ENDPOINT`, `GEMINI_API_KEY`, `GEMINI_MODEL` — optional AI suggestion
   integration (used only when `UseAI` is requested by the client).

Notes about Terraform formatting

- The backend will attempt to run `terraform fmt` on generated Terraform files if
   the `terraform` binary is present in the runtime image. If `terraform` is not
   available a `README_FORMATTING.txt` will be included in the zip explaining that
   files are unformatted.
- The `terraform fmt` invocation uses a 10s timeout to avoid hung processes.

API (HTTP endpoints)

- `POST /api/validate` — validate YAML/JSON payloads. Request JSON: `{content, filename, schema?, useAI?}`
- `POST /api/fix` — attempt to auto-fix YAML/JSON. Request JSON: `{content, fixTypes?, schema?, useAI?}`
- `POST /api/format-zip` — generate Terraform files and return a ZIP archive. Request JSON: `{main, variables, outputs, tfvars, name?}`
- `GET /healthz` — health check

Development helpers

- `make dev` (root) will bring up services for local development using Docker Compose.
- `make build` attempts to build frontend and backend artifacts.

Useful notes

- The backend logs a warning when running with Gin's default debug mode — set
   `GIN_MODE=release` in production.
- We intentionally enforce a conservative auto-fix policy for YAML to avoid
   making unsafe structural changes automatically; the UI will present suggested
   snippets when auto-fix is disabled.

Read more in each package README for package-specific instructions.
