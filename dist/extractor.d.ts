import type { ExtractedClause } from "./types.js";
interface ClausePatternConfig {
  patterns: RegExp[];
  baseConfidence: number;
  confidenceThreshold?: number;
}
/**
 * Load custom clause patterns from a YAML file.
 * The file should contain a list of clause pattern definitions:
 *
 * - name: non_compete
 *   patterns:
 *     - "non.compete"
 *     - "non.solicitation"
 *   base_confidence: 0.85
 */
export declare function loadCustomClausePatterns(
  filePath: string,
): Record<string, ClausePatternConfig>;
/**
 * Merge built-in patterns with custom patterns.
 * Custom patterns override built-ins with the same name.
 */
export declare function buildClausePatterns(
  customPatternsFile?: string,
): Record<string, ClausePatternConfig>;
/**
 * Extract clauses from document text.
 *
 * Multi-label: each section can match multiple clause types if all scores
 * exceed the confidence threshold. Returns all matches, sorted by confidence.
 *
 * @param text                  Parsed document text
 * @param confidenceThreshold   Minimum confidence to include a clause (default 0.6)
 * @param customPatternsFile    Optional path to a YAML file with custom clause patterns
 */
export declare function extractClauses(
  text: string,
  confidenceThreshold?: number,
  customPatternsFile?: string,
): ExtractedClause[];
export {};
