import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "../supabase/functions/extract-invoice/invoice-image-crop.ts";

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

function peakInRange(image: Image, start: number, end: number): { y: number; edge: number } {
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

const paths = [
  [".tmp/bocconcino-investigation/invoice-full.png", "Bocconcino", 472, 170],
  [".tmp/bidfood-ovo.png", "Bidfood", 465, 170],
  [".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", "Aviludo", 247, 170],
];

for (const [path, label, refinedBottom, minH] of paths) {
  const image = await Image.decode(readFileSync(path));
  const h = image.height;
  const oldEnd = Math.min(refinedBottom + 350, Math.floor(h * 0.85));
  const newEnd = Math.floor(h * 0.88);
  const start = refinedBottom + minH;
  console.log(
    label,
    "old peak",
    peakInRange(image, start, oldEnd),
    "new peak",
    peakInRange(image, start, newEnd),
    "bounds",
    detectTableBounds(image),
  );
}
