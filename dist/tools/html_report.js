import { parseDocument } from "../parser.js";
import { extractClauses } from "../extractor.js";
import { getTemplate } from "../templates.js";
const SEVERITY_RANK = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
};
const SEVERITY_COLOR = {
    critical: "#b91c1c",
    high: "#c2410c",
    medium: "#b45309",
    low: "#15803d",
};
/**
 * export_analysis_report tool handler.
 * Generates a single-file HTML report with all analysis inline.
 */
export async function toolExportAnalysisReport(filePath, templateName, templates, config) {
    let doc;
    try {
        doc = await parseDocument(filePath, { enableOcr: config.enableOcr });
    }
    catch (err) {
        const code = err.code === "UNSUPPORTED_FILE_TYPE"
            ? "invalid_params"
            : "internal_error";
        throw Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
            mcpCode: code,
        });
    }
    const clauses = extractClauses(doc.text, config.confidenceThreshold);
    let template;
    let findings = [];
    if (templateName) {
        template = getTemplate(templates, templateName);
        if (!template) {
            throw Object.assign(new Error(`Template "${templateName}" not found. Use list_templates to see available templates.`), { mcpCode: "invalid_params" });
        }
        findings = computeFindings(clauses, template);
    }
    const html = buildHtml(doc.file_path, doc.file_type, doc.file_hash, clauses, template, findings);
    return html;
}
// ---------------------------------------------------------------------------
// Risk finding computation (mirrors logic in analyze.ts)
// ---------------------------------------------------------------------------
function computeFindings(clauses, template) {
    const findings = [];
    for (const rule of template.rules) {
        const matchingClauses = clauses.filter((c) => c.type === rule.clause_type);
        if (rule.flag_if_missing) {
            if (matchingClauses.length === 0) {
                findings.push({
                    rule_id: rule.id,
                    description: rule.description,
                    severity: rule.severity,
                    message: rule.message,
                    clause_type: rule.clause_type,
                    flag_type: "missing_clause",
                });
            }
        }
        else if (rule.pattern) {
            const regex = new RegExp(rule.pattern, "i");
            for (const clause of matchingClauses) {
                if (regex.test(clause.text)) {
                    findings.push({
                        rule_id: rule.id,
                        description: rule.description,
                        severity: rule.severity,
                        message: rule.message,
                        clause_type: rule.clause_type,
                        matched_clause: clause,
                        flag_type: "pattern_match",
                    });
                    break;
                }
            }
        }
    }
    findings.sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
    return findings;
}
// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------
function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function formatClauseType(type) {
    return type
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}
function severityBadge(severity) {
    const color = SEVERITY_COLOR[severity] ?? "#374151";
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:0.75rem;font-weight:700;text-transform:uppercase;">${esc(severity)}</span>`;
}
function buildClausesTable(clauses) {
    if (clauses.length === 0) {
        return `<p style="color:#6b7280;font-style:italic;">No clauses were identified above the confidence threshold.</p>`;
    }
    const rows = clauses
        .map((c) => {
        const pct = Math.round(c.confidence * 100);
        const lowBadge = c.low_confidence
            ? `<span style="color:#b45309;font-size:0.75rem;margin-left:6px;">⚠ Low</span>`
            : "";
        const barWidth = pct;
        const barColor = c.confidence >= 0.85 ? "#15803d" : c.confidence >= 0.7 ? "#b45309" : "#b91c1c";
        const displayText = c.text.length > 300 ? c.text.slice(0, 300) + "…" : c.text;
        return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;">${esc(formatClauseType(c.type))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:80px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
              <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:4px;"></div>
            </div>
            <span style="font-size:0.85rem;">${pct}%${lowBadge}</span>
          </div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:0.85rem;color:#374151;">${esc(displayText)}</td>
      </tr>`;
    })
        .join("\n");
    return `
  <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #d1d5db;white-space:nowrap;">Clause Type</th>
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #d1d5db;white-space:nowrap;">Confidence</th>
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #d1d5db;">Text (excerpt)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}
function buildFindingsTable(findings) {
    if (findings.length === 0) {
        return `<p style="color:#15803d;font-weight:600;">✅ No risk findings for the selected template.</p>`;
    }
    const rows = findings
        .map((f) => {
        const typeLabel = f.flag_type === "missing_clause" ? "Missing clause" : "Pattern match";
        return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${severityBadge(f.severity)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${esc(f.description)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:0.8rem;">${esc(f.rule_id)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:0.85rem;color:#6b7280;">${esc(typeLabel)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:0.85rem;">${esc(f.message)}</td>
      </tr>`;
    })
        .join("\n");
    return `
  <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
    <thead>
      <tr style="background:#fef2f2;">
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #fca5a5;">Severity</th>
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #fca5a5;">Description</th>
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #fca5a5;">Rule ID</th>
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #fca5a5;">Type</th>
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #fca5a5;">Recommendation</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}
function buildHtml(filePath, fileType, fileHash, clauses, template, findings) {
    const generatedAt = new Date().toISOString();
    const clauseSection = buildClausesTable(clauses);
    const findingsSection = template
        ? `
    <section style="margin-bottom:2rem;">
      <h2 style="font-size:1.25rem;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">
        Risk Findings — ${esc(template.name)}
      </h2>
      <p style="margin-bottom:12px;color:#6b7280;font-size:0.9rem;">Template version: ${esc(template.version)}</p>
      ${buildFindingsTable(findings)}
    </section>`
        : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Legal Analysis Report — ${esc(filePath.split("/").pop() ?? filePath)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f9fafb;
      color: #111827;
      line-height: 1.5;
    }
    .page {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    .header {
      background: #1e3a5f;
      color: #fff;
      padding: 1.5rem 2rem;
      border-radius: 8px;
      margin-bottom: 2rem;
    }
    .header h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    .header .meta { font-size: 0.85rem; opacity: 0.8; }
    .card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }
    .disclaimer {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 1rem 1.25rem;
      font-size: 0.85rem;
      color: #92400e;
      margin-top: 2rem;
    }
    @media print {
      body { background: #fff; }
      .page { max-width: 100%; padding: 1rem; }
      .card { border: 1px solid #ccc; box-shadow: none; }
      .header { background: #1e3a5f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Legal Document Analysis Report</h1>
      <div class="meta">
        <div>File: ${esc(filePath)}</div>
        <div>Type: ${esc(fileType.toUpperCase())} &nbsp;|&nbsp; SHA-256: ${esc(fileHash.slice(0, 16))}…</div>
        <div>Generated: ${esc(generatedAt)}</div>
        ${template ? `<div>Template: ${esc(template.name)} v${esc(template.version)}</div>` : ""}
      </div>
    </div>

    <div class="card">
      <section style="margin-bottom:0;">
        <h2 style="font-size:1.25rem;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">
          Extracted Clauses (${clauses.length})
        </h2>
        ${clauseSection}
      </section>
    </div>

    ${template ? `<div class="card">${findingsSection}</div>` : ""}

    <div class="disclaimer">
      <strong>⚠ Disclaimer:</strong> This report is an analysis aid, not legal advice.
      Results should be reviewed by a qualified legal professional before making decisions.
    </div>
  </div>
</body>
</html>`;
}
