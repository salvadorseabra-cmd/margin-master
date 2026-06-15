import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  computeBottomCropStartY,
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
  GREY_HEADER_LUMINANCE_THRESHOLD,
  HEADER_BAND_ROWS,
  HEADER_BAND_THRESHOLD_DELTA,
  HEADER_RULE_MIN_EDGE,
  HEADER_RULE_OFFSETS,
  MIN_TABLE_HEIGHT,
  SUMMARY_BAND_LUMINANCE_MAX,
  SUMMARY_BAND_LUMINANCE_MIN,
  SUMMARY_BAND_MIN_DARK_FRACTION,
  SUMMARY_BAND_MIN_ROWS,
  TABLE_SCAN_END_FRACTION,
  TABLE_SCAN_START_FRACTION,
  TABLE_TOP_MARGIN,
  TOTALS_SCAN_END_FRACTION,
  FOOTER_GREY_HEADER_MAX_FRACTION,
  TABLE_HEADER_BAND_SCAN_END_FRACTION,
  WHITE_HEADER_EXPANDED_MIN_RULE_FRACTION,
  WHITE_HEADER_MIN_RULE_FRACTION,
} from "./invoice-crop-geometry.ts";

export {
  computeBottomCropStartY,
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
} from "./invoice-crop-geometry.ts";

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

function rowDarkFraction(image: Image, y: number, threshold = 200): number {
  let dark = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x++) {
    if (pixelLuminance(image.getPixelAt(x, row)) < threshold) dark++;
  }
  return dark / image.width;
}

function bandAverageLuminance(image: Image, y: number, rows = HEADER_BAND_ROWS): number {
  let sum = 0;
  for (let dy = 0; dy < rows; dy++) {
    sum += rowMeanLuminance(image, y + dy);
  }
  return sum / rows;
}

/** White-background column headers: text stripes on paper, not a shaded grey band. */
function isWhiteHeaderBand(image: Image, y: number): boolean {
  let textRows = 0;
  for (let dy = 0; dy < 6; dy++) {
    const mean = rowMeanLuminance(image, y + dy);
    const dark = rowDarkFraction(image, y + dy);
    if (mean >= 165 && mean <= 215 && dark >= 0.30 && dark <= 0.75) textRows++;
  }
  const bandAverage = bandAverageLuminance(image, y);
  return textRows >= 3 && bandAverage >= 168 && bandAverage <= 195;
}

function detectGreyHeaderTop(
  image: Image,
  scanStart: number,
  scanEnd: number,
): { headerTop: number; bestBandAverage: number } {
  let headerTop = scanStart;
  let bestBandAverage = Number.POSITIVE_INFINITY;

  for (let y = scanStart; y < scanEnd - HEADER_BAND_ROWS; y++) {
    const bandAverage = bandAverageLuminance(image, y);
    if (bandAverage < bestBandAverage) {
      bestBandAverage = bandAverage;
      headerTop = y;
    }
  }

  return { headerTop, bestBandAverage };
}

/** Anchor on horizontal rules above column labels (Bocconcino-style layouts). */
function detectWhiteHeaderTop(
  image: Image,
  scanStart: number,
  scanEnd: number,
  minRuleFraction = WHITE_HEADER_MIN_RULE_FRACTION,
): number | null {
  const minRuleY = Math.floor(image.height * minRuleFraction);
  const rules: number[] = [];

  for (let y = Math.max(scanStart, minRuleY); y < scanEnd; y++) {
    if (rowEdgeScore(image, y) >= HEADER_RULE_MIN_EDGE) rules.push(y);
  }

  rules.sort((a, b) => a - b);
  for (const ruleY of rules) {
    for (const offset of HEADER_RULE_OFFSETS) {
      const candidateY = ruleY + offset;
      if (candidateY >= scanEnd - HEADER_BAND_ROWS) continue;
      if (isWhiteHeaderBand(image, candidateY)) return candidateY;
    }
  }

  return null;
}

/**
 * White headers without a strong horizontal rule (Lenha-style): scan column-header
 * text bands in the upper table zone when rule anchoring finds nothing.
 */
function detectWhiteHeaderTopByBandScan(
  image: Image,
  scanStart: number,
  scanEnd: number,
): number | null {
  let bestY: number | null = null;
  let bestRuleScore = -1;

  for (let y = scanStart; y < scanEnd - HEADER_BAND_ROWS; y++) {
    if (!isWhiteHeaderBand(image, y)) continue;

    let ruleScore = 0;
    for (const offset of HEADER_RULE_OFFSETS) {
      const ruleY = y - offset;
      if (ruleY >= scanStart) {
        ruleScore = Math.max(ruleScore, rowEdgeScore(image, ruleY));
      }
    }

    if (
      bestY == null ||
      ruleScore > bestRuleScore ||
      (ruleScore === bestRuleScore && y < bestY)
    ) {
      bestY = y;
      bestRuleScore = ruleScore;
    }
  }

  return bestY;
}

