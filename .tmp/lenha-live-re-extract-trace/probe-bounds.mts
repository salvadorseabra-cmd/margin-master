import { detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const label = Deno.args[0] ?? "LOCAL";
const imagePath = Deno.args[1] ??
  ".tmp/lenha-extraction-fix/invoice-full.png";
const buf = await Deno.readFile(imagePath);
const image = await Image.decode(buf);
const bounds = detectTableBounds(image);
console.log(JSON.stringify({ label, imageHeight: image.height, imageWidth: image.width, bounds }, null, 2));
