import { JPEG_QUALITY, TARGET_PAGE_WIDTH_PX } from "@/lib/config";
import type { PageImage } from "@/lib/types";
import { isLowInk } from "./blankFilter";

/**
 * Rasterise a PDF entirely in the browser. Nothing leaves the machine here —
 * the caller decides what to send, and sends images, never the file.
 */
export async function renderPdfToPages(
  file: File,
  onPage?: (rendered: number, total: number) => void,
): Promise<PageImage[]> {
  if (typeof window === "undefined") {
    throw new Error("renderPdfToPages is browser-only");
  }

  // Imported lazily: pdfjs touches DOM globals at module scope.
  const pdfjs = await import("pdfjs-dist");
  // Local worker asset — CDN defaults break under Next bundling.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const pages: PageImage[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = TARGET_PAGE_WIDTH_PX / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas context unavailable");

    // Scans are transparent-backed once rendered; paint paper under them.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const skip = isLowInk(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!skip) {
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      pages.push({ pageIndex: n - 1, base64, bytes: base64.length });
    }

    page.cleanup();
    onPage?.(n, doc.numPages);
  }

  await doc.cleanup();
  return pages;
}
