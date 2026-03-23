/**
 * Tests for src/tools/templates.ts (toolListTemplates)
 * Previously had ~9.5% coverage because the function was never called directly.
 */
import { describe, it, expect } from "vitest";
import { toolListTemplates } from "../src/tools/templates.js";
import { loadAllTemplates } from "../src/templates.js";
import type { Template } from "../src/types.js";

describe("toolListTemplates", () => {
  it("should return a string containing the header", async () => {
    const templates = await loadAllTemplates();
    const result = toolListTemplates(templates);
    expect(result).toContain("## Available Compliance Templates");
  });

  it("should list all loaded template names", async () => {
    const templates = await loadAllTemplates();
    const result = toolListTemplates(templates);
    expect(result).toContain("NDA");
    expect(result).toContain("Employment Agreement");
    expect(result).toContain("SaaS Customer Agreement");
  });

  it("should include total template count", async () => {
    const templates = await loadAllTemplates();
    const result = toolListTemplates(templates);
    expect(result).toMatch(/\*\*Total templates:\*\* \d+/);
  });

  it("should include description and version fields for each template", async () => {
    const templates = await loadAllTemplates();
    const result = toolListTemplates(templates);
    expect(result).toContain("**Description:**");
    expect(result).toContain("**Version:**");
  });

  it("should return 'No templates are currently available' for an empty map", () => {
    const empty = new Map<string, Template>();
    const result = toolListTemplates(empty);
    expect(result).toContain("No templates are currently available.");
    expect(result).toContain("**Total templates:** 0");
  });

  it("should format a single template correctly", () => {
    const singleTemplate = new Map<string, Template>([
      [
        "test template",
        {
          name: "Test Template",
          description: "A test compliance template",
          version: "1.0.0",
          rules: [],
        },
      ],
    ]);
    const result = toolListTemplates(singleTemplate);
    expect(result).toContain("### Test Template");
    expect(result).toContain("**Description:** A test compliance template");
    expect(result).toContain("**Version:** 1.0.0");
    expect(result).toContain("**Total templates:** 1");
  });

  it("should handle multiple templates without errors", async () => {
    const templates = await loadAllTemplates();
    expect(() => toolListTemplates(templates)).not.toThrow();
  });
});
