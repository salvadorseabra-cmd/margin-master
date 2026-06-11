import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";

const txt = await Deno.readTextFile(".tmp/emporio-footer-audit/emporio/invoice-full.b64.txt");
const { bytes } = parseImageDataUrl(txt);
const image = await Image.decode(bytes);
console.log("after decode", image.width, image.height);
const encoded = await image.encode();
console.log("after encode", image.width, image.height, "encoded bytes", encoded.length);
