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

function rowEdgeScore(image: Image, y: number): number {
  if (y < 0 || y >= image.height - 1) return 0;
  let score = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor(image.width / 120));
  const row = y + 1;
  for (let x = 1; x <= image.width; x += step) {
    score += Math.abs(
      pixelLuminance(image.getPixelAt(x, row)) -
        pixelLuminance(image.getPixelAt(x, row + 1)),
    );
    samples++;
  }
  return samples > 0 ? score / samples : 0;
}

function rowDarkFraction(image: Image, y: number, thresh = 200): number {
  let dark = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x++) {
    if (pixelLuminance(image.getPixelAt(x, row)) < thresh) dark++;
  }
  return dark / image.width;
}

function bandAverage(image: Image, y: number, rows = 18): number {
  let sum = 0;
  for (let dy = 0; dy < rows; dy++) sum += rowMeanLuminance(image, y + dy);
  return sum / rows;
}

function validateHeaderBand(image: Image, y: number): boolean {
  let textRows = 0;
  for (let dy = 0; dy < 6; dy++) {
    const mean = rowMeanLuminance(image, y + dy);
    const dark = rowDarkFraction(image, y + dy);
    if (mean >= 165 && mean <= 215 && dark >= 0.30 && dark <= 0.75) textRows++;
  }
  const avg = bandAverage(image, y);
  return textRows >= 3 && avg >= 168;
}

function detectStructural(image: Image): number | null {
  const h = image.height;
  const scanStart = Math.floor(h * 0.12);
  const scanEnd = Math.floor(h * 0.55);
  const minEdge = 28;
  const rules: number[] = [];
  for (let y = scanStart; y < scanEnd; y++) {
    if (rowEdgeScore(image, y) >= minEdge) rules.push(y);
  }
  rules.sort((a, b) => a - b);
  for (const yRule of rules) {
    for (const offset of [10, 14, 18, 22]) {
      const yCand = yRule + offset;
      if (yCand >= scanEnd - 18) continue;
      if (validateHeaderBand(image, yCand)) return yCand;
    }
  }
  return null;
}

const paths: [string, string, number][] = [
  [".tmp/bocconcino-investigation/invoice-full.png", "Bocconcino", 453],
  [".tmp/bidfood-ovo.png", "Bidfood", 447],
  [".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", "Aviludo", 228],
];

for (const [p, label, expected] of paths) {
  const image = await Image.decode(readFileSync(p));
  const structural = detectStructural(image);
  console.log(`${label}: structural=${structural} expected=${expected} delta=${structural != null ? structural - expected : "n/a"}`);
  for (const y of [228, 430, 447, 453, 454, 571]) {
    if (y < image.height - 18) {
      console.log(`  y=${y} valid=${validateHeaderBand(image, y)} avg=${bandAverage(image, y).toFixed(1)}`);
    }
  }
}
