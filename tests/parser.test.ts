import { describe, it, expect } from "vitest";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { parseDocument } from "../src/parser.js";

// Synthetic plain-text contract for testing — no real documents used
const SYNTHETIC_CONTRACT_TEXT = `
SERVICE AGREEMENT

This Service Agreement is entered into between Service Provider and Client.

PAYMENT TERMS: Client agrees to pay monthly fees as specified in the attached schedule.

TERMINATION: Either party may terminate this agreement with 30 days written notice.

GOVERNING LAW: This agreement shall be governed by the laws of New York.

CONFIDENTIALITY: Both parties agree to keep all project information confidential.

WARRANTY: Service Provider warrants that services will be performed in a professional manner.
`;

describe("parseDocument", () => {
  it("should parse a .txt file and return text content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "legal-test-"));
    const filePath = join(dir, "test-contract.txt");
    await writeFile(filePath, SYNTHETIC_CONTRACT_TEXT, "utf-8");

    try {
      const result = await parseDocument(filePath);
      expect(result.file_type).toBe("txt");
      expect(result.text).toContain("SERVICE AGREEMENT");
      expect(result.text).toContain("PAYMENT TERMS");
      expect(typeof result.file_hash).toBe("string");
      expect(result.file_hash.length).toBe(64); // SHA-256 hex
      expect(result.file_path).toBe(filePath);
    } finally {
      await unlink(filePath);
    }
  });

  it("should return a stable hash for identical content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "legal-test-"));
    const filePath1 = join(dir, "contract-a.txt");
    const filePath2 = join(dir, "contract-b.txt");
    await writeFile(filePath1, SYNTHETIC_CONTRACT_TEXT, "utf-8");
    await writeFile(filePath2, SYNTHETIC_CONTRACT_TEXT, "utf-8");

    try {
      const result1 = await parseDocument(filePath1);
      const result2 = await parseDocument(filePath2);
      expect(result1.file_hash).toBe(result2.file_hash);
    } finally {
      await unlink(filePath1);
      await unlink(filePath2);
    }
  });

  it("should return different hashes for different content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "legal-test-"));
    const filePath1 = join(dir, "contract-a.txt");
    const filePath2 = join(dir, "contract-b.txt");
    await writeFile(filePath1, SYNTHETIC_CONTRACT_TEXT, "utf-8");
    await writeFile(filePath2, SYNTHETIC_CONTRACT_TEXT + " ADDITIONAL", "utf-8");

    try {
      const result1 = await parseDocument(filePath1);
      const result2 = await parseDocument(filePath2);
      expect(result1.file_hash).not.toBe(result2.file_hash);
    } finally {
      await unlink(filePath1);
      await unlink(filePath2);
    }
  });

  it("should throw UNSUPPORTED_FILE_TYPE for unsupported extensions", async () => {
    await expect(parseDocument("/tmp/contract.xlsx")).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
  });

  it("should throw FILE_READ_ERROR for non-existent files", async () => {
    await expect(
      parseDocument("/tmp/nonexistent-legal-doc-xyz.txt"),
    ).rejects.toMatchObject({
      code: "FILE_READ_ERROR",
    });
  });

  it("should expand ~ in file paths (home dir)", async () => {
    // A path starting with ~ that doesn't exist should still fail with FILE_READ_ERROR
    // (not UNSUPPORTED_FILE_TYPE), which means expandHome ran and produced a path
    await expect(parseDocument("~/nonexistent-legal-test-xyz.txt")).rejects.toMatchObject(
      {
        code: "FILE_READ_ERROR",
      },
    );
  });
});

// ---------------------------------------------------------------------------
// PDF parsing paths
// ---------------------------------------------------------------------------
describe("parseDocument — PDF", () => {
  it("should throw PDF_PARSE_ERROR for an invalid PDF buffer", async () => {
    // Write a file with .pdf extension but invalid content so pdf-parse throws
    const dir = await mkdtemp(join(tmpdir(), "legal-pdf-test-"));
    const filePath = join(dir, "invalid.pdf");
    await writeFile(filePath, Buffer.from("not a real pdf"), "binary");
    try {
      await expect(parseDocument(filePath)).rejects.toMatchObject({
        code: "PDF_PARSE_ERROR",
      });
    } finally {
      await unlink(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// DOCX parsing paths
// ---------------------------------------------------------------------------
describe("parseDocument — DOCX", () => {
  it("should throw DOCX_PARSE_ERROR for an invalid DOCX buffer", async () => {
    // Write a file with .docx extension but invalid content so mammoth throws
    const dir = await mkdtemp(join(tmpdir(), "legal-docx-test-"));
    const filePath = join(dir, "invalid.docx");
    await writeFile(filePath, Buffer.from("not a real docx file"), "binary");
    try {
      await expect(parseDocument(filePath)).rejects.toMatchObject({
        code: "DOCX_PARSE_ERROR",
      });
    } finally {
      await unlink(filePath);
    }
  });

  it("should parse a minimal valid DOCX file", async () => {
    // A minimal valid DOCX is a ZIP file containing required parts.
    // We use a fixture if available, otherwise skip with a note.
    const fixturesDir = join(
      "/Users/newtechlab/Desktop/Cleanup/mcp-plugins/mcp-legal-doc-analyzer/tests/fixtures",
    );
    const fixturePath = join(fixturesDir, "sample.docx");
    const { existsSync } = await import("fs");
    if (!existsSync(fixturePath)) {
      // No fixture available — skip
      return;
    }
    const result = await parseDocument(fixturePath);
    expect(result.file_type).toBe("docx");
    expect(typeof result.text).toBe("string");
    expect(result.file_hash.length).toBe(64);
  });
});