/** Detect header band and totals-section start for tabular invoice crops. */
export function detectTableBounds(image: Image): TableBounds {
  const height = image.height;
  const scanStart = Math.floor(height * TABLE_SCAN_START_FRACTION);
  const scanEnd = Math.floor(height * TABLE_SCAN_END_FRACTION);

  const { headerTop: darkestHeaderTop, bestBandAverage } = detectGreyHeaderTop(
    image,
    scanStart,
    scanEnd,
  );

  let headerTop = darkestHeaderTop;
  if (bestBandAverage >= GREY_HEADER_LUMINANCE_THRESHOLD) {
    const whiteHeaderTop = detectWhiteHeaderTop(image, scanStart, scanEnd);
    if (whiteHeaderTop != null) {
      headerTop = whiteHeaderTop;
    } else if (
      darkestHeaderTop >= Math.floor(height * FOOTER_GREY_HEADER_MAX_FRACTION)
    ) {
      const fallbackWhiteTop = detectWhiteHeaderTop(
        image,
        scanStart,
        scanEnd,
        WHITE_HEADER_EXPANDED_MIN_RULE_FRACTION,
      );
      if (fallbackWhiteTop != null) headerTop = fallbackWhiteTop;
    }
  }

  const footerMaxY = Math.floor(height * FOOTER_GREY_HEADER_MAX_FRACTION);
  if (headerTop >= footerMaxY) {
    const bandScanStart = Math.max(
      scanStart,
      Math.floor(height * WHITE_HEADER_EXPANDED_MIN_RULE_FRACTION),
    );
    const bandScanEnd = Math.min(
      footerMaxY,
      Math.floor(height * TABLE_HEADER_BAND_SCAN_END_FRACTION),
    );
    const bandScanTop = detectWhiteHeaderTopByBandScan(
      image,
      bandScanStart,
      bandScanEnd,
    );
    if (bandScanTop != null) headerTop = bandScanTop;
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
  const bandThreshold = bandAverageLuminance(image, headerTop) + HEADER_BAND_THRESHOLD_DELTA;

  let refinedBottom = headerBottom;
  while (
    refinedBottom < height &&
    rowMeanLuminance(image, refinedBottom) < bandThreshold &&
    refinedBottom - headerTop < 36
  ) {
    refinedBottom++;
  }

  const searchStart = refinedBottom + MIN_TABLE_HEIGHT;
  const searchEnd = Math.floor(height * TOTALS_SCAN_END_FRACTION);
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

  const top = Math.max(0, headerTop - TABLE_TOP_MARGIN);
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

function isSummaryTotalsRow(image: Image, y: number): boolean {
  const mean = rowMeanLuminance(image, y);
  const dark = rowDarkFraction(image, y);
  return dark >= SUMMARY_BAND_MIN_DARK_FRACTION &&
    mean >= SUMMARY_BAND_LUMINANCE_MIN &&
    mean <= SUMMARY_BAND_LUMINANCE_MAX;
}

/** Grey Subtotal/Total box above the IVA breakdown (Emporio Italia-style layouts). */
export function detectSummaryTotalsBandTop(
  image: Image,
  scanStartY: number,
  scanEndY: number,
): number | null {
  if (scanEndY - scanStartY < SUMMARY_BAND_MIN_ROWS) return null;

  let runStart: number | null = null;
  let runLen = 0;

  for (let y = scanStartY; y < scanEndY; y++) {
    if (isSummaryTotalsRow(image, y)) {
      if (runStart == null) runStart = y;
      runLen++;
      if (runLen >= SUMMARY_BAND_MIN_ROWS) return runStart;
    } else {
      runStart = null;
      runLen = 0;
    }
  }

  return null;
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
  bottomFraction = DEFAULT_BOTTOM_CROP_FRACTION,
): Promise<string> {
  const { bytes } = parseImageDataUrl(dataUrl);
  const image = await Image.decode(bytes);
  const bounds = detectTableBounds(image);
  const fractionStartY = computeBottomCropStartY(image.height, bottomFraction);
  const summaryBandTop = bounds.detected && bounds.totalsStart != null
    ? detectSummaryTotalsBandTop(image, fractionStartY, bounds.totalsStart)
    : null;
  const cropStartY = computeFooterCropStartY(
    image.height,
    bounds.detected ? bounds.bottom : null,
    bottomFraction,
    summaryBandTop,
  );
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
