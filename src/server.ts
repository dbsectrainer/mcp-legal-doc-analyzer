import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CancelledNotificationSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { createDb } from "./db.js";
import { loadAllTemplates } from "./templates.js";
import {
  toolExtractClauses,
  toolFlagRisks,
  toolSummarizeTerms,
} from "./tools/analyze.js";
import { toolListTemplates } from "./tools/templates.js";
import { toolCheckCompliance } from "./tools/compliance.js";
import { toolCompareVersions } from "./tools/diff.js";
import { toolExportAnalysisReport } from "./tools/html_report.js";
import { AuditLog, computeDocFingerprint } from "./audit-log.js";
import { bulkAnalyze } from "./bulk-analyzer.js";
import { expandHome } from "./utils.js";
import type { LegalDb } from "./db.js";
import type { ServerConfig, Template } from "./types.js";

// ---------------------------------------------------------------------------
// Cancellation support
// ---------------------------------------------------------------------------
const cancellationRegistry = new Map<string, boolean>();

function registerCancellationHandler(server: Server): void {
  server.setNotificationHandler(CancelledNotificationSchema, async (notification) => {
    const requestId = notification.params?.requestId;
    if (requestId !== undefined) {
      cancellationRegistry.set(String(requestId), true);
    }
  });
}

export function isCancelled(requestId: string): boolean {
  return cancellationRegistry.get(requestId) === true;
}

