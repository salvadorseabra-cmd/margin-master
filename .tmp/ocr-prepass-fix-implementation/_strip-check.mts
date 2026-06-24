
import { readFileSync } from "node:fs";
import { cropQtdColumnStrip } from "/Users/salvadorseabra1/margin-master/supabase/functions/extract-invoice/invoice-qty-column-crop.ts";
import { toImageDataUrl, parseImageDataUrl } from "/Users/salvadorseabra1/margin-master/supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const bytes = readFileSync("/Users/salvadorseabra1/margin-master/.tmp/fraction-row-crop-audit/table-crop.png");
const dataUrl = toImageDataUrl(bytes);
const stripUrl = await cropQtdColumnStrip(dataUrl);
if (!stripUrl) { console.log(JSON.stringify({ ok: false })); Deno.exit(0); }
const { bytes: sb } = parseImageDataUrl(stripUrl);
const strip = await Image.decode(sb);
const src = await Image.decode(bytes);
console.log(JSON.stringify({
  ok: true,
  sourceWidth: src.width,
  sourceHeight: src.height,
  stripWidth: strip.width,
  stripHeight: strip.height,
}));
