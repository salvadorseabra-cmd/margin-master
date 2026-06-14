/** READ-ONLY — capture Pass C structured fields for Farina (1 run). */
import { extractTableItemsFromImage } from "../../supabase/functions/extract-invoice/invoice-table-extraction.ts";
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";
import { cropTableRegionForLineItems } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const IMAGE = ".tmp/mammafiore-investigation/invoice-full.png";
const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.log(JSON.stringify({ skipped: true, reason: "OPENAI_API_KEY not set" }));
  Deno.exit(0);
}

const bytes = await Deno.readFile(IMAGE);
let binary = "";
const chunk = 0x8000;
for (let i = 0; i < bytes.length; i += chunk) {
  binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
}
const imageDataUrl = `data:image/png;base64,${btoa(binary)}`;

const crop = await cropTableRegionForLineItems(imageDataUrl);
const result = await extractTableItemsFromImage(imageDataUrl, apiKey);
const farinaFinal = result.items.find((i) =>
  /farin[ae].*speciale.*pizza|speciale pizza.*25kg/i.test(i.name ?? "")
) ?? null;

const promptText = await Deno.readTextFile(
  "./supabase/functions/extract-invoice/invoice-table-extraction.ts",
);
const systemMatch = promptText.match(
  /const TABLE_EXTRACTION_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\)/,
);
const systemPrompt = systemMatch?.[1] ?? "";

const TABLE_EXTRACTION_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "invoice_line_items",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              gross_unit_price: { type: ["number", "null"] },
              discount_pct: { type: ["number", "null"] },
              line_total_net: { type: ["number", "null"] },
            },
            required: [
              "name",
              "quantity",
              "unit",
              "gross_unit_price",
              "discount_pct",
              "line_total_net",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const raw = await callOpenAiJson(apiKey, [
  { role: "system", content: systemPrompt },
  {
    role: "user",
    content: [
      {
        type: "text",
        text:
          "Extract each visible invoice line item. Copy quantity, gross_unit_price, discount_pct, and line_total_net from their labeled table columns.",
      },
      { type: "image_url", image_url: { url: crop.croppedDataUrl } },
    ],
  },
], TABLE_EXTRACTION_RESPONSE_FORMAT);

const farinaRaw = (raw.items ?? []).find((i: { name?: string }) =>
  /farin[ae].*speciale.*pizza|speciale pizza.*25kg/i.test(i.name ?? "")
) ?? null;
const parsed = parseMonetaryLineItems(farinaRaw ? [farinaRaw] : []);
const bound = bindMonetaryColumns(parsed);
const legacy = bound.map(monetaryToInvoiceLineItem);

console.log(JSON.stringify({
  cropBounds: crop.bounds,
  cropFallbackUsed: crop.fallbackUsed,
  farinaRaw,
  farinaAfterBind: bound[0] ?? null,
  farinaFinal,
  farinaLegacy: legacy[0] ?? null,
}, null, 2));
