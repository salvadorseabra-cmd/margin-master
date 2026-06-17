import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { HEADER_BAND_ROWS } from "../supabase/functions/extract-invoice/invoice-crop-geometry.ts";

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
const scanStart = Math.floor(h * 0.12);
const upperEnd = Math.floor(h * 0.50);
let best = { y: scanStart, avg: Infinity };
for (let y = scanStart; y < upperEnd - HEADER_BAND_ROWS; y++) {
  const avg = bandAverage(image, y);
  if (avg < best.avg) best = { y, avg };
}
console.log("Upper half darkest:", best);
