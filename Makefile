.PHONY: dev build backend frontend

dev:
	docker-compose up --build

build: backend frontend

backend:
	cd backend && make build

frontend:
	cd frontend && npm ci && npm run build

clean:
	rm -rf frontend/.next backend/bin
