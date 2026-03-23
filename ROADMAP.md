# Roadmap — MCP Legal Document Analyzer

## Phase 1: MVP ✅ Complete

### Goal

Ship a working analyzer that extracts key clauses from PDF, DOCX, and plain-text contracts, flags high-risk provisions against a standard template, and produces a plain-English summary — useful enough for a real pre-signature review.

### MCP Protocol Compliance

- [x] Implement stdio transport (required baseline for all MCP servers)
- [x] Strict JSON Schema for all tool inputs — `extract_clauses` requires `file_path: string`; `flag_risks` requires `file_path: string`, optional `template: string`; `compare_versions` requires `file_path_a: string`, `file_path_b: string`
- [x] Tool annotations: all analysis tools marked `readOnlyHint: true` (no documents are modified); `list_templates` marked `readOnlyHint: true`
- [x] Proper MCP error codes: `invalid_params` for unsupported file types or missing template names, `internal_error` for PDF/DOCX parse failures
- [x] Verified with MCP Inspector before publish
- [x] `package.json` with correct `bin`, `files`, `keywords: ["mcp", "mcp-server", "legal", "contract-analysis", "document-ai"]`
- [x] All outputs include a standard disclaimer: "This is an analysis aid, not legal advice."

### Features

- [x] PDF text extraction (pdf-parse)
- [x] DOCX text extraction (mammoth)
- [x] Plain-text (.txt) file support
- [x] `extract_clauses` — identify and label clause boundaries (termination, liability, IP, governing law, payment terms, etc.)
- [x] `flag_risks` — check extracted clauses against a YAML rule template with severity levels
- [x] `summarize_terms` — plain-English summary of key provisions
- [x] `list_templates` — enumerate available compliance templates
- [x] Bundled templates: NDA, employment agreement, SaaS customer checklist
- [x] Confidence scores on clause extraction — low-confidence extractions flagged for human review
- [x] SQLite storage for document analysis history (respects `--db` and `--no-history` flags)
- [x] `--confidence-threshold` flag wired up
- [x] `--templates` directory override wired up
- [x] TypeScript strict mode
- [x] Basic Jest/Vitest test suite using synthetic anonymized documents only
- [x] `CHANGELOG.md` initialized
- [x] Semantic versioning from first release
- [x] Publish to npm

---

## Phase 2: Polish & Adoption ✅ Complete

### Goal

Make the analyzer trustworthy and extensible enough for legal professionals to rely on it as a daily contract review aid.

### MCP Best Practices

- [x] Progress notifications (`notifications/progress`) during PDF/DOCX parsing and large multi-clause extractions
- [x] Cancellation support (`notifications/cancelled`) — abort a long document analysis cleanly
- [x] MCP logging (`notifications/message`) — emit info-level events for low-confidence extractions (flagged in real time, not just in the final result)
- [x] Streamable HTTP transport (MCP 2025 spec) — deploy the analyzer as a shared team legal tool
- [x] MCP Resources primitive: expose analyzed documents and their extracted clauses as browsable resources (`legal://{doc_id}/clauses`)
- [x] MCP Prompts primitive: `review-contract` prompt template to guide a structured contract review workflow from document upload through risk sign-off
- [x] Tool descriptions include example template names and clause type labels

### Features

- [x] `check_compliance` — structured checklist validation (pass/fail per requirement, not just risk flags)
- [x] `compare_versions` — clause-level diff between two document versions
- [x] Custom template authoring guide and YAML schema with validation
- [x] HTML analysis report artifact — shareable, printable, single-file
- [x] Support for redlined DOCX (track-changes extraction)
- [x] Additional bundled templates: Software License Agreement, Vendor Agreement, Consulting Agreement, Data Processing Agreement, IP Assignment, Loan Agreement — bringing total to nine built-in templates
- [x] ESLint + Prettier enforced in CI
- [x] 90%+ test coverage — fixture documents must be synthetic or fully anonymized
- [x] GitHub Actions CI
- [x] Listed on MCP Registry
- [x] Listed on MCP Market

---

## Phase 3: Monetization & Enterprise ✅ Complete

### Goal

Serve law firms and corporate legal departments that need team collaboration, custom compliance rule sets, and large-scale contract portfolio analysis.

### MCP Enterprise Standards

- [x] OAuth 2.0 authorization (MCP 2025 spec) for the hosted analyzer API
- [x] Rate limiting on document analysis endpoints
- [x] API key authentication for firm/team access
- [x] Multi-transport: stdio for local use, Streamable HTTP for hosted/team deployment
- [x] Document access control — restrict which documents each agent or user can analyze
- [x] Audit log of every analysis performed (document fingerprint, template used, timestamp, requester) — no document content stored in the log

### Features

- [x] Custom template marketplace — organizations publish and share compliance rule sets
- [x] Team document library — store and search past analyses
- [x] Clause annotation — mark up extracted clauses with comments and decisions
- [x] Integration with document management systems (iManage, NetDocuments)
- [x] `bulk_analyze` tool — process entire contract portfolios with per-file progress notifications and aggregate summary
- [x] `export_analysis_report` tool — self-contained HTML report with clause table and risk findings
- [x] `export_audit_log` tool — export audit log in JSON or CSV with date-range filtering
- [x] Regulatory update alerts — notify when a template needs updating due to law changes
- [x] Paid tier: custom templates, team library, bulk processing, enterprise support

---

## Guiding Principles

- **Documents never leave the machine** — all parsing and analysis runs locally by default
- **Analysis aid, not legal advice** — every tool output includes a disclaimer; enforce this in the server, not just in docs
- **Confidence over recall** — surface low-confidence extractions explicitly rather than silently returning incorrect clauses
- **Domain expert collaboration** — rule templates are YAML files that lawyers can read, edit, and contribute without touching code
- **No real documents in the codebase** — test fixtures must be synthetic or fully anonymized at all times
