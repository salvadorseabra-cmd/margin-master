import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";

const txt = await Deno.readTextFile(".tmp/emporio-footer-audit/emporio/invoice-full.b64.txt");
const { bytes, mime } = parseImageDataUrl(txt);
console.log("mime", mime, "bytes", bytes.length);
const image = await Image.decode(bytes);
console.log("parsed:", image.width, image.height);
