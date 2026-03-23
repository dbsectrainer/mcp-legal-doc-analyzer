import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { createAuthMiddleware } from "./auth.js";
import { createRateLimiter } from "./rate-limiter.js";
export async function startHttpServer(port) {
  const mcpServer = createServer();
  const app = express();
  // Parse raw body as Buffer so we can forward it to the MCP transport
  app.use(express.raw({ type: "*/*", limit: "10mb" }));
  // Apply auth and rate-limiting before the /mcp route
  app.use("/mcp", createAuthMiddleware());
  app.use("/mcp", createRateLimiter(60, 60_000));
  // Handle DELETE — method not allowed
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed" });
  });
  // POST handler: forward the buffered body to the MCP transport
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await mcpServer.connect(transport);
    let body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      try {
        body = JSON.parse(req.body.toString("utf-8"));
      } catch {
        body = undefined;
      }
    }
    await transport.handleRequest(req, res, body);
  });
  // GET handler: SSE / streaming
  app.get("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  });
  // Catch-all 404 for any other path
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.listen(port, () => {
    console.error(`MCP Legal Doc Analyzer HTTP server listening on port ${port}`);
  });
}
