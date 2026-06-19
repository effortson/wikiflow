import type { DocumentChunk } from "@shared/types/normalized-document";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildPageTextFromPdfItems } from "./pdf-layout";
import { ensurePdfWorkerConfigured } from "./pdf-setup";

export async function extractPdfText(
  bytes: ArrayBuffer,
  maxPages: number,
): Promise<{
  fullText: string;
  chunks: DocumentChunk[];
  pageCount: number;
  ocrUsed: boolean;
  tableCount: number;
}> {
  ensurePdfWorkerConfigured();

  const loading = await getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  } as Parameters<typeof getDocument>[0]);
  const pdf = await loading.promise;
  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, maxPages);

  const chunks: DocumentChunk[] = [];
  const parts: string[] = [];
  let tableCount = 0;

  for (let pageNum = 1; pageNum <= limit; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const layout = buildPageTextFromPdfItems(textContent.items);
    tableCount += layout.tableCount;

    parts.push(layout.text);
    chunks.push({
      id: `chunk-${String(pageNum).padStart(3, "0")}`,
      text: layout.text,
      locator: { kind: "pdf", page: pageNum, pageCount },
      sequence: pageNum,
    });
  }

  const fullText = parts.filter(Boolean).join("\n\n");
  return { fullText, chunks, pageCount, ocrUsed: false, tableCount };
}

export async function renderPdfPagesToPng(
  bytes: ArrayBuffer,
  maxPages: number,
): Promise<{ page: number; pageCount: number; base64: string }[]> {
  ensurePdfWorkerConfigured();

  const loading = await getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  } as Parameters<typeof getDocument>[0]);
  const pdf = await loading.promise;
  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, maxPages);
  const images: { page: number; pageCount: number; base64: string }[] = [];

  for (let pageNum = 1; pageNum <= limit; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2d context unavailable");

    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    images.push({
      page: pageNum,
      pageCount,
      base64: dataUrl.split(",")[1] ?? "",
    });
  }

  return images;
}
