import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

let configured = false;

/** Call once from plugin onload with a vault resource URL to pdf.worker.min.mjs. */
export function configurePdfWorker(workerSrc: string): void {
  if (!workerSrc) {
    throw new Error("PDF worker URL is required");
  }
  GlobalWorkerOptions.workerSrc = workerSrc;
  configured = true;
}

export function ensurePdfWorkerConfigured(): void {
  if (!configured || !GlobalWorkerOptions.workerSrc) {
    throw new Error(
      'PDF.js worker is not configured. Reload the plugin after running "npm run build".',
    );
  }
}
