#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { expandHome } from "./utils.js";
import { startServer } from "./server.js";
import { startHttpServer } from "./http-server.js";
const argv = await yargs(hideBin(process.argv))
  .option("db", {
    alias: "db-path",
    type: "string",
    description: "Path to the SQLite database file",
    default: "~/.mcp/legal.db",
  })
  .option("confidence-threshold", {
    type: "number",
    description: "Minimum confidence score (0–1) to include clauses in results",
    default: 0.6,
  })
  .option("no-history", {
    type: "boolean",
    description: "Disable storing analysis results in the database",
    default: false,
  })
  .option("templates", {
    alias: "templates-dir",
    type: "string",
    description: "Path to a directory containing custom YAML templates",
  })
  .option("clause-patterns", {
    type: "string",
    description:
      "Path to a YAML file defining custom clause patterns (see custom-clause-patterns.example.yaml)",
  })
  .option("bulk-concurrency", {
    type: "number",
    description:
      "Number of files to process in parallel during bulk_analyze (default: 4)",
    default: 4,
  })
  .option("ocr", {
    type: "boolean",
    description:
      "Enable OCR fallback for scanned PDFs that contain no text layer. Requires optional dependencies: tesseract.js, pdfjs-dist, and canvas",
    default: false,
  })
  .option("http-port", {
    type: "number",
    description:
      "Start the server in Streamable HTTP mode on the given port instead of stdio",
  })
  .strict()
  .help()
  .parseAsync();
const config = {
  dbPath: expandHome(argv.db),
  confidenceThreshold: argv["confidence-threshold"],
  noHistory: argv["no-history"],
  templatesDir: argv.templates ? expandHome(argv.templates) : undefined,
  clausePatternsFile: argv["clause-patterns"]
    ? expandHome(argv["clause-patterns"])
    : undefined,
  bulkConcurrency: argv["bulk-concurrency"],
  enableOcr: argv.ocr,
};
if (argv["http-port"] !== undefined) {
  await startHttpServer(argv["http-port"]);
} else {
  await startServer(config);
}
