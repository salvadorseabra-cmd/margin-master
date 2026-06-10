import { describe, expect, it } from "vitest";
import {
  AVILUDO_IMAGE_HEIGHT,
  AVILUDO_TOTAL_BAND_Y,
  BIDFOOD_IMAGE_HEIGHT,
  BIDFOOD_TOTAL_Y,
  computeBottomCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
} from "../../supabase/functions/extract-invoice/invoice-crop-geometry";

describe("computeBottomCropStartY", () => {
  it("includes Bidfood TOTAL region (y1132) in default footer crop", () => {
    const cropStartY = computeBottomCropStartY(
      BIDFOOD_IMAGE_HEIGHT,
      DEFAULT_BOTTOM_CROP_FRACTION,
    );

    expect(cropStartY).toBeLessThanOrEqual(BIDFOOD_TOTAL_Y);
    expect(BIDFOOD_TOTAL_Y).toBeLessThan(BIDFOOD_IMAGE_HEIGHT);
  });

  it("excludes Bidfood TOTAL from the 83% top crop boundary (y1056)", () => {
    const topCropEndY = Math.round(BIDFOOD_IMAGE_HEIGHT * 0.83);
    expect(topCropEndY).toBe(1056);
    expect(BIDFOOD_TOTAL_Y).toBeGreaterThan(topCropEndY);
  });

  it("includes Aviludo VALOR A PAGAR band in default footer crop", () => {
    const cropStartY = computeBottomCropStartY(
      AVILUDO_IMAGE_HEIGHT,
      DEFAULT_BOTTOM_CROP_FRACTION,
    );

    expect(cropStartY).toBeLessThanOrEqual(AVILUDO_TOTAL_BAND_Y);
  });
});
