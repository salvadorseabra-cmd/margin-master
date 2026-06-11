import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

function pixelLuminance(pixel: number): number {
  const r = (pixel >> 24) & 0xff;
  const g = (pixel >> 16) & 0xff;
  const b = (pixel >> 8) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
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

const image = await Image.decode(
  readFileSync(".tmp/bocconcino-investigation/invoice-full.png"),
);

for (const y of [640, 660, 666, 700, 750, 800, 857, 881, 900]) {
  console.log(`y=${y} edge=${rowEdgeScore(image, y).toFixed(2)}`);
}

function peakInRange(start: number, end: number): { y: number; edge: number } {
  let peak = 0;
  let peakY = start;
  for (let y = start; y < end; y++) {
    const edge = rowEdgeScore(image, y);
    if (edge > peak) {
      peak = edge;
      peakY = y;
    }
  }
  return { y: peakY, edge: peak };
}

console.log("peak [642,945]:", peakInRange(642, 945));
console.log("peak [777,913]:", peakInRange(777, 913));
