import { parseDocument } from "./parser.js";
import { extractClauses } from "./extractor.js";
import { getTemplate } from "./templates.js";
/**
 * Analyze a portfolio of contract files with configurable concurrency.
 *
 * @param db            better-sqlite3 Database instance (reserved for future persistence)
 * @param filePaths     Array of absolute file paths to analyze
 * @param templateName  Name of the compliance template to apply
 * @param options       confidenceThreshold and concurrency (default: 4)
 * @param templates     Map of available templates (keyed by name)
 * @param onProgress    Optional callback called after each file is processed
 */
export async function bulkAnalyze(
  db,
  filePaths,
  templateName,
  options,
  templates,
  onProgress,
) {
  const template = getTemplate(templates, templateName);
  if (!template) {
    throw Object.assign(
      new Error(
        `Template "${templateName}" not found. Use list_templates to see available templates.`,
      ),
      { mcpCode: "invalid_params" },
    );
  }
  const confidenceThreshold = options.confidenceThreshold ?? 0.6;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const results = new Array(filePaths.length);
  let completed = 0;
  async function processFile(filePath, index) {
    let result;
    try {
      const doc = await parseDocument(filePath, { enableOcr: options.enableOcr });
      const clauses = extractClauses(doc.text, confidenceThreshold);
      result = { filePath, success: true, clauseCount: clauses.length, clauses };
    } catch (err) {
      result = {
        filePath,
        success: false,
        clauseCount: 0,
        clauses: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
    results[index] = result;
    completed++;
    if (onProgress) onProgress(completed, filePaths.length, filePath, result);
  }
  // Process in batches of `concurrency`
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    await Promise.all(batch.map((fp, j) => processFile(fp, i + j)));
  }
  void db; // reserved for future persistence
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  const totalClauses = results.reduce((sum, r) => sum + r.clauseCount, 0);
  return {
    results,
    summary: { total: results.length, succeeded, failed, totalClauses },
  };
}
