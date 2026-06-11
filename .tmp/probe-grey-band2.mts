import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { readFileSync } from "node:fs";

function lum(p: number) {
  const r = (p >> 24) & 255;
  const g = (p >> 16) & 255;
  const b = (p >> 8) & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function rowMean(img: Image, y: number) {
  let s = 0;
  const row = y + 1;
  for (let x = 1; x <= img.width; x++) s += lum(img.getPixelAt(x, row));
  return s / img.width;
}
function rowDark(img: Image, y: number, threshold = 200) {
  let dark = 0;
  const row = y + 1;
  for (let x = 1; x <= img.width; x++) {
    if (lum(img.getPixelAt(x, row)) < threshold) dark++;
  }
  return dark / img.width;
}

for (const [name, path, samples] of [
  ["emporio", ".tmp/emporio-footer-audit/emporio/invoice-full.png", [550, 650, 720, 780, 810, 825]],
  ["bidfood", ".tmp/bidfood-ovo.png", [600, 800, 1000, 1100, 1130]],
  ["aviludo", ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png", [400, 450, 500]],
] as const) {
  const img = await Image.decode(readFileSync(path));
  console.log("\n", name);
  for (const y of samples) {
    console.log(` y=${y} mean=${rowMean(img,y).toFixed(1)} dark=${(rowDark(img,y)*100).toFixed(1)}%`);
  }
}
