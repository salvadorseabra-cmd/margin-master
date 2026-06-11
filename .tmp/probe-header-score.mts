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
  return textRows >= 3 && avg >= 168 && avg <= 195;
}

function ruleAboveScore(image: Image, y: number): number {
  let peak = 0;
  for (let dy = 3; dy <= 25; dy++) {
    peak = Math.max(peak, rowEdgeScore(image, y - dy));
  }
  return peak;
}

function detectWhiteHeader(image: Image): number {
  const h = image.height;
  const scanStart = Math.floor(h * 0.12);
  const scanEnd = Math.floor(h * 0.55);
  let bestY = scanStart;
  let bestScore = -1;
  for (let y = scanStart; y < scanEnd - 18; y++) {
    if (!validateHeaderBand(image, y)) continue;
    const score = ruleAboveScore(image, y);
    if (score > bestScore || (score === bestScore && y < bestY)) {
      bestScore = score;
      bestY = y;
    }
  }
  return bestY;
}

function detectGreyHeader(image: Image): number {
  const h = image.height;
  const HEADER_BAND_ROWS = 18;
  const scanStart = Math.floor(h * 0.12);
  const scanEnd = Math.floor(h * 0.55);
  let headerTop = scanStart;
  let bestBandAverage = Number.POSITIVE_INFINITY;
  for (let y = scanStart; y < scanEnd - HEADER_BAND_ROWS; y++) {
    const avg = bandAverage(image, y, HEADER_BAND_ROWS);
    if (avg < bestBandAverage) {
      bestBandAverage = avg;
      headerTop = y;
    }
  }
  return headerTop;
}

const GREY_THRESHOLD = 163;

const paths: [string, string, number][] = [
  [".tmp/bocconcino-investigation/invoice-full.png", "Bocconcino", 453],
  [".tmp/bidfood-ovo.png", "Bidfood", 447],
  [".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", "Aviludo", 228],
];

for (const [p, label, expected] of paths) {
  const image = await Image.decode(readFileSync(p));
  const h = image.height;
  const scanStart = Math.floor(h * 0.12);
  const scanEnd = Math.floor(h * 0.55);
  const globalMinAvg = Math.min(
    ...Array.from({ length: scanEnd - scanStart - 18 }, (_, i) =>
      bandAverage(image, scanStart + i)),
  );
  const grey = globalMinAvg < GREY_THRESHOLD;
  const detected = grey ? detectGreyHeader(image) : detectWhiteHeader(image);
  console.log(
    `${label}: grey=${grey} globalMinAvg=${globalMinAvg.toFixed(1)} detected=${detected} expected=${expected} delta=${detected - expected}`,
  );
  if (!grey) {
    const top = [];
    for (let y = scanStart; y < scanEnd - 18; y++) {
      if (!validateHeaderBand(image, y)) continue;
      top.push({ y, rule: ruleAboveScore(image, y), avg: bandAverage(image, y) });
    }
    top.sort((a, b) => b.rule - a.rule);
    console.log("  top scored:", top.slice(0, 8).map((t) => `y=${t.y} rule=${t.rule.toFixed(1)} avg=${t.avg.toFixed(1)}`).join(", "));
  }
}
