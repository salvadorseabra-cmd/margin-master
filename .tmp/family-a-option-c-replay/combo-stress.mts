/**
 * Combo stress: force Gorgonzola/Rolo triggers by removing multiple blocking gates.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const TOL = 0.02;
const DIFF_PCT_MIN = 0.45;

type Ablated = Partial<Record<string, boolean>>;

function readJson(p: string) { return JSON.parse(readFileSync(p, "utf8")); }

function replayBinding(item: { quantity: number; unit_price: number; total: number; unit?: string | null }) {
  const raw = { name: "x", quantity: item.quantity, unit: item.unit ?? null, gross_unit_price: null, discount_pct: null, line_total_net: null, unit_price: item.unit_price, total: item.total };
  const [bound] = bindMonetaryColumns(parseMonetaryLineItems([raw]));
  const rawUnit = item.unit_price, boundUnit = bound.unit_price!, qty = bound.quantity!, total = bound.total!;
  const bindingChanged = Math.abs(boundUnit - rawUnit) > TOL;
  const diffPct = rawUnit > 0 ? Math.abs(rawUnit - boundUnit) / rawUnit : 0;
  return {
    bindingChanged,
    arithmeticConsistent: Math.abs(qty * boundUnit - total) <= TOL,
    diffPct: Math.round(diffPct * 10000) / 10000,
    unitApproxTotalAtQty1: Math.abs(rawUnit - total) / Math.max(total, 0.01) <= 0.02,
  };
}

function evaluate(hybridHQty: number, binding: ReturnType<typeof replayBinding>, meta: { ocrQty: number; undiscountedBlankDesc: boolean; supplierIsIlBocconcino: boolean; hybridHQty2Stable: boolean | null }, ablated: Ablated) {
  const signals: Record<string, boolean> = {
    ocr_qty_eq_1: meta.ocrQty === 1,
    hybrid_h_qty_eq_2: hybridHQty === 2,
    hybrid_h_qty_2_stable: meta.hybridHQty2Stable === true,
    undiscounted_blank_desc: meta.undiscountedBlankDesc,
    unit_price_approx_total_at_qty1: binding.unitApproxTotalAtQty1,
    supplier_il_bocconcino: meta.supplierIsIlBocconcino,
    qty_inflation_signature: hybridHQty > 1 && binding.bindingChanged && binding.arithmeticConsistent && binding.diffPct >= DIFF_PCT_MIN,
  };
  const check = (k: string) => (ablated[k] === false ? true : signals[k]);
  const combo = check("ocr_qty_eq_1") && check("hybrid_h_qty_eq_2") && check("hybrid_h_qty_2_stable") && check("undiscounted_blank_desc") && check("unit_price_approx_total_at_qty1") && check("supplier_il_bocconcino");
  const inflation = ablated.qty_inflation_signature === false ? true : ablated.diff_pct_ge_45 === false ? (hybridHQty > 1 && binding.bindingChanged && binding.arithmeticConsistent) : signals.qty_inflation_signature;
  return { wouldTrigger: combo && inflation, signals, combo, inflation };
}

const cases = [
  {
    name: "Gorgonzola (effective-paid DB row)",
    hybridHQty: 2,
    binding: replayBinding({ quantity: 2, unit_price: 10.22, total: 13.44 }),
    meta: { ocrQty: 1.35, undiscountedBlankDesc: false, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
    blocking: ["ocr_qty_eq_1", "hybrid_h_qty_2_stable", "undiscounted_blank_desc", "unit_price_approx_total_at_qty1", "supplier_il_bocconcino", "qty_inflation_signature"],
  },
  {
    name: "Gorgonzola (v25 Emporio extract)",
    hybridHQty: 2,
    binding: replayBinding({ quantity: 2, unit_price: 6.6, total: 13.44 }),
    meta: { ocrQty: 1.35, undiscountedBlankDesc: false, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
    blocking: ["ocr_qty_eq_1", "hybrid_h_qty_2_stable", "undiscounted_blank_desc", "unit_price_approx_total_at_qty1", "supplier_il_bocconcino", "qty_inflation_signature"],
  },
  {
    name: "Rolo (transient run 7)",
    hybridHQty: 2,
    binding: replayBinding({ quantity: 2, unit_price: 12.187, total: 12.17 }),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: false },
    blocking: ["hybrid_h_qty_2_stable"],
  },
  {
    name: "Mezzi Paccheri (failure)",
    hybridHQty: 2,
    binding: replayBinding({ quantity: 2, unit_price: 27.36, total: 27.3 }),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: true },
    blocking: [],
  },
];

// Counterfactual: Gorgonzola IF it were Bocconcino undiscounted with OCR qty=1
const gorgonzolaCounterfactual = {
  name: "Gorgonzola CF: Bocconcino + OCR=1 + undiscounted + stable",
  hybridHQty: 2,
  binding: replayBinding({ quantity: 2, unit_price: 10.22, total: 13.44 }),
  meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: true },
  blocking: ["qty_inflation_signature", "unit_price_approx_total_at_qty1"],
};

const results = cases.map((c) => {
  const baseline = evaluate(c.hybridHQty, c.binding, c.meta, {});
  const removeAllBlocking = Object.fromEntries(c.blocking.map((k) => [k, false]));
  const forced = evaluate(c.hybridHQty, c.binding, c.meta, removeAllBlocking);
  return { product: c.name, baseline, removeAllBlocking: { ablated: c.blocking, ...forced } };
});

const cf = evaluate(gorgonzolaCounterfactual.hybridHQty, gorgonzolaCounterfactual.binding, gorgonzolaCounterfactual.meta, {});
const cfNoDiff = evaluate(gorgonzolaCounterfactual.hybridHQty, gorgonzolaCounterfactual.binding, gorgonzolaCounterfactual.meta, { diff_pct_ge_45: false });
const cfNoDiffNoUnit = evaluate(gorgonzolaCounterfactual.hybridHQty, gorgonzolaCounterfactual.binding, gorgonzolaCounterfactual.meta, { diff_pct_ge_45: false, unit_price_approx_total_at_qty1: false });

// Threshold sweep for diff_pct on Gorgonzola effective-paid with all other Family A conditions forced true
const thresholdSweep = [];
for (let pct = 0; pct <= 0.55; pct += 0.05) {
  const binding = replayBinding({ quantity: 2, unit_price: 10.22, total: 13.44 });
  const inflates = binding.diffPct >= pct;
  thresholdSweep.push({ threshold: pct, gorgonzolaDiffPct: binding.diffPct, wouldInflate: inflates });
}

const out = { results, gorgonzolaCounterfactual: { baseline: cf, noDiffPctGate: cfNoDiff, noDiffPctAndUnitGate: cfNoDiffNoUnit }, thresholdSweep };
writeFileSync(join(__dir, "combo-stress-result.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
