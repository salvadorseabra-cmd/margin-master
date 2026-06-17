import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  HEADER_RULE_MIN_EDGE,
  HEADER_RULE_OFFSETS,
  WHITE_HEADER_EXPANDED_MIN_RULE_FRACTION,
  WHITE_HEADER_MIN_RULE_FRACTION,
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

function rowEdgeScore(image: Image, y: number): number {
  if (y < 0 || y >= image.height - 1) return 0;
  let score = 0;
  const step = Math.max(1, Math.floor(image.width / 120));
  let samples = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x += step) {
    score += Math.abs(
      rowMeanLuminance(image, y) - rowMeanLuminance(image, y + 1),
    );
    samples++;
  }
  return samples > 0 ? score / samples : 0;
}

function rowDarkFraction(image: Image, y: number, threshold = 200): number {
  let dark = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x++) {
    if (pixelLuminance(image.getPixelAt(x, row)) < threshold) dark++;
  }
  return dark / image.width;
}

function bandAverageLuminance(image: Image, y: number, rows = 18): number {
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

function probeWhiteHeader(image: Image, minRuleFraction: number) {
  const scanStart = Math.floor(image.height * 0.12);
  const scanEnd = Math.floor(image.height * 0.55);
  const minRuleY = Math.floor(image.height * minRuleFraction);
  const rules: number[] = [];
  for (let y = Math.max(scanStart, minRuleY); y < scanEnd; y++) {
    if (rowEdgeScore(image, y) >= HEADER_RULE_MIN_EDGE) rules.push(y);
  }
  console.log(`minRuleFraction=${minRuleFraction} minRuleY=${minRuleY} rules=${rules.length}`);
  for (const ruleY of rules.slice(0, 15)) {
    for (const offset of HEADER_RULE_OFFSETS) {
      const candidateY = ruleY + offset;
      if (candidateY >= scanEnd - 18) continue;
      const white = isWhiteHeaderBand(image, candidateY);
      if (white || (candidateY >= 400 && candidateY <= 460)) {
        console.log(`  ruleY=${ruleY} offset=${offset} candidateY=${candidateY} white=${white} avg=${bandAverageLuminance(image, candidateY).toFixed(1)}`);
      }
    }
  }
}

const image = await Image.decode(readFileSync(".tmp/lenha-extraction-fix/invoice-full.png"));
console.log("=== Standard white header ===");
probeWhiteHeader(image, WHITE_HEADER_MIN_RULE_FRACTION);
console.log("=== Expanded white header ===");
probeWhiteHeader(image, WHITE_HEADER_EXPANDED_MIN_RULE_FRACTION);

for (const y of [380, 400, 410, 420, 430, 440, 450]) {
  let textRows = 0;
  for (let dy = 0; dy < 6; dy++) {
    const mean = rowMeanLuminance(image, y + dy);
    const dark = rowDarkFraction(image, y + dy);
    const ok = mean >= 165 && mean <= 215 && dark >= 0.30 && dark <= 0.75;
    if (ok) textRows++;
    console.log(`y=${y}+${dy} mean=${mean.toFixed(1)} dark=${dark.toFixed(2)} ok=${ok}`);
  }
  console.log(`  y=${y} textRows=${textRows} bandAvg=${bandAverageLuminance(image, y).toFixed(1)} white=${isWhiteHeaderBand(image, y)}`);
}
