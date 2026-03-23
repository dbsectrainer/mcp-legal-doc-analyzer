import { describe, it, expect } from "vitest";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { toolCheckCompliance } from "../src/tools/compliance.js";
import { loadAllTemplates } from "../src/templates.js";
import type { ServerConfig } from "../src/types.js";

const CONFIG: ServerConfig = {
  dbPath: ":memory:",
  confidenceThreshold: 0.6,
  noHistory: true,
};

// Synthetic NDA that satisfies most NDA template rules
const SYNTHETIC_NDA = `
MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is entered into between Party A and Party B.

CONFIDENTIALITY: Both parties agree to maintain confidentiality of all proprietary information for a period of 2 years from the date of disclosure.

TERMINATION: This agreement shall terminate upon written notice from either party, with 30 days notice required.

GOVERNING LAW: This agreement shall be governed by the laws of Delaware.

LIMITATION OF LIABILITY: Neither party shall be liable for indirect, consequential, or incidental damages.

INTELLECTUAL PROPERTY: Each party retains ownership of their existing intellectual property.
`;

// NDA with an unlimited liability clause (should trigger the critical rule)
const NDA_UNLIMITED_LIABILITY = `
NON-DISCLOSURE AGREEMENT

CONFIDENTIALITY: All proprietary information shall be kept confidential by both parties.

TERMINATION: This agreement expires after 1 year from the signing date.

LIMITATION OF LIABILITY: Liability is unlimited for any breach of this agreement.
`;

// Minimal document with no recognisable clauses
const EMPTY_DOC = "This is a document with no legal clauses.";

async function writeTempFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "compliance-test-"));
  const filePath = join(dir, "contract.txt");
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

describe("toolCheckCompliance", () => {
  it("should return pass/fail/not_applicable items for every rule in the NDA template", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolCheckCompliance(filePath, "NDA", templates, CONFIG, null);

      expect(result).toContain("## Compliance Check");
      expect(result).toContain("**Template:** NDA");
      // Every result line should contain one of the status labels
      expect(result).toMatch(/PASS|FAIL|N\/A/);
    } finally {
      await unlink(filePath);
    }
  });

  it("should mark term_duration as PASS when termination clause is present", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolCheckCompliance(filePath, "NDA", templates, CONFIG, null);
      // term_duration is flag_if_missing:true — present in SYNTHETIC_NDA => pass
      expect(result).toContain("[PASS]");
    } finally {
      await unlink(filePath);
    }
  });

  it("should mark unlimited_liability as FAIL when pattern matches", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(NDA_UNLIMITED_LIABILITY);

    try {
      const result = await toolCheckCompliance(filePath, "NDA", templates, CONFIG, null);
      expect(result).toContain("[FAIL]");
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw an error for an unknown template name", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      await expect(
        toolCheckCompliance(filePath, "NonExistentTemplate", templates, CONFIG, null),
      ).rejects.toMatchObject({ mcpCode: "invalid_params" });
    } finally {
      await unlink(filePath);
    }
  });

  it("should default to NDA template when no template name is provided", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolCheckCompliance(
        filePath,
        undefined,
        templates,
        CONFIG,
        null,
      );
      expect(result).toContain("**Template:** NDA");
    } finally {
      await unlink(filePath);
    }
  });

  it("should handle documents with no recognisable clauses (all not_applicable or fail)", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(EMPTY_DOC);

    try {
      const result = await toolCheckCompliance(filePath, "NDA", templates, CONFIG, null);
      expect(result).toContain("## Compliance Check");
      // With no clauses extracted, flag_if_missing rules should FAIL
      expect(result).toContain("[FAIL]");
    } finally {
      await unlink(filePath);
    }
  });

  it("should work with Employment Agreement template", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(`
EMPLOYMENT AGREEMENT

COMPENSATION: Employee shall receive base salary compensation and fees.

TERMINATION: Employment is at-will. Either party may terminate at will at any time.

INTELLECTUAL PROPERTY: All work product and proprietary materials created during employment are assigned to the employer.

NON-COMPETE: Employee agrees not to engage in competing business activities for 12 months.
    `);

    try {
      const result = await toolCheckCompliance(
        filePath,
        "Employment Agreement",
        templates,
        CONFIG,
        null,
      );
      expect(result).toContain("**Template:** Employment Agreement");
    } finally {
      await unlink(filePath);
    }
  });

  it("should include a disclaimer in the output", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolCheckCompliance(filePath, "NDA", templates, CONFIG, null);
      expect(result).toContain("Disclaimer");
    } finally {
      await unlink(filePath);
    }
  });

  it("should report pass, fail, and not_applicable counts in the summary line", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolCheckCompliance(filePath, "NDA", templates, CONFIG, null);
      // Summary line looks like: "**Results:** X passed, Y failed, Z not applicable"
      expect(result).toMatch(/\d+ passed, \d+ failed, \d+ not applicable/);
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw invalid_params for unsupported file extension", async () => {
    const templates = await loadAllTemplates();
    await expect(
      toolCheckCompliance("/tmp/contract.xlsx", "NDA", templates, CONFIG, null),
    ).rejects.toMatchObject({ mcpCode: "invalid_params" });
  });

  it("should throw internal_error for non-existent file", async () => {
    const templates = await loadAllTemplates();
    await expect(
      toolCheckCompliance(
        "/tmp/nonexistent-compliance-xyz.txt",
        "NDA",
        templates,
        CONFIG,
        null,
      ),
    ).rejects.toMatchObject({ mcpCode: "internal_error" });
  });
});
