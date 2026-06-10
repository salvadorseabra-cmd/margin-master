/** Y coordinate where a bottom-fraction crop begins (0-based, inclusive). */
export function computeBottomCropStartY(
  imageHeight: number,
  bottomFraction = 0.48,
): number {
  return Math.round(imageHeight * (1 - bottomFraction));
}

/** Bidfood da472b7f full-page raster (920×1272). TOTAL band at y≈1132 per VL investigation. */
export const BIDFOOD_IMAGE_HEIGHT = 1272;
export const BIDFOOD_TOTAL_Y = 1132;
export const DEFAULT_BOTTOM_CROP_FRACTION = 0.48;

/** Aviludo FCL template (742×938). VALOR A PAGAR band y≈470–520 per VL table-localization. */
export const AVILUDO_IMAGE_HEIGHT = 938;
export const AVILUDO_TOTAL_BAND_Y = 500;
