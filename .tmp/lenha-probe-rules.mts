import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  HEADER_RULE_OFFSETS,
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
    const l1 = pixelLuminance(image.getPixelAt(x, row));
    const l2 = pixelLuminance(image.getPixelAt(x, row + 1));
    score += Math.abs(l1 - l2);
    samples++;
  }
  return samples > 0 ? score / samples : 0;
}

const image = await Image.decode(readFileSync(".tmp/lenha-extraction-fix/invoice-full.png"));
for (const y of [228, 400, 531, 360]) {
  let ruleScore = 0;
  for (const offset of HEADER_RULE_OFFSETS) {
    ruleScore = Math.max(ruleScore, rowEdgeScore(image, y - offset));
  }
  console.log(`y=${y} ruleScore=${ruleScore.toFixed(1)} frac=${(y / image.height).toFixed(3)}`);
}
