import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadAllTemplates, getTemplate, listTemplates } from "../src/templates.js";

describe("loadAllTemplates", () => {
  it("should load the three bundled templates", async () => {
    const templates = await loadAllTemplates();
    expect(templates.size).toBeGreaterThanOrEqual(3);
  });

  it("should load the NDA template", async () => {
    const templates = await loadAllTemplates();
    const nda = getTemplate(templates, "NDA");
    expect(nda).toBeDefined();
    expect(nda?.name).toBe("NDA");
  });

  it("should load the Employment Agreement template", async () => {
    const templates = await loadAllTemplates();
    const employment = getTemplate(templates, "Employment Agreement");
    expect(employment).toBeDefined();
    expect(employment?.name).toBe("Employment Agreement");
  });

  it("should load the SaaS Customer Agreement template", async () => {
    const templates = await loadAllTemplates();
    const saas = getTemplate(templates, "SaaS Customer Agreement");
    expect(saas).toBeDefined();
    expect(saas?.name).toBe("SaaS Customer Agreement");
  });

  it("should return undefined for unknown template names", async () => {
    const templates = await loadAllTemplates();
    expect(getTemplate(templates, "NonExistentTemplate")).toBeUndefined();
  });

  it("should perform case-insensitive template lookup", async () => {
    const templates = await loadAllTemplates();
    expect(getTemplate(templates, "nda")).toBeDefined();
    expect(getTemplate(templates, "NDA")).toBeDefined();
  });
});

describe("listTemplates", () => {
  it("should return an array of template summaries", async () => {
    const templates = await loadAllTemplates();
    const list = listTemplates(templates);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it("should include name, description, and version for each template", async () => {
    const templates = await loadAllTemplates();
    const list = listTemplates(templates);
    for (const item of list) {
      expect(typeof item.name).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(typeof item.version).toBe("string");
    }
  });
});

describe("loadAllTemplates — custom directory", () => {
  it("should return only bundled templates when customDir does not exist", async () => {
    const bundled = await loadAllTemplates();
    const withNonExistentDir = await loadAllTemplates("/tmp/nonexistent-custom-dir-xyz");
    // Both should have the same keys since the custom dir is missing
    expect(withNonExistentDir.size).toBe(bundled.size);
  });

  it("should merge custom templates from a valid directory, overriding bundled ones", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-"));
    const customTemplateYaml = `
name: NDA
description: Custom NDA override for testing
version: 99.0.0
rules: []
`;
    await writeFile(join(customDir, "custom-nda.yaml"), customTemplateYaml, "utf-8");

    const templates = await loadAllTemplates(customDir);
    const nda = getTemplate(templates, "NDA");
    // The custom template should override the bundled one
    expect(nda?.version).toBe("99.0.0");
    expect(nda?.description).toBe("Custom NDA override for testing");
  });

  it("should load .yml extension templates as well", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-yml-"));
    const ymlTemplate = `
name: YML Test Template
description: A template using .yml extension
version: 1.0.0
rules: []
`;
    await writeFile(join(customDir, "test.yml"), ymlTemplate, "utf-8");

    const templates = await loadAllTemplates(customDir);
    const ymlTest = getTemplate(templates, "YML Test Template");
    expect(ymlTest).toBeDefined();
    expect(ymlTest?.version).toBe("1.0.0");
  });

  it("should skip files that are not .yaml or .yml", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-skip-"));
    await writeFile(join(customDir, "README.txt"), "not a template", "utf-8");
    await writeFile(join(customDir, "template.json"), '{"name":"JSON"}', "utf-8");

    const bundled = await loadAllTemplates();
    const withCustom = await loadAllTemplates(customDir);
    // Only bundled templates should be loaded (the txt/json files should be ignored)
    expect(withCustom.size).toBe(bundled.size);
  });

  it("should silently skip malformed YAML template files", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-bad-"));
    // Missing required 'rules' field
    await writeFile(
      join(customDir, "bad-template.yaml"),
      "name: Bad Template\ndescription: missing rules field\nversion: 1.0.0\n",
      "utf-8",
    );

    // Should not throw; malformed template is silently skipped
    const bundled = await loadAllTemplates();
    const withBad = await loadAllTemplates(customDir);
    // The bad template should not be added
    expect(withBad.size).toBe(bundled.size);
  });

  it("should silently skip completely invalid YAML content", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-invalid-"));
    await writeFile(
      join(customDir, "invalid.yaml"),
      ": this is not valid yaml: [unclosed",
      "utf-8",
    );

    const bundled = await loadAllTemplates();
    const withInvalid = await loadAllTemplates(customDir);
    expect(withInvalid.size).toBe(bundled.size);
  });

  it("should silently skip YAML that parses to a non-object (null/scalar)", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-null-"));
    // YAML that parses to null (just a tilde)
    await writeFile(join(customDir, "null-template.yaml"), "~\n", "utf-8");

    const bundled = await loadAllTemplates();
    const withNull = await loadAllTemplates(customDir);
    expect(withNull.size).toBe(bundled.size);
  });

  it("should silently skip YAML that parses to a plain string", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-str-"));
    // YAML that parses to a plain string
    await writeFile(join(customDir, "string-template.yaml"), "just a string\n", "utf-8");

    const bundled = await loadAllTemplates();
    const withStr = await loadAllTemplates(customDir);
    expect(withStr.size).toBe(bundled.size);
  });

  it("should add new custom templates that don't conflict with bundled ones", async () => {
    const customDir = await mkdtemp(join(tmpdir(), "custom-templates-new-"));
    const newTemplate = `
name: Custom Vendor SLA
description: A custom SLA template for vendor agreements
version: 2.0.0
rules:
  - id: sla_uptime
    description: Check for SLA uptime clause
    severity: high
    clause_type: warranty
    flag_if_missing: true
    message: Add an SLA uptime clause
`;
    await writeFile(join(customDir, "sla.yaml"), newTemplate, "utf-8");

    const bundled = await loadAllTemplates();
    const withCustom = await loadAllTemplates(customDir);
    // Custom template should be added in addition to bundled ones
    expect(withCustom.size).toBe(bundled.size + 1);
    const custom = getTemplate(withCustom, "Custom Vendor SLA");
    expect(custom).toBeDefined();
    expect(custom?.version).toBe("2.0.0");
    expect(custom?.rules.length).toBe(1);
  });
});

describe("NDA template rules", () => {
  it("should have at least one rule", async () => {
    const templates = await loadAllTemplates();
    const nda = getTemplate(templates, "NDA");
    expect(nda?.rules.length).toBeGreaterThan(0);
  });

  it("should have valid severity levels in all rules", async () => {
    const templates = await loadAllTemplates();
    const validSeverities = new Set(["low", "medium", "high", "critical"]);
    for (const [, template] of templates) {
      for (const rule of template.rules) {
        expect(validSeverities.has(rule.severity)).toBe(true);
      }
    }
  });

  it("should have term_duration rule flagged as missing", async () => {
    const templates = await loadAllTemplates();
    const nda = getTemplate(templates, "NDA");
    const rule = nda?.rules.find((r) => r.id === "term_duration");
    expect(rule?.flag_if_missing).toBe(true);
  });

  it("should have unlimited_liability rule with pattern", async () => {
    const templates = await loadAllTemplates();
    const nda = getTemplate(templates, "NDA");
    const rule = nda?.rules.find((r) => r.id === "unlimited_liability");
    expect(rule?.pattern).toBeDefined();
    expect(rule?.severity).toBe("critical");
  });
});
