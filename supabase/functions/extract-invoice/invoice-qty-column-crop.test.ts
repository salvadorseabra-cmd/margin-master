import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert, assertEquals, assertGreater, assertLess } from "jsr:@std/assert@1";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  cropQtdColumnStrip,
  isMostlyBlankStrip,
} from "./invoice-qty-column-crop.ts";
import { parseImageDataUrl, toImageDataUrl } from "./invoice-image-crop.ts";
import {
  EMPORIO_QTD_COLUMN_X_FRAC,
  QTD_STRIP_MIN_WIDTH_PX,
  QTD_STRIP_RIGHT_PAD_PX,
} from "./invoice-crop-geometry.ts";

const REPO_ROOT = join(new URL(".", import.meta.url).pathname, "../../..");

Deno.test("cropQtdColumnStrip: Emporio table-crop → ~43px Qtd strip", async () => {
  const tableCropPath = join(
    REPO_ROOT,
    ".tmp/fraction-row-crop-audit/table-crop.png",
  );
  const bytes = readFileSync(tableCropPath);
  const dataUrl = toImageDataUrl(bytes);

  const stripUrl = await cropQtdColumnStrip(dataUrl);
  assert(stripUrl != null, "strip crop should succeed on Emporio table crop");

  const { bytes: stripBytes } = parseImageDataUrl(stripUrl);
  const strip = await Image.decode(stripBytes);
  const source = await Image.decode(bytes);
  const expectedWidth = Math.min(
    source.width,
    Math.ceil(source.width * EMPORIO_QTD_COLUMN_X_FRAC.x1) +
      QTD_STRIP_RIGHT_PAD_PX,
  ) - Math.floor(source.width * EMPORIO_QTD_COLUMN_X_FRAC.x0);

  assertEquals(strip.width, expectedWidth);
  assertGreater(strip.width, QTD_STRIP_MIN_WIDTH_PX);
  assertLess(strip.width, 50);
  assertEquals(strip.height, source.height);
  assertEquals(isMostlyBlankStrip(strip), false);
});

Deno.test("cropQtdColumnStrip: blank image fails open", async () => {
  const blank = new Image(724, 100);
  blank.fill(0xffffffff);
  const encoded = await blank.encode();
  const dataUrl = toImageDataUrl(encoded);

  const stripUrl = await cropQtdColumnStrip(dataUrl);
  assertEquals(stripUrl, null);
});
