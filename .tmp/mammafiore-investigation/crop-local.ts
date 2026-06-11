
import { readFileSync, writeFileSync } from "node:fs";
import { cropTableRegionForLineItems, detectTableBounds, parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const cropResult = await cropTableRegionForLineItems(dataUrl);

const croppedBytes = parseImageDataUrl(cropResult.croppedDataUrl).bytes;
writeFileSync(outDir + "/table-crop.png", croppedBytes);

const croppedImg = await Image.decode(croppedBytes);
const topH = Math.min(400, croppedImg.height);
const topCrop = croppedImg.crop(0, 0, croppedImg.width, topH);
writeFileSync(outDir + "/table-crop-top400.png", await topCrop.encode());

// Region above crop top
if (bounds.detected && bounds.top > 0) {
  const aboveH = Math.min(bounds.top, image.height);
  const above = image.crop(0, 0, image.width, aboveH);
  writeFileSync(outDir + "/region-above-crop-top.png", await above.encode());
}

// Overlay: red=top, green=bottom, blue=headerTop
const overlay = image.clone();
const drawHLine = (y: number, color: number) => {
  if (y < 0 || y >= overlay.height) return;
  for (let x = 0; x < overlay.width; x++) overlay.setPixelAt(x + 1, y + 1, color);
};
if (bounds.detected) {
  drawHLine(bounds.top, 0xff0000ff);
  drawHLine(bounds.bottom, 0xff00ff00);
  drawHLine(bounds.headerTop, 0xffff0000);
  if (bounds.totalsStart != null) drawHLine(bounds.totalsStart, 0xffffff00);
}
writeFileSync(outDir + "/overlay.png", await overlay.encode());

// Row band crops for OCR (first/middle/last of expected 8 rows)
const rowBands = [];
if (bounds.detected) {
  const tableH = bounds.bottom - bounds.top;
  const rowH = Math.floor(tableH / 8);
  for (const idx of [0, 3, 7]) {
    const y0 = bounds.top + idx * rowH;
    const h = Math.min(rowH + 20, image.height - y0);
    const band = image.crop(0, y0, image.width, h);
    const path = outDir + "/row-band-" + idx + ".png";
    writeFileSync(path, await band.encode());
    rowBands.push({ index: idx, y0, h, path: "row-band-" + idx + ".png" });
  }
}

console.log(JSON.stringify({
  fullImage: { width: image.width, height: image.height },
  bounds,
  cropResult: {
    fallbackUsed: cropResult.fallbackUsed,
    cropHeight: bounds.detected ? bounds.bottom - bounds.top : null,
    cropTop: bounds?.top,
    cropBottom: bounds?.bottom,
    croppedSize: { width: croppedImg.width, height: croppedImg.height },
  },
  rowBands,
}, null, 2));
