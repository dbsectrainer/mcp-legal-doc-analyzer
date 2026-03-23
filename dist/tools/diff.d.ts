import type { ExtractedClause, ServerConfig } from "../types.js";
export interface ClauseDiff {
  added: ExtractedClause[];
  removed: ExtractedClause[];
  changed: Array<{
    type: string;
    textA: string;
    textB: string;
  }>;
  unchanged: ExtractedClause[];
}
/**
 * compare_versions tool handler.
 * Extracts clauses from two document versions and returns a clause-level diff.
 */
export declare function toolCompareVersions(
  filePathA: string,
  filePathB: string,
  config: ServerConfig,
): Promise<string>;
