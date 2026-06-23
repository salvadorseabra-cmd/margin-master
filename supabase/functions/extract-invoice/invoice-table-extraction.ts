import { cropTableRegionForLineItems } from "./invoice-image-crop.ts";
import {
  callOpenAiJson,
  type OpenAiResponseFormat,
} from "./invoice-date-extraction.ts";
import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "./invoice-monetary-binding.ts";
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
      "line_total_net": number | null
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
- discount_pct: copy ONLY from the discount/% column. Strip the % symbol when present.
  Emporio Italia / dense tables: Desc.(%) often shows plain decimals WITHOUT % (e.g. 17,50 or 10,00) — still discount_pct, NOT a euro price.
  The discount column sits BETWEEN the unit-price column and the line-total column — never copy it into gross_unit_price or line_total_net.
- line_total_net: copy ONLY from the line total column (rightmost EUR total for the row). Read digit by digit.
- If a row has no discount column, set discount_pct to null.
- Downstream derives unit_price and total from these structured columns.

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

ROW-ISOLATION MONETARY COLUMNS (never bleed from adjacent rows):
- gross_unit_price, discount_pct, and line_total_net must come from the SAME row only.
- Never borrow monetary values from the row above or below, even when prices align vertically in dense tables.

Adjacent Aviludo rows — Chocolate Culinaria Pantagruel 10x200 g (qty 2, gross_unit_price 29,99, line_total_net 59,98)
and Açúcar Branco METRO Chef 10x1 Kg (qty 1, gross_unit_price 9,99, line_total_net 9,99) on the next line:
→ Chocolate: gross_unit_price 29.99, line_total_net 59.98 (GOOD — from Chocolate row only)
→ Chocolate: gross_unit_price 9.99 (BAD — borrowed from Açúcar row below; NOT 29,99)

TOTAL COLUMN ISOLATION (line_total_net from VALOR only — never gross_unit_price):
- line_total_net must come from the VALOR / Preço Total column only — never copy gross_unit_price.
- When quantity > 1 and a discount applies, line_total_net usually exceeds gross_unit_price.
- When quantity is 1 and the row is undiscounted, line_total_net may equal gross_unit_price — do NOT infer quantity > 1 from that equality alone.

"Ovo Líquido Past.Gema Dovo 1kg" with quantity "6" and PREÇO UNITÁRIO "10,19"
→ gross_unit_price: 10.19, line_total_net: 61.14 (GOOD — 6 × 10,19 from VALOR column)
→ line_total_net: 10.19 (BAD — copied gross_unit_price; NOT 61,14)

"Nata Reny Picot 22% 6x1L" with quantity "5" and PREÇO UNITÁRIO "18,29"
→ gross_unit_price: 18.29, line_total_net: 91.45 (GOOD — 5 × 18,29 from VALOR)
→ line_total_net: 18.29 (BAD — copied gross_unit_price; NOT 91,45)

EMPORIO DENSE TABLE VALOR ISOLATION (Preço Total is source of truth):
- On Emporio Italia 8-column tables, line_total_net MUST come from Preço Total / VALOR for THAT row only.
- If Preço Total is visible, copy it digit by digit — NEVER replace with qty × unit, a neighbouring row's total, or a neighbouring row's quantity.
- Never borrow Ventricina, Bresaola, or any adjacent-row Preço Total into another row's line_total_net.

Emporio — "Gorgonzola DOP Dolce" with Qtd "1,35", Preço Unit "12,90 €", Desc.(%) "22,85", Preço Total "13,44 €"
→ quantity: 1.35, line_total_net: 13.44 (GOOD — copied Preço Total)
→ quantity: 2, line_total_net: 27 (BAD — computed qty×unit; NOT 13,44 from Preço Total)

