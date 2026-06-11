import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { parseImageDataUrl, detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { computeFooterCropStartY, computeBottomCropStartY, DEFAULT_BOTTOM_CROP_FRACTION } from "../../supabase/functions/extract-invoice/invoice-crop-geometry.ts";

const txt = await Deno.readTextFile(".tmp/emporio-footer-audit/emporio/invoice-full.b64.txt");
const { bytes } = parseImageDataUrl(txt);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const footerCropStartY = computeFooterCropStartY(image.height, bounds.bottom, DEFAULT_BOTTOM_CROP_FRACTION);
console.log("before crop", image.width, image.height, "startY", footerCropStartY);
const footerCropHeight = Math.max(1, image.height - footerCropStartY);
const footerCrop = image.crop(0, footerCropStartY, image.width, footerCropHeight);
console.log("after footer crop parent", image.width, image.height);
console.log("footer crop child", footerCrop.width, footerCrop.height);
