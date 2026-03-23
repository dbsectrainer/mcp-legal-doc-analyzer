import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { canAnalyze } from "../src/access-control.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let policyPath: string;

function writePolicyYaml(content: string): void {
  writeFileSync(policyPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("canAnalyze — no policy file", () => {
  it("allows everything when policy file does not exist", () => {
    expect(canAnalyze("NDA", "agent-x", "/tmp/nonexistent-policy-xyz.yaml")).toBe(true);
    expect(canAnalyze("M&A", "agent-x", "/tmp/nonexistent-policy-xyz.yaml")).toBe(true);
  });
});

describe("canAnalyze — with YAML policy", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "access-control-test-"));
    policyPath = join(tempDir, "policy.yaml");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("allows doc type in allow_doc_types list", () => {
    writePolicyYaml(`
policies:
  - agent_id: "agent-x"
    allow_doc_types: ["NDA", "employment"]
    deny_doc_types: []
`);
    expect(canAnalyze("NDA", "agent-x", policyPath)).toBe(true);
    expect(canAnalyze("employment", "agent-x", policyPath)).toBe(true);
  });

  it("denies doc type in deny_doc_types list", () => {
    writePolicyYaml(`
policies:
  - agent_id: "agent-x"
    allow_doc_types: ["NDA"]
    deny_doc_types: ["M&A", "litigation"]
`);
    expect(canAnalyze("M&A", "agent-x", policyPath)).toBe(false);
    expect(canAnalyze("litigation", "agent-x", policyPath)).toBe(false);
  });

  it("deny takes precedence over allow when both lists contain the doc type", () => {
    writePolicyYaml(`
policies:
  - agent_id: "agent-x"
    allow_doc_types: ["NDA", "M&A"]
    deny_doc_types: ["M&A"]
`);
    expect(canAnalyze("M&A", "agent-x", policyPath)).toBe(false);
    expect(canAnalyze("NDA", "agent-x", policyPath)).toBe(true);
  });

  it("denies doc type not in allow_doc_types when allow list is specified", () => {
    writePolicyYaml(`
policies:
  - agent_id: "agent-x"
    allow_doc_types: ["NDA"]
`);
    expect(canAnalyze("employment", "agent-x", policyPath)).toBe(false);
  });

  it("allows everything for agent not in policy (open-by-default)", () => {
    writePolicyYaml(`
policies:
  - agent_id: "agent-x"
    allow_doc_types: ["NDA"]
    deny_doc_types: ["M&A"]
`);
    // agent-y has no policy → allow all
    expect(canAnalyze("M&A", "agent-y", policyPath)).toBe(true);
    expect(canAnalyze("litigation", "agent-y", policyPath)).toBe(true);
  });

  it("allows everything when agent policy has neither allow nor deny lists", () => {
    writePolicyYaml(`
policies:
  - agent_id: "agent-x"
`);
    expect(canAnalyze("NDA", "agent-x", policyPath)).toBe(true);
    expect(canAnalyze("M&A", "agent-x", policyPath)).toBe(true);
  });

  it("handles empty policies array gracefully", () => {
    writePolicyYaml(`
policies: []
`);
    expect(canAnalyze("NDA", "agent-x", policyPath)).toBe(true);
  });

  it("handles malformed YAML gracefully (returns allow)", () => {
    writeFileSync(policyPath, "{ invalid yaml: [", "utf-8");
    expect(canAnalyze("NDA", "agent-x", policyPath)).toBe(true);
  });

  it("multiple agents with independent policies", () => {
    writePolicyYaml(`
policies:
  - agent_id: "agent-a"
    allow_doc_types: ["NDA"]
    deny_doc_types: ["M&A"]
  - agent_id: "agent-b"
    allow_doc_types: ["M&A", "litigation"]
    deny_doc_types: ["NDA"]
`);
    expect(canAnalyze("NDA", "agent-a", policyPath)).toBe(true);
    expect(canAnalyze("M&A", "agent-a", policyPath)).toBe(false);
    expect(canAnalyze("M&A", "agent-b", policyPath)).toBe(true);
    expect(canAnalyze("NDA", "agent-b", policyPath)).toBe(false);
  });
});
