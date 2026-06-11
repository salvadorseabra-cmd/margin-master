/** Footer crop audit: bounds, coordinates, PNG artifacts. */
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  computeBottomCropStartY,
  computeFooterCropStartY,
  DEFAULT_BOTTOM_CROP_FRACTION,
} from "../../supabase/functions/extract-invoice/invoice-crop-geometry.ts";
import {
  detectTableBounds,
  parseImageDataUrl,
} from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";

const [imagePath, outDir] = Deno.args;
if (!imagePath || !outDir) {
  console.error("usage: footer-crop-audit.ts <dataUrlFile> <outDir>");
  Deno.exit(1);
}

const imageDataUrl = await Deno.readTextFile(imagePath);
const { bytes } = parseImageDataUrl(imageDataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const imageHeight = image.height;
const imageWidth = image.width;
const fractionStartY = computeBottomCropStartY(imageHeight, DEFAULT_BOTTOM_CROP_FRACTION);
const footerCropStartY = computeFooterCropStartY(
  imageHeight,
  bounds.detected ? bounds.bottom : null,
  DEFAULT_BOTTOM_CROP_FRACTION,
);
const footerCropHeight = Math.max(1, imageHeight - footerCropStartY);
const fractionCropHeight = Math.max(1, imageHeight - fractionStartY);

await Deno.mkdir(outDir, { recursive: true });

await Deno.writeFile(`${outDir}/invoice-full.png`, await image.encode());

// ImageScript crop() mutates the source — decode fresh buffers per crop.
const footerBytes = parseImageDataUrl(imageDataUrl).bytes;
const footerImage = await Image.decode(footerBytes);
await Deno.writeFile(
  `${outDir}/footer-crop.png`,
  await footerImage.crop(0, footerCropStartY, imageWidth, footerCropHeight).encode(),
);

const fractionBytes = parseImageDataUrl(imageDataUrl).bytes;
const fractionImage = await Image.decode(fractionBytes);
await Deno.writeFile(
  `${outDir}/footer-fraction-crop.png`,
  await fractionImage.crop(0, fractionStartY, imageWidth, fractionCropHeight).encode(),
);

const evidence = {
  imageWidth,
  imageHeight,
  tableBounds: bounds,
  fractionStartY,
  footerCropStartY,
  footerCropHeight,
  footerCropEndY: imageHeight,
  bottomFraction: DEFAULT_BOTTOM_CROP_FRACTION,
  cropMethod: "max(fractionStartY, tableBoundsBottom)",
};

await Deno.writeTextFile(`${outDir}/crop-bounds.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
