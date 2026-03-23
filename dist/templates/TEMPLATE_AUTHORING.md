# Template Authoring Guide

This guide explains how to author custom compliance templates for mcp-legal-doc-analyzer.

Templates are plain YAML files placed in a directory passed via the `--templates` flag (or in `src/templates/` for bundled templates). Each file must have a `.yaml` or `.yml` extension.

---

## YAML Schema

```yaml
name: string # Human-readable template name (must be unique; used for lookup)
description: string # Short description shown in list_templates output
version: string # Semantic version string, e.g. "1.0.0"
rules:
  - id: string # Unique rule identifier (snake_case recommended)
    description: string # Short description of what this rule checks
    clause_type: string # Which clause type to inspect (see Clause Types below)
    pattern: string # Optional: regex pattern; rule triggers if matched
    severity: string # One of: low | medium | high | critical
    message: string # Recommendation text shown when the rule fires
    flag_if_missing: boolean # If true, rule fires when clause_type is absent
```

---

## Field Reference

### `name`

The display name for the template. This is the value passed to `flag_risks --template` and `check_compliance --template`. Case-insensitive matching is used.

Example: `name: Vendor Agreement`

### `description`

A one-sentence description of what this template checks.

Example: `description: "Vendor / supplier agreement checklist"`

### `version`

A semantic version string. Used for display purposes only.

Example: `version: "1.0.0"`

---

## Rule Fields

### `id`

A unique identifier for the rule within the template. Used in compliance check output.

Example: `id: ip_assignment`

### `description`

A short human-readable name for what the rule checks.

Example: `description: "IP assignment clause present"`

### `clause_type`

The extractor clause type label to inspect. Must match one of the supported clause types (see below).

### `pattern`

An optional JavaScript-compatible regular expression (case-insensitive). If provided:

- The rule fires when a clause of `clause_type` is found **and** the text matches the pattern.
- Used to flag specific risky language (e.g. "unlimited liability").

Example: `pattern: "unlimited|without limit|no cap"`

Leave `pattern` out (or omit the field) if you only want to check for presence/absence.

### `severity`

The severity level reported when the rule fires. One of:

| Value      | Meaning                            |
| ---------- | ---------------------------------- |
| `low`      | Minor concern; review recommended  |
| `medium`   | Notable issue; should be addressed |
| `high`     | Significant risk; strongly review  |
| `critical` | Blocking issue; must be resolved   |

### `message`

The recommendation text displayed when the rule fires.

Example: `message: "No governing law clause found. Jurisdiction is unclear."`

### `flag_if_missing`

Controls when the rule fires relative to clause presence:

| Value   | Behaviour                                                        |
| ------- | ---------------------------------------------------------------- |
| `true`  | Rule fires when **no clause** of `clause_type` exists in the doc |
| `false` | Rule fires when a clause **is found** and matches `pattern`      |

---

## Supported Clause Types

The extractor recognises the following `clause_type` values:

| Clause Type             | Description                                  |
| ----------------------- | -------------------------------------------- |
| `termination`           | Contract end, notice periods, expiration     |
| `liability`             | Limitation of liability, indemnification     |
| `intellectual_property` | IP ownership, assignment, non-compete        |
| `governing_law`         | Choice of law, jurisdiction                  |
| `payment_terms`         | Fees, invoices, billing, compensation        |
| `confidentiality`       | NDA, non-disclosure, proprietary information |
| `dispute_resolution`    | Arbitration, mediation, litigation           |
| `warranty`              | Warranties, representations, SLAs            |

---

## Example Template

```yaml
name: Consulting Agreement
description: "Consulting / professional services agreement checklist"
version: "1.0.0"
rules:
  - id: ip_assignment
    description: "Work product IP assignment"
    clause_type: intellectual_property
    severity: critical
    message: "No IP assignment clause found. Ownership of deliverables is unclear."
    flag_if_missing: true

  - id: payment_defined
    description: "Compensation and payment terms"
    clause_type: payment_terms
    severity: high
    message: "No payment clause found. Consultant remuneration is undefined."
    flag_if_missing: true

  - id: unlimited_liability
    description: "Check for unlimited liability provisions"
    clause_type: liability
    pattern: "unlimited|without limit|no cap"
    severity: critical
    message: "Contract contains potentially unlimited liability provisions."
    flag_if_missing: false
```

---

## Loading Custom Templates

Pass the directory containing your YAML files when starting the server:

```bash
mcp-legal-doc-analyzer --templates /path/to/my-templates
```

Custom templates are merged with bundled templates. If a custom template has the same `name` as a bundled one, the custom version takes precedence.

---

## Tips

- Keep `id` values unique within a template to avoid confusion in reports.
- Patterns are applied with the JavaScript `RegExp` engine and the `i` (case-insensitive) flag.
- Use `flag_if_missing: true` for required clauses, and `flag_if_missing: false` with a `pattern` for risky language detection.
- Test your template with `check_compliance` to see pass/fail results per rule.
