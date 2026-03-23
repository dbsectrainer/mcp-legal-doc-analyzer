/**
 * Check whether an agent is allowed to analyze a given document type.
 *
 * Rules applied (first matching policy wins):
 *   1. If the agent has an explicit deny for the docType → deny
 *   2. If the agent has an explicit allow for the docType → allow
 *   3. If no matching policy exists → allow (open by default)
 *
 * @param docType    The document type being analyzed (e.g. "NDA", "M&A")
 * @param agentId    The agent identifier (from API key or JWT sub claim)
 * @param policyPath Optional override path to the YAML policy file
 */
export declare function canAnalyze(docType: string, agentId: string, policyPath?: string): boolean;
