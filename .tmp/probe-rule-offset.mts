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

function detectFromRules(image: Image, minRuleFraction: number): number | null {
  const h = image.height;
  const scanStart = Math.floor(h * 0.12);
  const scanEnd = Math.floor(h * 0.55);
  const minRuleY = Math.floor(h * minRuleFraction);
  const minEdge = 28;
  const rules: number[] = [];
  for (let y = Math.max(scanStart, minRuleY); y < scanEnd; y++) {
    if (rowEdgeScore(image, y) >= minEdge) rules.push(y);
  }
  rules.sort((a, b) => a - b);
  for (const yRule of rules) {
    for (const offset of [12, 16, 20, 24]) {
      const yCand = yRule + offset;
      if (yCand >= scanEnd - 18) continue;
      if (validateHeaderBand(image, yCand)) return yCand;
    }
  }
  return null;
}

function detectGrey(image: Image): { y: number; avg: number } {
  const h = image.height;
  const scanStart = Math.floor(h * 0.12);
  const scanEnd = Math.floor(h * 0.55);
  let y = scanStart;
  let avg = Infinity;
  for (let yy = scanStart; yy < scanEnd - 18; yy++) {
    const a = bandAverage(image, yy);
    if (a < avg) {
      avg = a;
      y = yy;
    }
  }
  return { y, avg };
}

const paths: [string, string, number][] = [
  [".tmp/bocconcino-investigation/invoice-full.png", "Bocconcino", 453],
  [".tmp/bidfood-ovo.png", "Bidfood", 447],
  [".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", "Aviludo", 228],
];

for (const minFrac of [0.35, 0.38, 0.40, 0.42]) {
  console.log(`\n=== minRuleFraction=${minFrac}`);
  for (const [p, label, expected] of paths) {
    const image = await Image.decode(readFileSync(p));
    const { avg } = detectGrey(image);
    const grey = avg < 163;
    const detected = grey ? detectGrey(image).y : detectFromRules(image, minFrac);
    console.log(
      `${label}: grey=${grey} detected=${detected} expected=${expected} delta=${detected != null ? (detected as number) - expected : "n/a"}`,
    );
  }
}
