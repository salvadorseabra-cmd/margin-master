const DEFAULT_MAX_LONG_EDGE = 1600;
const DEFAULT_PAGE_NUMBER = 1;

export type PdfRasterizeResult = {
  dataUrl: string;
  pageNumber: number;
  numPages: number;
  width: number;
  height: number;
};

export type PdfRasterizeOptions = {
  pageNumber?: number;
  maxLongEdge?: number;
  fileName?: string;
};

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsReady: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsReady) {
    pdfJsReady = (async () => {
      if (import.meta.env.VITEST) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        return pdfjs as unknown as PdfJsModule;
      }

      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfJsReady;
}

/** Pure helper — scale PDF page viewport so the long edge fits within maxLongEdge (never upscale). */
export function computePdfRenderScale(
  width: number,
  height: number,
  maxLongEdge: number,
): number {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0 || longEdge <= maxLongEdge) return 1;
  return maxLongEdge / longEdge;
}

function resolveFileName(source: Blob | File, fileName?: string): string {
  if (source instanceof File && source.name) return source.name;
  return fileName ?? "invoice.pdf";
}

function formatRasterizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/password/i.test(message)) {
    return "This PDF is password-protected and cannot be read.";
  }
  return `Could not render PDF for OCR: ${message}`;
}

export async function renderPdfFirstPageToPngDataUrl(
  source: Blob | File,
  options: PdfRasterizeOptions = {},
): Promise<PdfRasterizeResult> {
  if (typeof document === "undefined") {
    throw new Error("PDF rasterization requires a browser environment.");
  }

  const pageNumber = options.pageNumber ?? DEFAULT_PAGE_NUMBER;
  const maxLongEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const fileName = resolveFileName(source, options.fileName);

  console.log("[pdf-rasterize] start", {
    fileName,
    pageNumber,
    maxLongEdge,
    byteLength: source.size,
  });

  const pdfjs = await loadPdfJs();
  const arrayBuffer = await source.arrayBuffer();

  let pdf: Awaited<ReturnType<PdfJsModule["getDocument"]>>["promise"] extends Promise<infer T>
    ? T
    : never;

  try {
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    pdf = await loadingTask.promise;
  } catch (error) {
    console.error("[pdf-rasterize] load-failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(formatRasterizeError(error));
  }

  const numPages = pdf.numPages;
  if (numPages > 1) {
    console.log("[pdf-rasterize] multi-page-notice", {
      fileName,
      numPages,
      usingPage: pageNumber,
      note: "Only page 1 is rasterized for invoice OCR",
    });
  }

  if (pageNumber < 1 || pageNumber > numPages) {
    await pdf.destroy();
    throw new Error(`PDF page ${pageNumber} is out of range (document has ${numPages} page(s)).`);
  }

  try {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = computePdfRenderScale(baseViewport.width, baseViewport.height, maxLongEdge);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable.");
    }

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const dataUrl = canvas.toDataURL("image/png");

    console.log("[pdf-rasterize] done", {
      fileName,
      pageNumber,
      numPages,
      width,
      height,
      scale,
      dataUrlLength: dataUrl.length,
    });

    canvas.width = 0;
    canvas.height = 0;

    return {
      dataUrl,
      pageNumber,
      numPages,
      width,
      height,
    };
  } finally {
    await pdf.destroy();
  }
}