Emporio — "Bresaola Punta d'Anca Oro" with Qtd "1,83", Preço Unit "33,80 €", Desc.(%) "20,00", Preço Total "49,48 €"
→ line_total_net: 49.48 (GOOD — copied Preço Total for Bresaola row)
→ line_total_net: 39.48 (BAD — borrowed from nearby Ventricina row 39,49; NOT Bresaola's 49,48)

Emporio — "SanPellegrino Acqua in vitro 75cl x 15ud" with Qtd "2,00", Preço Unit "21,42 €", Desc.(%) "10,00", Preço Total "38,56 €"
→ quantity: 2, line_total_net: 38.56 (GOOD — copied Preço Total; x 15ud is pack metadata, NOT quantity 15)
→ quantity: 3, line_total_net: 43.26 (BAD — qty×unit synthesis; NOT 38,56 from Preço Total)

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

BOCCONCINO UNDISCOUNTED BLANK-DESC ROWS (IL BOCCONCINO / P.VENDA layout):
- When DESC is blank and discount_pct is null, quantity still comes ONLY from the QUANT column.
- Pack notation (*6, *15, CX …) and weight tokens (1,5KG, 1KG) in the description are NOT purchased quantity.
- VALOR ≈ P.VENDA at quantity 1 is normal on undiscounted lines — do NOT raise quantity to 2.

"MEZZI PACCHERI MANCINI (CX 1KG*6)" with QUANT "1,000", blank DESC, P.VENDA "27,560 EUR", VALOR "27,30 EUR"
→ quantity: 1 (NOT 6 — *6 is units-per-case; NOT 2 — undiscounted VALOR≈P.VENDA at qty 1 is valid)
→ gross_unit_price: 27.56, discount_pct: null, line_total_net: 27.3

"RICOTTA TREVIGIANA 1,5KG" with QUANT "1,000", blank DESC, P.VENDA "7,967 EUR", VALOR "7,97 EUR"
→ quantity: 1 (NOT 2 — 1,5KG is unit weight metadata; NOT 1.5 unless QUANT column shows 1,5)
→ gross_unit_price: 7.967, discount_pct: null, line_total_net: 7.97

Emporio Italia — "Assaporami Prosciutto Cotto" with Qtd "4,30", Preço Unit "10,30 €", Desc.(%) "17,50", Preço Total "36,54 €"
→ quantity: 4.3
→ gross_unit_price: 10.3 (from Preço Unit — has € suffix)
→ discount_pct: 17.5 (from Desc.(%) — plain 17,50 without % symbol; NOT a euro price, NOT gross_unit_price)
→ line_total_net: 36.54 (from Preço Total)

Emporio Italia — "Salame Ventricina 2,5 Kg" with Qtd "2,60", Preço Unit "16,60 €", Desc.(%) "8,50", Preço Total "39,49 €"
→ quantity: 2.6
→ gross_unit_price: 16.6 (from Preço Unit — has € suffix)
→ discount_pct: 8.5 (from Desc.(%) — plain 8,50 without % symbol; NOT a euro price even when 8,50 < 16,60)
→ line_total_net: 39.49 (from Preço Total)

Emporio Italia — "Mortadella IGP 'Massima' con Pistacchio" with Qtd "3,11", Preço Unit "11,10 €", Desc.(%) "10,00", Preço Total "31,07 €"
→ quantity: 3.11
→ gross_unit_price: 11.1 (from Preço Unit — has € suffix)
→ discount_pct: 10 (from Desc.(%) — plain 10,00 without % symbol; values like 10,00 are discounts, NOT euro prices)
→ line_total_net: 31.07 (from Preço Total — NOT qty×unit 27.57)

Emporio Italia — Desc.(%) column rule: Preço Unit | Desc.(%) | Preço Total → gross_unit_price | discount_pct | line_total_net.
Values in Desc.(%) are ALWAYS discount percentages — never gross_unit_price or line_total_net — even when the decimal looks like a plausible euro amount (e.g. 8,50).
Format examples (plain decimal, no % symbol): 17,50→17.5, 10,00→10, 8,50→8.5.

"Aceto balsamico di Modena IGP pet 5l*2 Toschi" with quantity column "1"
→ quantity: 1 (NOT 2 — *2 means 2×5L pack spec, not qty purchased)
→ unit_price and total: from their columns only

"Rulo Di Capra 1kg*2 Simonetta" with quantity column "1"
→ quantity: 1 (NOT 2 — *2 is dual-unit pack metadata)
→ unit: from column

MAMMAFIORE COLUMN ISOLATION (Pr. Unitário | Desc. | IVA | Valor):
- gross_unit_price ← Pr. Unitário only
- discount_pct ← Desc. only (plain decimal, no % symbol — e.g. 28,50 → 28.5)
- IVA column is VAT rate — IGNORE for gross_unit_price, discount_pct, and line_total_net
- line_total_net ← Valor only (rightmost line amount for the row)

"Rulo Di Capra 1kg*2 Simonetta" with Qtd "1", Pr. Unitário "15,192", Desc. "28,50", IVA "6,00", Valor "10,86"
→ gross_unit_price: 15.192, discount_pct: 28.5, line_total_net: 10.86 (GOOD — copied Valor)
→ line_total_net: 6.00 (BAD — copied IVA column; NOT Valor 10,86)

"Farina Speciale pizza 25kg Amoruso" with Qtd "1", Pr. Unitário "33,154", Desc. "20,00", IVA "6,00", Valor "26,52"
→ gross_unit_price: 33.154, discount_pct: 20, line_total_net: 26.52 (GOOD — copied Valor digit by digit)
→ line_total_net: 25.52 (BAD — digit drift on Valor; read 26,52 not 25,52)

Mammafiore Valor digit rule: when gross_unit_price and discount_pct are read, qty × gross × (1 − discount/100) should match the printed Valor. If discount math confirms Valor (e.g. 33,154 × 0,80 ≈ 26,52), copy the printed Valor exactly — do not alter Valor digits.

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
- Emporio Desc.(%) without %: values like 17,50 between Preço Unit and Preço Total are discount_pct (e.g. 17.5), even when no % symbol is printed.
- Bocconcino DESC with %: values like 20,00% are discount_pct: 20 — strip the % symbol only.
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

const TABLE_EXTRACTION_RESPONSE_FORMAT: OpenAiResponseFormat = {
  type: "json_schema",
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

export type InvoiceLineItem = ReconciledLineItem;

export type TableExtractionResult = {
  items: InvoiceLineItem[];
  tableCrop: {
    bounds: TableBounds | null;
    fallbackUsed: boolean;
  };
};

export async function extractTableItemsFromImage(
  imageDataUrl: string,
  apiKey: string,
  knownTotal: number | null = null,
): Promise<TableExtractionResult> {
  const firstPass = await runTableExtractionPass(imageDataUrl, apiKey);
  const usedCrop = firstPass.tableCrop.bounds != null &&
    !firstPass.tableCrop.fallbackUsed &&
    firstPass.croppedDataUrl !== imageDataUrl;

  if (
    firstPass.items.length === 0 &&
    knownTotal != null &&
    knownTotal > 0 &&
    usedCrop
  ) {
    console.log("[invoice-ocr] table-pass-empty-retry", {
      knownTotal,
      retryStrategy: "full-image",
      cropBounds: firstPass.tableCrop.bounds,
    });
    const retryPass = await runTableExtractionPass(imageDataUrl, apiKey, {
      skipCrop: true,
    });
    if (retryPass.items.length > 0) {
      return {
        items: retryPass.items,
        tableCrop: {
          bounds: firstPass.tableCrop.bounds,
          fallbackUsed: true,
        },
      };
    }
  }

  return {
    items: firstPass.items,
    tableCrop: firstPass.tableCrop,
  };
}

async function runTableExtractionPass(
  imageDataUrl: string,
  apiKey: string,
  options: { skipCrop?: boolean } = {},
): Promise<TableExtractionResult & { croppedDataUrl: string }> {
  let croppedDataUrl = imageDataUrl;
  let bounds = null;
  let fallbackUsed = true;

  if (!options.skipCrop) {
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
  } else {
    console.log("[invoice-ocr] table-crop-skipped", {
      reason: "full-image-retry",
    });
  }

  const parsed = await callOpenAiJson(
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
          { type: "image_url", image_url: { url: croppedDataUrl } },
        ],
      },
    ],
    TABLE_EXTRACTION_RESPONSE_FORMAT,
  );

  const boundItems = bindMonetaryColumns(parseMonetaryLineItems(parsed.items));
  const items = reconcileLineItemAmounts(
    boundItems.map(monetaryToInvoiceLineItem),
  );

  return {
    items,
    tableCrop: {
      bounds,
      fallbackUsed: options.skipCrop ? true : fallbackUsed,
    },
    croppedDataUrl,
  };
}

export function finalizeExtractedLineItems(
  items: InvoiceLineItem[],
  netSubtotal: number | null,
): InvoiceLineItem[] {
  return reconcileLineItemsToNetSubtotal(items, netSubtotal);
}
