import { assertEquals } from "jsr:@std/assert@1";
import {
  anchorQuantities,
  applyFractionDescriptionConflict,
  hasFractionDescriptionToken,
  isQtyAnchorScopeRow,
  type QtyPrepassRow,
} from "./invoice-qty-prepass.ts";
import type { MonetaryLineItem } from "./invoice-monetary-binding.ts";
import { bindMonetaryColumns } from "./invoice-monetary-binding.ts";

function gorgonzolaStructured(
  quantity: number,
  lineTotalNet: number,
): MonetaryLineItem {
  return {
    name: "Gorgonzola DOP Dolce",
    quantity,
    unit: "kg",
    gross_unit_price: 12.9,
    discount_pct: 22.85,
    line_total_net: lineTotalNet,
    unit_price: null,
    total: null,
  };
}

const gorgonzolaPrepass: QtyPrepassRow = {
  name: "Gorgonzola DOP Dolce",
  quantity: 1.35,
  unit: "kg",
};

Deno.test("scope gate: fractional kg Emporio row in scope", () => {
  assertEquals(isQtyAnchorScopeRow(gorgonzolaPrepass, gorgonzolaStructured(1.05, 13.44)), true);
});

Deno.test("scope gate: integer Pellegrino qty excluded", () => {
  const prepass: QtyPrepassRow = { name: "SanPellegrino", quantity: 2, unit: "un" };
  const structured: MonetaryLineItem = {
    name: "SanPellegrino",
    quantity: 2,
    unit: "un",
    gross_unit_price: 21.42,
    discount_pct: 10,
    line_total_net: 38.56,
    unit_price: null,
    total: null,
  };
  assertEquals(isQtyAnchorScopeRow(prepass, structured), false);
});

Deno.test("A) OCR 1.35 Pass C 1.05 → anchor to 1.35", () => {
  const { items, metadata } = anchorQuantities(
    [gorgonzolaPrepass],
    [gorgonzolaStructured(1.05, 13.44)],
  );
  assertEquals(items[0].quantity, 1.35);
  assertEquals(metadata[0].quantity_anchored, true);
  assertEquals(metadata[0].ocr_qty_mismatch, false);
  const bound = bindMonetaryColumns(items)[0];
  assertEquals(bound.total, 13.44);
  assertEquals(bound.unit_price, 9.95);
});

Deno.test("B) OCR 1.35 Pass C 2.00 total 13.44 → anchor to 1.35", () => {
  const { items, metadata } = anchorQuantities(
    [gorgonzolaPrepass],
    [gorgonzolaStructured(2, 13.44)],
  );
  assertEquals(items[0].quantity, 1.35);
  assertEquals(metadata[0].quantity_anchored, true);
  const bound = bindMonetaryColumns(items)[0];
  assertEquals(bound.total, 13.44);
});

Deno.test("C) OCR 1.35 Pass C 1.35 → no-op", () => {
  const { items, metadata } = anchorQuantities(
    [gorgonzolaPrepass],
    [gorgonzolaStructured(1.35, 13.44)],
  );
  assertEquals(items[0].quantity, 1.35);
  assertEquals(metadata[0].quantity_anchored, false);
  assertEquals(metadata[0].ocr_qty_mismatch, false);
});

Deno.test("S3) OCR 1.35 Pass C 2.00 total 18.72 → mismatch flag, keep Pass C", () => {
  const { items, metadata } = anchorQuantities(
    [gorgonzolaPrepass],
    [gorgonzolaStructured(2, 18.72)],
  );
  assertEquals(items[0].quantity, 2);
  assertEquals(metadata[0].quantity_anchored, false);
  assertEquals(metadata[0].ocr_qty_mismatch, true);
});

Deno.test("control: Prosciutto 4.30 agreement → no-op", () => {
  const prepass: QtyPrepassRow = {
    name: "Assaporami Prosciutto Cotto",
    quantity: 4.3,
    unit: "kg",
  };
  const structured: MonetaryLineItem = {
    name: "Assaporami Prosciutto Cotto",
    quantity: 4.3,
    unit: "kg",
    gross_unit_price: 10.3,
    discount_pct: 17.5,
    line_total_net: 36.54,
    unit_price: null,
    total: null,
  };
  const { items, metadata } = anchorQuantities([prepass], [structured]);
  assertEquals(items[0].quantity, 4.3);
  assertEquals(metadata[0].quantity_anchored, false);
  assertEquals(metadata[0].ocr_qty_mismatch, false);
});

