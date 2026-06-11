
import { readFileSync, writeFileSync } from "node:fs";
import { parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const cropTop = Number(Deno.args[2]);
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const h = Math.min(cropTop, image.height);
const above = image.crop(0, 0, image.width, h);
writeFileSync(outDir + "/region-above-crop-top.png", await above.encode());
// Also save table header zone: y=400..650
const tableZone = image.crop(0, 400, image.width, Math.min(250, image.height - 400));
writeFileSync(outDir + "/table-zone-400-650.png", await tableZone.encode());
console.log("saved");
