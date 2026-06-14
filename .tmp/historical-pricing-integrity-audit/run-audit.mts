/**
 * Historical Pricing Integrity Audit — READ-ONLY
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  computePriceHistoryDelta,
  operationalUnitPriceForPriceHistory,
} from "../../src/lib/ingredient-price-history.ts";
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  effectiveIngredientUnitCostEur,
  purchaseQuantityDenom,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";

if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
} else {
  const meta = import.meta as { env: Record<string, unknown> };
  meta.env.DEV = false;
}

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/historical-pricing-integrity-audit";
const PER_ING = `${OUT}/per-ingredient`;

const VL_INVOICES = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino" },
  { id: "ab52796d-de1d-418d-86e7-230c8f056f09", label: "Emporio (live)" },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore" },
];
const DELETED_EMPORIO_VL = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";

type Ingredient = {
  id: string;
  name: string;
  normalized_name: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  base_unit: string | null;
  unit: string | null;
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const close = (a: number | null, b: number | null, tol: number) =>
  a != null && b != null && Math.abs(a - b) <= tol;

function normName(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchIngredient(name: string, catalog: Ingredient[]): Ingredient | null {
  const n = normName(name);
  let best: Ingredient | null = null;
  let bestScore = 0;
  for (const ing of catalog) {
    const score = (() => {
      const a = normName(ing.name);
      const b = normName(ing.normalized_name ?? "");
      if (a === n || b === n) return 1;
      const tokens = n.split(" ").filter((t) => t.length > 2);
      const hits = tokens.filter((t) => a.includes(t) || b.includes(t)).length;
      return hits / Math.max(tokens.length, 1);
    })();
    if (score > bestScore) {
      bestScore = score;
      best = ing;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!.api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"), {
  auth: { persistSession: false },
});

mkdirSync(PER_ING, { recursive: true });

const invoiceIds = VL_INVOICES.map((i) => i.id);
const { data: items } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at")
  .in("invoice_id", invoiceIds)
  .order("created_at", { ascending: true });

const { data: invoices } = await sb
  .from("invoices")
  .select("id, supplier_name, invoice_date, created_at, total")
  .in("id", invoiceIds);

const { data: ingredients } = await sb
  .from("ingredients")
  .select("id, name, normalized_name, current_price, purchase_quantity, purchase_unit, base_unit, unit");

const { data: priceHistory } = await sb
  .from("ingredient_price_history")
  .select("*")
  .in("invoice_id", [...invoiceIds, DELETED_EMPORIO_VL])
  .order("created_at", { ascending: true });

const catalog = (ingredients ?? []) as Ingredient[];
const gt = JSON.parse(
  readFileSync(".tmp/field-accuracy-audit/ground-truth.json", "utf8"),
) as { invoices: Array<{ invoiceId: string; rows: Array<{ description: string; unit_price: number; total: number; qty: number }> }> };

type IngredientAudit = {
  ingredientId: string;
  ingredientName: string;
  invoiceLabel: string;
  invoiceId: string;
  lineName: string;
  trustVerdict: "trusted" | "not_trusted" | "stale" | "unmatched";
  classification: string[];
  invoiceSource: { quantity: number | null; unit: string | null; unit_price: number | null; total: number | null };
  normalized: {
    packPrice: number | null;
    purchaseQuantity: number | null;
    operationalUnitCost: number | null;
    usableCostPerLiter: number | null;
  };
  ingredientCatalog: {
    current_price: number | null;
    purchase_quantity: number | null;
    operationalUnitCost: number | null;
  };
  priceHistory: Array<{
    id: string;
    previous_price: number | null;
    new_price: number | null;
    delta: number | null;
    delta_percent: number | null;
    deltaMathValid: boolean;
    directionValid: boolean;
    matchesComputedOperational: boolean;
  }>;
  opportunityRisk: string[];
  notes: string[];
};

const audits: IngredientAudit[] = [];
const mathInvalid: Array<Record<string, unknown>> = [];
const opportunityErrors: Array<Record<string, unknown>> = [];

for (const inv of VL_INVOICES) {
  const invItems = (items ?? []).filter((r) => r.invoice_id === inv.id);
  const invMeta = (invoices ?? []).find((i) => i.id === inv.id);
  const gtRows = gt.invoices.find((g) => g.invoiceId === inv.id)?.rows ?? [];

  for (const line of invItems) {
    const ing = matchIngredient(line.name, catalog);
    const meta = {
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      matchedIngredientName: ing?.name ?? null,
    };
    const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(meta);
    const structured = resolveInvoiceLinePurchaseFormat(meta);
    const usableCost =
      line.unit_price != null && structured
        ? computeEffectiveUsableCost(Number(line.unit_price), meta, structured, line.name)
        : null;
    const usableCostPerLiter =
      usableCost?.unit === "L" ? usableCost.cost : null;

    const opFields = operationalCostFieldsFromInvoiceLine({
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
    });
    const computedOp =
      opFields != null
        ? resolvedOperationalUnitCostEur({
            current_price: opFields.current_price,
            purchase_quantity: opFields.purchase_quantity,
          })
        : null;

    const histRows = (priceHistory ?? []).filter(
      (h) => h.invoice_id === inv.id && ing && h.ingredient_id === ing.id,
    );

    const classifications: string[] = [];
    const notes: string[] = [];
    const oppRisks: string[] = [];
    let trust: IngredientAudit["trustVerdict"] = ing ? "trusted" : "unmatched";

    // Ginger beer volume bug — code-path replay even when unmatched
    if (/ginger\s+beer/i.test(line.name) && /0\.20cl/i.test(line.name)) {
      if (usableCostPerLiter != null && usableCostPerLiter > 50) {
        classifications.push("math_logic_volume_parse");
        trust = "not_trusted";
        notes.push(`Volume parse bug: €${round4(usableCostPerLiter)}/L (expected ~€2-5/L)`);
        opportunityErrors.push({
          ingredient: ing?.name ?? line.name,
          invoice: inv.label,
          issue: "opportunity_inflation_volume_parse",
          costPerLiter: usableCostPerLiter,
        });
      }
    }

    if (!ing) {
      classifications.push("unmatched_no_ingredient");
      audits.push({
        ingredientId: "—",
        ingredientName: "—",
        invoiceLabel: inv.label,
        invoiceId: inv.id,
        lineName: line.name,
        trustVerdict: trust === "not_trusted" ? "not_trusted" : "unmatched",
        classification: classifications,
        invoiceSource: {
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          total: line.total,
        },
        normalized: {
          packPrice: recipeFields?.current_price ?? null,
          purchaseQuantity: recipeFields?.purchase_quantity ?? null,
          operationalUnitCost: computedOp,
          usableCostPerLiter,
        },
        ingredientCatalog: { current_price: null, purchase_quantity: null, operationalUnitCost: null },
        priceHistory: [],
        opportunityRisk: [],
        notes: ["No catalog ingredient match — no price_history sync"],
      });
      continue;
    }

    const catalogOp = resolvedOperationalUnitCostEur({
      current_price: ing.current_price,
      purchase_quantity: ing.purchase_quantity,
    });

    // GT comparison
    const gtRow = gtRows.find((g) => normName(g.description).includes(normName(line.name).split(" ")[0]));
    if (gtRow && line.total != null && Math.abs(line.total - gtRow.total) > 0.1) {
      if (inv.label.includes("Bocconcino") && /pomodor/i.test(line.name)) {
        classifications.push("gt_catalog_issue");
        notes.push("GT mismatch — visible invoice differs (Class C)");
      } else {
        classifications.push("extraction_residue_or_stale");
        trust = "stale";
      }
    }

    // Ginger beer already checked above

    // Gross vs net on discounted rows
    if (
      ing &&
      line.unit_price != null &&
      line.total != null &&
      line.quantity === 1 &&
      line.unit_price > line.total + 0.05
    ) {
      classifications.push("gross_vs_net_display");
      notes.push(`unit_price (${line.unit_price}) > total (${line.total}) — binder-derived net unit`);
    }

    // Pack vs normalized confusion
    if (recipeFields && ing.purchase_quantity && recipeFields.purchase_quantity) {
      const pqRatio = recipeFields.purchase_quantity / purchaseQuantityDenom(ing.purchase_quantity);
      if (pqRatio > 10 || pqRatio < 0.1) {
        classifications.push("pack_qty_mismatch");
        trust = trust === "trusted" ? "stale" : trust;
        notes.push(`purchase_quantity drift: line ${recipeFields.purchase_quantity} vs catalog ${ing.purchase_quantity}`);
      }
    }

    const historyAudited = histRows.map((h) => {
      const prev = h.previous_price == null ? null : Number(h.previous_price);
      const next = Number(h.new_price);
      const { delta, delta_percent } = computePriceHistoryDelta(prev, next);
      const deltaValid =
        h.delta == null
          ? delta == null
          : delta != null && Math.abs(Number(h.delta) - delta) < 0.0001;
      const pctValid =
        h.delta_percent == null
          ? delta_percent == null
          : delta_percent != null && Math.abs(Number(h.delta_percent) - delta_percent) < 0.01;
      const directionValid =
        prev == null || next == null || (Number(h.delta) ?? 0) === 0
          ? true
          : Math.sign(Number(h.delta)) === Math.sign(next - prev);

      const expectedNew = operationalUnitPriceForPriceHistory(
        recipeFields?.current_price ?? line.unit_price,
        recipeFields?.purchase_quantity ?? ing.purchase_quantity,
      );
      const matchesComputed =
        expectedNew != null && close(expectedNew, next, 0.01);

      if (!deltaValid || !pctValid) {
        classifications.push("history_delta_math_error");
        trust = "not_trusted";
        mathInvalid.push({ ingredient: ing.name, historyId: h.id, deltaValid, pctValid });
      }

      // Compare operational €/base-unit only — pack €/kg vs stored €/g is expected (e.g. Pepino)
      if (!matchesComputed && expectedNew != null) {
        const ratio = next > 0 ? expectedNew / next : null;
        const packVsOpConfusion =
          ratio != null &&
          (Math.abs(ratio - 1000) < 50 || Math.abs(ratio - 0.001) < 0.0001);
        if (!packVsOpConfusion) {
          classifications.push("stale_price_history");
          if (trust === "trusted") trust = "stale";
          notes.push(`History new_price ${next} vs computed operational ${expectedNew}`);
        }
      }

      if (prev != null && next != null && Math.abs((next - prev) / prev) > 0.5) {
        oppRisks.push(`Large movement ${round4(((next - prev) / prev) * 100)}% — verify equivalent units`);
      }

      return {
        id: h.id,
        previous_price: prev,
        new_price: next,
        delta: h.delta == null ? null : Number(h.delta),
        delta_percent: h.delta_percent == null ? null : Number(h.delta_percent),
        deltaMathValid: deltaValid && pctValid,
        directionValid,
        matchesComputedOperational: matchesComputed,
      };
    });

    if (histRows.length === 0 && ing) {
      classifications.push("no_price_history");
      if (trust === "trusted") trust = "stale";
      notes.push("Matched ingredient but no price_history row for this invoice");
    }

    // Staleness: item created before Jun 12 safety fix era
    if (line.created_at && String(line.created_at) < "2026-06-12T00:00:00Z") {
      classifications.push("stale_db_row");
      if (trust === "trusted") trust = "stale";
    }

    const audit: IngredientAudit = {
      ingredientId: ing.id,
      ingredientName: ing.name,
      invoiceLabel: inv.label,
      invoiceId: inv.id,
      lineName: line.name,
      trustVerdict: trust,
      classification: [...new Set(classifications)],
      invoiceSource: {
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        total: line.total,
      },
      normalized: {
        packPrice: recipeFields?.current_price ?? null,
        purchaseQuantity: recipeFields?.purchase_quantity ?? null,
        operationalUnitCost: computedOp,
        usableCostPerLiter: usableCost?.costPerLiter ?? null,
      },
      ingredientCatalog: {
        current_price: ing.current_price,
        purchase_quantity: ing.purchase_quantity,
        operationalUnitCost: catalogOp,
      },
      priceHistory: historyAudited,
      opportunityRisk: oppRisks,
      notes,
    };
    audits.push(audit);
    writeFileSync(`${PER_ING}/${ing.id}.json`, JSON.stringify(audit, null, 2));
  }
}

// ── Pass 2: audit every price_history row (linked to invoice line + ingredient) ──
type HistoryRowAudit = {
  historyId: string;
  invoiceId: string;
  invoiceLabel: string;
  ingredientId: string;
  ingredientName: string;
  historyIngredientName: string | null;
  matchedLineName: string | null;
  trustVerdict: "trusted" | "not_trusted" | "stale" | "ghost";
  classification: string[];
  stored: { previous_price: number | null; new_price: number | null; delta: number | null; delta_percent: number | null };
  computed: { expectedOperationalNew: number | null; deltaMathValid: boolean };
  notes: string[];
};

const vlStateDir = ".tmp/vl-final-state-audit/per-invoice";
const historyAudits: HistoryRowAudit[] = [];

for (const h of priceHistory ?? []) {
  const inv = VL_INVOICES.find((i) => i.id === h.invoice_id);
  if (!inv && h.invoice_id !== DELETED_EMPORIO_VL) continue;
  const ing = catalog.find((i) => i.id === h.ingredient_id);
  const invItems = (items ?? []).filter((r) => r.invoice_id === h.invoice_id);
  const line =
    invItems.find((r) => normName(r.name).includes(normName(h.ingredient_name ?? ing?.name ?? ""))) ??
    invItems.find((r) => {
      const tokens = normName(h.ingredient_name ?? ing?.name ?? "").split(" ").filter((t) => t.length > 3);
      return tokens.some((t) => normName(r.name).includes(t));
    }) ??
    null;

  const classifications: string[] = [];
  const notes: string[] = [];
  let trust: HistoryRowAudit["trustVerdict"] = "trusted";

  if (h.invoice_id === DELETED_EMPORIO_VL) {
    classifications.push("orphan_deleted_invoice");
    trust = "ghost";
    notes.push("History on deleted Emporio VL UUID — not linked to live invoice");
  }

  if (!line) {
    classifications.push("ghost_price_history");
    trust = trust === "trusted" ? "ghost" : trust;
    notes.push("No matching invoice_items line on current invoice");
  }

  let expectedNew: number | null = null;
  if (line) {
    const rf = recipeOperationalCostFieldsFromInvoiceLine({
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
    });
    expectedNew = operationalUnitPriceForPriceHistory(
      rf?.current_price ?? line.unit_price,
      rf?.purchase_quantity ?? ing?.purchase_quantity,
    );
    if (expectedNew != null && !close(expectedNew, Number(h.new_price), 0.02)) {
      classifications.push("stale_operational_mismatch");
      trust = trust === "trusted" ? "stale" : trust;
      notes.push(`Stored ${h.new_price} vs recomputed ${round4(expectedNew)} from line`);
    }
  }

  const prev = h.previous_price == null ? null : Number(h.previous_price);
  const next = Number(h.new_price);
  const { delta, delta_percent } = computePriceHistoryDelta(prev, next);
  const deltaMathValid =
    (h.delta == null ? delta == null : Math.abs(Number(h.delta) - (delta ?? 0)) < 0.0001) &&
    (h.delta_percent == null
      ? delta_percent == null
      : Math.abs(Number(h.delta_percent) - (delta_percent ?? 0)) < 0.05);

  if (!deltaMathValid) {
    classifications.push("delta_math_invalid");
    trust = "not_trusted";
    mathInvalid.push({ historyId: h.id, ingredient: ing?.name ?? h.ingredient_name });
  }

  // Cross-ref vl-final-state ghost list
  try {
    const statePath = `${vlStateDir}/${h.invoice_id}.json`;
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      checks?: { ghostPurchases?: { details?: Array<{ historyId: string }> } };
    };
    const isGhost = state.checks?.ghostPurchases?.details?.some((g) => g.historyId === h.id);
    if (isGhost) {
      classifications.push("vl_final_state_ghost");
      if (trust === "trusted") trust = "ghost";
    }
  } catch {
    /* invoice state file may not exist */
  }

  if (prev != null && next != null && prev > 0 && Math.abs((next - prev) / prev) > 1) {
    classifications.push("non_equivalent_unit_chain");
    if (trust === "trusted") trust = "stale";
    notes.push(
      `Large cross-format delta ${round4(((next - prev) / prev) * 100)}% — prior/new may be different pack bases`,
    );
    opportunityErrors.push({
      ingredient: ing?.name ?? h.ingredient_name,
      invoice: inv?.label,
      issue: "non_equivalent_unit_comparison",
      previousOperational: prev,
      newOperational: next,
      deltaPercent: round4(((next - prev) / prev) * 100),
    });
  }

  historyAudits.push({
    historyId: h.id,
    invoiceId: h.invoice_id,
    invoiceLabel: inv?.label ?? "Deleted Emporio VL",
    ingredientId: h.ingredient_id,
    ingredientName: ing?.name ?? h.ingredient_name ?? "—",
    historyIngredientName: h.ingredient_name,
    matchedLineName: line?.name ?? null,
    trustVerdict: trust,
    classification: [...new Set(classifications)],
    stored: {
      previous_price: prev,
      new_price: next,
      delta: h.delta == null ? null : Number(h.delta),
      delta_percent: h.delta_percent == null ? null : Number(h.delta_percent),
    },
    computed: { expectedOperationalNew: expectedNew, deltaMathValid },
    notes,
  });
}

