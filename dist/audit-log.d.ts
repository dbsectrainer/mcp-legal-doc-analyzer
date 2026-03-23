export interface AuditEntry {
    timestamp: string;
    doc_fingerprint: string;
    template_used: string | null;
    tool_name: string;
    requester_id: string;
    clause_count: number;
}
/**
 * Compute SHA-256 fingerprint of raw document bytes.
 */
export declare function computeDocFingerprint(raw: Buffer | string): string;
/**
 * AuditLog records analysis events to a JSONL file without storing document content.
 */
export declare class AuditLog {
    private readonly filePath;
    constructor(filePath?: string);
    /**
     * Append an audit entry to the JSONL file.
     */
    record(entry: AuditEntry): void;
    /**
     * Read and return all audit entries, optionally filtered by ISO date range.
     *
     * @param from  ISO 8601 date string — include entries at or after this timestamp
     * @param to    ISO 8601 date string — include entries at or before this timestamp
     */
    export(from?: string, to?: string): AuditEntry[];
}
/** Singleton default instance */
export declare const auditLog: AuditLog;
