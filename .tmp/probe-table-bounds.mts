import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "../supabase/functions/extract-invoice/invoice-image-crop.ts";

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
    const l1 = pixelLuminance(image.getPixelAt(x, row));
    const l2 = pixelLuminance(image.getPixelAt(x, row + 1));
    score += Math.abs(l1 - l2);
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

const paths: [string, string][] = [
  [".tmp/bocconcino-investigation/invoice-full.png", "Bocconcino"],
  [".tmp/bidfood-ovo.png", "Bidfood"],
  [".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", "Aviludo"],
];

for (const [p, label] of paths) {
  const image = await Image.decode(readFileSync(p));
  const bounds = detectTableBounds(image);
  const h = image.height;
  const scanStart = Math.floor(h * 0.12);
  const scanEnd = Math.floor(h * 0.55);
  const edges: { y: number; edge: number }[] = [];
  for (let y = scanStart; y < scanEnd; y++) {
    edges.push({ y, edge: rowEdgeScore(image, y) });
  }
  edges.sort((a, b) => b.edge - a.edge);
  console.log(`\n=== ${label} current headerTop=${bounds.headerTop} cropTop=${bounds.top}`);
  console.log("top 15 edges in scan band:");
  for (const e of edges.slice(0, 15)) {
    console.log(`  y=${e.y} edge=${e.edge.toFixed(2)}`);
  }
  for (const y of [430, 440, 443, 450, 453, 454, 460, 500, 561, 571]) {
    if (y < h) {
      console.log(
        `y=${y} mean=${rowMeanLuminance(image, y).toFixed(1)} darkFrac=${
          (rowDarkFraction(image, y) * 100).toFixed(1)
        }% edge=${rowEdgeScore(image, y).toFixed(2)}`,
      );
    }
  }
}
