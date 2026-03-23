import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { ExtractedClause } from "./types.js";

// ── Built-in clause pattern definitions ──────────────────────────────────────

interface ClausePatternConfig {
  patterns: RegExp[];
  baseConfidence: number;
  confidenceThreshold?: number; // per-type override for the global threshold
}

const BUILTIN_CLAUSE_PATTERNS: Record<string, ClausePatternConfig> = {
  termination: {
    patterns: [/termination/i, /terminate/i, /end of agreement/i, /expiration/i],
    baseConfidence: 0.8,
  },
  liability: {
    patterns: [/liability/i, /limitation of liability/i, /indemnif/i, /indemnification/i],
    baseConfidence: 0.85,
  },
  intellectual_property: {
    patterns: [
      /intellectual property/i,
      /\bip\b/i,
      /ownership/i,
      /proprietary/i,
      /copyright/i,
    ],
    baseConfidence: 0.8,
  },
  governing_law: {
    patterns: [/governing law/i, /jurisdiction/i, /applicable law/i],
    baseConfidence: 0.9,
  },
  payment_terms: {
    patterns: [/payment/i, /fees/i, /invoice/i, /billing/i, /compensation/i],
    baseConfidence: 0.8,
  },
  confidentiality: {
    patterns: [/confidential/i, /non-disclosure/i, /nda/i, /proprietary information/i],
    baseConfidence: 0.85,
  },
  dispute_resolution: {
    patterns: [/dispute/i, /arbitration/i, /mediation/i, /litigation/i],
    baseConfidence: 0.8,
  },
  warranty: {
    patterns: [/warrant/i, /warranty/i, /representation/i, /guarantee/i],
    baseConfidence: 0.75,
  },
  force_majeure: {
    patterns: [/force majeure/i, /act of god/i, /unforeseeable/i, /beyond.*control/i],
    baseConfidence: 0.85,
  },
  assignment: {
    patterns: [/assignment/i, /assign.*rights/i, /transfer.*agreement/i, /novation/i],
    baseConfidence: 0.8,
  },
  data_protection: {
    patterns: [
      /data protection/i,
      /gdpr/i,
      /personal data/i,
      /data processing/i,
      /privacy/i,
    ],
    baseConfidence: 0.85,
  },
};

// ── YAML-configurable custom clause patterns ──────────────────────────────────

interface YamlClausePattern {
  name: string;
  patterns: string[];
  base_confidence: number;
  confidence_threshold?: number; // optional per-type threshold override
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
export function loadCustomClausePatterns(
  filePath: string,
): Record<string, ClausePatternConfig> {
  if (!fs.existsSync(filePath)) return {};

  try {
    const raw = yaml.load(fs.readFileSync(filePath, "utf-8")) as YamlClausePattern[];
    if (!Array.isArray(raw)) return {};

    const result: Record<string, ClausePatternConfig> = {};
    for (const entry of raw) {
      if (typeof entry.name !== "string" || !Array.isArray(entry.patterns)) continue;
      result[entry.name] = {
        patterns: entry.patterns.map((p) => new RegExp(p, "i")),
        baseConfidence:
          typeof entry.base_confidence === "number" ? entry.base_confidence : 0.75,
        ...(typeof entry.confidence_threshold === "number"
          ? { confidenceThreshold: entry.confidence_threshold }
          : {}),
      };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Merge built-in patterns with custom patterns.
 * Custom patterns override built-ins with the same name.
 */
export function buildClausePatterns(
  customPatternsFile?: string,
): Record<string, ClausePatternConfig> {
  const custom = customPatternsFile ? loadCustomClausePatterns(customPatternsFile) : {};
  return { ...BUILTIN_CLAUSE_PATTERNS, ...custom };
}

// ── Section splitting ─────────────────────────────────────────────────────────

function splitIntoSections(
  text: string,
): Array<{ text: string; start: number; end: number }> {
  const sections: Array<{ text: string; start: number; end: number }> = [];
  const SEPARATOR = /\n{2,}/;
  const parts = text.split(SEPARATOR);

  let cursor = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    const partStart = text.indexOf(part, cursor);
    const partEnd = partStart + part.length;
    cursor = partEnd;

    if (trimmed.length > 20) {
      sections.push({ text: trimmed, start: partStart, end: partEnd });
    }
  }

  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({ text: text.trim(), start: 0, end: text.length });
  }

  return sections;
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function calculateConfidence(
  text: string,
  patterns: RegExp[],
  baseConfidence: number,
): number {
  let matchCount = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) matchCount++;
  }
  if (matchCount === 0) return 0;
  const boost = Math.min((matchCount - 1) * 0.05, 0.15);
  return Math.min(baseConfidence + boost, 0.99);
}

// ── Main extractor ────────────────────────────────────────────────────────────

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
export function extractClauses(
  text: string,
  confidenceThreshold: number = 0.6,
  customPatternsFile?: string,
): ExtractedClause[] {
  const patterns = buildClausePatterns(customPatternsFile);
  const sections = splitIntoSections(text);
  const clauses: ExtractedClause[] = [];

  for (const section of sections) {
    // Collect ALL clause types that exceed the threshold for this section
    const matches: Array<{ type: string; confidence: number }> = [];

    for (const [clauseType, config] of Object.entries(patterns)) {
      const confidence = calculateConfidence(
        section.text,
        config.patterns,
        config.baseConfidence,
      );
      // Per-type threshold takes precedence over the global threshold
      const effectiveThreshold = config.confidenceThreshold ?? confidenceThreshold;
      if (confidence >= effectiveThreshold) {
        matches.push({ type: clauseType, confidence });
      }
    }

    // Sort matches by confidence descending and emit one ExtractedClause per match
    matches.sort((a, b) => b.confidence - a.confidence);

    for (const match of matches) {
      clauses.push({
        type: match.type,
        text: section.text,
        confidence: match.confidence,
        start_index: section.start,
        end_index: section.end,
        low_confidence: match.confidence < 0.7,
      });
    }
  }

  // Sort overall by confidence descending
  clauses.sort((a, b) => b.confidence - a.confidence);

  return clauses;
}
