import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { extname } from "path";
import { expandHome } from "./utils.js";
function detectFileType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".txt") return "txt";
  throw Object.assign(new Error(`Unsupported file type: ${ext}`), {
    code: "UNSUPPORTED_FILE_TYPE",
  });
}
async function computeFileHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
async function extractPdfText(buffer) {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  } catch (err) {
    throw Object.assign(
      new Error(
        `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
      ),
      { code: "PDF_PARSE_ERROR" },
    );
  }
}
/**
 * OCR fallback for scanned PDFs that return empty text from pdf-parse.
 * Requires tesseract.js, pdfjs-dist, and canvas to be installed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractPdfTextWithOcr(buffer) {
  // Dynamic import of tesseract.js (optional dependency)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createWorker;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tesseract = await import("tesseract.js");
    createWorker = tesseract.createWorker;
  } catch {
    throw Object.assign(
      new Error(
        "OCR fallback requires tesseract.js. Install it with: npm install tesseract.js",
      ),
      { code: "OCR_DEPENDENCY_MISSING" },
    );
  }
  // Dynamic import of pdfjs-dist and canvas (optional dependencies)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfjsGetDocument;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createCanvas;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs = await import("pdfjs-dist");
    pdfjsGetDocument = pdfjs.getDocument;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvasModule = await import("canvas");
    createCanvas = canvasModule.createCanvas;
  } catch {
    throw Object.assign(
      new Error(
        "PDF OCR requires pdfjs-dist and canvas. Install with: npm install pdfjs-dist canvas",
      ),
      { code: "OCR_DEPENDENCY_MISSING" },
    );
  }
  const pdf = await pdfjsGetDocument({ data: new Uint8Array(buffer) }).promise;
  const worker = await createWorker("eng");
  const textParts = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2× scale improves OCR accuracy
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = await worker.recognize({
        data: imageData.data,
        width: canvas.width,
        height: canvas.height,
      });
      textParts.push(result.data.text);
      page.cleanup();
    }
  } finally {
    await worker.terminate();
  }
  return textParts.join("\n\n");
}
async function extractDocxText(buffer) {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    // Extract tracked-changes text (inserted/deleted runs) from mammoth messages.
    // mammoth surfaces revision markup as warning messages with embedded text.
    const trackedChangeParts = [];
    for (const msg of result.messages ?? []) {
      // mammoth messages for tracked changes contain the original/revised text
      // in the message string in the format: "... [text] ..."
      if (
        msg.type === "warning" &&
        typeof msg.message === "string" &&
        /tracked.change|revision|insert|delete/i.test(msg.message)
      ) {
        trackedChangeParts.push(msg.message);
      }
    }
    const mainText = result.value;
    if (trackedChangeParts.length === 0) {
      return mainText;
    }
    // Append tracked-changes context after the main document text, separated
    // so that the extractor can still detect clauses in revised language.
    return mainText + "\n\n[Tracked Changes]\n" + trackedChangeParts.join("\n");
  } catch (err) {
    throw Object.assign(
      new Error(
        `Failed to parse DOCX: ${err instanceof Error ? err.message : String(err)}`,
      ),
      { code: "DOCX_PARSE_ERROR" },
    );
  }
}
export async function parseDocument(filePath, options) {
  const resolvedPath = expandHome(filePath);
  const fileType = detectFileType(resolvedPath);
  let buffer;
  try {
    buffer = await readFile(resolvedPath);
  } catch (err) {
    throw Object.assign(
      new Error(
        `Cannot read file at path "${resolvedPath}": ${err instanceof Error ? err.message : String(err)}`,
      ),
      { code: "FILE_READ_ERROR" },
    );
  }
  const file_hash = await computeFileHash(buffer);
  let text;
  let ocr_used;
  if (fileType === "pdf") {
    text = await extractPdfText(buffer);
    // Fall back to OCR if text-layer extraction returned nothing and OCR is enabled
    if (options?.enableOcr && !text.trim()) {
      text = await extractPdfTextWithOcr(buffer);
      ocr_used = true;
    }
  } else if (fileType === "docx") {
    text = await extractDocxText(buffer);
  } else {
    text = buffer.toString("utf-8");
  }
  return {
    text,
    file_type: fileType,
    file_path: resolvedPath,
    file_hash,
    ...(ocr_used ? { ocr_used } : {}),
  };
}
