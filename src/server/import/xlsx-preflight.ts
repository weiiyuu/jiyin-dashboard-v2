import { unzipSync } from "fflate";

export const XLSX_LIMITS = {
  maxCompressedBytes: 25 * 1024 * 1024,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxCells: 250_000,
} as const;

const decoder = new TextDecoder();

export function preflightXlsx(bytes: Uint8Array): void {
  if (bytes.byteLength === 0 || bytes.byteLength > XLSX_LIMITS.maxCompressedBytes) {
    throw new Error("XLSX_FILE_SIZE_LIMIT");
  }
  let expandedBytes = 0;
  const entries = unzipSync(bytes, {
    filter(file) {
      expandedBytes += file.originalSize;
      if (expandedBytes > XLSX_LIMITS.maxUncompressedBytes) throw new Error("XLSX_EXPANDED_SIZE_LIMIT");
      const name = file.name.toLowerCase();
      if (name.endsWith("vbaproject.bin") || name.includes("/externallinks/")) throw new Error("XLSX_UNSAFE_CONTENT");
      return name.endsWith(".xml") || name.endsWith(".rels");
    },
  });
  let cells = 0;
  for (const [name, data] of Object.entries(entries)) {
    const xml = decoder.decode(data);
    if (/<f(?:\s|>)/i.test(xml)) throw new Error("XLSX_FORMULA_NOT_ALLOWED");
    if (/TargetMode=["']External["']/i.test(xml) || /macroEnabled/i.test(xml)) throw new Error("XLSX_UNSAFE_CONTENT");
    if (name.toLowerCase().includes("worksheets/")) {
      cells += (xml.match(/<c(?:\s|>)/g) ?? []).length;
      if (cells > XLSX_LIMITS.maxCells) throw new Error("XLSX_CELL_COUNT_LIMIT");
    }
  }
}
