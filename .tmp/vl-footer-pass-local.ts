/** Run footer metadata pass locally; prints raw GPT JSON + parsed fields. */
import { extractFooterMetadataFromImage } from "../supabase/functions/extract-invoice/invoice-footer-metadata-extraction.ts";
import { callOpenAiJson } from "../supabase/functions/extract-invoice/invoice-date-extraction.ts";
import { cropBottomPortion } from "../supabase/functions/extract-invoice/invoice-image-crop.ts";
import {
  parseFooterMetadataExtraction,
  validateFooterMetadataArithmetic,
} from "../supabase/functions/extract-invoice/invoice-footer-metadata-parse.ts";

const FOOTER_METADATA_EXTRACTION_SYSTEM_PROMPT = `
You TRANSCRIBE printed invoice totals from the footer / summary section. Copy numbers exactly as printed.

Return ONLY valid JSON:

{
  "total": number | null,
  "net_subtotal": number | null,
  "vat": number | null
}

FIELD DEFINITIONS (copy the value beside each label — do NOT calculate or infer):

- total: amount due / document total beside labels such as TOTAL, TOTAL DO DOCUMENTO, VALOR A PAGAR, Amount Due. This is the final payable amount.
- net_subtotal: net merchandise value beside labels such as VALOR LÍQUIDO, Base incidência, Total Mercadoria, Subtotal (before tax).
- vat: total tax amount beside labels such as IVA, VAT, Total IVA.

TRANSCRIPTION RULES:

- Copy each number exactly as printed. Do NOT add, subtract, multiply, or sum values.
- Do NOT derive total from net_subtotal + vat or from line items.
- Do NOT pick a line-item row total, unit price, or intermediate subtotal as the document total.
- If a field is not visible in this crop, return null for that field.
- Numeric values only — no currency symbols.
- IGNORE compliance stamps, TALÃO DE CONTROLO references, and footer legal text.

EXAMPLE (Bidfood-style footer):
Printed TOTAL = 292.70, VALOR LÍQUIDO = 237.97, IVA = 54.73
Correct: { "total": 292.70, "net_subtotal": 237.97, "vat": 54.73 }
Wrong: { "total": 170.00, ... } — never substitute a computed or inferred value for the printed TOTAL.
`.trim();

const imagePath = Deno.args[0];
if (!imagePath) {
  console.error("usage: vl-footer-pass-local.ts <dataUrlFile>");
  Deno.exit(1);
}

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.log(JSON.stringify({ error: "OPENAI_API_KEY not set" }));
  Deno.exit(0);
}

const imageDataUrl = await Deno.readTextFile(imagePath);
const croppedDataUrl = await cropBottomPortion(imageDataUrl);

const rawGptJson = await callOpenAiJson(apiKey, [
  { role: "system", content: FOOTER_METADATA_EXTRACTION_SYSTEM_PROMPT },
  {
    role: "user",
    content: [
      {
        type: "text",
        text:
          "Transcribe only the printed total, net subtotal, and VAT from this footer crop. Do not calculate or infer any value.",
      },
      { type: "image_url", image_url: { url: croppedDataUrl } },
    ],
  },
]);

const parsed = parseFooterMetadataExtraction(rawGptJson);

console.log(
  JSON.stringify({
    rawGptJson,
    parsed: {
      total: parsed.total,
      net_subtotal: parsed.net_subtotal,
      vat: parsed.vat,
      confidence: parsed.confidence,
      validation_warning: parsed.validation_warning,
    },
  }),
);
