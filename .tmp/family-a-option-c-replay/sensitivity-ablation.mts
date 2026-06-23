/**
 * Adversarial sensitivity ablation — READ-ONLY, .tmp only.
 * Removes each Option C condition one-at-a-time and reports metrics.
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
const OUT = join(__dir, "sensitivity-ablation-result.json");

const TOL = 0.02;
const DIFF_PCT_MIN = 0.45;

type RowSpec = {
  product: string;
  category: "failure" | "control" | "negative";
  expectedTrigger: boolean;
  artifact: string;
  match: (name: string) => boolean;
  meta: {
    ocrQty: number;
    undiscountedBlankDesc: boolean;
    supplierIsIlBocconcino: boolean;
    hybridHQty2Stable: boolean | null;
    notes?: string;
  };
  runLabel?: string;
};

type AblatedConditions = {
  ocr_qty_eq_1?: boolean;
  hybrid_h_qty_eq_2?: boolean;
  hybrid_h_qty_2_stable?: boolean;
  undiscounted_blank_desc?: boolean;
  unit_price_approx_total_at_qty1?: boolean;
  supplier_il_bocconcino?: boolean;
  qty_inflation_signature?: boolean;
  diff_pct_ge_45?: boolean;
};

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normName(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9*]/g, "");
}

function findItem(
  extract: { items: Array<{ name: string; quantity: number; unit_price: number; total: number; unit?: string | null }> },
  match: (name: string) => boolean,
) {
  return extract.items.find((i) => match(i.name));
}

function replayBinding(item: { name: string; quantity: number; unit_price: number; total: number; unit?: string | null }) {
  const raw = {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit ?? null,
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
    unit_price: item.unit_price,
    total: item.total,
  };
  const [bound] = bindMonetaryColumns(parseMonetaryLineItems([raw]));
  const rawUnit = item.unit_price;
  const boundUnit = bound.unit_price!;
  const qty = bound.quantity!;
  const total = bound.total!;
  const bindingChanged = Math.abs(boundUnit - rawUnit) > TOL;
  const product = qty * rawUnit;
  const arithmeticConsistent = Math.abs(qty * boundUnit - total) <= TOL;
  const diffPct = rawUnit > 0 ? Math.abs(rawUnit - boundUnit) / rawUnit : 0;
  const unitApproxTotalAtQty1 = Math.abs(rawUnit - total) / Math.max(total, 0.01) <= 0.02;
  const totalPreserved = Math.abs(product - total) > TOL && arithmeticConsistent;

  return {
    raw: { qty, unit_price: rawUnit, total },
    bound: { qty, unit_price: boundUnit, total },
    bindingChanged,
    arithmeticConsistent,
    diffPct: Math.round(diffPct * 10000) / 10000,
    unitApproxTotalAtQty1,
    totalPreserved,
  };
}

function evaluateOptionC(
  hybridHQty: number,
  binding: ReturnType<typeof replayBinding>,
  meta: RowSpec["meta"],
  ablated: AblatedConditions = {},
) {
  const signals = {
    ocr_qty_eq_1: meta.ocrQty === 1,
    hybrid_h_qty_eq_2: hybridHQty === 2,
    hybrid_h_qty_2_stable: meta.hybridHQty2Stable === true,
    undiscounted_blank_desc: meta.undiscountedBlankDesc,
    unit_price_approx_total_at_qty1: binding.unitApproxTotalAtQty1,
    supplier_il_bocconcino: meta.supplierIsIlBocconcino,
    total_preserved: binding.totalPreserved,
    qty_inflation_signature:
      hybridHQty > 1 &&
      binding.bindingChanged &&
      binding.arithmeticConsistent &&
      binding.diffPct >= DIFF_PCT_MIN,
    diff_pct_ge_45: binding.diffPct >= DIFF_PCT_MIN,
  };

  const check = (key: keyof typeof signals) => (ablated[key] === false ? true : signals[key]);

  const documentedCombo =
    check("ocr_qty_eq_1") &&
    check("hybrid_h_qty_eq_2") &&
    check("hybrid_h_qty_2_stable") &&
    check("undiscounted_blank_desc") &&
    check("unit_price_approx_total_at_qty1") &&
    check("supplier_il_bocconcino");

  const inflationOk = ablated.qty_inflation_signature === false
    ? true
    : ablated.diff_pct_ge_45 === false
      ? hybridHQty > 1 && binding.bindingChanged && binding.arithmeticConsistent
      : signals.qty_inflation_signature;

  const wouldTrigger = documentedCombo && inflationOk;

  return { signals, documentedCombo, wouldTrigger, inflationOk };
}

function classify(wouldTrigger: boolean, expectedTrigger: boolean) {
  if (wouldTrigger === expectedTrigger) return "PASS";
  if (wouldTrigger && !expectedTrigger) return "FALSE_POSITIVE";
  return "FALSE_NEGATIVE";
}

const ROWS: RowSpec[] = [
  {
    product: "Mezzi Paccheri",
    category: "failure",
    expectedTrigger: true,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`,
    match: (n) => normName(n).includes("MEZZIPACCHERI") || normName(n).includes("PACCHERIMANCINI"),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: true, notes: "passc qty=1; 10/10 stability qty=2" },
  },
  {
    product: "Ricotta",
    category: "failure",
    expectedTrigger: true,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`,
    match: (n) => normName(n).includes("RICOTTA"),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: true },
  },
  {
    product: "Pomodori",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`,
    match: (n) => normName(n).includes("POMODOR"),
    meta: { ocrQty: 1, undiscountedBlankDesc: false, supplierIsIlBocconcino: true, hybridHQty2Stable: false },
  },
  {
    product: "Rolo (stable v25)",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`,
    match: (n) => normName(n).includes("ROLO") && normName(n).includes("CABRA"),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: false },
  },
  {
    product: "Rolo (transient run 7)",
    category: "negative",
    expectedTrigger: false,
    artifact: `${ROOT}/final-stability-audit/extracts/f0aa5a08-86a3-4938-99f0-711e86073968-run7.json`,
    match: (n) => normName(n).includes("ROLO") && normName(n).includes("CABRA"),
    runLabel: "stability run 7",
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: false },
  },
  {
    product: "Acqua",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`,
    match: (n) => normName(n).includes("ACQUA") && normName(n).includes("PELLEGRINO"),
    meta: { ocrQty: 2, undiscountedBlankDesc: true, supplierIsIlBocconcino: true, hybridHQty2Stable: null },
  },
  {
    product: "Mozzarella (Bocconcino)",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`,
    match: (n) => normName(n).includes("MOZZARELLA") && normName(n).includes("BOCCONCINO"),
    meta: { ocrQty: 10, undiscountedBlankDesc: false, supplierIsIlBocconcino: true, hybridHQty2Stable: null },
  },
  {
    product: "Arroz",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2.json`,
    match: (n) => normName(n).includes("ARROZ"),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
  },
  {
    product: "Açúcar",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2.json`,
    match: (n) => {
      const x = normName(n);
      return x.includes("ACUAR") || x.includes("ACUCAR") || (x.includes("METROCHEF") && x.includes("10X1"));
    },
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
  },
  {
    product: "Pepinos",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2.json`,
    match: (n) => normName(n).includes("PEPINOS"),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
  },
  {
    product: "Aceto",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json`,
    match: (n) => normName(n).includes("ACETO"),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
  },
  {
    product: "Rulo Di Capra",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json`,
    match: (n) => normName(n).includes("RULO") && normName(n).includes("CAPRA"),
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
  },
  {
    product: "Farina",
    category: "control",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/36c99d19-6f9f-413f-8c2d-ae3526291a2d.json`,
    match: (n) => {
      const x = normName(n);
      return (x.includes("FARINA") || x.includes("FARINE")) && x.includes("PIZZA");
    },
    meta: { ocrQty: 1, undiscountedBlankDesc: true, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
  },
  {
    product: "Gorgonzola (v25 Emporio)",
    category: "negative",
    expectedTrigger: false,
    artifact: `${ROOT}/final-validation-lab-rerun/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json`,
    match: (n) => normName(n).includes("GORGONZOLA"),
    meta: { ocrQty: 1.35, undiscountedBlankDesc: false, supplierIsIlBocconcino: false, hybridHQty2Stable: false },
  },
];

function buildRowResults(ablated: AblatedConditions = {}) {
  const results = [];
  for (const spec of ROWS) {
    const extract = readJson(spec.artifact);
    const item = findItem(extract, spec.match);
    if (!item) continue;
    const binding = replayBinding(item);
    const eval_ = evaluateOptionC(item.quantity, binding, spec.meta, ablated);
    results.push({
      product: spec.product,
      category: spec.category,
      expectedTrigger: spec.expectedTrigger,
      wouldTrigger: eval_.wouldTrigger,
      outcome: classify(eval_.wouldTrigger, spec.expectedTrigger),
      signals: eval_.signals,
      binding,
    });
  }

  // Gorgonzola effective-paid
  const gorgonzolaEffectivePaid = readJson(`${ROOT}/effective-paid-contract-validation-result.json`)
    .flagged_all_15.find((r: { description: string }) => r.description.toLowerCase().includes("gorgonzola"));
  if (gorgonzolaEffectivePaid) {
    const b = gorgonzolaEffectivePaid.binding;
    const binding = {
      raw: b.raw,
      bound: b.bound,
      bindingChanged: b.binding_changed,
      arithmeticConsistent: b.arithmetic_consistent,
      diffPct: b.diff_pct,
      unitApproxTotalAtQty1: Math.abs(b.raw.unit_price - b.raw.total) / Math.max(b.raw.total, 0.01) <= 0.02,
      totalPreserved: b.arithmetic_consistent && b.binding_changed,
    };
    const meta = { ocrQty: 1.35, undiscountedBlankDesc: false, supplierIsIlBocconcino: false, hybridHQty2Stable: false };
    const eval_ = evaluateOptionC(b.raw.qty, binding as ReturnType<typeof replayBinding>, meta, ablated);
    results.push({
      product: "Gorgonzola (effective-paid DB row)",
      category: "negative",
      expectedTrigger: false,
      wouldTrigger: eval_.wouldTrigger,
      outcome: classify(eval_.wouldTrigger, false),
      signals: eval_.signals,
      binding,
    });
  }
  return results;
}

function metrics(results: ReturnType<typeof buildRowResults>) {
  const failures = results.filter((r) => r.category === "failure");
  const controls = results.filter((r) => r.category === "control");
  const recall = failures.filter((r) => r.wouldTrigger).length / Math.max(failures.length, 1);
  const controlPrecision = controls.filter((r) => !r.wouldTrigger).length / Math.max(controls.length, 1);
  const fp = results.filter((r) => r.outcome === "FALSE_POSITIVE");
  const fn = results.filter((r) => r.outcome === "FALSE_NEGATIVE");
  return {
    familyARecall: recall,
    familyARecallFraction: `${failures.filter((r) => r.wouldTrigger).length}/${failures.length}`,
    controlPrecision,
    controlsPreserved: `${controls.filter((r) => !r.wouldTrigger).length}/${controls.length}`,
    falsePositives: fp.length,
    falseNegatives: fn.length,
    falsePositiveProducts: fp.map((r) => r.product),
    falseNegativeProducts: fn.map((r) => r.product),
  };
}

const ABLATION_KEYS: Array<{ key: keyof AblatedConditions; label: string }> = [
  { key: "ocr_qty_eq_1", label: "Remove OCR qty=1 gate" },
  { key: "hybrid_h_qty_eq_2", label: "Remove Hybrid H qty=2 gate" },
  { key: "hybrid_h_qty_2_stable", label: "Remove stability gate (10/10)" },
  { key: "undiscounted_blank_desc", label: "Remove undiscounted blank DESC gate" },
  { key: "unit_price_approx_total_at_qty1", label: "Remove unit≈total at qty=1 gate" },
  { key: "supplier_il_bocconcino", label: "Remove IL BOCCONCINO supplier gate" },
  { key: "qty_inflation_signature", label: "Remove entire qty inflation signature" },
  { key: "diff_pct_ge_45", label: "Remove diff_pct≥45% (keep binding_changed)" },
];

const baseline = buildRowResults();
const ablations = ABLATION_KEYS.map(({ key, label }) => ({
  ablatedCondition: key,
  label,
  metrics: metrics(buildRowResults({ [key]: false })),
}));

// Gorgonzola stress: force each blocking condition OFF for Gorgonzola only
function gorgonzolaStress() {
  const gProducts = ["Gorgonzola (v25 Emporio)", "Gorgonzola (effective-paid DB row)"];
  const conditions = [
    "supplier_il_bocconcino",
    "ocr_qty_eq_1",
    "undiscounted_blank_desc",
    "hybrid_h_qty_2_stable",
    "unit_price_approx_total_at_qty1",
    "diff_pct_ge_45",
    "qty_inflation_signature",
    "hybrid_h_qty_eq_2",
  ] as const;

  const baseResults = buildRowResults();
  const stress: Record<string, Record<string, { wouldTrigger: boolean; blockingSignals: string[] }>> = {};

  for (const gp of gProducts) {
    const row = baseResults.find((r) => r.product === gp)!;
    stress[gp] = { baseline: { wouldTrigger: row.wouldTrigger, blockingSignals: [] } } as any;

    for (const cond of conditions) {
      const ablated = { [cond]: false } as AblatedConditions;
      const r = buildRowResults(ablated).find((x) => x.product === gp)!;
      const blocking = Object.entries(row.signals)
        .filter(([k, v]) => v === false && k !== cond)
        .map(([k]) => k);
      stress[gp][cond] = { wouldTrigger: r.wouldTrigger, stillBlockedBy: blocking.filter((k) => !(r.signals as any)[k.replace(/_ge_45$/, "_ge_45")]) } as any;
    }
  }

  // Per-condition: which single removal makes Gorgonzola trigger?
  const singleRemovalTriggers: Record<string, string[]> = {};
  for (const { key } of ABLATION_KEYS) {
    const m = metrics(buildRowResults({ [key]: false }));
    singleRemovalTriggers[key] = m.falsePositiveProducts.filter((p) => p.includes("Gorgonzola"));
  }

  return { gorgonzolaRows: baseResults.filter((r) => r.product.includes("Gorgonzola")), singleRemovalTriggers };
}

// Rolo stress
function roloStress() {
  const baseResults = buildRowResults();
  const roloRows = baseResults.filter((r) => r.product.includes("Rolo"));
  const conditions = [
    "supplier_il_bocconcino",
    "ocr_qty_eq_1",
    "undiscounted_blank_desc",
    "hybrid_h_qty_2_stable",
    "unit_price_approx_total_at_qty1",
    "diff_pct_ge_45",
    "qty_inflation_signature",
    "hybrid_h_qty_eq_2",
  ] as const;

  const perCondition: Record<string, Record<string, boolean>> = {};
  for (const { key } of ABLATION_KEYS) {
    const r = buildRowResults({ [key]: false });
    perCondition[key] = Object.fromEntries(
      roloRows.map((row) => [row.product, r.find((x) => x.product === row.product)!.wouldTrigger]),
    );
  }

  // Which conditions block transient Rolo specifically?
  const transient = roloRows.find((r) => r.product.includes("transient"))!;
  const blockingAtBaseline = Object.entries(transient.signals)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  return { roloRows, perCondition, transientBlockingAtBaseline: blockingAtBaseline };
}

// Minimal rule: what's the smallest subset that gets 2/2 recall with 0 FP on controls+negatives?
function findMinimalSeparators() {
  const allKeys = ABLATION_KEYS.map((k) => k.key);
  const necessary: string[] = [];
  for (const key of allKeys) {
    const m = metrics(buildRowResults({ [key]: false }));
    if (m.falsePositives > 0 || m.falseNegatives > 0) {
      necessary.push(key);
    }
  }
  return necessary;
}

const output = {
  generatedAt: new Date().toISOString(),
  mode: "ADVERSARIAL SENSITIVITY ABLATION",
  baseline: metrics(baseline),
  baselineRows: baseline.map((r) => ({
    product: r.product,
    category: r.category,
    wouldTrigger: r.wouldTrigger,
    outcome: r.outcome,
    diffPct: r.binding.diffPct,
    signals: r.signals,
  })),
  ablations,
  necessaryConditions: findMinimalSeparators(),
  gorgonzolaStress: gorgonzolaStress(),
  roloStress: roloStress(),
};

writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ baseline: output.baseline, necessaryConditions: output.necessaryConditions, ablations: ablations.map(a => ({ condition: a.ablatedCondition, ...a.metrics })) }, null, 2));
