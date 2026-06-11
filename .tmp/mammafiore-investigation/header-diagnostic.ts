import { readFileSync, writeFileSync } from "node:fs";
import { detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  GREY_HEADER_LUMINANCE_THRESHOLD,
  TABLE_SCAN_START_FRACTION,
  TABLE_SCAN_END_FRACTION,
  WHITE_HEADER_MIN_RULE_FRACTION,
  HEADER_RULE_MIN_EDGE,
} from "../../supabase/functions/extract-invoice/invoice-crop-geometry.ts";

const pngPath = Deno.args[0];
const outDir = Deno.args[1];
const fullImage = await Image.decode(readFileSync(pngPath));
const height = fullImage.height;
const scanStart = Math.floor(height * TABLE_SCAN_START_FRACTION);
const scanEnd = Math.floor(height * TABLE_SCAN_END_FRACTION);
const minRuleY = Math.floor(height * WHITE_HEADER_MIN_RULE_FRACTION);

function pixelLuminance(pixel: number): number {
  const r = (pixel >> 24) & 0xff;
  const g = (pixel >> 16) & 0xff;
  const b = (pixel >> 8) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function rowMeanLuminance(img: Image, y: number): number {
  let sum = 0;
  for (let x = 1; x <= img.width; x++) sum += pixelLuminance(img.getPixelAt(x, y + 1));
  return sum / img.width;
}
function rowEdgeScore(img: Image, y: number): number {
  if (y < 0 || y >= img.height - 1) return 0;
  let score = 0, samples = 0;
  const step = Math.max(1, Math.floor(img.width / 120));
  for (let x = 1; x <= img.width; x += step) {
    score += Math.abs(
      pixelLuminance(img.getPixelAt(x, y + 1)) -
      pixelLuminance(img.getPixelAt(x, y + 2))
    );
    samples++;
  }
  return samples > 0 ? score / samples : 0;
}

writeFileSync(outDir + "/table-zone-320-520.png", await fullImage.clone().crop(0, 320, fullImage.width, 200).encode());

let headerTop = scanStart, bestBand = Infinity;
for (let y = scanStart; y < scanEnd - 18; y++) {
  let sum = 0;
  for (let dy = 0; dy < 18; dy++) sum += rowMeanLuminance(fullImage, y + dy);
  const avg = sum / 18;
  if (avg < bestBand) { bestBand = avg; headerTop = y; }
}

const rules: { y: number; edge: number }[] = [];
for (let y = Math.max(scanStart, minRuleY); y < scanEnd; y++) {
  const edge = rowEdgeScore(fullImage, y);
  if (edge >= HEADER_RULE_MIN_EDGE) rules.push({ y, edge });
}
rules.sort((a, b) => b.edge - a.edge);

const bounds = detectTableBounds(fullImage);

for (const row of [
  { label: "first", y: 395, h: 55 },
  { label: "middle", y: 520, h: 55 },
  { label: "last", y: 655, h: 55 },
]) {
  writeFileSync(`${outDir}/ocr-row-${row.label}.png`, await fullImage.clone().crop(0, row.y, fullImage.width, row.h).encode());
}

const overlay = fullImage.clone();
const drawHLine = (y: number, color: number) => {
  if (y < 0 || y >= overlay.height) return;
  for (let x = 0; x < overlay.width; x++) overlay.setPixelAt(x + 1, y + 1, color);
};
drawHLine(bounds.top, 0xff0000ff);
drawHLine(Math.min(bounds.bottom, overlay.height - 1), 0xff00ff00);
drawHLine(bounds.headerTop, 0xffff0000);
drawHLine(370, 0xff00ffff);
if (bounds.totalsStart != null) drawHLine(bounds.totalsStart, 0xffffff00);
writeFileSync(outDir + "/overlay.png", await overlay.encode());

console.log(JSON.stringify({
  imageSize: { w: fullImage.width, h: height },
  scanRange: { scanStart, scanEnd },
  whiteHeaderSearchStart: Math.max(scanStart, minRuleY),
  greyDetection: {
    darkestHeaderTop: headerTop,
    bestBandAverage: Math.round(bestBand * 100) / 100,
    triggersWhitePath: bestBand >= GREY_HEADER_LUMINANCE_THRESHOLD,
  },
  rulesInWhiteSearchZone: rules.slice(0, 10),
  productionBounds: bounds,
  expectedHeaderApproxY: 370,
  analysis: "Real column headers at y≈370; white-header search starts y≥449; grey fallback picks y=632 (footer band)",
}, null, 2));
