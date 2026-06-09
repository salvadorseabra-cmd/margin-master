import { renderPdfFirstPageToPngDataUrl } from "@/lib/pdf-to-invoice-image";

type NamedBlobLike = {
  type?: string;
  name?: string;
};

const IMAGE_MIME_PREFIX = "image/";
const PDF_MIME = "application/pdf";
const EXTRACTABLE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "pdf"]);

export function isImageFile(input: NamedBlobLike): boolean {
  return Boolean(input.type?.startsWith(IMAGE_MIME_PREFIX));
}

export function isPdfFile(input: NamedBlobLike): boolean {
  if (input.type === PDF_MIME) return true;
  const name = input.name?.toLowerCase() ?? "";
  return name.endsWith(".pdf");
}

export function isExtractableFile(input: NamedBlobLike): boolean {
  return isImageFile(input) || isPdfFile(input);
}

export function isExtractableInvoicePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXTRACTABLE_EXTENSIONS.has(ext);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(blob);
  });
}

export async function fileToExtractionDataUrl(
  input: Blob | File,
  fileName?: string,
): Promise<string> {
  const name = input instanceof File ? input.name : fileName;
  const descriptor = { type: input.type, name };

  if (isImageFile(descriptor)) {
    return readBlobAsDataUrl(input);
  }

  if (isPdfFile(descriptor)) {
    const result = await renderPdfFirstPageToPngDataUrl(input, { fileName: name });
    return result.dataUrl;
  }

  throw new Error("Unsupported file type for invoice extraction.");
}
