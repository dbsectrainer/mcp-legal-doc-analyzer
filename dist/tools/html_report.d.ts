import type { ServerConfig, Template } from "../types.js";
/**
 * export_analysis_report tool handler.
 * Generates a single-file HTML report with all analysis inline.
 */
export declare function toolExportAnalysisReport(
  filePath: string,
  templateName: string | undefined,
  templates: Map<string, Template>,
  config: ServerConfig,
): Promise<string>;
