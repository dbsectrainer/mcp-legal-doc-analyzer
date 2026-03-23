import { randomUUID } from "crypto";
import { parseDocument } from "../parser.js";
import { extractClauses } from "../extractor.js";
import { getTemplate } from "../templates.js";
export const DISCLAIMER =
  "\n\n---\n⚠️ **Disclaimer**: This is an analysis aid, not legal advice. Results should be reviewed by a qualified legal professional before making decisions.";
const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};
/**
 * extract_clauses tool handler.
 * Parses the document, extracts clauses, optionally stores in DB.
 * The optional onLowConfidence callback is called for each low-confidence clause
 * to allow real-time MCP logging notifications.
 * The optional onProgress callback receives (step, total, description) for progress tracking.
 */
export async function toolExtractClauses(
  filePath,
  config,
  db,
  onLowConfidence,
  onProgress,
) {
  const TOTAL_STEPS = 3;
  if (onProgress) onProgress(1, TOTAL_STEPS, "Parsing document");
  let doc;
  try {
    doc = await parseDocument(filePath, { enableOcr: config.enableOcr });
  } catch (err) {
    const code =
      err.code === "UNSUPPORTED_FILE_TYPE" ? "invalid_params" : "internal_error";
    throw Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
      mcpCode: code,
    });
  }
  if (onProgress) onProgress(2, TOTAL_STEPS, "Extracting clauses");
  const clauses = extractClauses(
    doc.text,
    config.confidenceThreshold,
    config.clausePatternsFile,
  );
  if (onProgress) onProgress(3, TOTAL_STEPS, "Finalising results");
  // Emit real-time MCP logging notifications for low-confidence extractions
  if (onLowConfidence) {
    for (const clause of clauses) {
      if (clause.low_confidence) {
        onLowConfidence(doc.file_path, clause.type, clause.confidence);
      }
    }
  }
  if (!config.noHistory && db) {
    const analysisId = randomUUID();
    db.saveAnalysis({
      id: analysisId,
      file_path: doc.file_path,
      file_hash: doc.file_hash,
      file_type: doc.file_type,
      analyzed_at: Date.now(),
      clause_count: clauses.length,
      risk_count: 0,
    });
    db.saveClauses(analysisId, clauses);
  }
  const lines = [
    `## Extracted Clauses`,
    `**File:** ${doc.file_path}`,
    `**Type:** ${doc.file_type.toUpperCase()}`,
    `**Clauses found:** ${clauses.length}`,
    "",
  ];
  if (doc.ocr_used) {
    lines.push(
      "> ⚠️ **OCR fallback used**: No text layer was detected in this PDF. Text was extracted via OCR — accuracy may be lower than for text-based PDFs. Human review is strongly recommended.",
    );
    lines.push("");
  }
  if (clauses.length === 0) {
    lines.push("No clauses were identified above the confidence threshold.");
  } else {
    for (const clause of clauses) {
      const confidencePct = Math.round(clause.confidence * 100);
      const lowFlag = clause.low_confidence
        ? " ⚠️ *Low confidence — human review recommended*"
        : "";
      lines.push(
        `### ${formatClauseType(clause.type)} (${confidencePct}% confidence)${lowFlag}`,
      );
      lines.push("");
      // Truncate very long clause text in the output to keep responses readable
      const displayText =
        clause.text.length > 500 ? clause.text.slice(0, 500) + "…" : clause.text;
      lines.push(displayText);
      lines.push("");
    }
  }
  return lines.join("\n") + DISCLAIMER;
}
/**
 * flag_risks tool handler.
 * Extracts clauses, applies template rules, returns ranked findings.
 */
export async function toolFlagRisks(filePath, templateName, templates, config, db) {
  const resolvedTemplateName = templateName ?? "NDA";
  const template = getTemplate(templates, resolvedTemplateName);
  if (!template) {
    throw Object.assign(
      new Error(
        `Template "${resolvedTemplateName}" not found. Use list_templates to see available templates.`,
      ),
      { mcpCode: "invalid_params" },
    );
  }
  let doc;
  try {
    doc = await parseDocument(filePath, { enableOcr: config.enableOcr });
  } catch (err) {
    const code =
      err.code === "UNSUPPORTED_FILE_TYPE" ? "invalid_params" : "internal_error";
    throw Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
      mcpCode: code,
    });
  }
  const clauses = extractClauses(
    doc.text,
    config.confidenceThreshold,
    config.clausePatternsFile,
  );
  const findings = [];
  for (const rule of template.rules) {
    // Find clauses matching this rule's clause_type
    const matchingClauses = clauses.filter((c) => c.type === rule.clause_type);
    if (rule.flag_if_missing) {
      // Flag if no clause of this type was found
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
    } else if (rule.pattern) {
      // Flag if clause text matches the pattern
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
          break; // Only report once per rule
        }
      }
    }
  }
  // Sort by severity descending
  findings.sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
  if (!config.noHistory && db) {
    const analysisId = randomUUID();
    db.saveAnalysis({
      id: analysisId,
      file_path: doc.file_path,
      file_hash: doc.file_hash,
      file_type: doc.file_type,
      analyzed_at: Date.now(),
      clause_count: clauses.length,
      risk_count: findings.length,
      template_used: template.name,
    });
    db.saveClauses(analysisId, clauses);
  }
  const lines = [
    `## Risk Analysis`,
    `**File:** ${doc.file_path}`,
    `**Template:** ${template.name}`,
    `**Findings:** ${findings.length}`,
    "",
  ];
  if (findings.length === 0) {
    lines.push("No risk findings for the selected template against this document.");
  } else {
    for (const finding of findings) {
      const icon = severityIcon(finding.severity);
      lines.push(
        `### ${icon} [${finding.severity.toUpperCase()}] ${finding.description}`,
      );
      lines.push(`**Rule:** \`${finding.rule_id}\``);
      lines.push(`**Clause type:** ${formatClauseType(finding.clause_type)}`);
      lines.push(
        `**Type:** ${finding.flag_type === "missing_clause" ? "Missing clause" : "Pattern match"}`,
      );
      lines.push(`**Recommendation:** ${finding.message}`);
      lines.push("");
    }
  }
  return lines.join("\n") + DISCLAIMER;
}
/**
 * summarize_terms tool handler.
 * Generates a plain-English bullet-point summary of key provisions.
 */
