import { parseDocument } from "../parser.js";
import { extractClauses } from "../extractor.js";
import { DISCLAIMER } from "./analyze.js";
/**
 * compare_versions tool handler.
 * Extracts clauses from two document versions and returns a clause-level diff.
 */
export async function toolCompareVersions(filePathA, filePathB, config) {
    let docA, docB;
    try {
        docA = await parseDocument(filePathA, { enableOcr: config.enableOcr });
    }
    catch (err) {
        const code = err.code === "UNSUPPORTED_FILE_TYPE"
            ? "invalid_params"
            : "internal_error";
        throw Object.assign(new Error(`Error reading file A: ${err instanceof Error ? err.message : String(err)}`), { mcpCode: code });
    }
    try {
        docB = await parseDocument(filePathB, { enableOcr: config.enableOcr });
    }
    catch (err) {
        const code = err.code === "UNSUPPORTED_FILE_TYPE"
            ? "invalid_params"
            : "internal_error";
        throw Object.assign(new Error(`Error reading file B: ${err instanceof Error ? err.message : String(err)}`), { mcpCode: code });
    }
    const clausesA = extractClauses(docA.text, config.confidenceThreshold);
    const clausesB = extractClauses(docB.text, config.confidenceThreshold);
    // Build maps by clause type (best-confidence clause per type)
    const mapA = buildTypeMap(clausesA);
    const mapB = buildTypeMap(clausesB);
    const allTypes = new Set([...mapA.keys(), ...mapB.keys()]);
    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];
    for (const type of allTypes) {
        const inA = mapA.get(type);
        const inB = mapB.get(type);
        if (inA && !inB) {
            removed.push(inA);
        }
        else if (!inA && inB) {
            added.push(inB);
        }
        else if (inA && inB) {
            // Normalize whitespace for comparison
            const normalizedA = inA.text.replace(/\s+/g, " ").trim();
            const normalizedB = inB.text.replace(/\s+/g, " ").trim();
            if (normalizedA === normalizedB) {
                unchanged.push(inA);
            }
            else {
                changed.push({ type, textA: inA.text, textB: inB.text });
            }
        }
    }
    const lines = [
        `## Document Version Comparison`,
        `**Version A:** ${docA.file_path}`,
        `**Version B:** ${docB.file_path}`,
        "",
        `**Summary:** ${added.length} added, ${removed.length} removed, ${changed.length} changed, ${unchanged.length} unchanged`,
        "",
    ];
    if (added.length > 0) {
        lines.push("### Clauses Added (in B, not in A)");
        lines.push("");
        for (const clause of added) {
            lines.push(`#### + ${formatClauseType(clause.type)} (${Math.round(clause.confidence * 100)}% confidence)`);
            lines.push("");
            lines.push(truncate(clause.text, 400));
            lines.push("");
        }
    }
    if (removed.length > 0) {
        lines.push("### Clauses Removed (in A, not in B)");
        lines.push("");
        for (const clause of removed) {
            lines.push(`#### - ${formatClauseType(clause.type)} (${Math.round(clause.confidence * 100)}% confidence)`);
            lines.push("");
            lines.push(truncate(clause.text, 400));
            lines.push("");
        }
    }
    if (changed.length > 0) {
        lines.push("### Clauses Changed");
        lines.push("");
        for (const diff of changed) {
            lines.push(`#### ~ ${formatClauseType(diff.type)}`);
            lines.push("");
            lines.push("**Version A:**");
            lines.push(truncate(diff.textA, 400));
            lines.push("");
            lines.push("**Version B:**");
            lines.push(truncate(diff.textB, 400));
            lines.push("");
        }
    }
    if (unchanged.length > 0) {
        lines.push("### Unchanged Clauses");
        lines.push("");
        lines.push(unchanged.map((c) => `- ${formatClauseType(c.type)}`).join("\n"));
        lines.push("");
    }
    return lines.join("\n") + DISCLAIMER;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildTypeMap(clauses) {
    const map = new Map();
    // clauses are already sorted by confidence desc — first encountered wins
    for (const clause of clauses) {
        if (!map.has(clause.type)) {
            map.set(clause.type, clause);
        }
    }
    return map;
}
function formatClauseType(type) {
    return type
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}
function truncate(text, maxLen) {
    return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}
