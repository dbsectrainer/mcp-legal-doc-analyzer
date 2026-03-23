import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { join, dirname } from "path";
import { homedir } from "os";
const DEFAULT_AUDIT_PATH = join(homedir(), ".mcp", "legal-audit.jsonl");
/**
 * Compute SHA-256 fingerprint of raw document bytes.
 */
export function computeDocFingerprint(raw) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf-8");
  return createHash("sha256").update(buf).digest("hex");
}
/**
 * AuditLog records analysis events to a JSONL file without storing document content.
 */
export class AuditLog {
  filePath;
  constructor(filePath) {
    this.filePath = filePath ?? DEFAULT_AUDIT_PATH;
    // Ensure the directory exists
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  /**
   * Append an audit entry to the JSONL file.
   */
  record(entry) {
    appendFileSync(this.filePath, JSON.stringify(entry) + "\n", "utf-8");
  }
  /**
   * Read and return all audit entries, optionally filtered by ISO date range.
   *
   * @param from  ISO 8601 date string — include entries at or after this timestamp
   * @param to    ISO 8601 date string — include entries at or before this timestamp
   */
  export(from, to) {
    if (!existsSync(this.filePath)) return [];
    const raw = readFileSync(this.filePath, "utf-8");
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }
    const fromMs = from ? new Date(from).getTime() : -Infinity;
    const toMs = to ? new Date(to).getTime() : Infinity;
    return entries.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }
}
/** Singleton default instance */
export const auditLog = new AuditLog();
