/** Y coordinate where a bottom-fraction crop begins (0-based, inclusive). */
export function computeBottomCropStartY(
  imageHeight: number,
  bottomFraction = DEFAULT_BOTTOM_CROP_FRACTION,
): number {
  return Math.round(imageHeight * (1 - bottomFraction));
}

/**
 * Footer crop start: prefer the tighter of fraction-based or post-table boundary
 * so line-item rows are excluded while net/VAT/total bands stay visible.
 */
export function computeFooterCropStartY(
  imageHeight: number,
  tableBoundsBottom: number | null,
  bottomFraction = DEFAULT_BOTTOM_CROP_FRACTION,
): number {
  const fractionStartY = computeBottomCropStartY(imageHeight, bottomFraction);

  if (tableBoundsBottom == null) {
    return fractionStartY;
  }

  const tableAnchoredStartY = Math.min(
    imageHeight - 1,
    Math.max(0, tableBoundsBottom),
  );

  return Math.max(fractionStartY, tableAnchoredStartY);
}

/** Bidfood da472b7f full-page raster (920×1272). TOTAL band at y≈1132 per VL investigation. */
export const BIDFOOD_IMAGE_HEIGHT = 1272;
export const BIDFOOD_TOTAL_Y = 1132;
export const BIDFOOD_TABLE_BOTTOM_Y = 1050;

/** Raised from 0.48 → 0.55 to shrink line-item noise in tall footer crops. */
export const DEFAULT_BOTTOM_CROP_FRACTION = 0.55;

/** Aviludo FCL template (742×938). VALOR A PAGAR band y≈470–520 per VL table-localization. */
export const AVILUDO_IMAGE_HEIGHT = 938;
export const AVILUDO_TOTAL_BAND_Y = 500;
export const AVILUDO_TABLE_BOTTOM_Y = 448;

/** Table header band scan geometry (detectTableBounds). */
export const TABLE_SCAN_START_FRACTION = 0.12;
export const TABLE_SCAN_END_FRACTION = 0.55;
export const HEADER_BAND_ROWS = 18;
export const TABLE_TOP_MARGIN = 10;
export const MIN_TABLE_HEIGHT = 170;
export const HEADER_BAND_THRESHOLD_DELTA = 12;

/** Grey shaded headers (Bidfood, Aviludo) fall below this mean luminance. */
export const GREY_HEADER_LUMINANCE_THRESHOLD = 163;

/** White-background headers: anchor on horizontal rules in the lower table zone. */
export const WHITE_HEADER_MIN_RULE_FRACTION = 0.38;
export const HEADER_RULE_MIN_EDGE = 28;
export const HEADER_RULE_OFFSETS = [12, 16, 20, 24] as const;

/** Totals-band edge scan reaches the lower page even when the header sits higher. */
export const TOTALS_SCAN_END_FRACTION = 0.88;
