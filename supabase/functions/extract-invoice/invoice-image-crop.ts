import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

export function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error("imageDataUrl must be a base64 data URL");
  }
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { mime: match[1], bytes };
}

export function toImageDataUrl(bytes: Uint8Array, mime = "image/png"): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return `data:${mime};base64,${b64}`;
}

/** Keep the top portion of the invoice (header + line items), excluding footer compliance blocks. */
export async function cropTopPortion(
  dataUrl: string,
  topFraction = 0.83,
): Promise<string> {
  const { bytes } = parseImageDataUrl(dataUrl);
  const image = await Image.decode(bytes);
  const cropHeight = Math.max(1, Math.round(image.height * topFraction));
  const cropped = image.crop(0, 0, image.width, cropHeight);
  const encoded = await cropped.encode();
  return toImageDataUrl(encoded);
}