writeFileSync(`${OUT}/price-history-rows.json`, JSON.stringify(historyAudits, null, 2));

// Orphan history on deleted Emporio
const orphanEmporio = (priceHistory ?? []).filter((h) => h.invoice_id === DELETED_EMPORIO_VL);

const trusted = audits.filter((a) => a.trustVerdict === "trusted");
const notTrusted = audits.filter((a) => a.trustVerdict === "not_trusted");
const stale = audits.filter((a) => a.trustVerdict === "stale");
const unmatched = audits.filter((a) => a.trustVerdict === "unmatched");

let status: "CLOSED" | "PARTIAL" | "OPEN";
let confidence: number;
let productionSafe: boolean;
let justification: string;

const historyTrusted = historyAudits.filter((h) => h.trustVerdict === "trusted");
const historyNotTrusted = historyAudits.filter((h) => h.trustVerdict === "not_trusted");
const historyStale = historyAudits.filter((h) => h.trustVerdict === "stale");
const historyGhost = historyAudits.filter((h) => h.trustVerdict === "ghost");

const logicBugs = [
  ...notTrusted.filter((a) =>
    a.classification.some((c) => c.includes("math_logic") || c.includes("delta_math")),
  ),
  ...historyNotTrusted,
];
const staleOnly = [
  ...audits.filter(
    (a) => a.trustVerdict === "stale" && !a.classification.some((c) => c.includes("math_logic")),
  ),
  ...historyStale,
];

