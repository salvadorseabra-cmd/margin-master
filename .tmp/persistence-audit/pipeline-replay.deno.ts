/**
 * Replay Pass C pipeline stages locally — read-only.
 * Outputs: raw GPT JSON, post-normalizeItems, post-reconcileLineItemAmounts, post-finalize.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { cropTableRegionForLineItems } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";
import { extractFooterMetadataFromImage } from "../../supabase/functions/extract-invoice/invoice-footer-metadata-extraction.ts";
import {
  reconcileLineItemAmounts,
  reconcileLineItemsToNetSubtotal,
  type InvoiceLineItem,
} from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";

const TABLE_EXTRACTION_SYSTEM_PROMPT = `
You extract ONLY invoice line items from restaurant invoice table images.

Return ONLY valid JSON with this exact structure:

{
  "items": [
    {
      "name": string,
      "quantity": number | null,
      "unit": string | null,
      "unit_price": number | null,
      "total": number | null
    }
  ]
}

CRITICAL RULES:

- Extract ALL invoice line items visible in the table.
- quantity must represent the PURCHASED quantity.
- Read quantity, PREÇO UNITÁRIO, and VALOR DA MERCADORIA digit by digit from their respective columns.
- Do not confuse 8 and 9 (e.g. 9,99 misread as 8,99 or 9,49).
- quantity, unit_price, and total are each authoritative — copy each exactly from the invoice.
- Discounted/promotional lines are common: quantity × unit_price may NOT equal total. Never alter quantity or unit_price to force arithmetic closure.
- When quantity is 1, unit_price usually equals the line total column (unless a line discount applies).
`.trim();

function normalizeItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    name: typeof item?.name === "string" ? item.name : "Unknown item",
    quantity: typeof item?.quantity === "number" ? item.quantity : null,
    unit: typeof item?.unit === "string" ? item.unit : null,
    unit_price: typeof item?.unit_price === "number" ? item.unit_price : null,
    total: typeof item?.total === "number" ? item.total : null,
  }));
}

const imageDataUrlPath = Deno.args[0];
const outPath = Deno.args[1];
if (!imageDataUrlPath || !outPath) {
  console.error("usage: pipeline-replay.deno.ts <imageDataUrl.txt> <out.json>");
  Deno.exit(1);
}

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY required");

const imageDataUrl = readFileSync(imageDataUrlPath, "utf8").trim();

const cropResult = await cropTableRegionForLineItems(imageDataUrl);
const parsed = await callOpenAiJson(apiKey, [
  { role: "system", content: TABLE_EXTRACTION_SYSTEM_PROMPT },
  {
    role: "user",
    content: [
      {
        type: "text",
        text: "Extract all invoice line items from this restaurant invoice table image.",
      },
      { type: "image_url", image_url: { url: cropResult.croppedDataUrl } },
    ],
  },
]);

const passCRaw = normalizeItems(parsed.items);
const postNormalize = passCRaw; // normalizeItems is the only normalization in table pass
const postReconcileAmounts = reconcileLineItemAmounts(postNormalize);

let footer = { net_subtotal: null as number | null, total: null as number | null };
try {
  const f = await extractFooterMetadataFromImage(imageDataUrl, apiKey);
  footer = { net_subtotal: f.net_subtotal, total: f.total };
} catch {
  // footer optional for stage diff
}

const postFinalize = reconcileLineItemsToNetSubtotal(
  postReconcileAmounts,
  footer.net_subtotal,
);

const reconcileModified = postReconcileAmounts.some(
  (item, i) =>
    item.quantity !== postNormalize[i]?.quantity ||
    item.unit_price !== postNormalize[i]?.unit_price ||
    item.total !== postNormalize[i]?.total,
);
const finalizeModified = postFinalize.some(
  (item, i) =>
    item.quantity !== postReconcileAmounts[i]?.quantity ||
    item.unit_price !== postReconcileAmounts[i]?.unit_price ||
    item.total !== postReconcileAmounts[i]?.total,
);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      cropBounds: cropResult.bounds,
      cropFallbackUsed: cropResult.fallbackUsed,
      footer,
      passCRaw,
      postNormalize,
      postReconcileAmounts,
      postFinalize,
      reconcileModifiedQtyPriceTotal: reconcileModified,
      finalizeModifiedQtyPriceTotal: finalizeModified,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify({
    passCRawCount: passCRaw.length,
    reconcileModified,
    finalizeModified,
    netSubtotal: footer.net_subtotal,
  }),
);
