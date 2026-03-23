import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { expandHome } from "../src/utils.js";

describe("expandHome", () => {
  it("should expand ~/... paths to the home directory", () => {
    const result = expandHome("~/Documents/contract.txt");
    expect(result).toBe(`${homedir()}/Documents/contract.txt`);
  });

  it("should expand bare ~ to the home directory", () => {
    const result = expandHome("~");
    expect(result).toBe(homedir());
  });

  it("should leave absolute paths unchanged", () => {
    const path = "/tmp/contract.txt";
    expect(expandHome(path)).toBe(path);
  });

  it("should leave relative paths unchanged", () => {
    const path = "relative/path/to/file.txt";
    expect(expandHome(path)).toBe(path);
  });

  it("should leave paths starting with ~word unchanged (not ~/ or bare ~)", () => {
    // ~user paths are not expanded (only ~/ and ~ itself)
    const path = "~username/docs";
    expect(expandHome(path)).toBe(path);
  });

  it("should handle empty string", () => {
    expect(expandHome("")).toBe("");
  });
});
