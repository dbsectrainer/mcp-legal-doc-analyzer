# Changelog

All notable changes to MCP Legal Document Analyzer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-03-23)


### Features

* add mcpName and prepublishOnly for npm/registry publication ([587083d](https://github.com/dbsectrainer/mcp-legal-doc-analyzer/commit/587083d8e61a9d9f1f00ab8cd005373c55a4ae13))
* add server.json for official MCP registry ([44a86d1](https://github.com/dbsectrainer/mcp-legal-doc-analyzer/commit/44a86d13f0ec1828372220a752c1c66a962e9346))
* add smithery.yaml for Smithery deployment ([cabb1f1](https://github.com/dbsectrainer/mcp-legal-doc-analyzer/commit/cabb1f1a9f63447d8f30993164418d4a4608e878))
* initial release v1.0.0 ([5dc13e8](https://github.com/dbsectrainer/mcp-legal-doc-analyzer/commit/5dc13e8ada155774bab0af4bea0b09249d752e36))


### Bug Fixes

* **ci:** regenerate package-lock.json to sync with package.json ([20cd05d](https://github.com/dbsectrainer/mcp-legal-doc-analyzer/commit/20cd05db8e0509375936614c747c1745efbffd56))
* remove unused import and stale eslint-disable directive ([9a1a2f7](https://github.com/dbsectrainer/mcp-legal-doc-analyzer/commit/9a1a2f7769483b1e5deabe93175a7bd89648eb6c))

## [Unreleased]

## [1.0.0] - 2026-03-12

### Added

- `.env.example` documenting `MCP_API_KEY` and `MCP_JWT_SECRET`.
- `engines: { "node": ">=20.19.0" }` added to `package.json`.
- **`export_analysis_report` tool**: generates a self-contained HTML report with an inline clause table and risk findings, suitable for printing and sharing.
- **`export_audit_log` tool**: exports the analysis audit log in `json` or `csv` format with optional ISO 8601 date-range filtering.
- **`bulk_analyze` tool**: processes a portfolio of contract files in batch; emits `notifications/progress` per file and returns per-file results plus an aggregate summary.
- **Three new bundled compliance templates**: Data Processing Agreement, IP Assignment, and Loan Agreement — bringing the total to nine built-in templates.
- **Plain-text (`.txt`) file support**: all document tools now accept `.txt` files in addition to `.pdf` and `.docx`.
- **`--clause-patterns` flag**: path to a YAML file that defines custom clause detection patterns.
- **`--bulk-concurrency` flag**: controls parallel file processing in `bulk_analyze` (default: 4).
- **`--ocr` flag**: enables OCR fallback via `tesseract.js` / `pdfjs-dist` / `canvas` for scanned PDFs with no text layer.
- **`--http-port` flag**: starts the server in Streamable HTTP mode instead of stdio for shared team deployments.

### Changed

- `@modelcontextprotocol/sdk` upgraded from `^1.0.0` to `^1.12.0`.
- `@types/node` upgraded from `^20.x` to `^24.12.0` (Node 24 LTS).
- `eslint` upgraded from `^9.x` to `^10.0.3`; `eslint-config-prettier` from `^9.x` to `^10.1.8`.
- `yargs` upgraded from `^17.x` to `^18.0.0`.
- `@types/express` moved from `dependencies` to `devDependencies` — it is a type-only package with no runtime value.
- Added `author`, `license`, `repository`, and `homepage` fields to `package.json`.

### Fixed

- Removed unused `vi`, `beforeEach`, `afterEach`, `mkdir`, and `code` imports across `tests/parser.test.ts`, `tests/rate-limiter.test.ts`, `tests/templates.test.ts`, and `tests/auth.test.ts`.

### Security

- Resolved **GHSA-67mh-4wv8-2f99** (`esbuild` ≤ 0.24.2 dev-server cross-origin exposure) by upgrading `vitest` and `@vitest/coverage-v8` to `^4.1.0`. Affects local development only; not a production runtime concern.

## [0.2.0] - 2026-03-12

### Added

- **Access control** (`src/access-control.ts`): role-based access control for document operations; configurable per-user permissions.
- **Audit log** (`src/audit-log.ts`): append-only JSONL audit trail of all document access and analysis events.
- **JWT / API-key auth middleware** (`src/auth.ts`): HTTP transport protected via `MCP_API_KEY` or `MCP_JWT_SECRET`. stdio is unaffected.
- **Bulk analyzer** (`src/bulk-analyzer.ts`): batch document processing — analyze multiple files in a single tool call.
- **Per-client rate limiter** (`src/rate-limiter.ts`): sliding-window request throttle on the HTTP transport.
- **New tools**: `bulk_analyze`, `check_access`.
- **`npm run inspect` script**: launches MCP Inspector for interactive pre-publish verification.
- MCP Inspector verification instructions added to README.
- Tests for access control, audit log, auth, bulk analyzer, and rate limiter.

### Changed

- `pdf-parse` upgraded from `^1.x` to `^2.4.5`; `src/parser.ts` updated to the new class-based API.
- `mammoth` upgraded from `^1.11.x` to `^1.12.0`.

## [0.1.0] - 2026-03-12

### Added

- Initial public release of `mcp-legal-doc-analyzer`.
- Key clause extraction for common contract types (NDA, MSA, SaaS, employment).
- Risk flagging against configurable YAML rule templates.
- Clause-level document version comparison (`compare_versions` tool).
- Compliance checklist verification against built-in and custom checklists.
- PDF and DOCX parsing via `pdf-parse` and `mammoth`.
- All analysis runs locally — documents never leave the machine.
- Streamable HTTP transport via `--http-port` flag (default: disabled, uses stdio).
- GitHub Actions CI workflow running build, test, and lint on push/PR to `main`.
- Vitest test suite with coverage via `@vitest/coverage-v8`.
