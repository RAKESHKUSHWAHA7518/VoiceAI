.PHONY: dev test lint typecheck benchmark clean install

UV := uv
UV_RUN := $(UV) run

dev:
	$(UV_RUN) uvicorn server.app.main:app --reload --host 0.0.0.0 --port 8000 --log-level info

install:
	$(UV) sync --all-extras

test:
	$(UV_RUN) pytest

lint:
	$(UV_RUN) ruff check .

lint-fix:
	$(UV_RUN) ruff check --fix .

typecheck:
	$(UV_RUN) mypy server

format:
	$(UV_RUN) ruff format .

benchmark:
	$(UV_RUN) python -m server.benchmark.latency_harness

clean:
	rm -rf .venv __pycache__ .pytest_cache .mypy_cache .ruff_cache dist build *.egg-info

check: lint typecheck test

ci: install check