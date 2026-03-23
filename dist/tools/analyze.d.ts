import type { LegalDb } from "../db.js";
import type { ServerConfig, Template } from "../types.js";
export declare const DISCLAIMER =
  "\n\n---\n\u26A0\uFE0F **Disclaimer**: This is an analysis aid, not legal advice. Results should be reviewed by a qualified legal professional before making decisions.";
/**
 * extract_clauses tool handler.
 * Parses the document, extracts clauses, optionally stores in DB.
 * The optional onLowConfidence callback is called for each low-confidence clause
 * to allow real-time MCP logging notifications.
 * The optional onProgress callback receives (step, total, description) for progress tracking.
 */
export declare function toolExtractClauses(
  filePath: string,
  config: ServerConfig,
  db: LegalDb | null,
  onLowConfidence?: (filePath: string, clauseType: string, confidence: number) => void,
  onProgress?: (step: number, total: number, description: string) => void,
): Promise<string>;
/**
 * flag_risks tool handler.
 * Extracts clauses, applies template rules, returns ranked findings.
 */
export declare function toolFlagRisks(
  filePath: string,
  templateName: string | undefined,
  templates: Map<string, Template>,
  config: ServerConfig,
  db: LegalDb | null,
): Promise<string>;
/**
 * summarize_terms tool handler.
 * Generates a plain-English bullet-point summary of key provisions.
 */
export declare function toolSummarizeTerms(
  filePath: string,
  config: ServerConfig,
): Promise<string>;
