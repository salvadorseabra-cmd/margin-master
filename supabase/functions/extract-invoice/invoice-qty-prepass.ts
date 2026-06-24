import {
  callOpenAiJson,
  type OpenAiResponseFormat,
} from "./invoice-date-extraction.ts";
import type { MonetaryLineItem } from "./invoice-monetary-binding.ts";
import { cropQtdColumnStrip } from "./invoice-qty-column-crop.ts";

const QTY_PREPAS_RESPONSE_FORMAT: OpenAiResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "invoice_qty_prepass",
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
            },
            required: ["name", "quantity", "unit"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const QTY_PREPAS_SYSTEM_PROMPT = `
You extract ONLY quantity and unit from invoice table line items.

Return ONLY valid JSON:
{ "items": [{ "name": string, "quantity": number | null, "unit": string | null }] }

RULES:
- Copy quantity ONLY from the Qtd / QUANT / quantity column for each row.
- Copy unit from the unit column when visible; otherwise null.
- Ignore description tokens: 1/8, ~1,5kg, pack *N, CX6, x15, 33cl*24 — these are NOT purchased quantity.
- When quantity column and description disagree, ALWAYS trust the quantity column.
- Read fractional decimals exactly: 1,35 → 1.35, 0,5 → 0.5 — never round.
- One output row per visible product line in table order.
- Do not extract prices, discounts, or totals.
- The image may show ONLY the quantity column — no product names are visible.
- Each horizontal band is one row's Qtd cell. Read top-to-bottom in table order.
- Pack fractions in product names (1/8, 1/2, 1/4) are NEVER purchased quantity.
- If a cell is blank or illegible → quantity: null (never infer 1, 2, or pack count).
- Integer 2 is almost never a valid Emporio kg Qtd when the cell shows a decimal like 1,35.
`.trim();

const QTD_STRIP_SYSTEM_PROMPT = `
You extract ONLY quantity from invoice Qtd column row bands.

Return ONLY valid JSON:
{ "items": [{ "name": string, "quantity": number | null, "unit": string | null }] }

RULES:
- Read ONLY the Qtd column — no product names are visible.
- Each horizontal band is one row's Qtd cell. Read top-to-bottom in table order.
- Return quantity: null when a cell is blank or illegible — never guess from fractions or pack weights.
- Read fractional decimals exactly: 1,35 → 1.35, 0,5 → 0.5 — never round.
- One output row per visible row band.
- Pack fractions (1/8, 1/2, 1/4) are NEVER purchased quantity.
- unit should be "kg" for Emporio deli decimal rows when visible; otherwise null.
`.trim();

export type QtyPrepassRow = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type QtyAnchorMetadata = {
  ocr_quantity: number | null;
  pass_c_quantity: number | null;
  quantity_anchored: boolean;
  ocr_qty_mismatch: boolean;
};

export const QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT = 2;
export const QTY_ANCHOR_SCORE_MARGIN_EUR = 0.1;
export const QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR = 0.5;
export const OCR_QTY_MISMATCH_THRESHOLD_PCT = 10;

const round2 = (n: number) => Math.round(n * 100) / 100;

function normalizeWeightUnit(unit: string | null | undefined): string | null {
  const raw = unit?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "kg" || raw === "kgs") return "kg";
  return null;
}

function isFractionalQty(qty: number): boolean {
  if (!Number.isFinite(qty) || qty <= 0) return false;
  return Math.abs(qty % 1) > 0.001;
}

/** Scope gate B: fractional kg rows with Emporio-style discount table semantics. */
export function isQtyAnchorScopeRow(
  prepass: QtyPrepassRow,
  structured: MonetaryLineItem,
): boolean {
  const unit = normalizeWeightUnit(structured.unit ?? prepass.unit);
  if (unit !== "kg") return false;
  const ocrQty = prepass.quantity;
  if (ocrQty == null || !isFractionalQty(ocrQty)) return false;
  const hasDiscountSemantics =
    structured.discount_pct != null ||
    (structured.gross_unit_price != null && structured.line_total_net != null &&
      structured.gross_unit_price > structured.line_total_net);
  return hasDiscountSemantics;
}

