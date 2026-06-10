import { cropTableRegionForLineItems } from "./invoice-image-crop.ts";
import { callOpenAiJson } from "./invoice-date-extraction.ts";
import {
  reconcileLineItemAmounts,
  reconcileLineItemsToNetSubtotal,
  type InvoiceLineItem as ReconciledLineItem,
} from "./invoice-line-reconcile.ts";
import type { TableBounds } from "./invoice-image-crop.ts";

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
- unit must represent the PURCHASED unit.
- NEVER invent values.
- But DO infer quantity/unit when clearly present inside product names.
- Screenshots may have messy OCR. Use contextual reasoning.

IMPORTANT PATTERNS:

Examples:

"Acém Novilho Extra s/ osso 15kg"
→ quantity: 15
→ unit: "kg"

"Bacon Burger Premium Fatiado 1kg"
→ quantity: 1
→ unit: "kg"

"Peito de Frango Calibrado"
with visible quantity column "10"
→ quantity: 10
→ unit: "kg"

"Coca-Cola 33cl Pack 24"
→ quantity: 24
→ unit: "un"

"Água 25cl Pack 24"
→ quantity: 24
→ unit: "un"

"Hamburger Angus 180gr Caixa 40 un"
→ quantity: 40
→ unit: "un"

"Pão Brioche 80g 120 un"
→ quantity: 120
→ unit: "un"

If product size exists separately from purchased quantity:
- purchased quantity = pack/case/unit count
- NOT the per-item weight

Examples:
BAD:
180g

GOOD:
40 un

BAD:
33cl

GOOD:
24 un

Use these normalized units only when possible:
kg
g
L
ml
un
cx
mo
em

Bidfood / Portuguese supplier abbreviations (preserve exactly — do NOT coerce to cx):
- "MO" or "maço" = bunch of fresh herbs → unit: "mo"
- "EM" or "embalagem" = retail pack → unit: "em"

Examples:
"Tomilho" with quantity column "1" and unit "MO"
→ quantity: 1
→ unit: "mo"

"Manjericão" with unit "MO"
→ unit: "mo"

"Salada" with unit "EM"
→ quantity: 1
→ unit: "em"

If quantity truly cannot be determined:
- quantity = null
- unit = null

Do not hallucinate.
Do NOT extract supplier, total, invoice_date, or invoice_number.

PRICE ACCURACY (critical for Portuguese invoices):
- Read quantity, PREÇO UNITÁRIO, and VALOR DA MERCADORIA digit by digit from their respective columns.
- Do not confuse 8 and 9 (e.g. 9,99 misread as 8,99 or 9,49).
- quantity, unit_price, and total are each authoritative — copy each exactly from the invoice.
- Discounted/promotional lines are common: quantity × unit_price may NOT equal total. Never alter quantity or unit_price to force arithmetic closure.
- When quantity is 1, unit_price usually equals the line total column (unless a line discount applies).
`.trim();

export type InvoiceLineItem = ReconciledLineItem;

export type TableExtractionResult = {
  items: InvoiceLineItem[];
  tableCrop: {
    bounds: TableBounds | null;
    fallbackUsed: boolean;
  };
};

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

export async function extractTableItemsFromImage(
  imageDataUrl: string,
  apiKey: string,
): Promise<TableExtractionResult> {
  let croppedDataUrl = imageDataUrl;
  let bounds = null;
  let fallbackUsed = true;
  try {
    const cropResult = await cropTableRegionForLineItems(imageDataUrl);
    croppedDataUrl = cropResult.croppedDataUrl;
    bounds = cropResult.bounds;
    fallbackUsed = cropResult.fallbackUsed;
    const cropHeight = bounds ? bounds.bottom - bounds.top : null;
    console.log("[invoice-ocr] table-crop-result", {
      cropSucceeded: !fallbackUsed,
      fallbackUsed,
      bounds,
      cropHeight,
      sentSameAsInput: croppedDataUrl === imageDataUrl,
    });
  } catch (cropError) {
    console.error("[invoice-ocr] table-crop-failed", {
      cropSucceeded: false,
      fallbackUsed: true,
      error:
        cropError instanceof Error ? cropError.message : String(cropError),
    });
  }

  const parsed = await callOpenAiJson(apiKey, [
    { role: "system", content: TABLE_EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Extract all invoice line items from this restaurant invoice table image.",
        },
        { type: "image_url", image_url: { url: croppedDataUrl } },
      ],
    },
  ]);

  const items = reconcileLineItemAmounts(normalizeItems(parsed.items));

  return {
    items,
    tableCrop: {
      bounds,
      fallbackUsed,
    },
  };
}

export function finalizeExtractedLineItems(
  items: InvoiceLineItem[],
  netSubtotal: number | null,
): InvoiceLineItem[] {
  return reconcileLineItemsToNetSubtotal(items, netSubtotal);
}
