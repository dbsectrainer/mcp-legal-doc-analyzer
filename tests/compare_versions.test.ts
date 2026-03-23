import { describe, it, expect } from "vitest";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { toolCompareVersions } from "../src/tools/diff.js";
import type { ServerConfig } from "../src/types.js";

const CONFIG: ServerConfig = {
  dbPath: ":memory:",
  confidenceThreshold: 0.6,
  noHistory: true,
};

// Version A: NDA with confidentiality, termination, governing_law, liability, intellectual_property
const VERSION_A = `
MUTUAL NON-DISCLOSURE AGREEMENT

CONFIDENTIALITY: Both parties agree to maintain confidentiality of all proprietary information for a period of 2 years from the date of disclosure.

TERMINATION: This agreement shall terminate upon written notice from either party, with 30 days notice required.

GOVERNING LAW: This agreement shall be governed by the laws of Delaware.

LIMITATION OF LIABILITY: Neither party shall be liable for indirect, consequential, or incidental damages.

INTELLECTUAL PROPERTY: Each party retains ownership of their existing intellectual property.
`;

// Version B: Same structure but termination text changed; liability removed; payment added
const VERSION_B = `
MUTUAL NON-DISCLOSURE AGREEMENT

CONFIDENTIALITY: Both parties agree to maintain confidentiality of all proprietary information for a period of 2 years from the date of disclosure.

TERMINATION: This agreement shall terminate immediately upon written notice from either party, with no notice period required.

GOVERNING LAW: This agreement shall be governed by the laws of Delaware.

INTELLECTUAL PROPERTY: Each party retains ownership of their existing intellectual property.

PAYMENT TERMS: Client agrees to pay monthly fees as specified in the attached payment schedule.
`;

async function writeTempFile(content: string, name = "contract.txt"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "diff-test-"));
  const filePath = join(dir, name);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

describe("toolCompareVersions", () => {
  it("should detect clauses added in version B", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      // payment_terms is in B but not A
      expect(result).toContain("Clauses Added");
      expect(result).toContain("Payment Terms");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should detect clauses removed from version A", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      // liability is in A but not B
      expect(result).toContain("Clauses Removed");
      expect(result).toContain("Liability");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should detect clauses changed between versions", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      // termination text differs between versions
      expect(result).toContain("Clauses Changed");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should report unchanged clauses for identical clause text", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      expect(result).toContain("Unchanged Clauses");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should show no diff when both versions are identical", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_A, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      expect(result).toContain("0 added, 0 removed, 0 changed");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should include version A and B file paths in the output", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      expect(result).toContain("Version A:");
      expect(result).toContain("Version B:");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should throw FILE_READ_ERROR for non-existent file A", async () => {
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      await expect(
        toolCompareVersions("/tmp/nonexistent-a-xyz.txt", pathB, CONFIG),
      ).rejects.toMatchObject({ mcpCode: "internal_error" });
    } finally {
      await unlink(pathB);
    }
  });

  it("should throw FILE_READ_ERROR for non-existent file B", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");

    try {
      await expect(
        toolCompareVersions(pathA, "/tmp/nonexistent-b-xyz.txt", CONFIG),
      ).rejects.toMatchObject({ mcpCode: "internal_error" });
    } finally {
      await unlink(pathA);
    }
  });

  it("should include a disclaimer in the output", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      expect(result).toContain("Disclaimer");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should produce a summary line with counts", async () => {
    const pathA = await writeTempFile(VERSION_A, "v1.txt");
    const pathB = await writeTempFile(VERSION_B, "v2.txt");

    try {
      const result = await toolCompareVersions(pathA, pathB, CONFIG);
      expect(result).toMatch(/\d+ added, \d+ removed, \d+ changed, \d+ unchanged/);
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });
});