function deriveNetUnitPrice(
  grossUnitPrice: number | null,
  discountPct: number | null,
): number | null {
  if (grossUnitPrice != null && discountPct != null) {
    return round2(grossUnitPrice * (1 - discountPct / 100));
  }
  return grossUnitPrice;
}

function unitPriceForScoring(structured: MonetaryLineItem): number | null {
  const derivedNet = deriveNetUnitPrice(
    structured.gross_unit_price,
    structured.discount_pct,
  );
  if (derivedNet != null) return derivedNet;
  if (structured.unit_price != null) return structured.unit_price;
  if (structured.gross_unit_price != null) return structured.gross_unit_price;
  return null;
}

function scoreQtyAgainstLineTotal(
  qty: number,
  lineTotalNet: number,
  structured: MonetaryLineItem,
): number {
  const unitPrice = unitPriceForScoring(structured);
  if (unitPrice == null) return Number.POSITIVE_INFINITY;
  return round2(Math.abs(lineTotalNet - qty * unitPrice));
}

function mathReviewFails(
  qty: number,
  unitPrice: number | null,
  total: number | null,
): boolean {
  if (unitPrice == null || total == null) return false;
  const expected = round2(qty * unitPrice);
  const actual = round2(total);
  const variance_abs = round2(Math.abs(expected - actual));
  const denom = Math.max(Math.abs(actual), Math.abs(expected), 0.01);
  const variance_pct = round2((variance_abs / denom) * 100);
  return variance_abs > 0.5 && variance_pct > 5;
}

