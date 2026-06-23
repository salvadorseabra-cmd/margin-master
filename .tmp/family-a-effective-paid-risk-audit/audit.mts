/**
 * READ-ONLY forensic audit — Family A Option C effective-paid risk surface
 * VL: bjhnlrgodcqoyzddbpbd
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(import.meta.dirname);

mkdirSync(OUT, { recursive: true });

const contract = JSON.parse(
  readFileSync(join(ROOT, "effective-paid-contract-validation-result.json"), "utf8"),
);
const grossRaw = readFileSync(join(ROOT, "gross-net-global-audit-output.json"), "utf8");
const grossMarker = '"generated_at": "2026-06-20T00:28:10';
const grossStart = grossRaw.lastIndexOf("\n{", grossRaw.indexOf(grossMarker));
const grossJson = JSON.parse(grossRaw.slice(grossStart + 1));
const scopeAudit = JSON.parse(
  readFileSync(join(ROOT, "family-a-scope-audit/audit-result.json"), "utf8"),
);
const replayResult = JSON.parse(
  readFileSync(join(ROOT, "family-a-option-c-replay/replay-result.json"), "utf8"),
);
const phase1 = JSON.parse(
  readFileSync(join(ROOT, "phase1-validation-forensics-result.json"), "utf8"),
);

const FAMILY_A_IDS = new Set([
  "bb4bbfac-a59b-4d0b-9844-ba773c1f261e",
  "409850ab-646d-44fa-b20c-c8a4a8570064",
]);

const supplierMap = new Map<string, string>();
for (const row of grossJson.top_20_discrepancies ?? []) {
  supplierMap.set(row.invoice_item_id, row.supplier);
}

const ocrByProduct = new Map<string, number>();
for (const c of scopeAudit.candidates ?? []) {
  if (c.product && c.ocrQty != null) ocrByProduct.set(c.product.toUpperCase(), c.ocrQty);
}
ocrByProduct.set(
  "ARRIGONI FORMAGGI - GORGONZOLA DOP DOLCE LINEA CASTELFRIGO 1/8 - 1,5KG",
  1.35,
);
ocrByProduct.set("MEZZI PACCHERI MANCINI (CX 1KG*6)", 1);
ocrByProduct.set("RICOTTA TREVIGIANA 1,5KG", 1);

function totalPreserved(raw: { qty: number; unit_price: number; total: number }) {
  const implied = raw.qty * raw.unit_price;
  return Math.abs(implied - raw.total) / Math.max(raw.total, 0.01) > 0.02;
}

function unitApproxTotalAtQty1(raw: { unit_price: number; total: number }) {
  return Math.abs(raw.unit_price - raw.total) / Math.max(raw.total, 0.01) <= 0.02;
}

function hasWeightToken(desc: string) {
  return /\d+[,.]?\d*\s*(kg|gr|g|cl|l|lt|ml)|\*|\bcx\b|\d+\s*x\s*\d+/i.test(desc);
}

function hasPackNotation(desc: string) {
  return /\*\s*\d|\*?\d+\s*x\s*\d+|\(CX\s/i.test(desc);
}

function classify(row: Record<string, unknown>): string {
  const id = row.invoice_item_id as string;
  const desc = (row.description as string) ?? "";
  const binding = row.binding as {
    raw: { qty: number; unit_price: number; total: number };
    binding_changed: boolean;
    diff_pct: number;
  };
  const raw = binding.raw;

  if (FAMILY_A_IDS.has(id)) return "A) Confirmed Family A";

  if (/gorgonzola/i.test(desc)) return "C) Gorgonzola-like";

  if (
    binding.raw.qty === 2 &&
    binding.binding_changed &&
    totalPreserved(raw) &&
    binding.diff_pct >= 0.3 &&
    binding.diff_pct < 0.55
  ) {
    return "B) Family A-like";
  }

  const supplier = (row.supplier as string) ?? "";
  if (supplier.includes("Bidfood") && binding.diff_pct >= 0.19 && binding.diff_pct <= 0.21) {
    return "E) Other (Bidfood ~20% line discount pattern)";
  }

  if (raw.qty > 1 && !binding.binding_changed) return "D) Legitimate quantity >1";
  if (raw.qty > 1 && binding.diff_pct < 0.12) return "D) Legitimate quantity >1";

  if (raw.qty === 1 && !binding.binding_changed) return "E) Other";

  return "E) Other";
}

function familyASignals(row: Record<string, unknown>) {
  const binding = row.binding as {
    raw: { qty: number; unit_price: number; total: number };
    bound: { unit_price: number; total: number };
    binding_changed: boolean;
    diff_pct: number;
    arithmetic_consistent: boolean;
  };
  const raw = binding.raw;
  const desc = (row.description as string) ?? "";
  const supplier = (row.supplier as string) ?? "";
  const ocrQty =
    ocrByProduct.get(desc.toUpperCase()) ??
    (FAMILY_A_IDS.has(row.invoice_item_id as string) ? 1 : null);

  const signals: Record<string, boolean | number | null> = {
    ocr_qty_eq_1: ocrQty === 1,
    ocr_qty: ocrQty,
    extracted_qty: raw.qty,
    qty_eq_2: raw.qty === 2,
    stable_qty_2: FAMILY_A_IDS.has(row.invoice_item_id as string),
    blank_desc_undiscounted:
      !/gorgonzola|mozzarella|pomodori/i.test(desc) &&
      (supplier.includes("Bocconcino") || supplier.includes("Bidfood")),
    unit_approx_total_at_qty1: unitApproxTotalAtQty1(raw),
    total_preserved: totalPreserved(raw),
    supplier_bocconcino: /bocconcino/i.test(supplier),
    weight_token: hasWeightToken(desc),
    pack_notation: hasPackNotation(desc),
    binding_changed: binding.binding_changed,
    diff_pct_ge_45: binding.diff_pct >= 0.45,
    diff_pct: binding.diff_pct,
  };

  const weights: Record<string, number> = {
    ocr_qty_eq_1: 15,
    qty_eq_2: 12,
    stable_qty_2: 10,
    unit_approx_total_at_qty1: 10,
    total_preserved: 10,
    supplier_bocconcino: 10,
    binding_changed: 8,
    diff_pct_ge_45: 8,
    weight_token: 5,
    pack_notation: 5,
    blank_desc_undiscounted: 5,
  };

  let score = 0;
  let maxScore = 0;
  for (const [k, w] of Object.entries(weights)) {
    maxScore += w;
    if (signals[k] === true) score += w;
  }
  signals.similarity_score = score;
  signals.similarity_pct = Math.round((score / maxScore) * 1000) / 10;
  return signals;
}

const rows = (contract.flagged_all_15 as Record<string, unknown>[]).map((r) => {
  const id = r.invoice_item_id as string;
  const binding = r.binding as {
    raw: { qty: number; unit_price: number; total: number };
    bound: { qty: number; unit_price: number; total: number };
    binding_changed: boolean;
    diff_pct: number;
    arithmetic_consistent: boolean;
  };
  const raw = binding.raw;
  const desc = r.description as string;
  const supplier = supplierMap.get(id) ?? "unknown";
  const ocrQty = ocrByProduct.get(desc.toUpperCase()) ?? null;

  const riskFlags = {
    binding_changed: binding.binding_changed,
    would_fix: r.would_fix as boolean,
    diff_pct_gt_20: binding.diff_pct > 0.2,
    qty_gt_1_total_preserved: raw.qty > 1 && totalPreserved(raw),
  };
  const inRiskPopulation = Object.values(riskFlags).some(Boolean);

  return {
    invoice_item_id: id,
    description: desc,
    supplier,
    invoice_id: grossJson.top_20_discrepancies?.find(
      (x: { invoice_item_id: string }) => x.invoice_item_id === id,
    )?.invoice_id,
    effective_paid: r.effective_paid,
    binding,
    would_fix: r.would_fix,
    procurement: r.procurement,
    operational: r.operational,
    ocr_qty: ocrQty,
    extracted_qty: raw.qty,
    diff_pct: binding.diff_pct,
    diff_pct_pct: `${(binding.diff_pct * 100).toFixed(2)}%`,
    binding_changed: binding.binding_changed,
    total_preserved: totalPreserved(raw),
    family_a: FAMILY_A_IDS.has(id),
    classification: classify({ ...r, supplier }),
    risk_flags: riskFlags,
    in_risk_population: inRiskPopulation,
    signals: familyASignals({ ...r, supplier }),
  };
});

const riskPopulation = rows.filter((r) => r.in_risk_population);
const nonFamilyA = rows.filter((r) => !r.family_a);
const ranked = [...nonFamilyA].sort(
  (a, b) => (b.signals.similarity_pct as number) - (a.signals.similarity_pct as number),
);

const replayTestedIds = new Set<string>();
const replayTestedProducts = new Set<string>();
for (const r of replayResult.replayResults ?? []) {
  replayTestedProducts.add(r.product);
}
replayTestedIds.add("bb4bbfac-a59b-4d0b-9844-ba773c1f261e");
replayTestedIds.add("409850ab-646d-44fa-b20c-c8a4a8570064");
replayTestedIds.add("33dc7070-a202-4397-bba0-e7865bfb6931");
replayTestedIds.add("1ccf0bd0-12ef-4823-b504-3833df0899c7");

const productToId: Record<string, string> = {
  "Mezzi Paccheri": "bb4bbfac-a59b-4d0b-9844-ba773c1f261e",
  Ricotta: "409850ab-646d-44fa-b20c-c8a4a8570064",
  "Gorgonzola (effective-paid DB row)": "33dc7070-a202-4397-bba0-e7865bfb6931",
  Aceto: "1ccf0bd0-12ef-4823-b504-3833df0899c7",
};

function falsePositiveRisk(row: (typeof rows)[0]): { level: string; reason: string } {
  const s = row.signals;
  const cls = row.classification;
  if (row.family_a) return { level: "N/A", reason: "Target row (Family A)" };

  if (cls.startsWith("C)")) {
    return {
      level: "HIGH",
      reason:
        "qty=2, binding_changed, total preserved, would_fix:true; shares inflation profile; misses strict Option C only via supplier/OCR/discount gates",
    };
  }
  if (cls.startsWith("B)")) {
    return {
      level: "HIGH",
      reason: "Partial Family A signal stack (qty=2, total preserved, binding_changed, ~34-50% diff)",
    };
  }
  if ((s.similarity_pct as number) >= 55 && row.supplier.includes("Bocconcino")) {
    return {
      level: "HIGH",
      reason: "Same supplier/template; high similarity; Rolo transient precedent (run 7)",
    };
  }
  if (row.would_fix && row.binding_changed && (s.diff_pct as number) >= 0.45) {
    return {
      level: "MEDIUM",
      reason: "would_fix + ~50% binding halving if supplier/OCR/stability gates dropped",
    };
  }
  if (row.would_fix && row.supplier.includes("Bidfood")) {
    return {
      level: "MEDIUM",
      reason: "would_fix via binding; ~20% Bidfood discount pattern, not qty inflation",
    };
  }
  if (row.would_fix) {
    return { level: "MEDIUM", reason: "would_fix:true under current effective-paid binding" };
  }
  if (!row.would_fix && row.binding_changed) {
    return { level: "LOW", reason: "binding_changed but would_fix:false (arithmetic gate)" };
  }
  return { level: "LOW", reason: "Minimal Family A signal overlap" };
}

const output = {
  generated_at: new Date().toISOString(),
  vl_project: "bjhnlrgodcqoyzddbpbd",
  methodology: {
    sources: [
      ".tmp/effective-paid-contract-validation-result.json",
      ".tmp/gross-net-global-audit-output.json",
      ".tmp/phase1-validation-forensics-result.json",
      ".tmp/family-a-scope-audit/audit-result.json",
      ".tmp/family-a-option-c-replay/replay-result.json",
    ],
    risk_population_criteria:
      "binding_changed OR would_fix OR diff_pct>20% OR (qty>1 AND total preserved)",
  },
  summary: {
    total_flagged_effective_paid: contract.summary.flagged_rows_total,
    risk_population_count: riskPopulation.length,
    family_a_confirmed: 2,
    would_fix_count: contract.summary.would_fix_via_binding,
    would_not_fix_count: contract.summary.would_not_fix,
    classifications: Object.fromEntries(
      [...new Set(rows.map((r) => r.classification))].map((c) => [
        c,
        rows.filter((r) => r.classification === c).length,
      ]),
    ),
    replay_coverage: {
      effective_paid_population: rows.length,
      rows_with_direct_replay: rows.filter((r) => replayTestedIds.has(r.invoice_item_id)).length,
      coverage_pct: Math.round((4 / rows.length) * 1000) / 10,
      products_in_replay_harness: replayResult.replayResults?.length ?? 0,
      effective_paid_rows_not_in_replay: rows.filter((r) => !replayTestedIds.has(r.invoice_item_id))
        .length,
    },
  },
  risk_population: riskPopulation,
  all_rows: rows,
  similarity_ranking: ranked.map((r, i) => ({
    rank: i + 1,
    invoice_item_id: r.invoice_item_id,
    product: r.description,
    supplier: r.supplier,
    similarity_pct: r.signals.similarity_pct,
    closest_family_a_neighbour:
      i === 0
        ? FAMILY_A_IDS.has("409850ab-646d-44fa-b20c-c8a4a8570064")
          ? "RICOTTA TREVIGIANA 1,5KG"
          : "MEZZI PACCHERI MANCINI"
        : undefined,
    classification: r.classification,
    shared_signals: Object.entries(r.signals)
      .filter(([k, v]) => v === true && !k.startsWith("diff"))
      .map(([k]) => k),
    false_positive_risk: falsePositiveRisk(r),
  })),
  phase1_notes: {
    ricotta_qty1_vs_qty2: phase1.ricotta?.artifacts?.binding_qty1_vs_qty2 != null,
    paccheri_in_additional: phase1.additional?.paccheri != null,
  },
};

for (const r of rows) {
  (r as Record<string, unknown>).false_positive_risk = falsePositiveRisk(r);
}

writeFileSync(join(OUT, "risk-population.json"), JSON.stringify(output, null, 2));

console.log(JSON.stringify(output.summary, null, 2));