function bresaolaStructured(
  quantity: number,
  lineTotalNet: number,
): MonetaryLineItem {
  return {
    name: "Bresaola Punta d'Anca 1/2 1,5kg",
    quantity,
    unit: "kg",
    gross_unit_price: 28.5,
    discount_pct: 15,
    line_total_net: lineTotalNet,
    unit_price: null,
    total: null,
  };
}

Deno.test("A) Gorgonzola 1/8 desc: prepass 1.35 anchors over Pass C 1.05", () => {
  const { items, metadata } = anchorQuantities(
    [gorgonzolaPrepass],
    [gorgonzolaStructured(1.05, 13.44)],
  );
  assertEquals(items[0].quantity, 1.35);
  assertEquals(metadata[0].quantity_anchored, true);
  assertEquals(hasFractionDescriptionToken("Gorgonzola DOP 1/8 ~1,5kg"), true);
});

Deno.test("A-fallback) Gorgonzola 1/8: integer prepass 2 flags fraction conflict", () => {
  const badPrepass: QtyPrepassRow = {
    name: "row-0",
    quantity: 2,
    unit: "kg",
  };
  const structured = {
    ...gorgonzolaStructured(1.05, 13.44),
    name: "Gorgonzola DOP Dolce 1/8 ~1,5kg",
  };
  const { items, metadata } = anchorQuantities([badPrepass], [structured]);
  assertEquals(items[0].quantity, 1.05);
  assertEquals(metadata[0].quantity_anchored, false);
  assertEquals(metadata[0].ocr_qty_mismatch, true);
});

Deno.test("B) Bresaola 1/2 desc: prepass 1.83 agrees with Pass C", () => {
  const prepass: QtyPrepassRow = { name: "row-2", quantity: 1.83, unit: "kg" };
  const { items, metadata } = anchorQuantities(
    [prepass],
    [bresaolaStructured(1.83, 44.5)],
  );
  assertEquals(items[0].quantity, 1.83);
  assertEquals(metadata[0].quantity_anchored, false);
  assertEquals(metadata[0].ocr_qty_mismatch, false);
});

Deno.test("B-fallback) Bresaola 1/2: integer prepass 2 below 10% delta — no heuristic flag", () => {
  const badPrepass: QtyPrepassRow = { name: "row-2", quantity: 2, unit: "kg" };
  const { items, metadata } = anchorQuantities(
    [badPrepass],
    [bresaolaStructured(1.83, 44.5)],
  );
  assertEquals(items[0].quantity, 1.83);
  assertEquals(metadata[0].quantity_anchored, false);
  // delta(2, 1.83) ≈ 8.5% < 10% threshold — strip crop is primary fix for Bresaola
  assertEquals(metadata[0].ocr_qty_mismatch, false);
});

Deno.test("C) Paccheri integer row unchanged — no fraction conflict", () => {
  const prepass: QtyPrepassRow = { name: "row-5", quantity: 24, unit: "un" };
  const structured: MonetaryLineItem = {
    name: "Paccheri Rummo 500g",
    quantity: 24,
    unit: "un",
    gross_unit_price: 1.2,
    discount_pct: 0,
    line_total_net: 28.8,
    unit_price: null,
    total: null,
  };
  const { items, metadata } = anchorQuantities([prepass], [structured]);
  assertEquals(items[0].quantity, 24);
  assertEquals(metadata[0].ocr_qty_mismatch, false);
});

Deno.test("fraction conflict helper: Mortadella 3.1 vs 3.11 no flag", () => {
  const prepass: QtyPrepassRow = {
    name: "row-3",
    quantity: 3.1,
    unit: "kg",
  };
  const structured: MonetaryLineItem = {
    name: "Mortadella 1/2 3,5kg",
    quantity: 3.11,
    unit: "kg",
    gross_unit_price: 8.5,
    discount_pct: 10,
    line_total_net: 23.8,
    unit_price: null,
    total: null,
  };
  const meta = applyFractionDescriptionConflict(prepass, structured, {
    ocr_quantity: 3.1,
    pass_c_quantity: 3.11,
    quantity_anchored: false,
    ocr_qty_mismatch: false,
  });
  assertEquals(meta.ocr_qty_mismatch, false);
});
