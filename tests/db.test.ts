import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LegalDb, createDb } from "../src/db.js";
import type { DocumentAnalysis, ExtractedClause } from "../src/types.js";

// Use in-memory SQLite for all tests
let db: LegalDb;

beforeEach(async () => {
  db = await createDb(":memory:");
});

afterEach(() => {
  db.close();
});

const SAMPLE_ANALYSIS: DocumentAnalysis = {
  id: "test-analysis-001",
  file_path: "/tmp/contract.txt",
  file_hash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  file_type: "txt",
  analyzed_at: Date.now(),
  clause_count: 3,
  risk_count: 1,
  template_used: "NDA",
};

const SAMPLE_CLAUSES: ExtractedClause[] = [
  {
    type: "confidentiality",
    text: "All information shall remain confidential.",
    confidence: 0.9,
    start_index: 0,
    end_index: 42,
    low_confidence: false,
  },
  {
    type: "termination",
    text: "Either party may terminate with 30 days notice.",
    confidence: 0.65,
    start_index: 43,
    end_index: 90,
    low_confidence: true,
  },
];

describe("LegalDb", () => {
  describe("saveAnalysis / getAnalysis", () => {
    it("should save and retrieve an analysis by id", () => {
      db.saveAnalysis(SAMPLE_ANALYSIS);
      const retrieved = db.getAnalysis(SAMPLE_ANALYSIS.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(SAMPLE_ANALYSIS.id);
      expect(retrieved?.file_path).toBe(SAMPLE_ANALYSIS.file_path);
    });

    it("should return undefined for a non-existent id", () => {
      const result = db.getAnalysis("nonexistent-id");
      expect(result).toBeUndefined();
    });

    it("should overwrite an existing analysis on conflict (INSERT OR REPLACE)", () => {
      db.saveAnalysis(SAMPLE_ANALYSIS);
      const updated: DocumentAnalysis = { ...SAMPLE_ANALYSIS, clause_count: 10 };
      db.saveAnalysis(updated);
      const retrieved = db.getAnalysis(SAMPLE_ANALYSIS.id);
      expect(retrieved?.clause_count).toBe(10);
    });

    it("should store template_used when provided", () => {
      db.saveAnalysis(SAMPLE_ANALYSIS);
      const retrieved = db.getAnalysis(SAMPLE_ANALYSIS.id);
      expect(retrieved?.template_used).toBe("NDA");
    });

    it("should handle analysis without template_used", () => {
      const noTemplate: DocumentAnalysis = {
        ...SAMPLE_ANALYSIS,
        id: "no-template",
        template_used: undefined,
      };
      db.saveAnalysis(noTemplate);
      const retrieved = db.getAnalysis("no-template");
      expect(retrieved).toBeDefined();
    });
  });

  describe("listAnalyses", () => {
    it("should return an empty array when no analyses exist", () => {
      expect(db.listAnalyses()).toEqual([]);
    });

    it("should return all saved analyses", () => {
      db.saveAnalysis(SAMPLE_ANALYSIS);
      db.saveAnalysis({ ...SAMPLE_ANALYSIS, id: "second-analysis" });
      expect(db.listAnalyses().length).toBe(2);
    });

    it("should order analyses by analyzed_at descending", () => {
      const older: DocumentAnalysis = {
        ...SAMPLE_ANALYSIS,
        id: "older",
        analyzed_at: 1000,
      };
      const newer: DocumentAnalysis = {
        ...SAMPLE_ANALYSIS,
        id: "newer",
        analyzed_at: 2000,
      };
      db.saveAnalysis(older);
      db.saveAnalysis(newer);
      const results = db.listAnalyses();
      expect(results[0].id).toBe("newer");
      expect(results[1].id).toBe("older");
    });
  });

  describe("saveClauses", () => {
    it("should save clauses without throwing", () => {
      db.saveAnalysis(SAMPLE_ANALYSIS);
      expect(() => db.saveClauses(SAMPLE_ANALYSIS.id, SAMPLE_CLAUSES)).not.toThrow();
    });

    it("should handle saving an empty clauses array", () => {
      db.saveAnalysis(SAMPLE_ANALYSIS);
      expect(() => db.saveClauses(SAMPLE_ANALYSIS.id, [])).not.toThrow();
    });
  });
});

describe("createDb", () => {
  it("should create an in-memory db", async () => {
    const memDb = await createDb(":memory:");
    expect(memDb).toBeInstanceOf(LegalDb);
    memDb.close();
  });
});
