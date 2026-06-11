import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { readFileSync } from "node:fs";

function lum(p: number) {
  const r = (p >> 24) & 255;
  const g = (p >> 16) & 255;
  const b = (p >> 8) & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function rowStats(img: Image, y: number) {
  let s = 0;
  let dark = 0;
  const row = y + 1;
  for (let x = 1; x <= img.width; x++) {
    const l = lum(img.getPixelAt(x, row));
    s += l;
    if (l < 200) dark++;
  }
  return { mean: s / img.width, dark: dark / img.width };
}
function isSummaryRow(mean: number, dark: number) {
  return dark >= 0.88 && mean >= 155 && mean <= 188;
}

function detectSummaryBandTop(
  img: Image,
  scanStartY: number,
  scanEndY: number,
  minRows = 15,
): number | null {
  if (scanEndY - scanStartY < minRows) return null;
  let runStart: number | null = null;
  let runLen = 0;
  for (let y = scanStartY; y < scanEndY; y++) {
    const { mean, dark } = rowStats(img, y);
    if (isSummaryRow(mean, dark)) {
      if (runStart == null) runStart = y;
      runLen++;
      if (runLen >= minRows) return runStart;
    } else {
      runStart = null;
      runLen = 0;
    }
  }
  return null;
}

for (const [name, path, totalsStart, frac, tableBottom] of [
  ["emporio", ".tmp/emporio-footer-audit/emporio/invoice-full.png", 827, 506, 851],
  ["bidfood", ".tmp/bidfood-ovo.png", 1013, 572, 1037],
  ["aviludo", ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", 424, 422, 448],
] as const) {
  const img = await Image.decode(readFileSync(path));
  const bandTop = detectSummaryBandTop(img, frac, totalsStart);
  const anchored = Math.max(frac, tableBottom);
  const fixed = bandTop != null && anchored > bandTop ? frac : anchored;
  console.log(name, { bandTop, anchored, fixed });
}
