import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  GREY_HEADER_LUMINANCE_THRESHOLD,
  HEADER_BAND_ROWS,
  TABLE_SCAN_END_FRACTION,
  TABLE_SCAN_START_FRACTION,
} from "../supabase/functions/extract-invoice/invoice-crop-geometry.ts";

function pixelLuminance(pixel: number): number {
  const r = (pixel >> 24) & 0xff;
  const g = (pixel >> 16) & 0xff;
  const b = (pixel >> 8) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rowMeanLuminance(image: Image, y: number): number {
  let sum = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x++) sum += pixelLuminance(image.getPixelAt(x, row));
  return sum / image.width;
}

function bandAverage(image: Image, y: number, rows = HEADER_BAND_ROWS): number {
  let sum = 0;
  for (let dy = 0; dy < rows; dy++) sum += rowMeanLuminance(image, y + dy);
  return sum / rows;
}

const image = await Image.decode(readFileSync(".tmp/lenha-extraction-fix/invoice-full.png"));
const h = image.height;
const scanStart = Math.floor(h * TABLE_SCAN_START_FRACTION);
const scanEnd = Math.floor(h * TABLE_SCAN_END_FRACTION);
console.log({ h, scanStart, scanEnd, greyThreshold: GREY_HEADER_LUMINANCE_THRESHOLD });

const candidates: { y: number; avg: number }[] = [];
for (let y = scanStart; y < scanEnd - HEADER_BAND_ROWS; y++) {
  candidates.push({ y, avg: bandAverage(image, y) });
}
candidates.sort((a, b) => a.avg - b.avg);
console.log("Darkest 10 bands:");
for (const c of candidates.slice(0, 10)) {
  console.log(`  y=${c.y} avg=${c.avg.toFixed(1)} frac=${(c.y / h).toFixed(3)}`);
}

for (const y of [400, 420, 430, 440, 600, 610, 621]) {
  console.log(`y=${y} avg=${bandAverage(image, y).toFixed(1)}`);
}
