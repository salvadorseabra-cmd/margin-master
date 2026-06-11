
import { readFileSync, writeFileSync } from "node:fs";
import { cropTableRegionForLineItems, detectTableBounds, parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const cropResult = await cropTableRegionForLineItems(dataUrl);

// Save cropped table region
const croppedBytes = parseImageDataUrl(cropResult.croppedDataUrl).bytes;
writeFileSync(outDir + "/table-crop.png", croppedBytes);

// Save top 400px of crop for first-row inspection
const croppedImg = await Image.decode(croppedBytes);
const topH = Math.min(400, croppedImg.height);
const topCrop = croppedImg.crop(0, 0, croppedImg.width, topH);
const topEncoded = await topCrop.encode();
writeFileSync(outDir + "/table-crop-top400.png", topEncoded);

console.log(JSON.stringify({
  fullImage: { width: image.width, height: image.height },
  bounds,
  cropResult: {
    fallbackUsed: cropResult.fallbackUsed,
    cropHeight: bounds ? bounds.bottom - bounds.top : null,
    cropTop: bounds?.top,
    cropBottom: bounds?.bottom,
    croppedSize: { width: croppedImg.width, height: croppedImg.height },
  },
}, null, 2));
