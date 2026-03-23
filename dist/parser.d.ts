import type { ParsedDocument } from "./types.js";
export declare function parseDocument(filePath: string, options?: {
    enableOcr?: boolean;
}): Promise<ParsedDocument>;
