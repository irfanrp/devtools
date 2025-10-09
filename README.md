# DevFormat.io — YAML Linter & Fixer (Monorepo)

Quick start for development (macOS / zsh)

1) Backend (Go)

   cd backend
   make tidy
   make build
   PORT=8080 ./bin/devformat

2) Frontend (Next.js)

   cd frontend
   npm install
   npm run dev    # starts Next dev server on :3000
   # or for production build
   npm run build && npm run start

3) Docker Compose (dev)

   docker-compose up --build

Useful targets (root Makefile):

  make dev       # start services for local development (docker-compose)
  make build     # build frontend+backend artifacts
  make fmt       # optional formatting commands

Project layout

  frontend/   - Next.js + Tailwind + Monaco Editor
  backend/    - Go (Gin) API server
  shared/     - Shared types & contracts (TypeScript)

Read more in each package README.
