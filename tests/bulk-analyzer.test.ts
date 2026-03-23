import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3";
import { bulkAnalyze, type BulkResult } from "../src/bulk-analyzer.js";
import { loadAllTemplates } from "../src/templates.js";
import type { Template } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let db: Database.Database;
let templates: Map<string, Template>;

const NDA_TEXT = `
NON-DISCLOSURE AGREEMENT

CONFIDENTIALITY: Both parties agree to maintain confidentiality of all proprietary information.

TERMINATION: This agreement shall terminate with 30 days notice.

GOVERNING LAW: This agreement shall be governed by the laws of Delaware.

LIMITATION OF LIABILITY: Neither party shall be liable for indirect damages.
`;

function writeTempFile(name: string, content: string): string {
  const filePath = join(tempDir, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkAnalyze", () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bulk-analyzer-test-"));
    db = new Database(":memory:");
    templates = await loadAllTemplates();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns results for each file", async () => {
    const file1 = writeTempFile("contract1.txt", NDA_TEXT);
    const file2 = writeTempFile("contract2.txt", NDA_TEXT);

    const result = await bulkAnalyze(db, [file1, file2], "NDA", {}, templates);

    expect(result.results).toHaveLength(2);
    expect(result.summary.total).toBe(2);
  });

  it("marks successful files with success=true and clause count > 0", async () => {
    const file = writeTempFile("nda.txt", NDA_TEXT);
    const result = await bulkAnalyze(db, [file], "NDA", {}, templates);

    expect(result.results[0]!.success).toBe(true);
    expect(result.results[0]!.clauseCount).toBeGreaterThan(0);
  });

  it("marks non-existent files with success=false and error message", async () => {
    const result = await bulkAnalyze(
      db,
      ["/tmp/nonexistent-file-xyz.txt"],
      "NDA",
      {},
      templates,
    );

    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error).toBeDefined();
    expect(result.results[0]!.clauseCount).toBe(0);
  });

  it("returns correct aggregate summary", async () => {
    const file1 = writeTempFile("good.txt", NDA_TEXT);
    const bad = "/tmp/nonexistent-bulk-xyz.txt";

    const result = await bulkAnalyze(db, [file1, bad], "NDA", {}, templates);

    expect(result.summary.total).toBe(2);
    expect(result.summary.succeeded).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.totalClauses).toBeGreaterThan(0);
  });

  it("throws for unknown template", async () => {
    const file = writeTempFile("nda.txt", NDA_TEXT);

    await expect(
      bulkAnalyze(db, [file], "NonExistentTemplate", {}, templates),
    ).rejects.toMatchObject({ mcpCode: "invalid_params" });
  });

  it("calls onProgress callback for each file", async () => {
    const file1 = writeTempFile("a.txt", NDA_TEXT);
    const file2 = writeTempFile("b.txt", NDA_TEXT);

    const progressCalls: Array<[number, number, string, BulkResult]> = [];
    const onProgress = vi.fn(
      (index: number, total: number, filePath: string, result: BulkResult) => {
        progressCalls.push([index, total, filePath, result]);
      },
    );

    await bulkAnalyze(db, [file1, file2], "NDA", {}, templates, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(progressCalls[0]![0]).toBe(1);
    expect(progressCalls[0]![1]).toBe(2);
    expect(progressCalls[1]![0]).toBe(2);
    expect(progressCalls[1]![1]).toBe(2);
  });

  it("processes files sequentially and includes file paths in results", async () => {
    const file1 = writeTempFile("seq1.txt", NDA_TEXT);
    const file2 = writeTempFile("seq2.txt", NDA_TEXT);

    const result = await bulkAnalyze(db, [file1, file2], "NDA", {}, templates);

    const paths = result.results.map((r) => r.filePath);
    expect(paths[0]).toBe(file1);
    expect(paths[1]).toBe(file2);
  });

  it("respects custom confidenceThreshold option", async () => {
    const file = writeTempFile("nda.txt", NDA_TEXT);

    // Very high threshold should find fewer/no clauses
    const highResult = await bulkAnalyze(
      db,
      [file],
      "NDA",
      { confidenceThreshold: 0.99 },
      templates,
    );

    // Normal threshold should find more clauses
    const normalResult = await bulkAnalyze(
      db,
      [file],
      "NDA",
      { confidenceThreshold: 0.6 },
      templates,
    );

    expect(normalResult.results[0]!.clauseCount).toBeGreaterThanOrEqual(
      highResult.results[0]!.clauseCount,
    );
  });

  it("returns empty results array for empty file list", async () => {
    const result = await bulkAnalyze(db, [], "NDA", {}, templates);
    expect(result.results).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.succeeded).toBe(0);
    expect(result.summary.failed).toBe(0);
  });
});
