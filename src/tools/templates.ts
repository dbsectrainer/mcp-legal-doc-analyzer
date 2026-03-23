import { listTemplates } from "../templates.js";
import type { Template } from "../types.js";

/**
 * list_templates tool handler.
 * Returns all available template names and descriptions.
 */
export function toolListTemplates(templates: Map<string, Template>): string {
  const list = listTemplates(templates);

  const lines: string[] = [
    "## Available Compliance Templates",
    "",
    `**Total templates:** ${list.length}`,
    "",
  ];

  if (list.length === 0) {
    lines.push("No templates are currently available.");
  } else {
    for (const t of list) {
      lines.push(`### ${t.name}`);
      lines.push(`- **Description:** ${t.description}`);
      lines.push(`- **Version:** ${t.version}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
