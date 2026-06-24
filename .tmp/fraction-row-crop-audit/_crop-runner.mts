
import { readFileSync, writeFileSync } from "node:fs";
import {
  cropTableRegionForLineItems,
  detectTableBounds,
  parseImageDataUrl,
} from "/Users/salvadorseabra1/margin-master/supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const cropResult = await cropTableRegionForLineItems(dataUrl);

const croppedBytes = parseImageDataUrl(cropResult.croppedDataUrl).bytes;
writeFileSync(outDir + "/table-crop.png", croppedBytes);

const overlay = image.clone();
const drawHLine = (y: number, color: number) => {
  if (y < 0 || y >= overlay.height) return;
  for (let x = 0; x < overlay.width; x++) overlay.setPixelAt(x + 1, y + 1, color);
};
if (bounds.detected) {
  drawHLine(bounds.top, 0xff0000ff);
  drawHLine(bounds.bottom, 0xff00ff00);
  drawHLine(bounds.headerTop, 0xffff0000);
  drawHLine(bounds.headerBottom, 0xff00ffff);
  if (bounds.totalsStart != null) drawHLine(bounds.totalsStart, 0xffffff00);
}

writeFileSync(outDir + "/crop-overlay.png", await overlay.encode());

console.log(JSON.stringify({
  imageWidth: image.width,
  imageHeight: image.height,
  bounds,
  cropHeight: bounds.detected ? bounds.bottom - bounds.top : image.height,
  fallbackUsed: cropResult.fallbackUsed,
}));
