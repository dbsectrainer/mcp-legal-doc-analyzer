# MCP Legal Document Analyzer

npm `mcp-legal-doc-analyzer` package

Domain-specific MCP tooling for legal document workflows. Extract key clauses from contracts, flag risky provisions against configurable rule templates, compare document versions at the clause level, and check compliance against standard checklists — all locally, without documents leaving your machine.

[Tool reference](#tools) | [Configuration](#configuration) | [Contributing](#contributing) | [Troubleshooting](#troubleshooting)

## Key features

- **Clause extraction**: Identifies and labels clause boundaries (termination, liability, IP, governing law, and more) from PDF, DOCX, and plain-text files.
- **Risk flagging**: Checks extracted clauses against YAML rule templates and returns severity-ranked findings.
- **Compliance checking**: Validates documents against structured checklists (NDA, employment agreement, SaaS terms) with pass/fail per requirement.
- **Version diffing**: Compares two versions of a document at the clause level — not raw text lines.
- **Configurable templates**: Rule sets are YAML files that legal professionals can review and edit without writing code.
- **Local-only processing**: All parsing and analysis runs on-device; documents are never transmitted externally.

## Disclaimers

`mcp-legal-doc-analyzer` is an analysis aid, not legal advice. Outputs should be reviewed by a qualified legal professional before making decisions. Clause extraction uses pattern matching and heuristics; results may be incomplete or incorrect for non-standard document formats. Low-confidence extractions are flagged explicitly.

Document contents are processed locally and stored in a local SQLite database. Do not share database exports containing confidential documents.

## Requirements

- Node.js v20.19 or newer.
- npm.

## Getting started

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "legal-analyzer": {
      "command": "npx",
      "args": ["-y", "mcp-legal-doc-analyzer@latest"]
    }
  }
}
```

To load custom compliance templates from a directory:

```json
{
  "mcpServers": {
    "legal-analyzer": {
      "command": "npx",
      "args": ["-y", "mcp-legal-doc-analyzer@latest", "--templates=~/legal/my-templates"]
    }
  }
}
```

### MCP Client configuration

Amp · Claude Code · Cline · Cursor · VS Code · Windsurf · Zed

## Your first prompt

Provide a PDF or DOCX contract file, then enter:

```
Extract the key clauses from this NDA and flag any risky provisions.
```

Your client should return a list of extracted clauses and a risk report ranked by severity.

## Tools

### Document analysis (4 tools)

- `extract_clauses` — identify and label clause boundaries with confidence scores; supports .pdf, .docx, .txt
- `flag_risks` — severity-ranked risk findings against a compliance template
- `check_compliance` — structured pass/fail checklist validation per rule
- `summarize_terms` — plain-English bullet-point summary of key provisions

### Comparison (1 tool)

- `compare_versions` — clause-level diff between two document versions

### Templates (1 tool)

- `list_templates` — enumerate all available compliance templates

### Export & bulk (3 tools)

- `export_analysis_report` — self-contained HTML report with clause table and risk findings; suitable for printing
- `export_audit_log` — export the analysis audit log in JSON or CSV format with optional date-range filtering
- `bulk_analyze` — process a portfolio of contract files in batch with progress notifications

## Bundled templates

Nine compliance templates are included out of the box:

1. NDA
2. Employment Agreement
3. SaaS Customer Agreement
4. Software License Agreement
5. Vendor Agreement
6. Consulting Agreement
7. Data Processing Agreement
8. IP Assignment
9. Loan Agreement

Use `list_templates` to enumerate all available templates at runtime, including any custom templates loaded via `--templates`.

## Configuration

### `--templates` / `--templates-dir`

Directory to load custom YAML compliance rule templates from. Templates in this directory are merged with the built-in set.

Type: `string`

### `--db` / `--db-path`

Path to the SQLite database file used to store document analysis history.

Type: `string`
Default: `~/.mcp/legal.db`

### `--confidence-threshold`

Minimum confidence score (0–1) for extracted clauses to be included in results. Extractions below this threshold are flagged as low-confidence.

Type: `number`
Default: `0.6`

### `--no-history`

Disable storing document analysis results in the local database.

Type: `boolean`
Default: `false`

### `--clause-patterns`

Path to a YAML file defining custom clause detection patterns. See `custom-clause-patterns.example.yaml` in the source tree for the schema.

Type: `string`

### `--bulk-concurrency`

Number of files to process in parallel when using `bulk_analyze`.

Type: `number`
Default: `4`

### `--ocr`

Enable OCR fallback for scanned PDFs that contain no extractable text layer. Requires the optional peer dependencies `tesseract.js`, `pdfjs-dist`, and `canvas`.

Type: `boolean`
Default: `false`

### `--http-port`

Start the server in Streamable HTTP mode on the given port instead of stdio. When set, the server accepts HTTP connections suitable for shared team deployments.

Type: `number`

Pass flags via the `args` property in your JSON config:

```json
{
  "mcpServers": {
    "legal-analyzer": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-legal-doc-analyzer@latest",
        "--confidence-threshold=0.8",
        "--templates=~/legal/templates"
      ]
    }
  }
}
```

## Verification

Before publishing a new version, verify the server with MCP Inspector to confirm all tools are exposed correctly and the protocol handshake succeeds.

> Run `npm run build` first so the packaged templates in `dist/templates` are present during verification.

**Interactive UI** (opens browser):

```bash
npm run build && npm run inspect
```

**CLI mode** (scripted / CI-friendly):

```bash
# List all tools
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list

# List resources and prompts
npx @modelcontextprotocol/inspector --cli node dist/index.js --method resources/list
npx @modelcontextprotocol/inspector --cli node dist/index.js --method prompts/list

# Call a tool (example — replace with a relevant read-only tool for this plugin)
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name list_templates

# Call a tool with arguments
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name list_templates --tool-arg key=value
```

Run before publishing to catch regressions in tool registration and runtime startup.

## Contributing

Compliance rule templates live in `src/templates/` as YAML files and can be contributed without touching code. Clause extraction tests must use synthetic or anonymized documents only — never include real contracts in the repository. Never log document content.

```bash
npm install && npm test
```

## MCP Registry & Marketplace

This plugin is available on:

- [MCP Registry](https://registry.modelcontextprotocol.io)
- [MCP Market](https://mcpmarket.com)

Search for `mcp-legal-doc-analyzer`.
