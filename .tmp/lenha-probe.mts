import { readFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "../supabase/functions/extract-invoice/invoice-image-crop.ts";

const image = await Image.decode(readFileSync(".tmp/lenha-extraction-fix/invoice-full.png"));
const bounds = detectTableBounds(image);
console.log(JSON.stringify({ width: image.width, height: image.height, bounds }, null, 2));
