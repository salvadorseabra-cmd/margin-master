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
      "gross_unit_price": number | null,
      "discount_pct": number | null,
      "line_total_net": number | null,
      "unit_price": number | null,
      "total": number | null
    }
  ]
}

═══════════════════════════════════════════════════════════════
COLUMN-FAITHFUL EXTRACTION (highest priority — overrides all else)
═══════════════════════════════════════════════════════════════

Each table row has distinct columns. Copy values ONLY from their designated column:

1. QUANTITY column → quantity (and unit, if a unit column is visible)
2. PREÇO UNITÁRIO / P.VENDA / list unit price column → gross_unit_price
3. DESC / Desc.(%) / discount column → discount_pct (percentage only — never a euro amount)
4. VALOR / Preço Total / line total column → line_total_net
5. Product description column → name

MONETARY COLUMN BINDING (use column headers — never swap columns):
- gross_unit_price: copy ONLY from the unit/list price column (EUR suffix). Read digit by digit.
- discount_pct: copy ONLY from the discount/% column. Strip the % symbol. Never put this in gross_unit_price or line_total_net.
- line_total_net: copy ONLY from the line total column (rightmost EUR total for the row). Read digit by digit.
- unit_price and total: leave null when gross_unit_price / line_total_net are populated (downstream derives them).
- If a row has no discount column, set discount_pct to null and copy unit_price from the unit price column instead of gross_unit_price.

RULES:
- Copy quantity ONLY from the quantity column. Never override with numbers from the description.
- Descriptions NEVER override table quantities or prices.
- If a column value is illegible or absent → set that field to null. Prefer null over guessing.
- NEVER invent values. NEVER reconstruct rows from lot numbers, expiry dates, or footer text.
- NEVER create rows not visibly present as distinct product lines in the table.
- Extract ONLY rows that are clearly separate invoice line items with a product description.

PACK NOTATION IN DESCRIPTIONS IS METADATA (not purchased quantity):
Patterns like *2, *6, *24, x15, 33cl*24, 1kg*2, CX6, (CX 2.5KG*6), pet 5l*2 describe pack size,
case contents, or unit weight — NOT the purchased quantity unless the quantity column shows that number.

When quantity column AND description disagree → ALWAYS trust the quantity column.

QUANTITY COLUMN ISOLATION (never bleed from other columns):
- Quantity may ONLY come from the quantity column cell — never from PREÇO UNITÁRIO, VALOR, or description.
- Description pack metadata (10x1, 12x1, 5l*2, 1kg*2, CX6, Pack24, 33cl*24) is NOT purchased quantity.
- Do not take the leading digit of a price (e.g. 9,99) as quantity.

"Açúcar Branco METRO Chef 10x1 Kg" with quantity column "1" and PREÇO UNITÁRIO "9,99"
→ quantity: 1 (NOT 9 from 9,99, NOT 10 from 10x1)
→ unit_price: 9.99, total: from VALOR column

FRACTIONAL QUANTITIES (copy decimals exactly — never round):
- If the quantity column shows 0,5 / 0.5 / 1,5 / 1.5 — copy the exact decimal value.
- Read the unit column to disambiguate: MO herbs and KG weight rows coexist on the same invoice.
- Do NOT round 0,5 to 1 even when adjacent rows use MO (maço) units.

"Hortelã" with quantity column "0,5" and unit "KG"
→ quantity: 0.5, unit: "kg" (NOT 1 — do not round; NOT "mo" unless unit column says MO)
→ unit_price: from PREÇO UNITÁRIO (€/kg), total: from VALOR

═══════════════════════════════════════════════════════════════
NEGATIVE EXAMPLES (common failures — do NOT repeat)
═══════════════════════════════════════════════════════════════

"POMODORI PELATI (CX 2,5KG*6)" with quantity "1,000", P.VENDA "27,560 EUR", DESC "20,00%", VALOR "22,05 EUR"
→ quantity: 1 (NOT 6 — *6 is units-per-case)
→ gross_unit_price: 27.56 (from P.VENDA — NOT from DESC 20)
→ discount_pct: 20 (from DESC — NOT 20 as a euro price)
→ line_total_net: 22.05 (from VALOR LÍQUIDO)
→ unit_price: null, total: null

"Aceto balsamico di Modena IGP pet 5l*2 Toschi" with quantity column "1"
→ quantity: 1 (NOT 2 — *2 means 2×5L pack spec, not qty purchased)
→ unit_price and total: from their columns only

"Rulo Di Capra 1kg*2 Simonetta" with quantity column "1"
→ quantity: 1 (NOT 2 — *2 is dual-unit pack metadata)
→ unit: from column

"Baladin - Ginger Beer 0.20cl" with quantity column "2"
→ quantity: 2 (NOT 24 — do not infer bottle count from pack size)
→ unit_price: from column (per purchased unit, e.g. €9.69)
→ total: from column (e.g. €19.38)

