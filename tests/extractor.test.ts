import { describe, it, expect } from "vitest";
import { extractClauses } from "../src/extractor.js";

const SYNTHETIC_NDA = `
MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is entered into between Party A and Party B.

CONFIDENTIALITY: Both parties agree to maintain confidentiality of all proprietary information for a period of 2 years from the date of disclosure.

TERMINATION: This agreement shall terminate upon written notice from either party, with 30 days notice required.

GOVERNING LAW: This agreement shall be governed by the laws of Delaware.

LIMITATION OF LIABILITY: Neither party shall be liable for indirect, consequential, or incidental damages.

INTELLECTUAL PROPERTY: Each party retains ownership of their existing intellectual property.
`;

const SYNTHETIC_EMPLOYMENT = `
EMPLOYMENT AGREEMENT

COMPENSATION: Employee shall receive a base salary, with performance bonuses at management discretion. Fees and billing are subject to annual review.

TERMINATION: Employment is at-will. Either party may terminate at any time with two weeks notice.

INTELLECTUAL PROPERTY: All work product created during employment shall be assigned to the employer.

NON-COMPETE: Employee agrees not to engage in competing business for 12 months.

DISPUTE RESOLUTION: Disputes shall be resolved through arbitration.

GOVERNING LAW: Governed by the laws of California.
`;

describe("extractClauses", () => {
  it("should extract confidentiality clause from NDA text", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    const types = clauses.map((c) => c.type);
    expect(types).toContain("confidentiality");
  });

  it("should extract termination clause from NDA text", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    const types = clauses.map((c) => c.type);
    expect(types).toContain("termination");
  });

  it("should extract governing_law clause from NDA text", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    const types = clauses.map((c) => c.type);
    expect(types).toContain("governing_law");
  });

  it("should extract liability clause from NDA text", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    const types = clauses.map((c) => c.type);
    expect(types).toContain("liability");
  });

  it("should extract intellectual_property clause from NDA text", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    const types = clauses.map((c) => c.type);
    expect(types).toContain("intellectual_property");
  });

  it("should return confidence scores between 0 and 1", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    for (const clause of clauses) {
      expect(clause.confidence).toBeGreaterThan(0);
      expect(clause.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("should mark low_confidence correctly for low scores", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    for (const clause of clauses) {
      if (clause.confidence < 0.7) {
        expect(clause.low_confidence).toBe(true);
      } else {
        expect(clause.low_confidence).toBe(false);
      }
    }
  });

  it("should respect confidence threshold", () => {
    const allClauses = extractClauses(SYNTHETIC_NDA, 0.0);
    const filteredClauses = extractClauses(SYNTHETIC_NDA, 0.9);
    expect(filteredClauses.length).toBeLessThanOrEqual(allClauses.length);
  });

  it("should return empty array for empty text", () => {
    const clauses = extractClauses("");
    expect(clauses).toHaveLength(0);
  });

  it("should return clauses sorted by confidence descending", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    for (let i = 0; i < clauses.length - 1; i++) {
      expect(clauses[i].confidence).toBeGreaterThanOrEqual(clauses[i + 1].confidence);
    }
  });

  it("should extract multiple clause types from employment text", () => {
    const clauses = extractClauses(SYNTHETIC_EMPLOYMENT);
    const types = new Set(clauses.map((c) => c.type));
    // Should find at least 3 distinct clause types
    expect(types.size).toBeGreaterThanOrEqual(3);
  });

  it("should include start_index and end_index for each clause", () => {
    const clauses = extractClauses(SYNTHETIC_NDA);
    for (const clause of clauses) {
      expect(typeof clause.start_index).toBe("number");
      expect(typeof clause.end_index).toBe("number");
      expect(clause.end_index).toBeGreaterThanOrEqual(clause.start_index);
    }
  });
});
