import { renderPdfToPages } from "@/lib/pdf/render";
import type { PageImage } from "@/lib/types";

export type UploadKind = { kind: "pdf" } | { kind: "image"; mimeType: string };

/** Photo types Gemini reads directly, by file extension. */
const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};

/** What the file picker offers: PDFs plus JPG, PNG and HEIC photos of pages. */
export const UPLOAD_ACCEPT = [
  "application/pdf",
  ...new Set(Object.values(IMAGE_TYPES)),
  ...Object.keys(IMAGE_TYPES).map((ext) => `.${ext}`),
  ".pdf",
].join(",");

/**
 * Whether qDNA can read a file, and how. The extension decides when the
 * browser reports no type, which is common for HEIC.
 */
export function uploadKind(file: Pick<File, "name" | "type">): UploadKind | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (file.type === "application/pdf" || ext === "pdf") return { kind: "pdf" };

  if (Object.values(IMAGE_TYPES).includes(file.type)) {
    return { kind: "image", mimeType: file.type };
  }
  const untyped = file.type === "" || file.type === "application/octet-stream";
  return untyped && IMAGE_TYPES[ext] ? { kind: "image", mimeType: IMAGE_TYPES[ext] } : null;
}

/**
 * The pages of one upload, ready to batch. A PDF is rasterised in the
 * browser; a photo skips rasterisation and is sent as is, so Gemini reads
 * HEIC without the browser having to decode it.
 */
export async function pagesOf(file: File): Promise<PageImage[]> {
  const kind = uploadKind(file);
  if (!kind) throw new Error(`${file.name} is not a PDF or a JPG, PNG or HEIC photo.`);
  if (kind.kind === "pdf") return renderPdfToPages(file);

  const base64 = toBase64(new Uint8Array(await file.arrayBuffer()));
  return [{ pageIndex: 0, base64, bytes: base64.length, mimeType: kind.mimeType }];
}

/** Base64 without a stack-busting spread: phone photos run to megabytes. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
