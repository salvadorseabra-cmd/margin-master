/**
 * Local geometry pass: detectTableBounds + footer crop metrics.
 * Usage: deno run --allow-read geometry-deno.ts <image-path>
 */
import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  detectTableBounds,
  detectSummaryTotalsBandTop,
} from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import {
  computeBottomCropStartY,
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
  GREY_HEADER_LUMINANCE_THRESHOLD,
  TABLE_SCAN_END_FRACTION,
  TABLE_SCAN_START_FRACTION,
} from "../../supabase/functions/extract-invoice/invoice-crop-geometry.ts";

const imagePath = Deno.args[0];
if (!imagePath) {
  console.error("Usage: geometry-deno.ts <image-path>");
  Deno.exit(1);
}

const bytes = readFileSync(imagePath);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const fractionStartY = computeBottomCropStartY(
  image.height,
  DEFAULT_BOTTOM_CROP_FRACTION,
);
const summaryBandTop =
  bounds.detected && bounds.totalsStart != null
    ? detectSummaryTotalsBandTop(image, fractionStartY, bounds.totalsStart)
    : null;
const footerCropStartY = computeFooterCropStartY(
  image.height,
  bounds.detected ? bounds.bottom : null,
  DEFAULT_BOTTOM_CROP_FRACTION,
  summaryBandTop,
);

const scanStart = Math.floor(image.height * TABLE_SCAN_START_FRACTION);
const scanEnd = Math.floor(image.height * TABLE_SCAN_END_FRACTION);

console.log(
  JSON.stringify(
    {
      imageWidth: image.width,
      imageHeight: image.height,
      bounds,
      fractionStartY,
      summaryBandTop,
      footerCropStartY,
      footerCropHeight: image.height - footerCropStartY,
      scanStart,
      scanEnd,
      greyHeaderThreshold: GREY_HEADER_LUMINANCE_THRESHOLD,
    },
    null,
    2,
  ),
);
