import { describe, it, expect } from "vitest";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createServer, isCancelled } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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

async function writeTempFile(content: string, ext = ".txt"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "server-test-"));
  const filePath = join(dir, `contract${ext}`);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

/**
 * Helper: spin up a connected server+client pair using InMemoryTransport.
 */
async function createConnectedClient(config?: ServerConfig) {
  const server = createServer(config ?? CONFIG);
  const client = new Client({ name: "test-client", version: "1.0.0" });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { server, client };
}

// ---------------------------------------------------------------------------
// createServer basics
// ---------------------------------------------------------------------------
describe("createServer", () => {
  it("should return a Server instance", () => {
    const server = createServer(CONFIG);
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
  });

  it("should use a default config when called without arguments", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("should create independent server instances", () => {
    const serverA = createServer(CONFIG);
    const serverB = createServer(CONFIG);
    expect(serverA).not.toBe(serverB);
  });
});

// ---------------------------------------------------------------------------
// isCancelled
// ---------------------------------------------------------------------------
describe("isCancelled", () => {
  it("should return false for unknown request IDs", () => {
    expect(isCancelled("completely-unknown-id-xyz")).toBe(false);
  });

  it("should return false for an empty string request ID", () => {
    expect(isCancelled("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ListTools handler
// ---------------------------------------------------------------------------
describe("server — list_tools", () => {
  it("should list all 9 registered tools", async () => {
    const { client } = await createConnectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("extract_clauses");
    expect(names).toContain("flag_risks");
    expect(names).toContain("summarize_terms");
    expect(names).toContain("list_templates");
    expect(names).toContain("check_compliance");
    expect(names).toContain("compare_versions");
    expect(names).toContain("export_analysis_report");
    expect(names).toContain("export_audit_log");
    expect(names).toContain("bulk_analyze");
    expect(tools.length).toBe(9);
  });

  it("each tool should have a name, description, and inputSchema", async () => {
    const { client } = await createConnectedClient();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// CallTool — extract_clauses
// ---------------------------------------------------------------------------
describe("server — call_tool extract_clauses", () => {
  it("should extract clauses from a TXT file", async () => {
    const { client } = await createConnectedClient();
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      const result = await client.callTool({
        name: "extract_clauses",
        arguments: { file_path: filePath },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("## Extracted Clauses");
    } finally {
      await unlink(filePath);
    }
  });

  it("should return an error for empty file_path", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({ name: "extract_clauses", arguments: { file_path: "" } }),
    ).rejects.toThrow();
  });

  it("should return an error for missing file_path", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({ name: "extract_clauses", arguments: {} }),
    ).rejects.toThrow();
  });

  it("should throw for an unsupported file extension", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({
        name: "extract_clauses",
        arguments: { file_path: "/tmp/contract.xlsx" },
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CallTool — flag_risks
// ---------------------------------------------------------------------------
describe("server — call_tool flag_risks", () => {
  it("should return risk analysis for a TXT file", async () => {
    const { client } = await createConnectedClient();
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      const result = await client.callTool({
        name: "flag_risks",
        arguments: { file_path: filePath, template: "NDA" },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("## Risk Analysis");
    } finally {
      await unlink(filePath);
    }
  });

  it("should default to NDA template when template not provided", async () => {
    const { client } = await createConnectedClient();
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      const result = await client.callTool({
        name: "flag_risks",
        arguments: { file_path: filePath },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("**Template:** NDA");
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw for empty file_path", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({ name: "flag_risks", arguments: { file_path: "" } }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CallTool — summarize_terms
// ---------------------------------------------------------------------------
describe("server — call_tool summarize_terms", () => {
  it("should return plain-English summary for a TXT file", async () => {
    const { client } = await createConnectedClient();
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      const result = await client.callTool({
        name: "summarize_terms",
        arguments: { file_path: filePath },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("## Plain-English Summary");
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw for empty file_path", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({ name: "summarize_terms", arguments: { file_path: "  " } }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CallTool — list_templates
// ---------------------------------------------------------------------------
describe("server — call_tool list_templates", () => {
  it("should list available templates", async () => {
    const { client } = await createConnectedClient();
    const result = await client.callTool({
      name: "list_templates",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Available Compliance Templates");
    expect(text).toContain("NDA");
  });
});

// ---------------------------------------------------------------------------
// CallTool — check_compliance
// ---------------------------------------------------------------------------
describe("server — call_tool check_compliance", () => {
  it("should run compliance check for a TXT file", async () => {
    const { client } = await createConnectedClient();
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      const result = await client.callTool({
        name: "check_compliance",
        arguments: { file_path: filePath, template: "NDA" },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("## Compliance Check");
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw for empty file_path", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({ name: "check_compliance", arguments: { file_path: "" } }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CallTool — compare_versions
// ---------------------------------------------------------------------------
describe("server — call_tool compare_versions", () => {
  it("should compare two TXT versions", async () => {
    const { client } = await createConnectedClient();
    const pathA = await writeTempFile(SYNTHETIC_NDA);
    const pathB = await writeTempFile(
      SYNTHETIC_NDA + "\nPAYMENT TERMS: Monthly fees apply.",
    );
    try {
      const result = await client.callTool({
        name: "compare_versions",
        arguments: { file_path_a: pathA, file_path_b: pathB },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Version A:");
    } finally {
      await unlink(pathA);
      await unlink(pathB);
    }
  });

  it("should throw for empty file_path_a", async () => {
    const { client } = await createConnectedClient();
    const pathB = await writeTempFile(SYNTHETIC_NDA);
    try {
      await expect(
        client.callTool({
          name: "compare_versions",
          arguments: { file_path_a: "", file_path_b: pathB },
        }),
      ).rejects.toThrow();
    } finally {
      await unlink(pathB);
    }
  });

  it("should throw for empty file_path_b", async () => {
    const { client } = await createConnectedClient();
    const pathA = await writeTempFile(SYNTHETIC_NDA);
    try {
      await expect(
        client.callTool({
          name: "compare_versions",
          arguments: { file_path_a: pathA, file_path_b: "" },
        }),
      ).rejects.toThrow();
    } finally {
      await unlink(pathA);
    }
  });
});

// ---------------------------------------------------------------------------
// CallTool — export_analysis_report
// ---------------------------------------------------------------------------
describe("server — call_tool export_analysis_report", () => {
  it("should export an HTML report for a TXT file", async () => {
    const { client } = await createConnectedClient();
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      const result = await client.callTool({
        name: "export_analysis_report",
        arguments: { file_path: filePath },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toMatch(/<!DOCTYPE html>/i);
    } finally {
      await unlink(filePath);
    }
  });

  it("should export HTML report with template when specified", async () => {
    const { client } = await createConnectedClient();
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      const result = await client.callTool({
        name: "export_analysis_report",
        arguments: { file_path: filePath, template: "NDA" },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("NDA");
    } finally {
      await unlink(filePath);
    }
  });

  it("should throw for empty file_path", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({
        name: "export_analysis_report",
        arguments: { file_path: "" },
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CallTool — unknown tool
// ---------------------------------------------------------------------------
describe("server — call_tool unknown", () => {
  it("should throw MethodNotFound for an unknown tool name", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({ name: "nonexistent_tool", arguments: {} }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CallTool — error handling: non-McpError bubbles as InternalError
// ---------------------------------------------------------------------------
describe("server — call_tool error propagation", () => {
  it("should return InternalError when file does not exist", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.callTool({
        name: "extract_clauses",
        arguments: { file_path: "/tmp/server-test-nonexistent-xyz.txt" },
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// emitLowConfidenceWarning — triggered when extract_clauses runs with a low threshold
// on a document that has at least one clause scoring below 0.7
// ---------------------------------------------------------------------------
describe("server — low confidence warning (emitLowConfidenceWarning)", () => {
  it("should complete extraction with very low threshold (triggers low-confidence path)", async () => {
    // A low confidence threshold (0.1) ensures even low-scoring clauses are included,
    // which triggers emitLowConfidenceWarning for clauses scoring < 0.7
    const { client } = await createConnectedClient({
      dbPath: ":memory:",
      confidenceThreshold: 0.1,
      noHistory: true,
    });
    const filePath = await writeTempFile(
      "This agreement has a warranty provision and dispute resolution clause.",
    );
    try {
      const result = await client.callTool({
        name: "extract_clauses",
        arguments: { file_path: filePath },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      // With low threshold many clauses are included; some will be low confidence
      expect(text).toContain("## Extracted Clauses");
    } finally {
      await unlink(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// ListResources handler
// ---------------------------------------------------------------------------
describe("server — list_resources", () => {
  it("should return empty resources list when noHistory=true", async () => {
    const { client } = await createConnectedClient();
    const result = await client.listResources();
    expect(result.resources).toEqual([]);
  });

  it("should return resources after analysis when noHistory=false", async () => {
    const { client } = await createConnectedClient({
      ...CONFIG,
      noHistory: false,
    });
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      // Run extract_clauses to populate DB
      await client.callTool({
        name: "extract_clauses",
        arguments: { file_path: filePath },
      });
      const result = await client.listResources();
      expect(result.resources.length).toBeGreaterThan(0);
      expect(result.resources[0].uri).toMatch(/^legal:\/\//);
    } finally {
      await unlink(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// ReadResource handler
// ---------------------------------------------------------------------------
describe("server — read_resource", () => {
  it("should throw for an unrecognised resource URI", async () => {
    const { client } = await createConnectedClient();
    await expect(client.readResource({ uri: "invalid://foo/bar" })).rejects.toThrow();
  });

  it("should throw InternalError reading resource when noHistory=true", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.readResource({ uri: "legal://some-id/clauses" }),
    ).rejects.toThrow();
  });

  it("should throw for a valid URI format but unknown ID when noHistory=false", async () => {
    const { client } = await createConnectedClient({
      ...CONFIG,
      noHistory: false,
    });
    await expect(
      client.readResource({ uri: "legal://nonexistent-id-xyz/clauses" }),
    ).rejects.toThrow();
  });

  it("should return resource content for a valid analysis ID", async () => {
    const { client } = await createConnectedClient({
      ...CONFIG,
      noHistory: false,
    });
    const filePath = await writeTempFile(SYNTHETIC_NDA);
    try {
      await client.callTool({
        name: "extract_clauses",
        arguments: { file_path: filePath },
      });
      const { resources } = await client.listResources();
      expect(resources.length).toBeGreaterThan(0);

      const uri = resources[0].uri;
      const resource = await client.readResource({ uri });
      expect(resource.contents[0].text).toContain("# Clauses for document:");
    } finally {
      await unlink(filePath);
    }
  });
});

// ---------------------------------------------------------------------------
// ListPrompts handler
// ---------------------------------------------------------------------------
describe("server — list_prompts", () => {
  it("should list the review-contract prompt", async () => {
    const { client } = await createConnectedClient();
    const result = await client.listPrompts();
    expect(result.prompts.length).toBe(1);
    expect(result.prompts[0].name).toBe("review-contract");
  });

  it("review-contract prompt should have file_path and template arguments", async () => {
    const { client } = await createConnectedClient();
    const { prompts } = await client.listPrompts();
    const prompt = prompts[0];
    const argNames = prompt.arguments?.map((a) => a.name) ?? [];
    expect(argNames).toContain("file_path");
    expect(argNames).toContain("template");
  });
});

// ---------------------------------------------------------------------------
// GetPrompt handler
// ---------------------------------------------------------------------------
describe("server — get_prompt", () => {
  it("should return the review-contract prompt with file_path substituted", async () => {
    const { client } = await createConnectedClient();
    const result = await client.getPrompt({
      name: "review-contract",
      arguments: { file_path: "/contracts/nda.txt", template: "NDA" },
    });
    expect(result.messages.length).toBe(1);
    const text = result.messages[0].content.text as string;
    expect(text).toContain("/contracts/nda.txt");
    expect(text).toContain("NDA");
  });

  it("should use placeholder when file_path is not provided", async () => {
    const { client } = await createConnectedClient();
    const result = await client.getPrompt({
      name: "review-contract",
      arguments: {},
    });
    const text = result.messages[0].content.text as string;
    expect(text).toContain("<file_path>");
  });

  it("should default template to NDA when not provided", async () => {
    const { client } = await createConnectedClient();
    const result = await client.getPrompt({
      name: "review-contract",
      arguments: { file_path: "/contracts/test.txt" },
    });
    const text = result.messages[0].content.text as string;
    expect(text).toContain("NDA");
  });

  it("should throw for an unknown prompt name", async () => {
    const { client } = await createConnectedClient();
    await expect(
      client.getPrompt({ name: "nonexistent-prompt", arguments: {} }),
    ).rejects.toThrow();
  });
});