REJECT as line items (do NOT extract):
- "Nui Lote 609 Data Exp. 20/07/2027" — lot/expiry metadata, not a product
- "Lote 6009", "Nº Lote", "Data Exp." sub-lines — never standalone rows
- Rows with no visible product description in the description column

═══════════════════════════════════════════════════════════════
POSITIVE EXAMPLES (correct column-faithful extraction)
═══════════════════════════════════════════════════════════════

Bidfood — "Tomilho" with quantity column "1" and unit column "MO"
→ quantity: 1, unit: "mo", unit_price: from column, total: from column

Bidfood — "Manjericão" with quantity column "2" and unit "MO"
→ quantity: 2, unit: "mo" (from columns, not inferred from name)

Bidfood — "Hortelã" with quantity column "0,5" and unit "KG"
→ quantity: 0.5, unit: "kg", unit_price: from PREÇO UNITÁRIO, total: from VALOR

Aviludo — "Birra Peroni 33cl*24" with quantity column "24"
→ quantity: 24, unit: "un"
→ *24 in description is metadata; column confirms purchased count of 24 bottles

"Peito de Frango Calibrado" with quantity column "10" and unit column "kg"
→ quantity: 10, unit: "kg" (both from columns)

"Acém Novilho Extra s/ osso 15kg" with NO quantity column visible
→ quantity: null, unit: null (do NOT infer 15 from description weight)

═══════════════════════════════════════════════════════════════
UNIT NORMALIZATION
═══════════════════════════════════════════════════════════════

Use normalized units when the column shows them:
kg, g, L, ml, un, cx, mo, em

Bidfood / Portuguese supplier abbreviations (preserve exactly):
- "MO" or "maço" → unit: "mo"
- "EM" or "embalagem" → unit: "em"
Do NOT coerce MO/EM to cx.

"Salada" with unit "EM" and quantity column "1"
→ quantity: 1, unit: "em" (from columns)

═══════════════════════════════════════════════════════════════
PRICE ACCURACY
═══════════════════════════════════════════════════════════════

- Read PREÇO UNITÁRIO and VALOR digit by digit from their respective columns.
- Do not confuse 8 and 9 (e.g. 9,99 misread as 8,99).
- DISCOUNTED LINES: Populate gross_unit_price, discount_pct, and line_total_net from their separate columns.
  Never put the discount % value into gross_unit_price. Never recompute line_total_net from qty × price.
- When quantity is 1, unit_price usually equals line total (unless discount applies).
- Do not read numerics from the description into price fields; weight ranges (4-4,25KG) are not prices.

"Aceto balsamico di Modena IGP pet 5l*2 Toschi" with qty=1, unit_price=18,83, total=16,09
→ total: 16.09 (from VALOR — discounted line; do not substitute qty×price)

═══════════════════════════════════════════════════════════════
OUTPUT INTEGRITY
═══════════════════════════════════════════════════════════════

- One output row per visible invoice line item. No extra rows.
- Do not hallucinate products, SKUs, quantities, or prices.
- Do NOT extract supplier, invoice_date, invoice_number, or invoice footer totals.
- If quantity truly cannot be read from the column: quantity = null, unit = null.
`.trim();

export type InvoiceLineItem = ReconciledLineItem;

export type TableExtractionResult = {
  items: InvoiceLineItem[];
  tableCrop: {
    bounds: TableBounds | null;
    fallbackUsed: boolean;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function normalizeNumberField(item: Record<string, unknown>, key: string): number | null {
  const value = item[key];
  return typeof value === "number" ? value : null;
}

function resolveUnitPrice(
  grossUnitPrice: number | null,
  discountPct: number | null,
  unitPrice: number | null,
): number | null {
  if (grossUnitPrice != null && discountPct != null) {
    return round2(grossUnitPrice * (1 - discountPct / 100));
  }
  if (unitPrice != null) return unitPrice;
  return grossUnitPrice;
}

function resolveTotal(
  lineTotalNet: number | null,
  total: number | null,
): number | null {
  return lineTotalNet ?? total;
}

function normalizeItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const row = item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : {};

    const grossUnitPrice = normalizeNumberField(row, "gross_unit_price");
    const discountPct = normalizeNumberField(row, "discount_pct");
    const lineTotalNet = normalizeNumberField(row, "line_total_net");
    const unitPrice = normalizeNumberField(row, "unit_price");
    const total = normalizeNumberField(row, "total");

    return {
      name: typeof row.name === "string" ? row.name : "Unknown item",
      quantity: typeof row.quantity === "number" ? row.quantity : null,
      unit: typeof row.unit === "string" ? row.unit : null,
      unit_price: resolveUnitPrice(grossUnitPrice, discountPct, unitPrice),
      total: resolveTotal(lineTotalNet, total),
    };
  });
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
          text: "Extract each visible invoice line item. Copy quantity, gross_unit_price, discount_pct, and line_total_net from their labeled table columns.",
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
