import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { readFileSync } from "node:fs";

function lum(p: number) {
  const r = (p >> 24) & 255;
  const g = (p >> 16) & 255;
  const b = (p >> 8) & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function rowMean(img: Image, y: number) {
  let s = 0;
  const row = y + 1;
  for (let x = 1; x <= img.width; x++) s += lum(img.getPixelAt(x, row));
  return s / img.width;
}

for (const [name, path, totalsStart] of [
  ["emporio", ".tmp/emporio-footer-audit/emporio/invoice-full.png", 827],
  ["bidfood", ".tmp/bidfood-ovo.png", 1013],
  ["aviludo", ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", 424],
] as const) {
  const img = await Image.decode(readFileSync(path));
  const frac = Math.round(img.height * 0.45);
  let bestRun: { start: number; len: number; end: number } | null = null;
  let runStart: number | null = null;
  let runLen = 0;
  for (let y = frac; y < totalsStart; y++) {
    const m = rowMean(img, y);
    const grey = m >= 130 && m <= 195;
    if (grey) {
      if (runStart == null) runStart = y;
      runLen++;
    } else {
      if (runLen >= (bestRun?.len ?? 0) && runStart != null) {
        bestRun = { start: runStart, len: runLen, end: runStart + runLen - 1 };
      }
      runStart = null;
      runLen = 0;
    }
  }
  if (runLen >= (bestRun?.len ?? 0) && runStart != null) {
    bestRun = { start: runStart, len: runLen, end: runStart + runLen - 1 };
  }
  console.log(name, "frac", frac, "totalsStart", totalsStart, "bestGreyRun", bestRun);
}
