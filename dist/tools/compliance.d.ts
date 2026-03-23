import type { LegalDb } from "../db.js";
import type { ServerConfig, Template } from "../types.js";
export interface ComplianceCheckItem {
  rule_id: string;
  description: string;
  status: "pass" | "fail" | "not_applicable";
  finding?: string;
}
/**
 * check_compliance tool handler.
 * For each rule in the template, returns a pass/fail/not_applicable result.
 */
export declare function toolCheckCompliance(
  filePath: string,
  templateName: string | undefined,
  templates: Map<string, Template>,
  config: ServerConfig,
  _db: LegalDb | null,
): Promise<string>;
