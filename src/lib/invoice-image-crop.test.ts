import { describe, expect, it } from "vitest";
import {
  AVILUDO_IMAGE_HEIGHT,
  AVILUDO_TABLE_BOTTOM_Y,
  AVILUDO_TOTAL_BAND_Y,
  BIDFOOD_IMAGE_HEIGHT,
  BIDFOOD_TABLE_BOTTOM_Y,
  BIDFOOD_TOTAL_Y,
  computeBottomCropStartY,
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
} from "../../supabase/functions/extract-invoice/invoice-crop-geometry";

describe("computeBottomCropStartY", () => {
  it("uses 55% bottom fraction by default (tighter than legacy 48%)", () => {
    expect(DEFAULT_BOTTOM_CROP_FRACTION).toBe(0.55);
    expect(computeBottomCropStartY(BIDFOOD_IMAGE_HEIGHT)).toBe(572);
  });

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

describe("computeFooterCropStartY", () => {
  it("anchors Bidfood footer crop below line items (y1050)", () => {
    const cropStartY = computeFooterCropStartY(
      BIDFOOD_IMAGE_HEIGHT,
      BIDFOOD_TABLE_BOTTOM_Y,
    );

    expect(cropStartY).toBe(BIDFOOD_TABLE_BOTTOM_Y);
    expect(cropStartY).toBeGreaterThan(
      computeBottomCropStartY(BIDFOOD_IMAGE_HEIGHT),
    );
    expect(cropStartY).toBeLessThanOrEqual(BIDFOOD_TOTAL_Y);
  });

  it("keeps Aviludo totals visible when table bottom is above fraction crop", () => {
    const cropStartY = computeFooterCropStartY(
      AVILUDO_IMAGE_HEIGHT,
      AVILUDO_TABLE_BOTTOM_Y,
    );

    expect(cropStartY).toBeLessThanOrEqual(AVILUDO_TOTAL_BAND_Y);
    expect(cropStartY).toBeGreaterThanOrEqual(AVILUDO_TABLE_BOTTOM_Y);
  });
});
