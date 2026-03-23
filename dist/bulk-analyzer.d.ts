import type Database from "better-sqlite3";
import type { Template, ExtractedClause } from "./types.js";
export interface BulkResult {
    filePath: string;
    success: boolean;
    clauseCount: number;
    clauses: ExtractedClause[];
    error?: string;
}
export interface BulkSummary {
    total: number;
    succeeded: number;
    failed: number;
    totalClauses: number;
}
export interface BulkAnalysisResult {
    results: BulkResult[];
    summary: BulkSummary;
}
export type ProgressCallback = (index: number, total: number, filePath: string, result: BulkResult) => void;
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
export declare function bulkAnalyze(db: Database.Database, filePaths: string[], templateName: string, options: {
    confidenceThreshold?: number;
    concurrency?: number;
    enableOcr?: boolean;
}, templates: Map<string, Template>, onProgress?: ProgressCallback): Promise<BulkAnalysisResult>;
