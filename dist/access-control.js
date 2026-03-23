import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import yaml from "js-yaml";
const DEFAULT_POLICY_PATH = join(homedir(), ".mcp", "legal-access-policy.yaml");
/**
 * Load and parse the YAML policy file. Returns an empty policies array if the
 * file does not exist or cannot be parsed.
 */
function loadPolicies(policyPath) {
    if (!existsSync(policyPath))
        return [];
    try {
        const raw = readFileSync(policyPath, "utf-8");
        const parsed = yaml.load(raw);
        if (!parsed || !Array.isArray(parsed.policies))
            return [];
        return parsed.policies;
    }
    catch {
        return [];
    }
}
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
export function canAnalyze(docType, agentId, policyPath) {
    const resolvedPath = policyPath ?? DEFAULT_POLICY_PATH;
    const policies = loadPolicies(resolvedPath);
    const policy = policies.find((p) => p.agent_id === agentId);
    if (!policy) {
        // No policy for this agent → allow by default
        return true;
    }
    // Deny takes precedence over allow
    if (policy.deny_doc_types && policy.deny_doc_types.includes(docType)) {
        return false;
    }
    if (policy.allow_doc_types) {
        return policy.allow_doc_types.includes(docType);
    }
    // Policy exists but no allow_doc_types specified → allow
    return true;
}
