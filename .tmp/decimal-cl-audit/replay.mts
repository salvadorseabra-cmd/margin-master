/**
 * Read-only: replay detectVolume + €/L for decimal-cl audit matches.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { detectVolume } from "../../src/lib/ingredient-unit-inference";
import {
  computeEffectiveUsableCost,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveStructuredPurchaseForDisplay,
} from "../../src/lib/invoice-purchase-format";

const OUT_DIR = ".tmp/decimal-cl-audit";
const BEVERAGE_RE =
  /pellegrino|acqua|water|beer|ginger|cola|suco|sumo|juice|vinho|wine|cerveja|lager|ipa|soda|drink|bebida|champagne|prosecco|spritz|tonic|fever.?tree|fanta|pepsi|coca|baladin|aperol|campari|monin|schweppes|red\s*bull|monster|heineken|corona|stella|guinness|peroni|san\s*pellegrino/i;

type Row = {
  id?: string;
  name: string;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | string | null;
  total?: number | string | null;
  supplier_name?: string | null;
  invoice_date?: string | null;
  invoice_id?: string;
  dataset: "vl" | "production";
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? Number(v) : v;
}

function classifyStatus(
  name: string,
  parsedMlPerUnit: number | null,
  totalMl: number | null,
  costPerL: number | null,
): "SUSPECT" | "OK" | "N/A" {
  const isBeverage = BEVERAGE_RE.test(name);
  if (isBeverage && parsedMlPerUnit != null && parsedMlPerUnit < 50) return "SUSPECT";
  if (costPerL != null && costPerL > 50) return "SUSPECT";
  if (parsedMlPerUnit != null && totalMl != null) return "OK";
  return "N/A";
}

function replayRow(row: Row) {
  const meta = {
    name: row.name,
    quantity: num(row.quantity),
    unit: row.unit ?? "un",
    unit_price: num(row.unit_price),
    line_total: num(row.total),
    matchedIngredientName: null as string | null,
  };
  const vol = detectVolume(row.name);
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const structuredDisplay = resolveStructuredPurchaseForDisplay(meta);
  const perUnit = resolveUsablePerPricedUnit(meta, structured);
  const usableCost = computeEffectiveUsableCost(meta.unit_price, meta, structured, row.name);

  const parsedMlPerUnit = vol?.milliliters ?? null;
  const totalMl =
    structured.usableQuantityUnit === "ml" ? structured.normalizedUsableQuantity : null;
  const costPerL = usableCost?.unit === "L" ? usableCost.cost : null;
  const theoreticalEurPerL =
    perUnit?.unit === "ml" && perUnit.amount > 0
      ? meta.unit_price / (perUnit.amount / 1000)
      : null;

  return {
    id: row.id,
    dataset: row.dataset,
    product: row.name,
    invoice: `${row.supplier_name ?? "?"} — ${row.invoice_date ?? "?"}`,
    invoice_id: row.invoice_id,
    qty: meta.quantity,
    unit: meta.unit,
    unit_price: meta.unit_price,
    parsed_volume_ml_per_unit: parsedMlPerUnit,
    parsed_volume_display:
      parsedMlPerUnit != null
        ? `${parsedMlPerUnit} ml/unit (${totalMl ?? "?"} ml total)`
        : null,
    total_usable_ml: totalMl,
    usable_unit: structured.usableQuantityUnit,
    cost_per_liter: costPerL,
    theoretical_eur_per_liter:
      theoreticalEurPerL != null ? Math.round(theoreticalEurPerL * 100) / 100 : null,
    effective_usable_cost: usableCost,
    status: classifyStatus(
      row.name,
      parsedMlPerUnit,
      totalMl,
      costPerL ?? theoreticalEurPerL,
    ),
    detectVolume_reason: vol?.reason ?? null,
    structured_display: structuredDisplay,
    per_priced_unit: perUnit,
  };
}

const query = JSON.parse(readFileSync(`${OUT_DIR}/query-results.json`, "utf8")) as {
  decimal_cl: {
    vl: { rows: Row[] };
    production: { rows: Row[] };
  };
  broader_patterns: {
    vl: Array<{ id: string; name: string; supplier?: string }>;
    production: Array<{ id: string; name: string; supplier?: string }>;
  };
};

const rows: Row[] = [
  ...query.decimal_cl.vl.rows.map((r) => ({ ...r, dataset: "vl" as const })),
  ...query.decimal_cl.production.rows.map((r) => ({ ...r, dataset: "production" as const })),
];

const replayed = rows.map(replayRow);
const suspectCount = replayed.filter((r) => r.status === "SUSPECT").length;

const replayResults = {
  replayed_at: new Date().toISOString(),
  decimal_cl_matches: replayed,
  counts: {
    vl_matches: query.decimal_cl.vl.rows.length,
    production_matches: query.decimal_cl.production.rows.length,
    suspect: suspectCount,
    ok: replayed.filter((r) => r.status === "OK").length,
  },
  broader_pattern_note:
    "No broader 0.xx L / 0.xxL matches in either dataset; see query-results.json",
};

writeFileSync(`${OUT_DIR}/replay-results.json`, JSON.stringify(replayResults, null, 2));
console.log(JSON.stringify(replayResults.counts, null, 2));
for (const r of replayed) {
  console.log(
    `${r.status}\t${r.product}\t${r.parsed_volume_display}\t€${r.cost_per_liter ?? "—"}/L`,
  );
}
