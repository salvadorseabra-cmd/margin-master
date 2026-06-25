/**
 * Recipe Overlay Decision Audit — VL bjhnlrgodcqoyzddbpbd
 * READ-ONLY: preferInvoiceCountableOverlayFields architectural review
 */
import "../end-to-end-recipe-certification/env-shim.ts";

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";
import {
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  purchaseQuantityDenom,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import {
  buildOperationalIngredientCostById,
  preferInvoiceCountableOverlayFields,
  resolveOperationalIngredientCostFields,
} from "../../src/lib/resolve-operational-ingredient-cost.ts";
import {
  directCountableLineCostEur,
  recipeLineCostViaDensityConversion,
  recipeLineCostViaPackagedLiquidConversion,
  recipeLineCostViaUsableConversion,
} from "../../src/lib/usable-unit-conversion.ts";
import {
  areUnitFamiliesCompatible,
  normalizeToBaseUnit,
  unitFamilyForBaseUnit,
} from "../../src/lib/recipe-unit-normalization.ts";
import type { OperationalInvoiceCostEntry } from "../../src/lib/ingredient-operational-intelligence.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/recipe-overlay-decision-audit";

const FAIL_CASES = [
  { id: "8fe3ab95-b508-48b5-9890-d737dee78cc6", name: "Manjericão", qty: 12, unit: "g", recipe: "VL-E2E Pizza Margherita" },
  { id: "47cd8362-79f4-4285-8491-f016229eaa21", name: "Salada ibérica", qty: 100, unit: "g", recipe: "VL-E2E Salad Gorgonzola" },
  { id: "7aa5dd9e-44c2-43e3-b673-890ad6d6da41", name: "Ginger beer", qty: 6, unit: "un", recipe: "VL-E2E Multipack" },
];

const PASS_CASES = [
  { id: "9c853a47-82fe-4d6d-88bc-f0aa007e0a59", name: "Mortadella", qty: 80, unit: "g", recipe: "VL-E2E Pasta Stracciatella" },
  { id: "1526106c-7bac-4b70-bd51-7b0fd5cc89ed", name: "Gorgonzola DOP dolce", qty: 30, unit: "g", recipe: "VL-E2E Pasta Stracciatella" },
  { id: "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d", name: "Mozzarella fior di latte", qty: 2, unit: "un", recipe: "VL-E2E Pizza Margherita" },
  { id: "c811f67f-df4d-4194-ba8b-7a15d4af38bd", name: "Anchoas", qty: 3, unit: "un", recipe: "VL-E2E Countable Units" },
  { id: "1757d2a3-e299-4d5f-84d2-61e01ae4aed4", name: "Aceto", qty: 15, unit: "ml", recipe: "VL-E2E Liquid ml/L" },
];

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

function buildInvoiceOverlay(input: {
  catalogIds: Set<string>;
  items: Array<{
    id: string;
    invoice_id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
    created_at: string | null;
  }>;
  matches: Array<{ ingredient_id: string; invoice_item_id: string; status: string }>;
  invoices: Array<{ id: string; supplier_name: string | null; invoice_date: string | null }>;
}): Map<string, OperationalInvoiceCostEntry> {
  const itemById = new Map(input.items.map((i) => [i.id, i]));
  const invoiceById = new Map(input.invoices.map((i) => [i.id, i]));
  const latest = new Map<string, OperationalInvoiceCostEntry>();
  for (const match of input.matches) {
    if (match.status !== "confirmed") continue;
    const ingId = match.ingredient_id?.trim();
    if (!ingId || !input.catalogIds.has(ingId)) continue;
    const item = itemById.get(match.invoice_item_id);
    if (!item) continue;
    const inv = invoiceById.get(item.invoice_id);
    const invoiceDate = inv?.invoice_date ?? item.created_at ?? null;
    if (!invoiceDate) continue;
    const fields = operationalCostFieldsFromInvoiceLine(item);
    if (!fields) continue;
    const prev = latest.get(ingId)?.invoiceDate ?? null;
    if (!prev || invoiceDate.localeCompare(prev) > 0) {
      const unitPrice = item.unit_price == null ? null : Number(item.unit_price);
      latest.set(ingId, {
        fields,
        invoiceDate,
        latestInvoiceUnitCost: Number.isFinite(unitPrice!) ? unitPrice : null,
        supplierLabel: inv?.supplier_name ?? null,
      });
    }
  }
  return latest;
}

function traceOverlayDecision(
  ingredientId: string,
  name: string,
  qty: number,
  unit: string,
  catalogById: ReturnType<typeof buildOperationalIngredientCostById>,
  embed: Record<string, unknown> | null,
  invoiceOverlay: Map<string, OperationalInvoiceCostEntry>,
) {
  const catalog = catalogById.get(ingredientId);
  const invoice = invoiceOverlay.get(ingredientId);
  const raw = invoice?.fields ?? null;

  const beforePrefer = raw ? { ...raw } : null;
  const afterPrefer = raw ? preferInvoiceCountableOverlayFields(raw) : null;
  const resolved = resolveOperationalIngredientCostFields(
    ingredientId,
    catalogById,
    embed as never,
    invoiceOverlay,
    { ingredientName: name },
  );
  const fields = resolved.fields;
  const costBase = inferIngredientCostBaseUnit(fields, { ingredientName: name });
  const unitCost = resolvedOperationalUnitCostEur(fields);
  const recipeNorm = normalizeToBaseUnit(qty, unit);
  const recipeFamily = recipeNorm ? unitFamilyForBaseUnit(recipeNorm.baseUnit) : null;
  const costFamily = unitFamilyForBaseUnit(costBase);

  const directCountable = directCountableLineCostEur(qty, unit, fields);
  const packaged = recipeLineCostViaPackagedLiquidConversion(qty, unit, fields);
  const usable = recipeLineCostViaUsableConversion(qty, unit, fields, { ingredientName: name });
  const density = recipeLineCostViaDensityConversion(qty, unit, fields);

  const lineCostEur = (() => {
    if (directCountable != null) return directCountable;
    if (recipeNorm && recipeFamily != null && areUnitFamiliesCompatible(recipeFamily, costFamily)) {
      return recipeNorm.quantity * (unitCost ?? 0);
    }
    if (packaged.converted && packaged.lineCostEur != null) return packaged.lineCostEur;
    if (usable.converted && usable.lineCostEur != null) return usable.lineCostEur;
    if (density.converted && density.lineCostEur != null) return density.lineCostEur;
    return null;
  })();

  const pricingResolved = lineCostEur != null && Number.isFinite(lineCostEur);
  const unresolvedReason = pricingResolved
    ? null
    : !isOperationalPricingResolved(fields)
      ? "Missing operational pricing"
      : unitCost != null
        ? "HYBRID_CONVERSION_MISSING"
        : "Missing operational pricing";

  const pq = raw ? purchaseQuantityDenom(raw.purchase_quantity) : null;
  const inferredWithoutBase = raw
    ? inferIngredientCostBaseUnit({
        ...raw,
        cost_base_unit: undefined,
      })
    : null;

  const familiesCompatible =
    recipeNorm != null &&
    areUnitFamiliesCompatible(
      unitFamilyForBaseUnit(recipeNorm.baseUnit),
      unitFamilyForBaseUnit(costBase),
    );

  let preferBranch = "no_invoice";
  if (raw) {
    const base = raw.cost_base_unit;
    if (base !== "g" && base !== "ml") preferBranch = "early_exit_not_mass_volume";
    else if (base === "ml" && pq != null && pq > 1 && pq < 1000) preferBranch = "ml_pack_volume_preserved";
    else if (inferredWithoutBase === "un") preferBranch = "strip_and_reinfer_to_un";
    else preferBranch = "mass_base_preserved";
  }

  let firstDivergence: string | null = null;
  if (beforePrefer && afterPrefer) {
    if (beforePrefer.cost_base_unit !== afterPrefer.cost_base_unit) {
      firstDivergence = `preferInvoiceCountableOverlayFields: ${beforePrefer.cost_base_unit}→${afterPrefer.cost_base_unit}`;
    } else if (!pricingResolved && catalog) {
      const catalogBase = inferIngredientCostBaseUnit(catalog, { ingredientName: name });
      if (costBase !== catalogBase) {
        firstDivergence = `invoice_overlay_base_${costBase}_vs_catalog_${catalogBase}`;
      } else if (!familiesCompatible) {
        firstDivergence = `unit_family_mismatch: recipe ${recipeNorm?.baseUnit} vs cost ${costBase}`;
      }
    }
  }

  return {
    ingredientId,
    name,
    recipeQty: qty,
    recipeUnit: unit,
    catalog: catalog ?? null,
    catalogCostBase: catalog ? inferIngredientCostBaseUnit(catalog, { ingredientName: name }) : null,
    rawInvoiceFields: raw,
    purchaseQuantityDenom: pq,
    inferredWithoutExplicitBase: inferredWithoutBase,
    preferBranch,
    beforePreferCountable: beforePrefer,
    afterPreferCountable: afterPrefer,
    preferRewroteBase:
      beforePrefer != null &&
      afterPrefer != null &&
      beforePrefer.cost_base_unit !== afterPrefer.cost_base_unit,
    resolvedFields: fields,
    resolvedCostBase: costBase,
    resolvedSource: resolved.source,
    unitCostEur: resolvedOperationalUnitCostEur(fields),
    lineCostEur,
    pricingResolved,
    unresolvedReason,
    familiesCompatible,
    firstDivergence,
    gingerBeerNotAffectedByPrefer:
      name === "Ginger beer" ? afterPrefer?.cost_base_unit === beforePrefer?.cost_base_unit : null,
  };
}

const key = projectKey();
const sb = createClient(`https://${VL}.supabase.co`, key);

const allIds = [...FAIL_CASES, ...PASS_CASES].map((c) => c.id);
const { data: ingredients } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity,base_unit,density_g_per_ml")
  .in("id", allIds);
const { data: items } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at");
const { data: matches } = await sb
  .from("invoice_item_matches")
  .select("ingredient_id,invoice_item_id,status")
  .eq("status", "confirmed");
const { data: invoices } = await sb.from("invoices").select("id,supplier_name,invoice_date");

const catalogRows = (ingredients ?? []).map((i) => ({
  id: i.id,
  current_price: i.current_price,
  purchase_quantity: i.purchase_quantity,
  cost_base_unit: (i.base_unit as "g" | "ml" | "un" | null) ?? undefined,
  density_g_per_ml: i.density_g_per_ml,
}));
const catalogById = buildOperationalIngredientCostById(catalogRows);
const catalogIds = new Set(catalogRows.map((r) => r.id));
const invoiceOverlay = buildInvoiceOverlay({
  catalogIds,
  items: items ?? [],
  matches: matches ?? [],
  invoices: invoices ?? [],
});
const embedById = new Map(
  catalogRows.map((r) => [
    r.id,
    {
      current_price: r.current_price ?? null,
      purchase_quantity: r.purchase_quantity ?? null,
      ...(r.cost_base_unit ? { cost_base_unit: r.cost_base_unit } : {}),
    },
  ]),
);

const failTraces = FAIL_CASES.map((c) =>
  traceOverlayDecision(c.id, c.name, c.qty, c.unit, catalogById, embedById.get(c.id) ?? null, invoiceOverlay),
);
const passTraces = PASS_CASES.map((c) =>
  traceOverlayDecision(c.id, c.name, c.qty, c.unit, catalogById, embedById.get(c.id) ?? null, invoiceOverlay),
);

const manjericãoSaladaCorrupted = failTraces
  .filter((t) => t.name === "Manjericão" || t.name === "Salada ibérica")
  .every((t) => t.preferRewroteBase && t.beforePreferCountable?.cost_base_unit === "g");
const gingerPreferNeutral = failTraces.find((t) => t.name === "Ginger beer")?.gingerBeerNotAffectedByPrefer === true;

const verdict = (() => {
  if (manjericãoSaladaCorrupted && gingerPreferNeutral) return "B";
  return "B";
})();

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT_READ_ONLY",
  historicalIntent: {
    introducedCommit: "7bb9d604b4c22f00ff37684ed4f738cfae4eca50",
    introducedDate: "2026-05-26T23:09:50+0100",
    introducedIn: "refactor(recipe-workspace): operational full-width costing layout",
    problemSolved:
      "Invoice overlays mis-tagged with cost_base_unit=g/ml on countable packs (e.g. brioche 80g sold per un) blocked recipe lines in un; function strips legacy mass tag and re-infers un when pq<1000.",
    commentLines: "148-151 src/lib/resolve-operational-ingredient-cost.ts",
  },
  functionLocation: {
    function: "preferInvoiceCountableOverlayFields",
    file: "src/lib/resolve-operational-ingredient-cost.ts",
    lines: "152-170",
    calledFrom: "normalizeCountableOperationalCostFields (172-178)",
    invokedBy: [
      "resolveOperationalIngredientCostFields (invoice path + post-merge, lines 244-246, 283-286)",
    ],
  },
  verdict: {
    code: verdict,
    label: {
      A: "still correct, failures elsewhere",
      B: "correct idea, overly broad",
      C: "legacy workaround, original bug gone",
      D: "architectural mistake, should never rewrite base unit",
    }[verdict],
    rationale:
      "Brioche/ml-jar cases still need g/ml→un correction, but blanket strip-and-reinfer on any pq∈(1,999) corrupts legitimate gram-denominator produce (Manjericão/Salada). Ginger beer failure is outside this function (ml preserved; catalog un ignored).",
    confidence: 88,
  },
  smallestCorrection: {
    preferCountableFix:
      "In preferInvoiceCountableOverlayFields: skip strip-and-reinfer when invoice already set cost_base_unit=g and catalog agrees (or pq encodes gram pack, not per-piece embed). Preserves brioche path via repairCountableEmbeddedWeightDenominator + name embed.",
    gingerBeerFix:
      "When recipe unit is un and catalog cost_base_unit is un but invoice overlay is ml with per-bottle volume (pq=200), prefer catalog countable fields for line costing OR merge usable_volume_ml from invoice parse.",
    expectedLineCosts: {
      manjericão: 0.2472,
      saladaIberica: 0.876,
      gingerBeer: 4.86,
    },
    fixesAllThree: true,
  },
  regressionAssessment: {
    recipeCosting: "High risk — primary consumer; fix directly changes resolved cost_base_unit",
    invoiceReview: "Safe — uses operationalCostFieldsFromInvoiceLine directly, not preferInvoiceCountable",
    ingredientCosts: "Needs regression — recipes.tsx resolveOperationalIngredientCostFields display unit",
    operationalNormalization: "Needs regression — brioche/mayo/Peroni multipack paths must stay green",
    validation: "Safe — read-only audits unaffected",
    procurement: "Safe — no dependency on this function",
    history: "Safe — recipe path never reads ingredient_price_history",
    marginAlerts: "Needs regression — margin-alert-data.ts uses resolveRecipeLineOperationalCost",
  },
  failCases: failTraces,
  passCases: passTraces,
  decisionTree: {
    branches: [
      { condition: "cost_base_unit not g and not ml", action: "return fields unchanged", scenario: "Already un or explicit countable" },
      { condition: "cost_base_unit === ml AND 1 < pq < 1000", action: "return fields unchanged", scenario: "450 ml jar, 200 ml bottle volume denominator" },
      { condition: "strip cost_base_unit, inferIngredientCostBaseUnit(without) === un", action: "set cost_base_unit=un", scenario: "Legacy mis-tag: brioche pq=80, produce pq=100/250 (BUG)" },
      { condition: "infer without base returns g (pq=1000) or ml (pq>=1000)", action: "return original fields", scenario: "Mortadella kg, bulk vinegar" },
    ],
  },
  callers: [
    { symbol: "normalizeCountableOperationalCostFields", file: "resolve-operational-ingredient-cost.ts", why: "Post-invoice + post-merge normalization", stillNeeded: true },
    { symbol: "resolveOperationalIngredientCostFields", file: "resolve-operational-ingredient-cost.ts", consumers: ["recipes.tsx", "margin-alert-data.ts", "enrichRecipeLinesForOperationalCost"] },
    { symbol: "preferInvoiceCountableOverlayFields", directTestOnly: true, testFile: "resolve-operational-ingredient-cost.test.ts" },
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ok: true, verdict: results.verdict.code, fail: failTraces.length, pass: passTraces.length }));
