
import { readFileSync, writeFileSync } from "node:fs";
import { cropTableRegionForLineItems, detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const cropResult = await cropTableRegionForLineItems(dataUrl);
writeFileSync(outDir + "/table-crop.png", parseImageDataUrl(cropResult.croppedDataUrl).bytes);
writeFileSync(outDir + "/table-crop-dataurl.txt", cropResult.croppedDataUrl);
console.log(JSON.stringify({ bounds, fallbackUsed: cropResult.fallbackUsed, fullSize: { w: image.width, h: image.height } }));
