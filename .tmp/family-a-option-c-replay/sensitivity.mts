/**
 * Family A Option C — ablation sensitivity (READ-ONLY)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const base = JSON.parse(readFileSync(join(__dir, "replay-result.json"), "utf8"));

type Row = (typeof base.replayResults)[number];

const CONDITIONS = [
  "ocr_qty_eq_1",
  "hybrid_h_qty_eq_2",
  "hybrid_h_qty_2_stable",
  "undiscounted_blank_desc",
  "unit_price_approx_total_at_qty1",
  "supplier_il_bocconcino",
  "qty_inflation_signature",
  "diff_pct_ge_45",
] as const;

function strictTrigger(s: Record<string, boolean>) {
  const documentedCombo =
    s.ocr_qty_eq_1 &&
    s.hybrid_h_qty_eq_2 &&
    s.hybrid_h_qty_2_stable &&
    s.undiscounted_blank_desc &&
    s.unit_price_approx_total_at_qty1 &&
    s.supplier_il_bocconcino;
  return documentedCombo && s.qty_inflation_signature;
}

function ablatedTrigger(s: Record<string, boolean>, omit: string) {
  const checks: Record<string, boolean> = {
    ocr_qty_eq_1: s.ocr_qty_eq_1,
    hybrid_h_qty_eq_2: s.hybrid_h_qty_eq_2,
    hybrid_h_qty_2_stable: s.hybrid_h_qty_2_stable,
    undiscounted_blank_desc: s.undiscounted_blank_desc,
    unit_price_approx_total_at_qty1: s.unit_price_approx_total_at_qty1,
    supplier_il_bocconcino: s.supplier_il_bocconcino,
    qty_inflation_signature: s.qty_inflation_signature,
    diff_pct_ge_45: s.diff_pct_ge_45,
  };
  delete checks[omit];

  // diff_pct ablation: keep inflation signature but without diff_pct threshold
  if (omit === "diff_pct_ge_45") {
    const inflationWithoutDiff =
      s.hybrid_h_qty_eq_2 &&
      // replay uses qty>1 inside qty_inflation_signature; approximate via hybrid_h_qty_eq_2
      s.qty_inflation_signature || (s as Record<string, boolean>).total_preserved === true;
    // Reconstruct inflation without diff_pct: binding_changed + arithmetic + qty>1
    // Use stored qty_inflation_signature OR infer from binding fields on row
    return (
      (checks.ocr_qty_eq_1 ?? true) &&
      (checks.hybrid_h_qty_eq_2 ?? true) &&
      (checks.hybrid_h_qty_2_stable ?? true) &&
      (checks.undiscounted_blank_desc ?? true) &&
      (checks.unit_price_approx_total_at_qty1 ?? true) &&
      (checks.supplier_il_bocconcino ?? true) &&
      // inflation without diff_pct: use row-level binding if available
      true // placeholder — handled per-row below
    );
  }

  return Object.entries(checks).every(([, v]) => v !== false && v !== undefined);
}

function evaluateRows(omit: string | null) {
  const rows = base.replayResults.filter((r: Row) => !r.error) as Row[];
  return rows.map((r) => {
    const s = r.signals as Record<string, boolean>;
    let trigger: boolean;
    if (omit === null) {
      trigger = strictTrigger(s);
    } else if (omit === "diff_pct_ge_45") {
      // Replace qty_inflation_signature with version without diff_pct gate
      const inflationNoDiff =
        s.hybrid_h_qty_eq_2 &&
        (r.binding?.bindingChanged ?? false) &&
        (r.binding?.arithmeticConsistent ?? false);
      const documentedCombo =
        (omit !== "ocr_qty_eq_1" ? s.ocr_qty_eq_1 : true) &&
        (omit !== "hybrid_h_qty_eq_2" ? s.hybrid_h_qty_eq_2 : true) &&
        (omit !== "hybrid_h_qty_2_stable" ? s.hybrid_h_qty_2_stable : true) &&
        (omit !== "undiscounted_blank_desc" ? s.undiscounted_blank_desc : true) &&
        (omit !== "unit_price_approx_total_at_qty1" ? s.unit_price_approx_total_at_qty1 : true) &&
        (omit !== "supplier_il_bocconcino" ? s.supplier_il_bocconcino : true);
      trigger = documentedCombo && inflationNoDiff;
    } else {
      const parts = {
        ocr_qty_eq_1: omit === "ocr_qty_eq_1" ? true : s.ocr_qty_eq_1,
        hybrid_h_qty_eq_2: omit === "hybrid_h_qty_eq_2" ? true : s.hybrid_h_qty_eq_2,
        hybrid_h_qty_2_stable: omit === "hybrid_h_qty_2_stable" ? true : s.hybrid_h_qty_2_stable,
        undiscounted_blank_desc: omit === "undiscounted_blank_desc" ? true : s.undiscounted_blank_desc,
        unit_price_approx_total_at_qty1:
          omit === "unit_price_approx_total_at_qty1" ? true : s.unit_price_approx_total_at_qty1,
        supplier_il_bocconcino: omit === "supplier_il_bocconcino" ? true : s.supplier_il_bocconcino,
        qty_inflation_signature:
          omit === "qty_inflation_signature" ? true : s.qty_inflation_signature,
      };
      trigger = Object.values(parts).every(Boolean);
    }

    const expected = r.expectedTrigger;
    let outcome = "PASS";
    if (trigger !== expected) {
      outcome = trigger && !expected ? "FALSE_POSITIVE" : "FALSE_NEGATIVE";
    }
    return { product: r.product, category: r.category, trigger, expected, outcome };
  });
}

function metrics(evaluated: ReturnType<typeof evaluateRows>) {
  const failures = evaluated.filter((r) => r.category === "failure");
  const recall = failures.filter((r) => r.trigger).length / failures.length;
  const fp = evaluated.filter((r) => r.outcome === "FALSE_POSITIVE");
  const fn = evaluated.filter((r) => r.outcome === "FALSE_NEGATIVE");
  return {
    recall: `${failures.filter((r) => r.trigger).length}/${failures.length}`,
    recallPct: recall,
    falsePositives: fp.length,
    falseNegatives: fn.length,
    fpProducts: fp.map((r) => r.product),
    fnProducts: fn.map((r) => r.product),
  };
}

const ablations: Record<string, ReturnType<typeof metrics>> = {};
ablations["baseline_strict"] = metrics(evaluateRows(null));
for (const c of CONDITIONS) {
  ablations[`omit_${c}`] = metrics(evaluateRows(c));
}

function stressTarget(productSubstring: string) {
  const out: Record<string, boolean> = {};
  for (const c of ["baseline_strict", ...CONDITIONS.map((x) => `omit_${x}`)]) {
    const omit = c === "baseline_strict" ? null : c.replace("omit_", "");
    const row = evaluateRows(omit).find((r) => r.product.includes(productSubstring));
    out[c] = row?.trigger ?? false;
  }
  return out;
}

const output = {
  generatedAt: new Date().toISOString(),
  ablations,
  gorgonzolaEffectivePaid: stressTarget("effective-paid"),
  roloTransientRun7: stressTarget("transient run 7"),
};

writeFileSync(join(__dir, "sensitivity-result.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