function deltaPct(ocrQty: number, passCQty: number): number {
  return round2((Math.abs(ocrQty - passCQty) / Math.max(ocrQty, 0.01)) * 100);
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchPrepassRow(
  structured: MonetaryLineItem,
  prepassRows: QtyPrepassRow[],
  index: number,
): QtyPrepassRow | null {
  if (index < prepassRows.length) {
    const byIndex = prepassRows[index];
    if (byIndex) return byIndex;
  }
  const key = normalizeNameKey(structured.name);
  return prepassRows.find((row) => normalizeNameKey(row.name) === key) ?? null;
}

function isIntegerQty(qty: number): boolean {
  return Number.isFinite(qty) && Math.abs(qty % 1) <= 0.001;
}

/** Fraction token in product name (e.g. 1/8, 1/2) — detection-only adjunct for review flags. */
export function hasFractionDescriptionToken(name: string): boolean {
  return /\d+\s*\/\s*\d+/.test(name);
}

/**
 * When scope gate skips integer OCR on fraction-description rows, still flag for review.
 * Detection only — never overwrites quantity.
 */
export function applyFractionDescriptionConflict(
  prepass: QtyPrepassRow | null,
  structured: MonetaryLineItem,
  meta: QtyAnchorMetadata,
): QtyAnchorMetadata {
  if (!prepass || meta.ocr_qty_mismatch) return meta;
  const ocrQty = prepass.quantity;
  const passCQty = structured.quantity;
  if (ocrQty == null || passCQty == null) return meta;
  if (!isIntegerQty(ocrQty)) return meta;
  const unit = normalizeWeightUnit(structured.unit ?? prepass.unit);
  if (unit !== "kg" || !isFractionalQty(passCQty)) return meta;
  if (!hasFractionDescriptionToken(structured.name)) return meta;
  const delta = deltaPct(ocrQty, passCQty);
  if (delta <= OCR_QTY_MISMATCH_THRESHOLD_PCT) return meta;
  return { ...meta, ocr_qty_mismatch: true };
}

export type QtyPrepassResult = {
  rows: QtyPrepassRow[];
  usedQtdStrip: boolean;
};

function normalizePrepassRows(
  raw: unknown[],
  options: { stripMode: boolean },
): QtyPrepassRow[] {
  return raw.map((item, index) => {
    const row = item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : {};
    return {
      name: options.stripMode
        ? `row-${index}`
        : typeof row.name === "string"
        ? row.name
        : "Unknown item",
      quantity: typeof row.quantity === "number" ? row.quantity : null,
      unit: options.stripMode
        ? "kg"
        : typeof row.unit === "string"
        ? row.unit
        : null,
    };
  });
}

export async function runQuantityPrePass(
  croppedImageDataUrl: string,
  apiKey: string,
): Promise<QtyPrepassResult> {
  const qtdStripUrl = await cropQtdColumnStrip(croppedImageDataUrl);
  const usedQtdStrip = qtdStripUrl != null;
  const imageUrl = usedQtdStrip ? qtdStripUrl : croppedImageDataUrl;
  const systemPrompt = usedQtdStrip
    ? QTD_STRIP_SYSTEM_PROMPT
    : QTY_PREPAS_SYSTEM_PROMPT;
  const userText = usedQtdStrip
    ? "Read the decimal quantity from each row band in this Qtd column image only. Return one item per visible row band, in order. Name may be row-N."
    : "Copy quantity and unit from the Qtd column for each visible invoice line item.";

  const parsed = await callOpenAiJson(
    apiKey,
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    QTY_PREPAS_RESPONSE_FORMAT,
  );

  const raw = parsed.items;
  if (!Array.isArray(raw)) return { rows: [], usedQtdStrip };

  return {
    rows: normalizePrepassRows(raw, { stripMode: usedQtdStrip }),
    usedQtdStrip,
  };
}

export type AnchorQuantitiesResult = {
  items: MonetaryLineItem[];
  metadata: QtyAnchorMetadata[];
};

export function anchorQuantities(
  prepassRows: QtyPrepassRow[],
  structuredRows: MonetaryLineItem[],
): AnchorQuantitiesResult {
  const metadata: QtyAnchorMetadata[] = [];
  const items = structuredRows.map((row, index) => {
    const prepass = matchPrepassRow(row, prepassRows, index);
    const defaultMeta: QtyAnchorMetadata = {
      ocr_quantity: prepass?.quantity ?? null,
      pass_c_quantity: row.quantity,
      quantity_anchored: false,
      ocr_qty_mismatch: false,
    };

    if (!prepass || !isQtyAnchorScopeRow(prepass, row)) {
      metadata.push(applyFractionDescriptionConflict(prepass, row, defaultMeta));
      return row;
    }

    const ocrQty = prepass.quantity;
    const passCQty = row.quantity;
    if (ocrQty == null || passCQty == null) {
      metadata.push(defaultMeta);
      return row;
    }

    const delta = deltaPct(ocrQty, passCQty);
    if (delta <= QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT) {
      metadata.push(defaultMeta);
      return row;
    }

    const lineTotalNet = row.line_total_net;
    if (lineTotalNet == null) {
      metadata.push({
        ...defaultMeta,
        ocr_qty_mismatch: delta > OCR_QTY_MISMATCH_THRESHOLD_PCT,
      });
      return row;
    }

    const passCUnitForMath = unitPriceForScoring(row);
    const scoreOcr = scoreQtyAgainstLineTotal(ocrQty, lineTotalNet, row);
    const scorePassC = scoreQtyAgainstLineTotal(passCQty, lineTotalNet, row);

    const shouldAnchor =
      scoreOcr < scorePassC - QTY_ANCHOR_SCORE_MARGIN_EUR ||
      (mathReviewFails(passCQty, passCUnitForMath, lineTotalNet) &&
        scoreOcr <= QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR);

    if (shouldAnchor) {
      metadata.push({
        ocr_quantity: ocrQty,
        pass_c_quantity: passCQty,
        quantity_anchored: true,
        ocr_qty_mismatch: false,
      });
      return { ...row, quantity: ocrQty };
    }

    metadata.push({
      ocr_quantity: ocrQty,
      pass_c_quantity: passCQty,
      quantity_anchored: false,
      ocr_qty_mismatch: delta > OCR_QTY_MISMATCH_THRESHOLD_PCT,
    });
    return row;
  });

  return { items, metadata };
}