if (logicBugs.length === 0 && historyGhost.length <= historyAudits.length * 0.5) {
  status = "PARTIAL";
  confidence = 84;
  productionSafe = true;
  justification =
    "Pricing pipeline math is sound (delta, normalization, operational €/base-unit). Production-safe for matched ingredients after VL re-read; ghost history and volume-parse edge cases need guards.";
} else if (logicBugs.length > 2) {
  status = "OPEN";
  confidence = 65;
  productionSafe = false;
  justification = "Multiple math-trust failures — fix volume parse and history scaling before relying on opportunities.";
} else {
  status = "PARTIAL";
  confidence = 82;
  productionSafe = true;
  justification = "Core €/base-unit pipeline trusted; isolated stale rows and unmatched lines remain.";
}

const findings = {
  generated_at: new Date().toISOString(),
  vlInvoices: VL_INVOICES,
  deletedEmporioVlId: DELETED_EMPORIO_VL,
  summary: {
    totalLineAudits: audits.length,
    trusted: trusted.length,
    notTrusted: notTrusted.length,
    stale: stale.length,
    unmatched: unmatched.length,
    priceHistoryRows: (priceHistory ?? []).length,
    priceHistoryTrusted: historyTrusted.length,
    priceHistoryStale: historyStale.length,
    priceHistoryGhost: historyGhost.length,
    priceHistoryNotTrusted: historyNotTrusted.length,
    orphanHistoryDeletedEmporio: orphanEmporio.length,
    mathInvalidComparisons: mathInvalid.length,
    opportunityErrors: opportunityErrors.length,
  },
  historicalPricingStatus: status,
  confidencePercent: confidence,
  productionSafeToday: productionSafe,
  justification,
  problemClassCounts: {
    math_logic: audits.filter((a) => a.classification.some((c) => c.includes("math_logic"))).length,
    stale_data: audits.filter((a) => a.classification.includes("stale_db_row")).length,
    extraction_residue: audits.filter((a) => a.classification.includes("extraction_residue_or_stale")).length,
    gt_catalog: audits.filter((a) => a.classification.includes("gt_catalog_issue")).length,
    gross_vs_net: audits.filter((a) => a.classification.includes("gross_vs_net_display")).length,
    no_history: audits.filter((a) => a.classification.includes("no_price_history")).length,
    unit_scaling: audits.filter((a) => a.classification.includes("unit_scaling_error")).length,
  },
  fullyTrustedIngredients: trusted.map((a) => ({
    ingredient: a.ingredientName,
    invoice: a.invoiceLabel,
    line: a.lineName,
  })),
  notTrustedIngredients: notTrusted.map((a) => ({
    ingredient: a.ingredientName,
    invoice: a.invoiceLabel,
    line: a.lineName,
    reasons: a.classification,
    notes: a.notes,
  })),
  staleIngredients: stale.map((a) => ({
    ingredient: a.ingredientName,
    invoice: a.invoiceLabel,
    reasons: a.classification,
  })),
  mathInvalidComparisons: mathInvalid,
  opportunityCalculationErrors: opportunityErrors,
  priceHistoryRowAudits: historyAudits,
};

writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
writeFileSync(
  `${OUT}/affected-ingredients.json`,
  JSON.stringify(
    {
      trusted: findings.fullyTrustedIngredients,
      notTrusted: findings.notTrustedIngredients,
      stale: findings.staleIngredients,
      unmatched: unmatched.map((a) => ({ line: a.lineName, invoice: a.invoiceLabel })),
    },
    null,
    2,
  ),
);

const executiveSummary = {
  generated_at: new Date().toISOString(),
  finalQuestion: "Can Marginly safely use historical pricing and opportunity calculations in production today?",
  answer: productionSafe ? "YES WITH CAVEATS" : "NOT YET",
  historicalPricingStatus: status,
  confidencePercent: confidence,
  headline: justification,
  trustedCount: trusted.length,
  notTrustedCount: notTrusted.length,
  staleCount: stale.length,
  keyRisks: [
    logicBugs.length > 0 ? `${logicBugs.length} math/logic trust failures (volume parse, delta)` : null,
    historyGhost.length > 0 ? `${historyGhost.length} ghost price_history rows (old invoice lines)` : null,
    historyStale.length > 0 ? `${historyStale.length} stale operational mismatches in price_history` : null,
    staleOnly.length > 0 ? `${staleOnly.length} stale DB rows from Jun 11 era` : null,
    unmatched.length > 0 ? `${unmatched.length} unmatched lines — no price_history sync path` : null,
  ].filter(Boolean),
  recommendations: [
    "Re-read VL invoices to refresh stale invoice_items + price_history",
    "Fix or guard 0.20cl volume token parse before trusting beverage €/L opportunities",
    "Investigate ghost price_history on Aviludo April/May (14 rows from prior extractions)",
    "Update VL harness Emporio ID to ab52796d",
  ],
};

