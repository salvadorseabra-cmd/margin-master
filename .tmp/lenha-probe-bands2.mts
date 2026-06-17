import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

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

function rowDarkFraction(image: Image, y: number, threshold = 200): number {
  let dark = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x++) {
    if (pixelLuminance(image.getPixelAt(x, row)) < threshold) dark++;
  }
  return dark / image.width;
}

function bandAverage(image: Image, y: number, rows = 18): number {
  let sum = 0;
  for (let dy = 0; dy < rows; dy++) sum += rowMeanLuminance(image, y + dy);
  return sum / rows;
}

function isWhiteHeaderBand(image: Image, y: number): boolean {
  let textRows = 0;
  for (let dy = 0; dy < 6; dy++) {
    const mean = rowMeanLuminance(image, y + dy);
    const dark = rowDarkFraction(image, y + dy);
    if (mean >= 165 && mean <= 215 && dark >= 0.30 && dark <= 0.75) textRows++;
  }
  const bandAverage = bandAverageLuminance(image, y);
  return textRows >= 3 && bandAverage >= 168 && bandAverage <= 195;
}

function bandAverageLuminance(image: Image, y: number, rows = 18): number {
  return bandAverage(image, y, rows);
}

const image = await Image.decode(readFileSync(".tmp/lenha-extraction-fix/invoice-full.png"));
const scanStart = Math.floor(image.height * 0.12);
const footerMaxY = Math.floor(image.height * 0.50);
const hits: number[] = [];
for (let y = scanStart; y < footerMaxY - 18; y++) {
  if (isWhiteHeaderBand(image, y)) hits.push(y);
}
console.log("white header bands:", hits);
