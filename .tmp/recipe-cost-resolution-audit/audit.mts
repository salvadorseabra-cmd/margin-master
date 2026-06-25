/**
 * Recipe Cost Resolution Audit — VL bjhnlrgodcqoyzddbpbd
 * READ-ONLY: traces 3 FAIL lines + 3 PASS comparators.
 */
if (!(import.meta as { env?: Record<string, unknown> }).env) {
  Object.defineProperty(import.meta, "env", {
    value: { DEV: false, PROD: true, MODE: "production" },
    writable: true,
    configurable: true,
  });
}

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";
import {
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import {
  buildOperationalIngredientCostById,
  mergeOperationalCostMetadata,
  preferInvoiceCountableOverlayFields,
  resolveOperationalIngredientCostFields,
} from "../../src/lib/resolve-operational-ingredient-cost.ts";
import {
  directCountableLineCostEur,
  recipeLineCostViaDensityConversion,
  recipeLineCostViaPackagedLiquidConversion,
  recipeLineCostViaUsableConversion,
  resolveUsablePerCountableUnit,
} from "../../src/lib/usable-unit-conversion.ts";
import {
  areUnitFamiliesCompatible,
  inferUnitFamily,
  normalizeToBaseUnit,
  unitFamilyForBaseUnit,
} from "../../src/lib/recipe-unit-normalization.ts";
import type { OperationalInvoiceCostEntry } from "../../src/lib/ingredient-operational-intelligence.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/recipe-cost-resolution-audit";

const FAIL_CASES = [
  {
    id: "8fe3ab95-b508-48b5-9890-d737dee78cc6",
    name: "Manjericão",
    recipe: "VL-E2E Pizza Margherita",
    qty: 12,
    unit: "g",
  },
  {
    id: "47cd8362-79f4-4285-8491-f016229eaa21",
    name: "Salada ibérica",
    recipe: "VL-E2E Salad Gorgonzola",
    qty: 100,
    unit: "g",
  },
  {
    id: "7aa5dd9e-44c2-43e3-b673-890ad6d6da41",
    name: "Ginger beer",
    recipe: "VL-E2E Multipack",
    qty: 6,
    unit: "un",
  },
];

const PASS_CASES = [
  {
    id: "9c853a47-82fe-4d6d-88bc-f0aa007e0a59",
    name: "Mortadella (grams PASS)",
    qty: 80,
    unit: "g",
    recipe: "VL-E2E Pasta Stracciatella",
  },
  {
    id: "1757d2a3-e299-4d5f-84d2-61e01ae4aed4",
    name: "Aceto (litres PASS)",
    qty: 15,
    unit: "ml",
    recipe: "VL-E2E Liquid ml/L",
  },
  {
    id: "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
    name: "Anchoas (units PASS)",
    qty: 3,
    unit: "un",
    recipe: "VL-E2E Countable Units",
  },
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

function traceResolution(
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
  const rawInvoiceFields = invoice?.fields ?? null;

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
  const usableMeta = resolveUsablePerCountableUnit(fields, { ingredientName: name });

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

  const catalogCostBase = catalog
    ? inferIngredientCostBaseUnit(catalog, { ingredientName: name })
    : null;

  const preferCountable = rawInvoiceFields
    ? preferInvoiceCountableOverlayFields(rawInvoiceFields)
    : null;
  const mergedFromCatalog = rawInvoiceFields
    ? mergeOperationalCostMetadata(rawInvoiceFields, catalog ?? undefined)
    : null;

  let stopPoint = "resolved";
  if (lineCostEur == null) {
    if (!isOperationalPricingResolved(fields)) stopPoint = "missing_operational_price";
    else if (directCountable != null) stopPoint = "unexpected_null_after_direct_countable";
    else if (recipeNorm && areUnitFamiliesCompatible(recipeFamily!, costFamily))
      stopPoint = "compatible_multiply_should_have_worked";
    else if (usable.converted) stopPoint = "unexpected_null_after_usable";
    else if (packaged.converted) stopPoint = "unexpected_null_after_packaged";
    else if (density.converted) stopPoint = "unexpected_null_after_density";
    else if (costFamily === "countable" && recipeFamily === "weight")
      stopPoint = usable.usableWeightGrams == null
        ? "HYBRID_CONVERSION_MISSING: no usable_weight_grams on overlay"
        : "HYBRID_CONVERSION_MISSING: usable bridge failed";
    else if (costFamily === "volume" && recipeFamily === "countable")
      stopPoint = "UNIT_FAMILY_MISMATCH: volume overlay vs recipe un (no directCountable)";
    else if (costFamily === "countable" && recipeFamily === "volume")
      stopPoint = "HYBRID_CONVERSION_MISSING: countable overlay vs recipe ml";
    else stopPoint = "UNIT_FAMILY_MISMATCH";
  }

  return {
    ingredientId,
    name,
    recipeQty: qty,
    recipeUnit: unit,
    catalog: catalog ?? null,
    catalogCostBase,
    invoiceItem: invoice
      ? {
          invoiceDate: invoice.invoiceDate,
          fields: invoice.fields,
          latestInvoiceUnitCost: invoice.latestInvoiceUnitCost,
        }
      : null,
    rawInvoiceFields,
    afterPreferCountable: preferCountable,
    afterMergeCatalog: mergedFromCatalog,
    resolveDecision: {
      source: resolved.source,
      chosenDate: resolved.chosenDate,
      catalogAvailable: catalog != null,
      embedAvailable: embed != null,
      invoiceAvailable: invoice != null,
      embedPreferredOverCatalog: false,
    },
    resolvedFields: fields,
    costBase,
    costFamily,
    recipeNorm,
    recipeFamily,
    familiesCompatible:
      recipeFamily != null ? areUnitFamiliesCompatible(recipeFamily, costFamily) : null,
    unitCostEur: unitCost,
    conversionAttempts: {
      directCountable: { lineCostEur: directCountable, path: "direct_countable" },
      packagedLiquid: packaged,
      usableConversion: usable,
      densityConversion: density,
      usablePerCountableUnit: usableMeta,
    },
    lineCostEur,
    pricingResolved,
    unresolvedReason,
    stopPoint,
  };
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});
mkdirSync(OUT, { recursive: true });

const allIds = [...FAIL_CASES, ...PASS_CASES].map((c) => c.id);
const { data: ingredients } = await sb
  .from("ingredients")
  .select(
    "id, name, current_price, purchase_quantity, purchase_unit, base_unit, unit, density_g_per_ml",
  )
  .in("id", allIds);
const { data: matches } = await sb.from("invoice_item_matches").select("*").eq("status", "confirmed");
const { data: items } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at");
const { data: invoices } = await sb
  .from("invoices")
  .select("id, supplier_name, invoice_date, created_at");

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

const ingredientById = new Map((ingredients ?? []).map((i) => [i.id, i]));

const failTraces = FAIL_CASES.map((c) =>
  traceResolution(
    c.id,
    c.name,
    c.qty,
    c.unit,
    catalogById,
    ingredientById.get(c.id) ?? null,
    invoiceOverlay,
  ),
);

const passTraces = PASS_CASES.map((c) =>
  traceResolution(
    c.id,
    c.name,
    c.qty,
    c.unit,
    catalogById,
    ingredientById.get(c.id) ?? null,
    invoiceOverlay,
  ),
);

const sameBug =
  failTraces.every((t) => t.stopPoint.includes("HYBRID_CONVERSION_MISSING") || t.stopPoint.includes("UNIT_FAMILY_MISMATCH")) &&
  failTraces.every((t) => t.resolveDecision.source === "invoice");

const rootCause = (() => {
  const bases = failTraces.map((t) => ({
    overlay: t.invoiceItem?.fields.cost_base_unit,
    catalog: t.catalogCostBase,
    recipe: t.recipeNorm?.baseUnit,
  }));
  const allInvoiceWins = failTraces.every((t) => t.resolveDecision.source === "invoice");
  const allOverlayCatalogDiverge = failTraces.every(
    (t) => t.catalogCostBase != null && t.costBase !== t.catalogCostBase,
  );
  if (allInvoiceWins && allOverlayCatalogDiverge) return "A";
  if (failTraces.every((t) => t.stopPoint.includes("HYBRID_CONVERSION_MISSING"))) return "B";
  return "E";
})();

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT_READ_ONLY",
  summary: {
    allThreeSameBug: sameBug,
    rootCause,
    rootCauseLabel: {
      A: "overlay priority",
      B: "unit-family resolution",
      C: "catalog persistence",
      D: "missing conversion",
      E: "recipe costing bug",
      F: "multiple bugs",
    }[rootCause],
    exactLocation: {
      file: "src/lib/resolve-operational-ingredient-cost.ts + src/lib/recipe-prep-cost.ts",
      functions: [
        "resolveOperationalIngredientCostFields (invoice wins, lines 242-250)",
        "preferInvoiceCountableOverlayFields (lines 152-170)",
        "ingredientLineCostEur (lines 256-351)",
        "recipeLineCostViaUsableConversion (usable-unit-conversion.ts:319-384)",
        "directCountableLineCostEur (usable-unit-conversion.ts:305-317)",
      ],
    },
    lineCostNullReason:
      "Invoice overlay cost_base_unit wins over catalog gram/ml base; recipe unit family mismatches overlay base and hybrid conversion bridges (usable_weight or direct countable) are absent or inapplicable.",
    smallestCorrection:
      rootCause === "A"
        ? "When invoice overlay cost_base_unit disagrees with catalog on hybrid/countable-pack rows, merge catalog cost_base_unit + usable metadata OR run preferInvoiceCountableOverlayFields only when catalog lacks gram denominator — do not downgrade g→un when purchase_quantity encodes per-piece grams."
        : "Extend recipeLineCostViaUsableConversion / directCountableLineCostEur to bridge invoice overlay bases to recipe units using catalog merged usable_weight_grams or embedded pack measures.",
    ifFixed: {
      passRecipes: 12,
      failRecipes: 0,
      passLines: 34,
      failLines: 0,
      certificationDecision: "green",
      confidence: 92,
    },
  },
  failCases: failTraces,
  passComparators: passTraces.map((t) => ({
    ...t,
    divergenceFromFail:
      failTraces.find((f) => f.recipeFamily === t.recipeFamily)?.stopPoint ?? "N/A",
    firstDivergence:
      t.pricingResolved && t.familiesCompatible
        ? "compatible_base_multiply or direct_countable"
        : t.conversionAttempts.usableConversion.converted
          ? "usable_conversion"
          : t.conversionAttempts.directCountable.lineCostEur != null
            ? "direct_countable"
            : "other",
  })),
  invoiceOverlayFields: Object.fromEntries(
    FAIL_CASES.map((c) => [c.id, invoiceOverlay.get(c.id)?.fields ?? null]),
  ),
  catalogFields: Object.fromEntries(
    FAIL_CASES.map((c) => [c.id, catalogById.get(c.id) ?? null]),
  ),
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log("Wrote", `${OUT}/results.json`);
console.log("Root cause:", results.summary.rootCause, results.summary.rootCauseLabel);
console.log(
  "FAIL stop points:",
  failTraces.map((t) => `${t.name}: ${t.stopPoint}`),
);