export async function toolSummarizeTerms(filePath, config) {
  let doc;
  try {
    doc = await parseDocument(filePath, { enableOcr: config.enableOcr });
  } catch (err) {
    const code =
      err.code === "UNSUPPORTED_FILE_TYPE" ? "invalid_params" : "internal_error";
    throw Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
      mcpCode: code,
    });
  }
  const clauses = extractClauses(
    doc.text,
    config.confidenceThreshold,
    config.clausePatternsFile,
  );
  const lines = [
    `## Plain-English Summary`,
    `**File:** ${doc.file_path}`,
    `**Document type:** ${doc.file_type.toUpperCase()}`,
    "",
    "### Key Provisions",
    "",
  ];
  if (clauses.length === 0) {
    lines.push(
      "- No identifiable key provisions were found above the confidence threshold.",
    );
  } else {
    // Group by clause type and produce one bullet per type
    const byType = new Map();
    for (const clause of clauses) {
      const existing = byType.get(clause.type) ?? [];
      existing.push(clause);
      byType.set(clause.type, existing);
    }
    for (const [type, typeClauses] of byType) {
      const best = typeClauses[0]; // highest confidence already sorted
      const summary = summarizeClause(type, best.text);
      const lowFlag = best.low_confidence ? " *(low confidence)*" : "";
      lines.push(`- **${formatClauseType(type)}**${lowFlag}: ${summary}`);
    }
  }
  return lines.join("\n") + DISCLAIMER;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatClauseType(type) {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function severityIcon(severity) {
  switch (severity) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    default:
      return "🟢";
  }
}
/**
 * Produce a concise plain-English summary for a single clause.
 * Uses keyword-based heuristics to generate short descriptions.
 */
function summarizeClause(type, text) {
  const lower = text.toLowerCase();
  switch (type) {
    case "termination": {
      if (/at.will|at will/.test(lower)) {
        return "Either party may terminate at will without cause.";
      }
      const days = lower.match(/(\d+)\s*days?\s*notice/);
      if (days) {
        return `Agreement terminates with ${days[1]}-day written notice.`;
      }
      return "Agreement contains termination provisions.";
    }
    case "liability": {
      if (/unlimited|without limit|no cap/.test(lower)) {
        return "Contract may contain unlimited liability provisions — review carefully.";
      }
      if (/indemnif/.test(lower)) {
        return "Party indemnification obligations are specified.";
      }
      return "Liability is limited under the terms of this agreement.";
    }
    case "confidentiality": {
      if (/mutual|both parties/.test(lower)) {
        return "Mutual confidentiality obligations apply to both parties.";
      }
      return "Confidentiality obligations are specified for disclosed information.";
    }
    case "intellectual_property": {
      if (/non.compete|non.solicitation/.test(lower)) {
        return "Non-compete or non-solicitation restrictions apply.";
      }
      if (/assign/.test(lower)) {
        return "Intellectual property created under this agreement is assigned.";
      }
      return "Each party retains ownership of pre-existing intellectual property.";
    }
    case "governing_law": {
      const state = text.match(/laws?\s+of\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|\n|$)/);
      if (state) {
        return `Governed by the laws of ${state[1].trim()}.`;
      }
      return "A specific governing law and jurisdiction is specified.";
    }
    case "payment_terms": {
      return "Payment, fees, or compensation terms are defined in this agreement.";
    }
    case "dispute_resolution": {
      if (/arbitration/.test(lower)) {
        return "Disputes must be resolved through binding arbitration.";
      }
      if (/mediation/.test(lower)) {
        return "Disputes must first proceed through mediation before litigation.";
      }
      return "Dispute resolution procedures are specified.";
    }
    case "warranty": {
      if (/as.is|no warrant/.test(lower)) {
        return "Services or goods are provided AS-IS with limited or no warranties.";
      }
      if (/sla|service level|uptime/.test(lower)) {
        return "Service level or uptime commitments are included.";
      }
      return "Warranty or representation terms are specified.";
    }
    default:
      return "Clause details are specified in the document.";
  }
}
