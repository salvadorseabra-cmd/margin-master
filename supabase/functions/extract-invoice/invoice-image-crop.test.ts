import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert, assertEquals, assertLess, assertGreater } from "jsr:@std/assert@1";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  computeBottomCropStartY,
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
  EMPORIO_FRACTION_START_Y,
  EMPORIO_TABLE_BOTTOM_Y,
  EMPORIO_TOTALS_BAND_Y,
} from "./invoice-crop-geometry.ts";
import {
  detectSummaryTotalsBandTop,
  detectTableBounds,
} from "./invoice-image-crop.ts";

const REPO_ROOT = join(new URL(".", import.meta.url).pathname, "../../..");

async function loadImage(relativePath: string): Promise<Image> {
  const bytes = readFileSync(join(REPO_ROOT, relativePath));
  return await Image.decode(bytes);
}

Deno.test("detectTableBounds: Bidfood preserves grey-header crop (headerTop≈447)", async () => {
  const image = await loadImage(".tmp/bidfood-ovo.png");
  const bounds = detectTableBounds(image);

  // Before fix: headerTop=447, cropTop=437
  assertGreater(bounds.headerTop, 440);
  assertLess(bounds.headerTop, 455);
  assertEquals(bounds.top, bounds.headerTop - 10);
  assertLess(bounds.top, 446);
  assertEquals(bounds.detected, true);
});

Deno.test("detectTableBounds: Aviludo May preserves 8-row crop (headerTop=228)", async () => {
  const image = await loadImage(
    ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png",
  );
  const bounds = detectTableBounds(image);

  // Before fix: headerTop=228, cropTop=218, bottom=448
  assertGreater(bounds.headerTop, 220);
  assertLess(bounds.headerTop, 235);
  assertEquals(bounds.top, 218);
  assertGreater(bounds.bottom, 440);
  assertEquals(bounds.detected, true);
});

Deno.test("detectTableBounds: Mammafiore anchors white header near y≈370, not footer y=632", async () => {
  const image = await loadImage(".tmp/mammafiore-investigation/invoice-full.png");
  const bounds = detectTableBounds(image);

  // Before fix: headerTop=632, cropTop=622 — all 8 rows excluded
  assertLess(bounds.top, 622);
  assertLess(bounds.headerTop, 450);
  assertGreater(bounds.headerTop, 340);

  const firstRowY = 395;
  const lastRowY = 655;
  assertLess(bounds.top, firstRowY);
  assertGreater(bounds.bottom, lastRowY);

  const cropHeight = bounds.bottom - bounds.top;
  assertGreater(cropHeight, 400);
  assertEquals(bounds.detected, true);
});

Deno.test("detectTableBounds: Bocconcino anchors white header near y≈453, not y=571", async () => {
  const image = await loadImage(".tmp/bocconcino-investigation/invoice-full.png");
  const bounds = detectTableBounds(image);
  const expectedHeaderTop = 453;

  // Before fix: headerTop=571, cropTop=561 — lost Mozzarella + Stracciatella
  assertLess(Math.abs(bounds.headerTop - expectedHeaderTop), 50);
  assertLess(bounds.top, 500);
  assertLess(bounds.top, bounds.headerTop);

  const cropHeight = bounds.bottom - bounds.top;
  assertGreater(cropHeight, 350);

  const mozzarellaRowY = 490;
  const stracciatellaRowY = 530;
  assertLess(bounds.top, mozzarellaRowY);
  assertLess(bounds.top, stracciatellaRowY);
  assertGreater(bounds.bottom, mozzarellaRowY);
  assertGreater(bounds.bottom, stracciatellaRowY);
});

Deno.test("footer crop: Emporio Italia includes grey totals box (Subtotal/Total)", async () => {
  const image = await loadImage(".tmp/emporio-footer-audit/emporio/invoice-full.png");
  const bounds = detectTableBounds(image);
  const fractionStartY = computeBottomCropStartY(image.height, DEFAULT_BOTTOM_CROP_FRACTION);

  assertEquals(bounds.bottom, EMPORIO_TABLE_BOTTOM_Y);
  assertEquals(fractionStartY, EMPORIO_FRACTION_START_Y);

  const summaryBandTop = detectSummaryTotalsBandTop(
    image,
    fractionStartY,
    bounds.totalsStart!,
  );
  assert(summaryBandTop != null);
  assertLess(summaryBandTop, EMPORIO_TOTALS_BAND_Y);

  const cropStartY = computeFooterCropStartY(
    image.height,
    bounds.bottom,
    DEFAULT_BOTTOM_CROP_FRACTION,
    summaryBandTop,
  );

  assertLess(cropStartY, bounds.bottom);
  assertEquals(cropStartY, EMPORIO_FRACTION_START_Y);
  assertLess(cropStartY, EMPORIO_TOTALS_BAND_Y);
  assertGreater(image.height - cropStartY, bounds.bottom - cropStartY);
});

Deno.test("footer crop: Bidfood keeps table-anchored start with TOTAL 292.70", async () => {
  const image = await loadImage(".tmp/bidfood-ovo.png");
  const bounds = detectTableBounds(image);
  const fractionStartY = computeBottomCropStartY(image.height, DEFAULT_BOTTOM_CROP_FRACTION);
  const summaryBandTop = bounds.totalsStart != null
    ? detectSummaryTotalsBandTop(image, fractionStartY, bounds.totalsStart)
    : null;

  assertEquals(summaryBandTop, null);

  const cropStartY = computeFooterCropStartY(
    image.height,
    bounds.bottom,
    DEFAULT_BOTTOM_CROP_FRACTION,
    summaryBandTop,
  );

  assertGreater(cropStartY, fractionStartY);
  assertEquals(cropStartY, bounds.bottom);
  assertGreater(cropStartY, 1000);
  assertLess(cropStartY, 1132);
});

Deno.test("footer crop: Aviludo May keeps table-anchored start with 330.42 band", async () => {
  const image = await loadImage(
    ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png",
  );
  const bounds = detectTableBounds(image);
  const fractionStartY = computeBottomCropStartY(image.height, DEFAULT_BOTTOM_CROP_FRACTION);
  const summaryBandTop = bounds.totalsStart != null
    ? detectSummaryTotalsBandTop(image, fractionStartY, bounds.totalsStart)
    : null;

  assertEquals(summaryBandTop, null);

  const cropStartY = computeFooterCropStartY(
    image.height,
    bounds.bottom,
    DEFAULT_BOTTOM_CROP_FRACTION,
    summaryBandTop,
  );

  assertEquals(cropStartY, bounds.bottom);
  assertGreater(cropStartY, fractionStartY);
  assertLess(cropStartY, 500);
});
