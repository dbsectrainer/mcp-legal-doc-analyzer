export interface ExtractedClause {
    type: string;
    text: string;
    confidence: number;
    start_index: number;
    end_index: number;
    low_confidence: boolean;
}
export interface RiskFinding {
    rule_id: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    clause_type: string;
    matched_clause?: ExtractedClause;
    flag_type: "pattern_match" | "missing_clause";
}
export interface TemplateRule {
    id: string;
    description: string;
    clause_type: string;
    pattern?: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    flag_if_missing: boolean;
}
export interface Template {
    name: string;
    description: string;
    version: string;
    rules: TemplateRule[];
}
export interface DocumentAnalysis {
    id: string;
    file_path: string;
    file_hash: string;
    file_type: string;
    analyzed_at: number;
    clause_count: number;
    risk_count: number;
    template_used?: string;
}
export interface ParsedDocument {
    text: string;
    file_type: "pdf" | "docx" | "txt";
    file_path: string;
    file_hash: string;
    ocr_used?: boolean;
}
export interface ServerConfig {
    dbPath: string;
    confidenceThreshold: number;
    noHistory: boolean;
    templatesDir?: string;
    clausePatternsFile?: string;
    bulkConcurrency?: number;
    enableOcr?: boolean;
}
