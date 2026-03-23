import { parseDocument } from "../parser.js";
import { extractClauses } from "../extractor.js";
import { getTemplate } from "../templates.js";
import { DISCLAIMER } from "./analyze.js";
/**
 * check_compliance tool handler.
 * For each rule in the template, returns a pass/fail/not_applicable result.
 */
export async function toolCheckCompliance(
  filePath,
  templateName,
  templates,
  config,
  _db,
) {
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
  const clauses = extractClauses(doc.text, config.confidenceThreshold);
  const checklist = [];
  for (const rule of template.rules) {
    const matchingClauses = clauses.filter((c) => c.type === rule.clause_type);
    if (matchingClauses.length === 0) {
      if (rule.flag_if_missing) {
        checklist.push({
          rule_id: rule.id,
          description: rule.description,
          status: "fail",
          finding: rule.message,
        });
      } else {
        // Clause type not found and not required — not applicable
        checklist.push({
          rule_id: rule.id,
          description: rule.description,
          status: "not_applicable",
          finding: `No "${rule.clause_type}" clause was found in the document.`,
        });
      }
    } else if (rule.pattern) {
      const regex = new RegExp(rule.pattern, "i");
      const matched = matchingClauses.some((c) => regex.test(c.text));
      if (matched) {
        checklist.push({
          rule_id: rule.id,
          description: rule.description,
          status: "fail",
          finding: rule.message,
        });
      } else {
        checklist.push({
          rule_id: rule.id,
          description: rule.description,
          status: "pass",
        });
      }
    } else {
      // flag_if_missing is false and no pattern — clause present means pass
      checklist.push({
        rule_id: rule.id,
        description: rule.description,
        status: "pass",
      });
    }
  }
  const passCount = checklist.filter((i) => i.status === "pass").length;
  const failCount = checklist.filter((i) => i.status === "fail").length;
  const naCount = checklist.filter((i) => i.status === "not_applicable").length;
  const lines = [
    `## Compliance Check`,
    `**File:** ${doc.file_path}`,
    `**Template:** ${template.name}`,
    `**Results:** ${passCount} passed, ${failCount} failed, ${naCount} not applicable`,
    "",
  ];
  for (const item of checklist) {
    const icon = item.status === "pass" ? "✅" : item.status === "fail" ? "❌" : "➖";
    const statusLabel =
      item.status === "pass" ? "PASS" : item.status === "fail" ? "FAIL" : "N/A";
    lines.push(`### ${icon} [${statusLabel}] ${item.description}`);
    lines.push(`**Rule ID:** \`${item.rule_id}\``);
    if (item.finding) {
      lines.push(`**Finding:** ${item.finding}`);
    }
    lines.push("");
  }
  return lines.join("\n") + DISCLAIMER;
}
