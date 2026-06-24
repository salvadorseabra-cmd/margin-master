import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  EMPORIO_QTD_COLUMN_X_FRAC,
  QTD_STRIP_MIN_WIDTH_PX,
} from "./invoice-crop-geometry.ts";
import {
  parseImageDataUrl,
  toImageDataUrl,
} from "./invoice-image-crop.ts";

function pixelLuminance(pixel: number): number {
  const r = (pixel >> 24) & 0xff;
  const g = (pixel >> 16) & 0xff;
  const b = (pixel >> 8) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** True when the strip is overwhelmingly blank/white (fail-open to full table crop). */
export function isMostlyBlankStrip(image: Image): boolean {
  let nearWhite = 0;
  let sampled = 0;
  const stepY = Math.max(1, Math.floor(image.height / 40));
  const stepX = Math.max(1, Math.floor(image.width / 4));

  for (let y = 1; y <= image.height; y += stepY) {
    for (let x = 1; x <= image.width; x += stepX) {
      sampled++;
      if (pixelLuminance(image.getPixelAt(x, y)) > 248) nearWhite++;
    }
  }

  return sampled > 0 && nearWhite / sampled > 0.95;
}

/**
 * Crop a vertical Qtd-column strip from a table crop image.
 * Returns null when the strip is too narrow or mostly blank (fail-open).
 */
export async function cropQtdColumnStrip(
  tableCropDataUrl: string,
): Promise<string | null> {
  const { bytes } = parseImageDataUrl(tableCropDataUrl);
  const image = await Image.decode(bytes);
  const x0 = Math.floor(image.width * EMPORIO_QTD_COLUMN_X_FRAC.x0);
  const x1 = Math.ceil(image.width * EMPORIO_QTD_COLUMN_X_FRAC.x1);
  const stripWidth = x1 - x0;

  if (stripWidth < QTD_STRIP_MIN_WIDTH_PX) return null;

  const strip = image.crop(x0, 0, stripWidth, image.height);
  if (isMostlyBlankStrip(strip)) return null;

  const encoded = await strip.encode();
  return toImageDataUrl(encoded);
}