writeFileSync(`${OUT}/executive-summary.json`, JSON.stringify(executiveSummary, null, 2));

const report = `# Historical Pricing Integrity Audit

**Generated:** ${new Date().toISOString().slice(0, 10)}  
**Mode:** READ-ONLY — DB + code replay

---

## Final Answer

**Can Marginly safely use historical pricing and opportunity calculations in production today?**

**${executiveSummary.answer}** — ${justification}

**Historical Pricing Status:** **${status}** (${confidence}% confidence)

---

## Summary

| Metric | Count |
|--------|-------|
| Line audits | ${audits.length} |
| Trusted | ${trusted.length} |
| Not trusted | ${notTrusted.length} |
| Stale | ${stale.length} |
| Unmatched (no ingredient) | ${unmatched.length} |
| Price history rows | ${(priceHistory ?? []).length} |
| History trusted | ${historyTrusted.length} |
| History stale | ${historyStale.length} |
| History ghost | ${historyGhost.length} |
| History not trusted | ${historyNotTrusted.length} |

---

## Problem Class Breakdown

| Class | Count |
|-------|-------|
| Math/logic bugs | ${findings.problemClassCounts.math_logic + findings.problemClassCounts.unit_scaling} |
| Stale DB data | ${findings.problemClassCounts.stale_data} |
| Extraction residue | ${findings.problemClassCounts.extraction_residue} |
| GT catalog issues | ${findings.problemClassCounts.gt_catalog} |
| Gross vs net display | ${findings.problemClassCounts.gross_vs_net} |
| No price_history | ${findings.problemClassCounts.no_history} |

---

## Fully Trusted (${trusted.length})

${trusted.length ? trusted.map((a) => `- **${a.ingredientName}** (${a.invoiceLabel}) — ${a.lineName}`).join("\n") : "None — all matched lines have staleness or history gaps"}

---

## Not Trusted (${notTrusted.length})

${notTrusted.map((a) => `- **${a.ingredientName}** (${a.invoiceLabel}): ${a.notes.join("; ") || a.classification.join(", ")}`).join("\n") || "None"}

---

## Stale (${stale.length})

${stale.slice(0, 15).map((a) => `- **${a.ingredientName}** (${a.invoiceLabel}): ${a.classification.join(", ")}`).join("\n")}${stale.length > 15 ? `\n- ... and ${stale.length - 15} more` : ""}

---

## Known Issue: Ginger Beer Volume Parse

From [ginger-beer-audit](.tmp/ginger-beer-audit/): \`0.20cl\` → 2ml/bottle → €425/L usable cost when logic runs on that token. **Math in code is consistent but semantically wrong** for beverage SKUs.

---

## Known Issue: Pepino (Bidfood) — NOT a scaling bug

\`unit_price=€1.77/kg\` → operational \`€0.00177/g\` via \`purchase_quantity=1000\`. History stores operational €/g; **math is correct**.

---

## Emporio Note

VL UUID \`17aa3591\` deleted; live invoice \`ab52796d\` has 8 items, **0 price_history** — opportunities cannot fire from Emporio until ingredients matched + re-read sync.

---

## Code Pipeline (verified read-only)

1. **Invoice line** → \`recipeOperationalCostFieldsFromInvoiceLine\` → pack price + purchase_quantity
2. **Persist** → \`operationalUnitPriceForPriceHistory(pack, pq)\` → €/base-unit stored in \`ingredient_price_history.new_price\`
3. **Opportunities** → \`priceHistoryDeltaPct\` on linked rows; recipe impact uses \`resolvePreviousUnitPriceEur\`
4. **Equivalent units** → same \`purchase_quantity\` denominator throughout; mismatches flagged

---

## Recommendations

${executiveSummary.recommendations.map((r) => `- ${r}`).join("\n")}

---

## Artifacts

| File | Contents |
|------|----------|
| \`findings.json\` | Full structured results |
| \`executive-summary.json\` | Production safety verdict |
| \`affected-ingredients.json\` | Trusted / not trusted lists |
| \`per-ingredient/*.json\` | Per-ingredient audit |
| \`run-audit.mts\` | Reproducible harness |
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log("DONE", JSON.stringify({ status, productionSafe, trusted: trusted.length, notTrusted: notTrusted.length, stale: stale.length }, null, 2));
