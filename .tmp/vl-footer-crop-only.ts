/** Save footer crop PNG from a data URL file (first arg) to output path (second arg). */
import { cropBottomPortion } from "../supabase/functions/extract-invoice/invoice-image-crop.ts";

const [imagePath, outPath] = Deno.args;
if (!imagePath || !outPath) {
  console.error("usage: vl-footer-crop-only.ts <dataUrlFile> <outPng>");
  Deno.exit(1);
}

const imageDataUrl = await Deno.readTextFile(imagePath);
const cropped = await cropBottomPortion(imageDataUrl);
const match = cropped.match(/^data:image\/png;base64,(.+)$/);
if (!match) throw new Error("crop did not return png data url");
await Deno.writeFile(outPath, Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0)));
console.log(`saved ${outPath}`);
