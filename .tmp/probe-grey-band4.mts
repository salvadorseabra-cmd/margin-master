import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { readFileSync } from "node:fs";

function lum(p: number) {
  const r = (p >> 24) & 255;
  const g = (p >> 16) & 255;
  const b = (p >> 8) & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function rowStats(img: Image, y: number) {
  let s = 0;
  let dark = 0;
  const row = y + 1;
  for (let x = 1; x <= img.width; x++) {
    const l = lum(img.getPixelAt(x, row));
    s += l;
    if (l < 200) dark++;
  }
  return { mean: s / img.width, dark: dark / img.width };
}

const img = await Image.decode(readFileSync(".tmp/emporio-footer-audit/emporio/invoice-full.png"));
for (let y = 680; y <= 830; y++) {
  const { mean, dark } = rowStats(img, y);
  const hit = dark >= 0.88 && mean >= 155 && mean <= 188;
  if (hit || y % 10 === 0) console.log(`y=${y} mean=${mean.toFixed(1)} dark=${(dark*100).toFixed(1)}% hit=${hit}`);
}
