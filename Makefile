.PHONY: install dev test lint typecheck benchmark load-test clean build start-prod

# ============================================
# Development Commands
# ============================================

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

start-prod:
	npm run start:prod

# ============================================
# Testing Commands
# ============================================

test:
	npm run test

test-coverage:
	npm run test -- --coverage

test-watch:
	npm run test:watch

# ============================================
# Code Quality
# ============================================

lint:
	npm run lint

lint-fix:
	npm run lint:fix

typecheck:
	npm run typecheck

format:
	npm run format

# ============================================
# Benchmarking & Load Testing
# ============================================

benchmark:
	npm run benchmark

load-test:
	npm run load-test

# Locust load test (50 users, 60s)
load-test-full:
	cd server/benchmark && locust -f locustfile.py --host=ws://localhost:8000 --users=50 --spawn-rate=5 --run-time=60s --headless --csv=load_test_results

# ============================================
# Docker
# ============================================

docker-build:
	docker build -t voiceai:latest .

docker-run:
	docker run -p 8000:8000 --env-file .env voiceai:latest

docker-compose-up:
	docker compose up -d

docker-compose-down:
	docker compose down

docker-compose-logs:
	docker compose logs -f

# ============================================
# Database
# ============================================

db-up:
	docker compose up -d postgres redis

db-down:
	docker compose down

db-migrate:
	# Add migration commands here

# ============================================
# Utilities
# ============================================

clean:
	rm -rf dist node_modules coverage .nyc_output

reset: clean install

logs:
	docker compose logs -f voiceai

shell:
	docker exec -it voiceai sh

# ============================================
# CI/CD Helpers
# ============================================

ci: lint typecheck test

pre-commit: lint-fix format

# ============================================
# Development Helpers
# ============================================

# Start everything for local development
dev-all: db-up dev

# Quick health check
health:
	curl -s http://localhost:8000/health | jq .

# Open dashboard
open-dashboard:
	open http://localhost:8000

# API documentation
open-docs:
	open http://localhost:8000/docs