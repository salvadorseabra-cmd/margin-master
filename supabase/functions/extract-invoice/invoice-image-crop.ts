import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { computeBottomCropStartY } from "./invoice-crop-geometry.ts";

export { computeBottomCropStartY } from "./invoice-crop-geometry.ts";

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

export type TableBounds = {
  top: number;
  bottom: number;
  headerTop: number;
  headerBottom: number;
  totalsStart: number | null;
  detected: boolean;
};

export type TableCropResult = {
  croppedDataUrl: string;
  bounds: TableBounds | null;
  fallbackUsed: boolean;
};

export function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error("imageDataUrl must be a base64 data URL");
  }
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { mime: match[1], bytes };
}

export function toImageDataUrl(bytes: Uint8Array, mime = "image/png"): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function pixelLuminance(pixel: number): number {
  const r = (pixel >> 24) & 0xff;
  const g = (pixel >> 16) & 0xff;
  const b = (pixel >> 8) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rowMeanLuminance(image: Image, y: number): number {
  let sum = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x++) {
    sum += pixelLuminance(image.getPixelAt(x, row));
  }
  return sum / image.width;
}

function rowEdgeScore(image: Image, y: number): number {
  if (y < 0 || y >= image.height - 1) return 0;
  let score = 0;
  const step = Math.max(1, Math.floor(image.width / 120));
  let samples = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x += step) {
    const l1 = pixelLuminance(image.getPixelAt(x, row));
    const l2 = pixelLuminance(image.getPixelAt(x, row + 1));
    score += Math.abs(l1 - l2);
    samples++;
  }
  return samples > 0 ? score / samples : 0;
}

/** Detect grey header band and totals-section start for tabular invoice crops. */
export function detectTableBounds(image: Image): TableBounds {
  const height = image.height;
  const HEADER_BAND_ROWS = 18;
  const TOP_MARGIN = 10;
  const MIN_TABLE_HEIGHT = 170;
  const scanStart = Math.floor(height * 0.12);
  const scanEnd = Math.floor(height * 0.55);

  let headerTop = scanStart;
  let bestBandAverage = Number.POSITIVE_INFINITY;

  for (let y = scanStart; y < scanEnd - HEADER_BAND_ROWS; y++) {
    let bandSum = 0;
    for (let dy = 0; dy < HEADER_BAND_ROWS; dy++) {
      bandSum += rowMeanLuminance(image, y + dy);
    }
    const bandAverage = bandSum / HEADER_BAND_ROWS;
    if (bandAverage < bestBandAverage) {
      bestBandAverage = bandAverage;
      headerTop = y;
    }
  }

  if (!Number.isFinite(bestBandAverage)) {
    return {
      top: 0,
      bottom: height,
      headerTop: 0,
      headerBottom: 0,
      totalsStart: null,
      detected: false,
    };
  }

  const headerBottom = Math.min(height, headerTop + HEADER_BAND_ROWS);
  const bandThreshold = bestBandAverage + 12;

  let refinedBottom = headerBottom;
  while (
    refinedBottom < height &&
    rowMeanLuminance(image, refinedBottom) < bandThreshold &&
    refinedBottom - headerTop < 36
  ) {
    refinedBottom++;
  }

  const searchStart = refinedBottom + MIN_TABLE_HEIGHT;
  const searchEnd = Math.min(refinedBottom + 350, Math.floor(height * 0.85));
  const TOTALS_BOTTOM_PADDING = 24;
  const SEARCH_BOUNDARY_SLACK = 20;
  const BOUNDARY_BOTTOM_PADDING = 190;
  let totalsStart: number | null = null;

  if (searchStart < searchEnd) {
    let peakEdge = 0;
    for (let y = searchStart; y < searchEnd; y++) {
      const edge = rowEdgeScore(image, y);
      if (edge > peakEdge) {
        peakEdge = edge;
        totalsStart = y;
      }
    }
  }

  const top = Math.max(0, headerTop - TOP_MARGIN);
  const nearSearchBoundary = totalsStart != null &&
    searchEnd - totalsStart <= SEARCH_BOUNDARY_SLACK;
  const bottom = totalsStart != null
    ? Math.min(
      height,
      Math.max(
        refinedBottom + 40,
        nearSearchBoundary
          ? searchEnd + BOUNDARY_BOTTOM_PADDING
          : totalsStart + TOTALS_BOTTOM_PADDING,
      ),
    )
    : Math.min(height, refinedBottom + 202);

  return {
    top,
    bottom: Math.max(top + 1, bottom),
    headerTop,
    headerBottom: refinedBottom,
    totalsStart,
    detected: true,
  };
}

/** Keep the top portion of the invoice (header + line items), excluding footer compliance blocks. */
export async function cropTopPortion(
  dataUrl: string,
  topFraction = 0.83,
): Promise<string> {
  const { bytes } = parseImageDataUrl(dataUrl);
  const image = await Image.decode(bytes);
  const cropHeight = Math.max(1, Math.round(image.height * topFraction));
  const cropped = image.crop(0, 0, image.width, cropHeight);
  const encoded = await cropped.encode();
  return toImageDataUrl(encoded);
}

/** Keep the bottom portion of the invoice (totals + amount due), excluding header/line items. */
export async function cropBottomPortion(
  dataUrl: string,
  bottomFraction = 0.48,
): Promise<string> {
  const { bytes } = parseImageDataUrl(dataUrl);
  const image = await Image.decode(bytes);
  const cropStartY = computeBottomCropStartY(image.height, bottomFraction);
  const cropHeight = Math.max(1, image.height - cropStartY);
  const cropped = image.crop(0, cropStartY, image.width, cropHeight);
  const encoded = await cropped.encode();
  return toImageDataUrl(encoded);
}

/** Crop to the detected table region; fail-open to the full image when detection fails. */
export async function cropTableRegionForLineItems(
  dataUrl: string,
): Promise<TableCropResult> {
  const { bytes } = parseImageDataUrl(dataUrl);
  const image = await Image.decode(bytes);
  const bounds = detectTableBounds(image);

  if (!bounds.detected) {
    return {
      croppedDataUrl: dataUrl,
      bounds,
      fallbackUsed: true,
    };
  }

  const cropHeight = Math.max(1, bounds.bottom - bounds.top);
  const cropped = image.crop(0, bounds.top, image.width, cropHeight);
  const encoded = await cropped.encode();
  return {
    croppedDataUrl: toImageDataUrl(encoded),
    bounds,
    fallbackUsed: false,
  };
}
