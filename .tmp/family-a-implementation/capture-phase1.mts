/**
 * Family A Phase 1 — Hybrid H raw GPT capture + pipeline qty trace.
 * READ-ONLY: no DB writes. Requires OPENAI_API_KEY.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cropTableRegionForLineItems } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { callOpenAiJson } from "../../supabase/functions/extract-invoice/invoice-date-extraction.ts";
import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  reconcileLineItemAmounts,
  reconcileLineItemsToNetSubtotal,
} from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";
import { finalizeExtractedLineItems } from "../../supabase/functions/extract-invoice/invoice-table-extraction.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = __dir;
const INVOICE_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";

const promptSource = readFileSync(
  join(__dir, "../../supabase/functions/extract-invoice/invoice-table-extraction.ts"),
  "utf8",
);
const TABLE_EXTRACTION_SYSTEM_PROMPT = promptSource.match(
  /const TABLE_EXTRACTION_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\)/,
)?.[1];
if (!TABLE_EXTRACTION_SYSTEM_PROMPT) throw new Error("prompt not found");

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

function pick<T extends { name?: string }>(items: T[], pattern: RegExp): T | null {
  return items.find((it) => pattern.test(String(it.name ?? ""))) ?? null;
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY required");
  process.exit(1);
}

const imagePath =
  process.argv[2] ??
  join(__dir, "../family-a-v25-raw-capture/image-data-url.txt");
const imageDataUrl = readFileSync(imagePath, "utf8").trim();
mkdirSync(OUT, { recursive: true });

const cropResult = await cropTableRegionForLineItems(imageDataUrl);
const rawGptJson = await callOpenAiJson(
  apiKey,
  [
    { role: "system", content: TABLE_EXTRACTION_SYSTEM_PROMPT },
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

writeFileSync(join(OUT, "gpt-raw-json.json"), JSON.stringify(rawGptJson, null, 2));

const postNormalize = parseMonetaryLineItems(rawGptJson.items);
const postBind = bindMonetaryColumns(postNormalize);
const postReconcile = reconcileLineItemAmounts(postBind.map(monetaryToInvoiceLineItem));
const postFinalize = finalizeExtractedLineItems(postReconcile, null);

const familyPatterns = {
  ricotta: /ricotta/i,
  mezzi: /mezzi paccheri/i,
  pomodori: /pomodori/i,
  rolo: /rolo de cabra/i,
  acqua: /pellegrino/i,
};

const stageTrace = {
  generatedAt: new Date().toISOString(),
  invoiceId: INVOICE_ID,
  rows: Object.fromEntries(
    Object.entries(familyPatterns).map(([key, pattern]) => {
      const raw = pick(rawGptJson.items ?? [], pattern);
      const norm = pick(postNormalize, pattern);
      const bind = pick(postBind, pattern);
      const rec = pick(postReconcile, pattern);
      const fin = pick(postFinalize, pattern);
      return [
        key,
        {
          rawGptQty: raw?.quantity ?? null,
          postNormalizeQty: norm?.quantity ?? null,
          postBindQty: bind?.quantity ?? null,
          postReconcileQty: rec?.quantity ?? null,
          postFinalizeQty: fin?.quantity ?? null,
          rawGpt,
          postFinalize: fin,
        },
      ];
    }),
  ),
};

const proof =
  stageTrace.rows.ricotta?.rawGptQty === 2 || stageTrace.rows.mezzi?.rawGptQty === 2
    ? "A"
    : stageTrace.rows.ricotta?.rawGptQty !== stageTrace.rows.ricotta?.postFinalizeQty ||
        stageTrace.rows.mezzi?.rawGptQty !== stageTrace.rows.mezzi?.postFinalizeQty
      ? "B"
      : "UNKNOWN";

const captureResult = {
  proof,
  proofLabel:
    proof === "A"
      ? "GPT emitted qty=2 in raw structured output"
      : proof === "B"
        ? "Post-processing changed qty after GPT"
        : "Could not classify",
  stageTrace,
  pdfGroundTruthQty: { ricotta: 1, mezzi: 1 },
  passCBaselineQty: { ricotta: 1, mezzi: 1 },
  downstreamQtyInvariant:
    stageTrace.rows.ricotta?.rawGptQty === stageTrace.rows.ricotta?.postFinalizeQty &&
    stageTrace.rows.mezzi?.rawGptQty === stageTrace.rows.mezzi?.postFinalizeQty,
};

writeFileSync(join(OUT, "capture-result.json"), JSON.stringify(captureResult, null, 2));
console.log(JSON.stringify(captureResult, null, 2));
