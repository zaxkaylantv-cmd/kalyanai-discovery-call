# Repository Guidelines

This is a minimal automation starter. Use this guide to keep structure, tooling, and contributions consistent as the codebase grows.

## Project Structure & Module Organization
- `src/` — application/automation modules (keep features cohesive by folder).
- `tests/` — unit/integration tests mirroring `src/` structure.
- `scripts/` — dev/build/CI utilities (e.g., `dev.ps1`, `build.ps1`).
- `configs/` — app/CI config and `*.example` templates.
- `assets/` and `docs/` — non-code resources and documentation.
- `.github/workflows/` — CI pipelines.

## Build, Test, and Development Commands
Prefer a single task runner when available (Makefile or package.json). Example options:
- Setup (Python): `python -m venv .venv && .venv\Scripts\pip install -r requirements.txt`
- Setup (Node): `npm ci`
- Run: Python — `python -m src.main`; Node — `npm start`
- Test: Python — `pytest`; Node — `npm test`
- Lint/Format: Python — `black . && isort . && flake8`; Node — `npm run lint && npm run format`

## Coding Style & Naming Conventions
- Indentation: 2 or 4 spaces per language norms; no tabs in committed code.
- Python: Black + isort; `snake_case` for functions/vars/modules, `PascalCase` for classes.
- JS/TS: Prettier + ESLint; `camelCase` for functions/vars, `PascalCase` for classes; files `kebab-case`.
- Keep modules small, focused, and named after the feature (e.g., `src/scheduler/`, `src/validators/`).

## Testing Guidelines
- Frameworks: `pytest` (Py) or `jest/vitest` (JS/TS).
- Coverage: target ≥ 80% for changed lines; include edge cases.
- Naming: Python — `tests/test_<module>_*.py`; JS/TS — `**/*.test.ts`.
- Run tests locally and ensure they pass before opening a PR.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- PRs: clear description, linked issues (e.g., `Closes #123`), screenshots/logs for behavior changes, and notes on risks/rollbacks.
- Keep PRs small and focused; include tests and docs updates when applicable.

## Security & Configuration Tips
- Do not commit secrets. Use environment variables or `.env` (ignore in VCS). Provide `*.example` files in `configs/`.
- Validate inputs and sanitize file/OS interactions in automation scripts.

## Agent-Specific Instructions
- Follow these conventions when generating changes; touch only relevant files.
- Reference file paths explicitly and keep edits minimal and consistent with the current structure.
