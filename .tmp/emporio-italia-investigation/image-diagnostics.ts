import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
} from "../../supabase/functions/extract-invoice/invoice-crop-geometry.ts";
import { detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";

const dataUrl = await Deno.readTextFile(
  ".tmp/emporio-italia-investigation/invoice-full.b64.txt",
);
const b64 = dataUrl.split(",")[1]!;
const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const image = await Image.decode(bytes);

const bounds = detectTableBounds(image);
const cropStartY = computeFooterCropStartY(
  image.height,
  bounds.detected ? bounds.bottom : null,
  DEFAULT_BOTTOM_CROP_FRACTION,
);

await Deno.writeFile(
  ".tmp/emporio-italia-investigation/invoice-full.png",
  await image.encode(),
);

// Also save bottom 45% fraction crop for comparison
const fractionStartY = Math.round(image.height * (1 - DEFAULT_BOTTOM_CROP_FRACTION));
const fractionCrop = image.crop(0, fractionStartY, image.width, image.height - fractionStartY);
await Deno.writeFile(
  ".tmp/emporio-italia-investigation/footer-fraction-crop.png",
  await fractionCrop.encode(),
);

console.log(
  JSON.stringify(
    {
      width: image.width,
      height: image.height,
      tableBounds: bounds,
      footerCropStartY: cropStartY,
      footerCropHeight: image.height - cropStartY,
      fractionStartY,
    },
    null,
    2,
  ),
);
