/**
 * READ-ONLY Hybrid H stage capture — Family A (Bocconcino).
 * Runs table pass locally with production prompt/schema; no DB writes.
 * Requires OPENAI_API_KEY in environment.
 *
 * usage:
 *   OPENAI_API_KEY=... .tmp/deno/bin/deno run \
 *     --allow-read --allow-write --allow-net --allow-env \
 *     .tmp/family-a-v25-raw-capture/capture-hybrid-h.deno.ts \
 *     <imageDataUrl.txt> <outDir>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cropTableRegionForLineItems } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";
import { extractFooterMetadataFromImage } from "../../supabase/functions/extract-invoice/invoice-footer-metadata-extraction.ts";
import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  finalizeExtractedLineItems,
  reconcileLineItemAmounts,
} from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";

// Mirror TABLE_EXTRACTION_* from invoice-table-extraction.ts (Hybrid H structured schema)
const TABLE_EXTRACTION_SYSTEM_PROMPT = readFileSync(
  new URL("../../supabase/functions/extract-invoice/invoice-table-extraction.ts", import.meta.url),
  "utf8",
).match(/const TABLE_EXTRACTION_SYSTEM_PROMPT = `([\s\S]*?)`;/)?.[1];

const TABLE_EXTRACTION_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "invoice_table_items",
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

function pickFamily(items: Array<{ name?: string; quantity?: number | null }>, pattern: RegExp) {
  return items.find((it) => pattern.test(String(it.name ?? ""))) ?? null;
}

const imagePath = Deno.args[0];
const outDir = Deno.args[1] ?? ".tmp/family-a-v25-raw-capture";
if (!imagePath) {
  console.error("usage: capture-hybrid-h.deno.ts <imageDataUrl.txt> [outDir]");
  Deno.exit(1);
}

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY required");

const imageDataUrl = readFileSync(imagePath, "utf8").trim();
mkdirSync(outDir, { recursive: true });

const cropResult = await cropTableRegionForLineItems(imageDataUrl);
writeFileSync(join(outDir, "crop-bounds.json"), JSON.stringify(cropResult, null, 2));

const rawGptJson = await callOpenAiJson(
  apiKey,
  [
    { role: "system", content: TABLE_EXTRACTION_SYSTEM_PROMPT ?? "" },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract each visible invoice line item. Copy quantity, gross_unit_price, discount_pct, and line_total_net from their labeled table columns.",
        },
        { type: "image_url", image_url: { url: cropResult.croppedDataUrl } },
      ],
    },
  ],
  TABLE_EXTRACTION_RESPONSE_FORMAT,
);

writeFileSync(join(outDir, "gpt-raw-json.json"), JSON.stringify(rawGptJson, null, 2));

const postNormalize = parseMonetaryLineItems(rawGptJson.items);
const postBind = bindMonetaryColumns(postNormalize);
const postReconcile = reconcileLineItemAmounts(postBind.map(monetaryToInvoiceLineItem));

let footer = { net_subtotal: null as number | null, total: null as number | null };
try {
  const f = await extractFooterMetadataFromImage(imageDataUrl, apiKey);
  footer = { net_subtotal: f.net_subtotal, total: f.total };
} catch {
  /* optional */
}

const postFinalize = finalizeExtractedLineItems(postReconcile, footer.net_subtotal);

const familyPatterns = {
  ricotta: /ricotta/i,
  mezzi: /mezzi paccheri/i,
};

const stageTrace = {
  generatedAt: new Date().toISOString(),
  invoiceId: "f0aa5a08-86a3-4938-99f0-711e86073968",
  footer,
  reconcileModifiedQty: postReconcile.some(
    (it, i) => it.quantity !== postBind.map(monetaryToInvoiceLineItem)[i]?.quantity,
  ),
  finalizeModifiedQty: postFinalize.some(
    (it, i) => it.quantity !== postReconcile[i]?.quantity,
  ),
  rows: Object.fromEntries(
    Object.entries(familyPatterns).map(([key, pattern]) => [
      key,
      {
        rawGpt: pickFamily(rawGptJson.items ?? [], pattern),
        postNormalize: pickFamily(postNormalize, pattern),
        postBind: pickFamily(postBind, pattern),
        postReconcile: pickFamily(postReconcile, pattern),
        postFinalize: pickFamily(postFinalize, pattern),
      },
    ]),
  ),
};

writeFileSync(join(outDir, "stage-trace.json"), JSON.stringify(stageTrace, null, 2));
writeFileSync(
  join(outDir, "pipeline-full.json"),
  JSON.stringify(
    {
      rawGptJson,
      postNormalize,
      postBind,
      postReconcile,
      postFinalize,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify(stageTrace, null, 2));
