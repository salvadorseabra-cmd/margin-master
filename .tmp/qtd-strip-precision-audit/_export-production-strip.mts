
import { readFileSync, writeFileSync } from "node:fs";
import { cropQtdColumnStrip } from "/Users/salvadorseabra1/margin-master/supabase/functions/extract-invoice/invoice-qty-column-crop.ts";
import { toImageDataUrl, parseImageDataUrl } from "/Users/salvadorseabra1/margin-master/supabase/functions/extract-invoice/invoice-image-crop.ts";

const bytes = readFileSync("/Users/salvadorseabra1/margin-master/.tmp/fraction-row-crop-audit/table-crop.png");
const dataUrl = toImageDataUrl(bytes);
const stripUrl = await cropQtdColumnStrip(dataUrl);
if (!stripUrl) throw new Error("cropQtdColumnStrip returned null");
const { bytes: sb } = parseImageDataUrl(stripUrl);
writeFileSync("/Users/salvadorseabra1/margin-master/.tmp/qtd-strip-precision-audit/production-qtd-strip-full.png", sb);
console.log(JSON.stringify({ ok: true, bytes: sb.length }));
