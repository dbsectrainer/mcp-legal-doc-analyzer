import { describe, it, expect } from "vitest";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { toolExportAnalysisReport } from "../src/tools/html_report.js";
import { loadAllTemplates } from "../src/templates.js";
import type { ServerConfig } from "../src/types.js";

const CONFIG: ServerConfig = {
  dbPath: ":memory:",
  confidenceThreshold: 0.6,
  noHistory: true,
};

const SYNTHETIC_NDA = `
MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is entered into between Party A and Party B.

CONFIDENTIALITY: Both parties agree to maintain confidentiality of all proprietary information for a period of 2 years from the date of disclosure.

TERMINATION: This agreement shall terminate upon written notice from either party, with 30 days notice required.

GOVERNING LAW: This agreement shall be governed by the laws of Delaware.

LIMITATION OF LIABILITY: Neither party shall be liable for indirect, consequential, or incidental damages.

INTELLECTUAL PROPERTY: Each party retains ownership of their existing intellectual property.
`;

async function writeTempFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "html-report-test-"));
  const filePath = join(dir, "contract.txt");
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

describe("toolExportAnalysisReport", () => {
  it("should return valid HTML starting with <!DOCTYPE html>", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      expect(result.trim()).toMatch(/^<!DOCTYPE html>/i);
    } finally {
      await unlink(filePath);
    }
  });

  it("should include document metadata in the HTML", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      expect(result).toContain("Legal Document Analysis Report");
      expect(result).toContain(filePath);
    } finally {
      await unlink(filePath);
    }
  });

  it("should include extracted clauses section", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      expect(result).toContain("Extracted Clauses");
    } finally {
      await unlink(filePath);
    }
  });

  it("should include risk findings table when a template is specified", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(filePath, "NDA", templates, CONFIG);
      expect(result).toContain("Risk Findings");
      expect(result).toContain("NDA");
    } finally {
      await unlink(filePath);
    }
  });

  it("should not include risk findings section when no template is specified", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      expect(result).not.toContain("Risk Findings");
    } finally {
      await unlink(filePath);
    }
  });

  it("should include inline CSS (no external stylesheet links)", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      // Should have inline <style> block
      expect(result).toContain("<style>");
      // Should NOT link to any external CDN stylesheets
      expect(result).not.toMatch(/<link[^>]+href="https?:/);
    } finally {
      await unlink(filePath);
    }
  });

  it("should include a disclaimer in the HTML", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      expect(result).toContain("Disclaimer");
      expect(result).toContain("not legal advice");
    } finally {
      await unlink(filePath);
    }
  });

  it("should include printable CSS media query", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      expect(result).toContain("@media print");
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw for an unknown template name", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      await expect(
        toolExportAnalysisReport(filePath, "NonExistentTemplate", templates, CONFIG),
      ).rejects.toMatchObject({ mcpCode: "invalid_params" });
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw FILE_READ_ERROR for non-existent files", async () => {
    const templates = await loadAllTemplates();
    await expect(
      toolExportAnalysisReport(
        "/tmp/nonexistent-legal-report-xyz.txt",
        undefined,
        templates,
        CONFIG,
      ),
    ).rejects.toMatchObject({ mcpCode: "internal_error" });
  });

  it("should include confidence score bars in the clause table", async () => {
    const templates = await loadAllTemplates();
    const filePath = await writeTempFile(SYNTHETIC_NDA);

    try {
      const result = await toolExportAnalysisReport(
        filePath,
        undefined,
        templates,
        CONFIG,
      );
      // Confidence bar markup uses percentage widths
      expect(result).toContain("width:");
      expect(result).toContain("%");
    } finally {
      await unlink(filePath);
    }
  });

  it("should include severity badges in findings table when risks are present", async () => {
    const templates = await loadAllTemplates();
    // Document missing termination clause will trigger NDA term_duration rule
    const filePath = await writeTempFile(`
MUTUAL NON-DISCLOSURE AGREEMENT
CONFIDENTIALITY: Both parties agree to maintain confidentiality.
LIMITATION OF LIABILITY: Liability is unlimited for any breach.
    `);

    try {
      const result = await toolExportAnalysisReport(filePath, "NDA", templates, CONFIG);
      // Should have severity badges (inline-block spans with colours)
      expect(result).toContain("display:inline-block");
    } finally {
      await unlink(filePath);
    }
  });
});
