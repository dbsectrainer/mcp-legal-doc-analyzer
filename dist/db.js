import Database from "better-sqlite3";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import { expandHome } from "./utils.js";
const SCHEMA = `
CREATE TABLE IF NOT EXISTS document_analyses (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_type TEXT NOT NULL,
  analyzed_at INTEGER NOT NULL,
  clause_count INTEGER NOT NULL DEFAULT 0,
  risk_count INTEGER NOT NULL DEFAULT 0,
  template_used TEXT
);

CREATE TABLE IF NOT EXISTS extracted_clauses (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  clause_type TEXT NOT NULL,
  text TEXT NOT NULL,
  confidence REAL NOT NULL,
  low_confidence INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (analysis_id) REFERENCES document_analyses(id)
);
`;
export class LegalDb {
  db;
  constructor(dbPath) {
    this.db = new Database(expandHome(dbPath));
    this.db.exec(SCHEMA);
  }
  saveAnalysis(analysis) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO document_analyses
        (id, file_path, file_hash, file_type, analyzed_at, clause_count, risk_count, template_used)
      VALUES
        (@id, @file_path, @file_hash, @file_type, @analyzed_at, @clause_count, @risk_count, @template_used)
    `);
    stmt.run({
      ...analysis,
      // better-sqlite3 requires null (not undefined) for nullable columns
      template_used: analysis.template_used ?? null,
    });
  }
  saveClauses(analysisId, clauses) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO extracted_clauses
        (id, analysis_id, clause_type, text, confidence, low_confidence)
      VALUES
        (@id, @analysis_id, @clause_type, @text, @confidence, @low_confidence)
    `);
    const insertMany = this.db.transaction((rows) => {
      for (const row of rows) {
        stmt.run(row);
      }
    });
    insertMany(
      clauses.map((c, i) => ({
        id: `${analysisId}-${i}`,
        analysis_id: analysisId,
        clause_type: c.type,
        text: c.text,
        confidence: c.confidence,
        low_confidence: c.low_confidence ? 1 : 0,
      })),
    );
  }
  getAnalysis(id) {
    const row = this.db.prepare("SELECT * FROM document_analyses WHERE id = ?").get(id);
    return row;
  }
  listAnalyses() {
    const rows = this.db
      .prepare("SELECT * FROM document_analyses ORDER BY analyzed_at DESC")
      .all();
    return rows;
  }
  close() {
    this.db.close();
  }
}
export async function createDb(dbPath) {
  const resolvedPath = expandHome(dbPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  return new LegalDb(resolvedPath);
}