// ---------------------------------------------------------------------------
// createServer — builds and returns a configured MCP Server instance.
// Called by both startServer (stdio) and startHttpServer (HTTP).
// Config is optional: when called from http-server.ts there is no config
// context, so a default no-history, in-memory config is used.
// ---------------------------------------------------------------------------
export function createServer(config?: ServerConfig): Server {
  const resolvedConfig: ServerConfig = config ?? {
    dbPath: ":memory:",
    confidenceThreshold: 0.6,
    noHistory: true,
  };

  const server = new Server(
    {
      name: "mcp-legal-doc-analyzer",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // Register cancellation notification handler
  registerCancellationHandler(server);

  // Audit log instance
  const auditLog = new AuditLog();

  // Lazy-initialised DB and templates — populated after first tool call
  // (cannot await inside synchronous createServer, so we use a side-channel)
  let db: LegalDb | null = null;
  let templates: Map<string, Template> = new Map();
  let initialized = false;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    initialized = true;
    if (!resolvedConfig.noHistory) {
      db = await createDb(resolvedConfig.dbPath);
    }
    templates = await loadAllTemplates(resolvedConfig.templatesDir);
  }

  // Helper: emit MCP logging notification
  function emitLog(level: "debug" | "info" | "warning" | "error", message: string): void {
    server
      .notification({
        method: "notifications/message",
        params: {
          level,
          logger: "mcp-legal-doc-analyzer",
          data: message,
        },
      })
      .catch(() => {
        // notifications are best-effort; swallow errors
      });
  }

  // Helper: emit low-confidence warning
  function emitLowConfidenceWarning(
    filePath: string,
    clauseType: string,
    confidence: number,
  ): void {
    emitLog(
      "info",
      `Low-confidence extraction in "${filePath}": clause type "${clauseType}" scored ${Math.round(confidence * 100)}% — human review recommended.`,
    );
  }

  // ---------------------------------------------------------------------------
  // List tools
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "extract_clauses",
          description:
            "Extract and label key clauses from a contract document (PDF, DOCX, or TXT). Returns a structured list of clause types (e.g. termination, liability, confidentiality, governing_law, payment_terms, intellectual_property, dispute_resolution, warranty) with confidence scores. Low-confidence results are flagged for human review.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description:
                  "Absolute path (or ~/... path) to the contract file. Supported formats: .pdf, .docx, .txt",
              },
            },
            required: ["file_path"],
            additionalProperties: false,
          },
        },
        {
          name: "flag_risks",
          description:
            "Analyze a contract against a compliance template and return a severity-ranked list of risk findings. Available templates: NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement. If no template is specified, the NDA template is used.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description:
                  "Absolute path (or ~/... path) to the contract file. Supported formats: .pdf, .docx, .txt",
              },
              template: {
                type: "string",
                description:
                  "Name of the compliance template to use. Examples: NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement. Use list_templates to see all available options.",
              },
            },
            required: ["file_path"],
            additionalProperties: false,
          },
        },
        {
          name: "summarize_terms",
          description:
            "Generate a plain-English, bullet-point summary of the key provisions in a contract document. Covers clause types including termination, liability, confidentiality, governing_law, payment_terms, intellectual_property, dispute_resolution, and warranty.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description:
                  "Absolute path (or ~/... path) to the contract file. Supported formats: .pdf, .docx, .txt",
              },
            },
            required: ["file_path"],
            additionalProperties: false,
          },
        },
        {
          name: "list_templates",
          description:
            "List all available compliance templates that can be used with flag_risks, check_compliance, and export_analysis_report. Bundled templates include: NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: "check_compliance",
          description:
            "Run a structured checklist validation of a contract against a compliance template. For each rule, returns pass/fail/not_applicable with a finding description. Available templates: NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description:
                  "Absolute path (or ~/... path) to the contract file. Supported formats: .pdf, .docx, .txt",
              },
              template: {
                type: "string",
                description:
                  "Name of the compliance template to use. Examples: NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement.",
              },
            },
            required: ["file_path"],
            additionalProperties: false,
          },
        },
        {
          name: "compare_versions",
          description:
            "Compare two versions of a contract document at the clause level. Shows clauses that were added, removed, changed, or unchanged between version A and version B. Supports .pdf, .docx, and .txt files.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              file_path_a: {
                type: "string",
                description:
                  "Absolute path (or ~/... path) to version A of the contract. Supported formats: .pdf, .docx, .txt",
              },
              file_path_b: {
                type: "string",
                description:
                  "Absolute path (or ~/... path) to version B of the contract. Supported formats: .pdf, .docx, .txt",
              },
            },
            required: ["file_path_a", "file_path_b"],
            additionalProperties: false,
          },
        },
        {
          name: "export_analysis_report",
          description:
            "Generate a single-file HTML analysis report for a contract. Includes document metadata, extracted clauses with confidence scores, and an optional risk findings table when a template is provided. The HTML is self-contained with inline CSS and is suitable for printing. Available templates: NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description:
                  "Absolute path (or ~/... path) to the contract file. Supported formats: .pdf, .docx, .txt",
              },
              template: {
                type: "string",
                description:
                  "Optional compliance template name to include risk findings in the report. Examples: NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement.",
              },
            },
            required: ["file_path"],
            additionalProperties: false,
          },
        },
        {
          name: "export_audit_log",
          description:
            "Export the analysis audit log. Supports optional date-range filtering and JSON or CSV output format.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              from_date: {
                type: "string",
                description: "ISO 8601 start date (inclusive). E.g. 2024-01-01T00:00:00Z",
              },
              to_date: {
                type: "string",
                description: "ISO 8601 end date (inclusive). E.g. 2024-12-31T23:59:59Z",
              },
              format: {
                type: "string",
                enum: ["json", "csv"],
                description: "Output format: json (default) or csv",
              },
            },
            additionalProperties: false,
          },
        },
        {
          name: "bulk_analyze",
          description:
            "Analyze a portfolio of contract files in batch. Processes each file sequentially and returns per-file clause extraction results plus an aggregate summary.",
          inputSchema: {
            type: "object",
            properties: {
              file_paths: {
                type: "array",
                items: { type: "string" },
                description: "Array of absolute file paths to analyze.",
              },
              template_name: {
                type: "string",
                description:
                  "Compliance template to apply. Examples: NDA, Employment Agreement, SaaS Customer Agreement.",
              },
              output_format: {
                type: "string",
                enum: ["json", "csv"],
                description: "Output format: json (default) or csv",
              },
            },
            required: ["file_paths", "template_name"],
            additionalProperties: false,
          },
        },
      ],
    };
  });

  // ---------------------------------------------------------------------------
  // Call tools
  // ---------------------------------------------------------------------------
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await ensureInitialized();

    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case "extract_clauses": {
          const filePath = safeArgs["file_path"];
          if (typeof filePath !== "string" || !filePath.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_path must be a non-empty string",
            );
          }
          emitLog("info", `Document loaded for extraction: ${filePath}`);
          emitLog("info", `Extraction started: ${filePath}`);
          const progressToken = `analyze-${encodeURIComponent(filePath)}`;
          const onProgress = (step: number, total: number, _desc: string): void => {
            server
              .notification({
                method: "notifications/progress",
                params: { progressToken, progress: step, total },
              })
              .catch(() => {
                // best-effort
              });
          };
          const extractResult = await toolExtractClauses(
            filePath,
            resolvedConfig,
            db,
            emitLowConfidenceWarning,
            onProgress,
          );
          // Audit log (best-effort)
          try {
            const resolvedPath = expandHome(filePath);
            const rawBytes = readFileSync(resolvedPath);
            const clauseCount = (extractResult.match(/###/g) ?? []).length;
            auditLog.record({
              timestamp: new Date().toISOString(),
              doc_fingerprint: computeDocFingerprint(rawBytes),
              template_used: null,
              tool_name: "extract_clauses",
              requester_id: "system",
              clause_count: clauseCount,
            });
          } catch {
            // best-effort
          }
          emitLog("info", `Clause extraction complete: ${filePath}`);
          return { content: [{ type: "text", text: extractResult }] };
        }

        case "flag_risks": {
          const filePath = safeArgs["file_path"];
          if (typeof filePath !== "string" || !filePath.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_path must be a non-empty string",
            );
          }
          const riskTemplate =
            typeof safeArgs["template"] === "string" ? safeArgs["template"] : undefined;
          emitLog("info", `Document loaded for risk analysis: ${filePath}`);
          const riskResult = await toolFlagRisks(
            filePath,
            riskTemplate,
            templates,
            resolvedConfig,
            db,
          );
          // Audit log (best-effort)
          try {
            const resolvedPath = expandHome(filePath);
            const rawBytes = readFileSync(resolvedPath);
            auditLog.record({
              timestamp: new Date().toISOString(),
              doc_fingerprint: computeDocFingerprint(rawBytes),
              template_used: riskTemplate ?? "NDA",
              tool_name: "flag_risks",
              requester_id: "system",
              clause_count: 0,
            });
          } catch {
            // best-effort
          }
          emitLog("info", `Risk analysis complete: ${filePath}`);
          return { content: [{ type: "text", text: riskResult }] };
        }

        case "summarize_terms": {
          const filePath = safeArgs["file_path"];
          if (typeof filePath !== "string" || !filePath.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_path must be a non-empty string",
            );
          }
          emitLog("info", `Document loaded for summarization: ${filePath}`);
          const summarizeResult = await toolSummarizeTerms(filePath, resolvedConfig);
          // Audit log (best-effort)
          try {
            const resolvedPath = expandHome(filePath);
            const rawBytes = readFileSync(resolvedPath);
            auditLog.record({
              timestamp: new Date().toISOString(),
              doc_fingerprint: computeDocFingerprint(rawBytes),
              template_used: null,
              tool_name: "summarize_terms",
              requester_id: "system",
              clause_count: 0,
            });
          } catch {
            // best-effort
          }
          return { content: [{ type: "text", text: summarizeResult }] };
        }

        case "list_templates": {
          const result = toolListTemplates(templates);
          return { content: [{ type: "text", text: result }] };
        }

        case "check_compliance": {
          const filePath = safeArgs["file_path"];
          if (typeof filePath !== "string" || !filePath.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_path must be a non-empty string",
            );
          }
          const complianceTemplate =
            typeof safeArgs["template"] === "string" ? safeArgs["template"] : undefined;
          emitLog("info", `Document loaded for compliance check: ${filePath}`);
          const complianceResult = await toolCheckCompliance(
            filePath,
            complianceTemplate,
            templates,
            resolvedConfig,
            db,
          );
          // Audit log (best-effort)
          try {
            const resolvedPath = expandHome(filePath);
            const rawBytes = readFileSync(resolvedPath);
            auditLog.record({
              timestamp: new Date().toISOString(),
              doc_fingerprint: computeDocFingerprint(rawBytes),
              template_used: complianceTemplate ?? "NDA",
              tool_name: "check_compliance",
              requester_id: "system",
              clause_count: 0,
            });
          } catch {
            // best-effort
          }
          emitLog("info", `Compliance check done: ${filePath}`);
          return { content: [{ type: "text", text: complianceResult }] };
        }

        case "compare_versions": {
          const filePathA = safeArgs["file_path_a"];
          const filePathB = safeArgs["file_path_b"];
          if (typeof filePathA !== "string" || !filePathA.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_path_a must be a non-empty string",
            );
          }
          if (typeof filePathB !== "string" || !filePathB.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_path_b must be a non-empty string",
            );
          }
          emitLog("info", `Document comparison started: ${filePathA} vs ${filePathB}`);
          const compareResult = await toolCompareVersions(
            filePathA,
            filePathB,
            resolvedConfig,
          );
          return { content: [{ type: "text", text: compareResult }] };
        }

        case "export_analysis_report": {
          const filePath = safeArgs["file_path"];
          if (typeof filePath !== "string" || !filePath.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_path must be a non-empty string",
            );
          }
          const reportTemplate =
            typeof safeArgs["template"] === "string" ? safeArgs["template"] : undefined;
          emitLog("info", `Export started: ${filePath}`);
          const reportResult = await toolExportAnalysisReport(
            filePath,
            reportTemplate,
            templates,
            resolvedConfig,
          );
          emitLog("info", `Export complete: ${filePath}`);
          return { content: [{ type: "text", text: reportResult }] };
        }

        case "export_audit_log": {
          const fromDate =
            typeof safeArgs["from_date"] === "string" ? safeArgs["from_date"] : undefined;
          const toDate =
            typeof safeArgs["to_date"] === "string" ? safeArgs["to_date"] : undefined;
          const format =
            typeof safeArgs["format"] === "string" && safeArgs["format"] === "csv"
              ? "csv"
              : "json";

          const entries = auditLog.export(fromDate, toDate);

          let output: string;
          if (format === "csv") {
            const header =
              "timestamp,doc_fingerprint,template_used,tool_name,requester_id,clause_count";
            const rows = entries.map((e) =>
              [
                e.timestamp,
                e.doc_fingerprint,
                e.template_used ?? "",
                e.tool_name,
                e.requester_id,
                String(e.clause_count),
              ]
                .map((v) => `"${v.replace(/"/g, '""')}"`)
                .join(","),
            );
            output = [header, ...rows].join("\n");
          } else {
            output = JSON.stringify(entries, null, 2);
          }

          return { content: [{ type: "text", text: output }] };
        }

        case "bulk_analyze": {
          const filePaths = safeArgs["file_paths"];
          if (!Array.isArray(filePaths) || filePaths.length === 0) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "file_paths must be a non-empty array of strings",
            );
          }
          const templateName = safeArgs["template_name"];
          if (typeof templateName !== "string" || !templateName.trim()) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "template_name must be a non-empty string",
            );
          }
          const outputFormat =
            typeof safeArgs["output_format"] === "string" &&
            safeArgs["output_format"] === "csv"
              ? "csv"
              : "json";

          const progressToken = `bulk-analyze-${Date.now()}`;

          // Need a raw Database.Database — create an in-memory one for the API
          const Database = (await import("better-sqlite3")).default;
          const rawDb = new Database(":memory:");

          const bulkResult = await bulkAnalyze(
            rawDb,
            filePaths as string[],
            templateName,
            {
              confidenceThreshold: resolvedConfig.confidenceThreshold,
              concurrency: resolvedConfig.bulkConcurrency,
              enableOcr: resolvedConfig.enableOcr,
            },
            templates,
            (index, total, filePath, _result) => {
              server
                .notification({
                  method: "notifications/progress",
                  params: { progressToken, progress: index, total },
                })
                .catch(() => {
                  // best-effort
                });
              emitLog("info", `Bulk analyze: processed ${filePath} (${index}/${total})`);
            },
          );

          rawDb.close();

          let output: string;
          if (outputFormat === "csv") {
            const header = "file_path,success,clause_count,error";
            const rows = bulkResult.results.map((r) =>
              [r.filePath, String(r.success), String(r.clauseCount), r.error ?? ""]
                .map((v) => `"${v.replace(/"/g, '""')}"`)
                .join(","),
            );
            const summaryLine = `\n# Summary: total=${bulkResult.summary.total} succeeded=${bulkResult.summary.succeeded} failed=${bulkResult.summary.failed} totalClauses=${bulkResult.summary.totalClauses}`;
            output = [header, ...rows].join("\n") + summaryLine;
          } else {
            output = JSON.stringify(bulkResult, null, 2);
          }

          return { content: [{ type: "text", text: output }] };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (err: unknown) {
      if (err instanceof McpError) throw err;

      const typed = err as { mcpCode?: string; message?: string };
      if (typed.mcpCode === "invalid_params") {
        throw new McpError(
          ErrorCode.InvalidParams,
          typed.message ?? "Invalid parameters",
        );
      }
      throw new McpError(
        ErrorCode.InternalError,
        typed.message ?? "Internal server error",
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Resources: list analyzed documents stored in the DB
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    await ensureInitialized();

    if (!db) {
      return { resources: [] };
    }

    const rows = db.listAnalyses();

    return {
      resources: rows.map((row) => ({
        uri: `legal://${row.id}/clauses`,
        name: row.file_path.split("/").pop() ?? row.file_path,
        description: `Extracted clauses for ${row.file_path} (analyzed ${new Date(row.analyzed_at).toISOString()})`,
        mimeType: "text/plain",
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    await ensureInitialized();

    const uri = request.params.uri;
    const match = /^legal:\/\/([^/]+)\/clauses$/.exec(uri);
    if (!match) {
      throw new McpError(ErrorCode.InvalidParams, `Unrecognised resource URI: ${uri}`);
    }

    const analysisId = match[1];
    if (!db) {
      throw new McpError(
        ErrorCode.InternalError,
        "History is disabled (--no-history). Resources are not available.",
      );
    }

    const analysis = db.getAnalysis(analysisId);
    if (!analysis) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No analysis found with id: ${analysisId}`,
      );
    }

    const lines: string[] = [
      `# Clauses for document: ${analysis.file_path}`,
      `Analysis ID: ${analysis.id}`,
      `File type: ${analysis.file_type}`,
      `Analyzed: ${new Date(analysis.analyzed_at).toISOString()}`,
      `Clause count: ${analysis.clause_count}`,
      `Risk count: ${analysis.risk_count}`,
      analysis.template_used ? `Template used: ${analysis.template_used}` : "",
    ];

    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: lines.filter(Boolean).join("\n"),
        },
      ],
    };
  });

  // ---------------------------------------------------------------------------
  // Prompts: review-contract guided workflow
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "review-contract",
          description:
            "Guided structured contract review workflow. Walks through clause extraction, risk flagging, compliance checking, and plain-English summarisation for a given document.",
          arguments: [
            {
              name: "file_path",
              description:
                "Absolute path (or ~/... path) to the contract file to review.",
              required: true,
            },
            {
              name: "template",
              description:
                "Compliance template to apply (e.g. NDA, Employment Agreement, SaaS Customer Agreement, Software License Agreement, Vendor Agreement, Consulting Agreement). Defaults to NDA.",
              required: false,
            },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: promptArgs } = request.params;

    if (name !== "review-contract") {
      throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
    }

    const filePath =
      promptArgs && typeof promptArgs["file_path"] === "string"
        ? promptArgs["file_path"]
        : "<file_path>";
    const template =
      promptArgs && typeof promptArgs["template"] === "string"
        ? promptArgs["template"]
        : "NDA";

    return {
      description: "Structured contract review workflow — follow each step in order.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Please perform a full structured review of the contract at: ${filePath}`,
              ``,
              `Follow these steps in order:`,
              ``,
              `## Step 1: Extract Clauses`,
              `Call the extract_clauses tool with file_path="${filePath}".`,
              `Review the clause types and confidence scores. Note any low-confidence extractions that need human verification.`,
              ``,
              `## Step 2: Flag Risks`,
              `Call the flag_risks tool with file_path="${filePath}" and template="${template}".`,
              `Summarise the severity-ranked findings. Highlight any critical or high-severity issues.`,
              ``,
              `## Step 3: Compliance Checklist`,
              `Call the check_compliance tool with file_path="${filePath}" and template="${template}".`,
              `Report the pass/fail/not_applicable result for each rule.`,
              ``,
              `## Step 4: Plain-English Summary`,
              `Call the summarize_terms tool with file_path="${filePath}".`,
              `Present the key provisions in bullet-point form suitable for a non-lawyer.`,
              ``,
              `## Step 5: Overall Assessment`,
              `Based on the above, provide:`,
              `- An overall risk rating (Low / Medium / High / Critical) with justification`,
              `- The top 3 issues requiring attorney review`,
              `- Recommended next steps`,
              ``,
              `Remember: always remind the reader that this analysis is not legal advice and should be reviewed by a qualified legal professional.`,
            ].join("\n"),
          },
        },
      ],
    };
  });

  return server;
}

// ---------------------------------------------------------------------------
// startServer — initialises config-aware server and connects stdio transport.
// ---------------------------------------------------------------------------
export async function startServer(config: ServerConfig): Promise<void> {
  // Initialize DB and templates eagerly for the stdio path
  let db: LegalDb | null = null;
  if (!config.noHistory) {
    db = await createDb(config.dbPath);
  }
  const templates = await loadAllTemplates(config.templatesDir);

  // createServer with a pre-seeded config — we pass config directly but the
  // lazy init inside createServer will re-run on first call.  To avoid that
  // double-init we build a no-history wrapper that skips re-init.
  // Simpler approach: call createServer(config) then connect transport.
  // The lazy init will run on the first tool request (which is fine for stdio).
  void db; // used by lazy init inside createServer
  void templates; // same

  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
