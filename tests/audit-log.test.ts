import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { AuditLog, computeDocFingerprint, type AuditEntry } from "../src/audit-log.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let auditFilePath: string;

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    doc_fingerprint: "abc123",
    template_used: "NDA",
    tool_name: "extract_clauses",
    requester_id: "agent-x",
    clause_count: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditLog — record and export", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "audit-log-test-"));
    auditFilePath = join(tempDir, "audit.jsonl");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the log file on first record", () => {
    const log = new AuditLog(auditFilePath);
    log.record(makeEntry());
    expect(existsSync(auditFilePath)).toBe(true);
  });

  it("writes valid JSONL — one entry per line", () => {
    const log = new AuditLog(auditFilePath);
    log.record(makeEntry({ tool_name: "extract_clauses" }));
    log.record(makeEntry({ tool_name: "flag_risks" }));

    const lines = readFileSync(auditFilePath, "utf-8").trim().split("\n").filter(Boolean);

    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as AuditEntry;
    expect(first.tool_name).toBe("extract_clauses");
    const second = JSON.parse(lines[1]!) as AuditEntry;
    expect(second.tool_name).toBe("flag_risks");
  });

  it("export returns empty array when file does not exist", () => {
    const log = new AuditLog(join(tempDir, "nonexistent.jsonl"));
    expect(log.export()).toEqual([]);
  });

  it("export returns all entries when no date filter is provided", () => {
    const log = new AuditLog(auditFilePath);
    log.record(makeEntry({ tool_name: "extract_clauses" }));
    log.record(makeEntry({ tool_name: "flag_risks" }));
    log.record(makeEntry({ tool_name: "check_compliance" }));

    const entries = log.export();
    expect(entries).toHaveLength(3);
  });

  it("export filters by from date", () => {
    const log = new AuditLog(auditFilePath);

    const old = makeEntry({ timestamp: "2023-01-01T00:00:00Z", tool_name: "old-tool" });
    const recent = makeEntry({
      timestamp: "2024-06-01T00:00:00Z",
      tool_name: "new-tool",
    });

    log.record(old);
    log.record(recent);

    const entries = log.export("2024-01-01T00:00:00Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool_name).toBe("new-tool");
  });

  it("export filters by to date", () => {
    const log = new AuditLog(auditFilePath);

    const old = makeEntry({ timestamp: "2023-01-01T00:00:00Z", tool_name: "old-tool" });
    const recent = makeEntry({
      timestamp: "2024-06-01T00:00:00Z",
      tool_name: "new-tool",
    });

    log.record(old);
    log.record(recent);

    const entries = log.export(undefined, "2023-12-31T23:59:59Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool_name).toBe("old-tool");
  });

  it("export filters by date range (from and to)", () => {
    const log = new AuditLog(auditFilePath);

    log.record(makeEntry({ timestamp: "2022-01-01T00:00:00Z", tool_name: "tool-a" }));
    log.record(makeEntry({ timestamp: "2023-06-15T00:00:00Z", tool_name: "tool-b" }));
    log.record(makeEntry({ timestamp: "2024-12-01T00:00:00Z", tool_name: "tool-c" }));

    const entries = log.export("2023-01-01T00:00:00Z", "2023-12-31T23:59:59Z");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool_name).toBe("tool-b");
  });

  it("creates parent directory if it does not exist", () => {
    const nestedPath = join(tempDir, "nested", "dir", "audit.jsonl");
    const log = new AuditLog(nestedPath);
    log.record(makeEntry());
    expect(existsSync(nestedPath)).toBe(true);
  });

  it("skips malformed JSONL lines gracefully", () => {
    const log = new AuditLog(auditFilePath);
    log.record(makeEntry({ tool_name: "good-entry" }));
    // Inject a malformed line
    appendFileSync(auditFilePath, "{ bad json\n", "utf-8");
    log.record(makeEntry({ tool_name: "another-good-entry" }));

    const entries = log.export();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.tool_name)).toContain("good-entry");
    expect(entries.map((e) => e.tool_name)).toContain("another-good-entry");
  });
});

describe("computeDocFingerprint", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    const fp = computeDocFingerprint(Buffer.from("hello world"));
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns consistent fingerprint for same content", () => {
    const a = computeDocFingerprint("test content");
    const b = computeDocFingerprint("test content");
    expect(a).toBe(b);
  });

  it("returns different fingerprints for different content", () => {
    const a = computeDocFingerprint("content A");
    const b = computeDocFingerprint("content B");
    expect(a).not.toBe(b);
  });

  it("accepts Buffer input", () => {
    const fp = computeDocFingerprint(Buffer.from("buffer input"));
    expect(fp).toHaveLength(64);
  });

  it("accepts string input", () => {
    const fp = computeDocFingerprint("string input");
    expect(fp).toHaveLength(64);
  });
});
