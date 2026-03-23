# Contributing to MCP Legal Document Analyzer

Thank you for your interest in contributing to `mcp-legal-doc-analyzer`!

## Getting Started

```bash
git clone https://github.com/<org>/mcp-legal-doc-analyzer.git
cd mcp-legal-doc-analyzer
npm install
npm test
```

All tests must pass before submitting a pull request.

## Project Layout

```
src/
  tools/            # MCP tool handlers (analyze.ts, compliance.ts, diff.ts, html_report.ts, templates.ts)
  templates/        # Bundled YAML compliance rule templates
  index.ts          # CLI entry point — parses flags and starts the server
  server.ts         # MCP server: registers all tools, resources, and prompts
  parser.ts         # PDF and DOCX text extraction (pdf-parse, mammoth)
  extractor.ts      # Clause boundary detection and confidence scoring
  bulk-analyzer.ts  # Batch document processing with progress notifications
  audit-log.ts      # Append-only audit trail for all analysis events
  db.ts             # SQLite storage for document analysis history
  templates.ts      # YAML template loading and merging
  auth.ts           # JWT / API-key middleware for the HTTP transport
  access-control.ts # Role-based access control for document operations
  rate-limiter.ts   # Sliding-window rate limiter for the HTTP transport
  http-server.ts    # Streamable HTTP transport (--http-port)
  types.ts          # Shared TypeScript types
  utils.ts          # Utilities (e.g. home directory expansion)
```

Compliance rule templates live in `src/templates/`. Each template is a YAML file describing clause patterns and associated risk levels. See `src/templates/TEMPLATE_AUTHORING.md` for the schema and authoring guide. Add a corresponding test fixture for any new rule template.

## How to Contribute

### Bug Reports

Open a GitHub issue with:

- Steps to reproduce (include an anonymized or synthetic document excerpt if possible).
- Expected vs. actual behavior.
- Node.js version and OS.

### New Rule Templates

Submit a pull request with the new rule file and a test fixture containing a synthetic document excerpt that exercises the rule. Include the legal rationale or source (standard, jurisdiction, or common practice) as a comment in the rule file.

### Pull Requests

1. Fork the repository and create a branch from `main`.
2. Write or update tests for any changed behavior.
3. Run `npm test` and ensure all tests pass.
4. Follow the existing code style (run `npm run lint`).
5. Never include real confidential legal documents in tests — use synthetic excerpts only.
6. Reference the relevant issue in the PR description.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(rules): add indemnification clause risk template
fix(extractors): handle multi-page PDF clause extraction
docs: add NDA use-case example to README
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.
