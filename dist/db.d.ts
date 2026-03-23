import type { DocumentAnalysis, ExtractedClause } from "./types.js";
export declare class LegalDb {
    private db;
    constructor(dbPath: string);
    saveAnalysis(analysis: DocumentAnalysis): void;
    saveClauses(analysisId: string, clauses: ExtractedClause[]): void;
    getAnalysis(id: string): DocumentAnalysis | undefined;
    listAnalyses(): DocumentAnalysis[];
    close(): void;
}
export declare function createDb(dbPath: string): Promise<LegalDb>;
