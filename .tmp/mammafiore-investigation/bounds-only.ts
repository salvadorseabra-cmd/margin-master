import { readFileSync } from "node:fs";
import { detectTableBounds, parseImageDataUrl, cropTableRegionForLineItems } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const cropResult = await cropTableRegionForLineItems(dataUrl);
console.log(JSON.stringify({
  size: { w: image.width, h: image.height },
  bounds,
  cropH: bounds.bottom - bounds.top,
  fallbackUsed: cropResult.fallbackUsed,
}, null, 2));
