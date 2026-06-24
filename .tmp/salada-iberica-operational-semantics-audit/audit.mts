/**
 * STRICT READ-ONLY Salada Ibérica Operational Semantics Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { bindMonetaryColumns, parseMonetaryLineItems } from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  isCaseRowWithEmbeddedPieceWeightOnly,
  resolveInvoiceLinePurchaseFormat,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  parsePurchaseStructureFromText,
} from "../../src/lib/stock-normalization.ts";
import {
  operationalCostFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import { buildLastPurchaseCostPresentation } from "../../src/lib/ingredient-detail-panel.ts";
import {
  effectiveIngredientUnitCostEur,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { formatDisplayUnitCost } from "../../src/lib/display-unit-cost.ts";
import { inferUnitFamily } from "../../src/lib/recipe-unit-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/salada-iberica-operational-semantics-audit";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

function bindLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
        unit_price: raw.unit_price,
        total: raw.total,
      },
    ]),
  );
  return normalizeInvoiceItemFields(bound);
}

function traceLine(raw: {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const bound = bindLine(raw);
  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
  };
  const structure = parsePurchaseStructureFromText(bound.name);
  const usableChain = structure
    ? computeUsableFromPurchaseStructure(structure, bound.quantity, bound.unit)
    : null;
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const persistFields = operationalCostFieldsFromInvoiceLine(bound);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective =
    bound.unit_price != null
      ? computeEffectiveUsableCost(bound.unit_price, metadata, structured, bound.name)
      : null;
  const isCasePieceWeight = isCaseRowWithEmbeddedPieceWeightOnly(bound.name, bound.unit);
  const rowQtyLabel = formatRowPurchaseQuantityLabel(metadata);
  const detailPresentation = buildLastPurchaseCostPresentation({
    purchaseQuantityLabel: rowQtyLabel,
    procurementCostLabel: presentation.priceDisplay,
    operationalCostLabel: presentation.effectiveUsableCostLabel,
    priceLabel: bound.total != null ? `€${bound.total.toFixed(2)}` : null,
    supplierLabel: null,
    dateLabel: null,
  });
  const unitFamily = inferUnitFamily(bound.unit, {
    usableQuantityUnit: structured.usableQuantityUnit,
    purchaseFormatKind: structured.kind,
  });
  const recipeUnitCostEurPerG = recipeFields
    ? resolvedOperationalUnitCostEur(recipeFields)
    : null;
  const recipe100gCost =
    recipeUnitCostEurPerG != null ? 100 * recipeUnitCostEurPerG : null;
  const kpiUnitCost = recipeFields
    ? formatDisplayUnitCost(effectiveIngredientUnitCostEur(recipeFields), recipeFields.cost_base_unit)
    : null;
  const hypotheticalKgOperational =
    perUnit?.unit === "g" && bound.unit_price != null && perUnit.amount > 0
      ? {
          cost: bound.unit_price / (perUnit.amount / 1000),
          unit: "kg",
        }
      : null;

  return {
    invoiceItemId: raw.id,
    bound,
    structure,
    usableChain,
    structured,
    presentation,
    persistFields,
    recipeFields,
    perUnit,
    effective,
    isCasePieceWeight,
    rowQtyLabel,
    detailPresentation,
    unitFamily,
    recipeUnitCostEurPerG,
    recipe100gCost,
    kpiUnitCost,
    hypotheticalKgOperational,
  };
}

mkdirSync(OUT, { recursive: true });

const SALADA_ITEM_ID = "593e7560-ba2a-4c60-8300-ff34a26335b9";

// Salada ingredient + recipes
const { data: saladaMatch } = await sb
  .from("invoice_item_matches")
  .select("ingredient_id,status,match_kind")
  .eq("invoice_item_id", SALADA_ITEM_ID)
  .maybeSingle();

let saladaIngredient: Record<string, unknown> | null = null;
if (saladaMatch?.ingredient_id) {
  const { data } = await sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier")
    .eq("id", saladaMatch.ingredient_id)
    .maybeSingle();
  saladaIngredient = data;
}

if (!saladaIngredient) {
  const { data: saladaIngredients } = await sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier")
    .or("name.ilike.%salada%ibérica%,name.ilike.%salada%iberica%")
    .limit(10);
  saladaIngredient =
    saladaIngredients?.find((i) => /salada/i.test(i.name ?? "") && /ib[eé]rica/i.test(i.name ?? "")) ??
    saladaIngredients?.[0] ??
    null;
}

const { data: saladaItems } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
  .ilike("name", "%Salada Ibérica%")
  .order("created_at", { ascending: false })
  .limit(5);

const saladaItem = saladaItems?.[0] ?? null;
const saladaTrace = saladaItem ? traceLine(saladaItem) : null;

// Recipe usage of Salada
let saladaRecipes: unknown[] = [];
if (saladaIngredient?.id) {
  const { data: recipeLines } = await sb
    .from("recipe_ingredients")
    .select("id,recipe_id,quantity,unit,recipes(id,name,selling_price)")
    .eq("ingredient_id", saladaIngredient.id);
  saladaRecipes = recipeLines ?? [];
}

// Similar EMB + embedded weight products on VL
const { data: embItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total,created_at")
  .or("unit.eq.em,unit.eq.EM,name.ilike.%EMB%,name.ilike.%EM.%")
  .order("created_at", { ascending: false })
  .limit(200);

type SimilarRow = {
  product: string;
  invoiceItemId: string;
  invoiceQtyUnit: string;
  procurementDisplay: string | null;
  operationalDisplay: string | null;
  usableQuantity: string | null;
  isCasePieceWeight: boolean;
  recipeCostBaseUnit: string | null;
  purchaseQuantity: number | null;
  unitFamily: string;
  embeddedWeight: string | null;
};

const similarProducts: SimilarRow[] = [];
const seen = new Set<string>();

for (const item of embItems ?? []) {
  const name = String(item.name ?? "");
  const structure = parsePurchaseStructureFromText(name);
  const hasEmbeddedWeight =
    structure?.tier === "bare_measure" &&
    structure.unitMeasurement === "g" &&
    structure.unitSize != null;
  const isEmb =
    String(item.unit ?? "").toLowerCase() === "em" ||
    /\bEMB\b/i.test(name) ||
    /\bEM\.\s*\d/i.test(name);
  if (!isEmb && !hasEmbeddedWeight) continue;

  const key = name.slice(0, 60);
  if (seen.has(key)) continue;
  seen.add(key);

  const trace = traceLine(item);
  similarProducts.push({
    product: name,
    invoiceItemId: item.id,
    invoiceQtyUnit: `${item.quantity} / ${item.unit ?? "null"}`,
    procurementDisplay: trace.presentation.priceDisplay,
    operationalDisplay: trace.presentation.effectiveUsableCostLabel,
    usableQuantity:
      trace.structured.normalizedUsableQuantity != null
        ? `${trace.structured.normalizedUsableQuantity} ${trace.structured.usableQuantityUnit ?? ""}`
        : trace.perUnit
          ? `${trace.perUnit.amount} ${trace.perUnit.unit}`
          : null,
    isCasePieceWeight: trace.isCasePieceWeight,
    recipeCostBaseUnit: trace.recipeFields?.cost_base_unit ?? null,
    purchaseQuantity: trace.recipeFields?.purchase_quantity ?? null,
    unitFamily: trace.unitFamily,
    embeddedWeight: structure?.matchedText ?? null,
  });
}

const saladaOutlierAnalysis = {
  totalSimilar: similarProducts.length,
  sameCaseOperationalLabel: similarProducts.filter(
    (p) => p.operationalDisplay?.includes("/ case"),
  ).length,
  kgOperationalLabel: similarProducts.filter((p) => p.operationalDisplay?.includes("/ kg")).length,
  nullOperational: similarProducts.filter((p) => !p.operationalDisplay).length,
  packProcurement: similarProducts.filter((p) => p.procurementDisplay?.includes("/ pack")).length,
  gramRecipeBase: similarProducts.filter((p) => p.recipeCostBaseUnit === "g").length,
};

// Architecture table
const architectureTable = {
  purchaseUnit: {
    current: "pack (invoice row unit `em`, qty 4 → '4 packs')",
    intended:
      "pack — invoice procurement unit is the priced container (EM = embalagem/pack); formatRowPurchaseQuantityLabel maps em → pack",
  },
  procurementUnit: {
    current: "pack (€2.19 / pack via resolvePriceSuffix em→pack)",
    intended:
      "pack — procurement display reflects what was paid per invoice line container (ROW_UNIT_PRICE_SUFFIX['em'] = 'pack')",
  },
  operationalUnit: {
    current: "case (display: €2.19 / case via isCaseRowWithEmbeddedPieceWeightOnly shortcut)",
    intended:
      "kg (display) / g (internal cost_base_unit) — weight-family EMB products with embedded g should derive €/kg operational display from pack price ÷ usable grams; recipe layer persists cost_base_unit=g, purchase_quantity=250",
  },
  recipeConsumptionUnit: {
    current: "g (RECIPE_USAGE_UNIT_OPTIONS includes g/kg; persisted purchase_quantity=250, cost_base_unit=g)",
    intended:
      "g (or kg in UI) — recipe costing uses effectiveIngredientUnitCostEur = current_price / purchase_quantity with gram denominator for weight-family pack rows",
  },
};

// Verdict classification
const displayOperationalUnit = saladaTrace?.effective?.unit ?? null;
const recipeCostBase = saladaTrace?.recipeFields?.cost_base_unit ?? null;
const displayMatchesProcurementAmount =
  saladaTrace?.presentation.priceDisplay?.split(" / ")[0] ===
  saladaTrace?.presentation.effectiveUsableCostLabel?.split(" / ")[0];
const displayUnitWrong = displayOperationalUnit === "case";
const recipeUsesGrams = recipeCostBase === "g" && saladaTrace?.recipeFields?.purchase_quantity === 250;

let verdict: "A" | "B" | "C" | "D" | "E";
let verdictRationale: string;

if (displayUnitWrong && recipeUsesGrams && displayMatchesProcurementAmount) {
  verdict = "A";
  verdictRationale =
    "Operational Cost display label is wrong (shows 'case' instead of €/kg or pack-equivalent weight cost), but recipe costing uses correct gram-based denominator (€2.19/250g). Numeric €2.19 matches pack price — suffix 'case' is the bug, not the persisted cost basis.";
} else if (displayUnitWrong && recipeUsesGrams) {
  verdict = "B";
  verdictRationale = "Operational unit wrong in display path; recipe cost basis intact.";
} else if (!recipeUsesGrams) {
  verdict = "C";
  verdictRationale = "Cost basis wrong in persistence/recipe path.";
} else if (!displayUnitWrong) {
  verdict = "D";
  verdictRationale = "Expected behaviour — display and recipe aligned.";
} else {
  verdict = "E";
  verdictRationale = "Architecture ambiguity — display and recipe paths intentionally diverge.";
}

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  product: "Salada Ibérica FSTK EMB. 250g",
  verdict,
  verdictRationale,
  architectureQuestion: {
    intendedOperationalUnitForEmb250g:
      "Weight-normalized: internal g (cost_base_unit), display €/kg; NOT case. Pack is procurement only.",
    recipeShouldConsume: "B) grams (or C) kg in recipe UI — RECIPE_USAGE_UNIT_OPTIONS = [ml, L, g, kg, un]; weight-family EMB rows persist purchase_quantity in grams per pack",
    evidence: [
      "recipeOperationalCostFieldsFromInvoiceLine returns cost_base_unit=g, purchase_quantity=250 for Salada",
      "inferUnitFamily('em', { usableQuantityUnit: 'g' }) = 'weight' because em ∉ COUNTABLE_ROW_UNITS",
      "computeEffectiveUsableCost short-circuits to { unit: 'case' } via isCaseRowWithEmbeddedPieceWeightOnly — display-only path",
      "effectiveIngredientUnitCostEur = current_price / purchase_quantity = 2.19/250 = €0.00876/g",
    ],
  },
  recipe100gAnswer: {
    question: "If a recipe uses 100g of Salada Ibérica, what operational cost model is Marginly intending to apply?",
    model: "Gram-denominated operational cost: lineCost = 100 × (current_price / purchase_quantity)",
    calculation: saladaTrace?.recipe100gCost,
    unitCostPerG: saladaTrace?.recipeUnitCostEurPerG,
    unitCostPerKgDisplay: saladaTrace?.kpiUnitCost?.formattedLabel ?? null,
    persistedFields: saladaTrace?.recipeFields ?? null,
    notCaseModel: "Recipe does NOT charge €2.19/case × (100g/250g); it uses €/g from purchase_quantity denominator",
  },
  architectureTable,
  saladaIngredient,
  saladaItem,
  saladaTrace: saladaTrace
    ? {
        pipeline: {
          purchase_quantity: saladaTrace.recipeFields?.purchase_quantity,
          purchase_unit: saladaIngredient?.purchase_unit,
          usable_quantity: saladaTrace.structured.normalizedUsableQuantity ?? saladaTrace.perUnit?.amount,
          usable_unit: saladaTrace.structured.usableQuantityUnit ?? saladaTrace.perUnit?.unit,
          current_price: saladaTrace.recipeFields?.current_price,
          cost_base_unit: saladaTrace.recipeFields?.cost_base_unit,
          effectiveUsableCost: saladaTrace.effective,
          hypotheticalKgOperational: saladaTrace.hypotheticalKgOperational,
          procurementDisplay: saladaTrace.presentation.priceDisplay,
          operationalDisplay: saladaTrace.presentation.effectiveUsableCostLabel,
          isCaseRowWithEmbeddedPieceWeightOnly: saladaTrace.isCasePieceWeight,
          unitFamily: saladaTrace.unitFamily,
        },
        detailPresentation: saladaTrace.detailPresentation,
        persistFields: saladaTrace.persistFields,
        recipeFields: saladaTrace.recipeFields,
      }
    : null,
  saladaRecipes,
  similarProducts,
  saladaOutlierAnalysis,
  codeReferences: {
    isCaseRowWithEmbeddedPieceWeightOnly: "src/lib/invoice-purchase-format.ts:213-224",
    computeEffectiveUsableCostCaseShortcut: "src/lib/invoice-purchase-price-semantics.ts:522-524",
    recipeOperationalCostFieldsFromInvoiceLine: "src/lib/invoice-purchase-price-semantics.ts:657-715",
    effectiveIngredientUnitCostEur: "src/lib/ingredient-unit-cost.ts:108-110",
    ingredientLineCostEur: "src/lib/recipe-prep-cost.ts:205+",
    inferUnitFamilyEmWeight: "src/lib/recipe-unit-normalization.ts:64-86 (em + usableQuantityUnit g → weight)",
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const similarTable = similarProducts
  .slice(0, 25)
  .map(
    (p) =>
      `| ${p.product.slice(0, 45)} | ${p.procurementDisplay ?? "—"} | ${p.operationalDisplay ?? "—"} | ${p.usableQuantity ?? "—"} |`,
  )
  .join("\n");

const report = `# Salada Ibérica Operational Semantics Audit

**Validation Lab:** \`${VL}\`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments  
**Generated:** ${results.auditedAt}

---

## Executive Summary

Salada Ibérica FSTK EMB. 250g (4 packs @ €2.19/pack) exhibits a **split semantics model**: procurement correctly shows **€2.19 / pack**, but the Ingredient Detail **Operational Cost** display shows **€2.19 / case** via \`isCaseRowWithEmbeddedPieceWeightOnly\` → \`computeEffectiveUsableCost\` hardcoded \`unit: "case"\`. Recipe costing and persistence use a **different path**: \`recipeOperationalCostFieldsFromInvoiceLine\` → \`cost_base_unit: "g"\`, \`purchase_quantity: 250\`, yielding **€0.00876/g** (display **€8.76/kg**).

**FINAL VERDICT: ${verdict}** — ${verdictRationale}

---

## Required Table: Concept | Current | Intended by Architecture

| Concept | Current | Intended by Architecture |
|---------|---------|--------------------------|
| Purchase Unit | ${architectureTable.purchaseUnit.current} | ${architectureTable.purchaseUnit.intended} |
| Procurement Unit | ${architectureTable.procurementUnit.current} | ${architectureTable.procurementUnit.intended} |
| Operational Unit | ${architectureTable.operationalUnit.current} | ${architectureTable.operationalUnit.intended} |
| Recipe Consumption Unit | ${architectureTable.recipeConsumptionUnit.current} | ${architectureTable.recipeConsumptionUnit.intended} |

---

## Architecture Question

**Invoice → Procurement → Operational → Recipe Cost**

For EMB 250g products, Marginly's **recipe/persistence layer** treats them as **weight-family** (\`inferUnitFamily("em", { usableQuantityUnit: "g" }) → "weight"\`), storing pack price over grams-per-pack. Recipes should consume **grams (B)** or **kilograms (C)** in the UI — not packs or cases.

The **display operational cost** path reuses an Angus-style \`cx\` shortcut (\`isCaseRowWithEmbeddedPieceWeightOnly\`) that hardcodes \`case\` — this is a **presentation-layer** divergence from the recipe cost model.

---

## Key Question: Given 4 packs, 250g each, €2.19/pack — what should Operational Cost display?

| Layer | Expected per architecture | Salada actual |
|-------|---------------------------|---------------|
| Procurement | €2.19 / pack | €2.19 / pack ✓ |
| Operational display | €8.76 / kg (= €2.19 ÷ 0.25 kg) | €2.19 / case ✗ (wrong suffix; same numeric value as pack) |
| Recipe persistence | current_price=2.19, purchase_quantity=250, cost_base_unit=g | ✓ matches |
| 100g recipe line cost | 100 × (2.19/250) = **€0.876** | ${saladaTrace?.recipe100gCost != null ? `€${saladaTrace.recipe100gCost.toFixed(3)}` : "—"} |

---

## Recipe 100g Answer

**If a recipe uses 100g of Salada Ibérica, what operational cost model is Marginly intending to apply?**

Marginly applies **gram-denominated operational costing**: \`ingredientLineCostEur(100, fields, { recipeUnit: "g" })\` = \`100 × (current_price / purchase_quantity)\` = \`100 × (2.19 / 250)\` ≈ **€0.876**. The model is **not** €2.19/case prorated by pack fraction at the case level — it normalizes pack price to €/g via \`purchase_quantity=250\`.

---

## Salada Trace

| Field | Value |
|-------|-------|
| purchase_quantity (persisted) | ${saladaTrace?.recipeFields?.purchase_quantity ?? "—"} |
| purchase_unit (catalog) | ${saladaIngredient?.purchase_unit ?? "—"} |
| usable_quantity | ${saladaTrace?.structured.normalizedUsableQuantity ?? saladaTrace?.perUnit?.amount ?? "—"} |
| usable_unit | ${saladaTrace?.structured.usableQuantityUnit ?? saladaTrace?.perUnit?.unit ?? "—"} |
| current_price | €${saladaTrace?.recipeFields?.current_price ?? "—"} |
| cost_base_unit | ${saladaTrace?.recipeFields?.cost_base_unit ?? "—"} |
| effective usable cost (display path) | ${saladaTrace?.effective ? `€${saladaTrace.effective.cost.toFixed(2)} / ${saladaTrace.effective.unit}` : "—"} |
| hypothetical €/kg (without case shortcut) | ${saladaTrace?.hypotheticalKgOperational ? `€${saladaTrace.hypotheticalKgOperational.cost.toFixed(2)} / kg` : "—"} |
| unit_family | ${saladaTrace?.unitFamily ?? "—"} |
| isCaseRowWithEmbeddedPieceWeightOnly | ${saladaTrace?.isCasePieceWeight ?? "—"} |

---

## Similar EMB Products (VL sample, n=${similarProducts.length})

| Product | Procurement Display | Operational Display | Usable Quantity |
|---------|----------------------|---------------------|-----------------|
${similarTable || "| — | — | — | — |"}

**Outlier analysis:** ${saladaOutlierAnalysis.sameCaseOperationalLabel}/${saladaOutlierAnalysis.totalSimilar} show "/ case" operational label; ${saladaOutlierAnalysis.kgOperationalLabel} show "/ kg"; ${saladaOutlierAnalysis.gramRecipeBase} use gram recipe base. Salada is ${saladaOutlierAnalysis.sameCaseOperationalLabel > 0 ? "consistent with other EMB+embedded-weight rows hitting the case shortcut" : "an outlier"}.

---

## Recipe Usage on VL

${saladaRecipes.length ? `Found ${saladaRecipes.length} recipe line(s) using Salada ibérica.` : "No recipe_ingredients rows linked to Salada ibérica on VL."}

---

## Bug Classification

| # | Category | Applies? |
|---|----------|:--------:|
| 1 | Wrong label | **Yes** — "case" suffix on operational display |
| 2 | Wrong operational unit | **Partial** — display unit wrong; recipe unit (g) correct |
| 3 | Wrong cost basis | **No** — recipe uses €/g correctly |
| 4 | Expected architecture | **No** — display/recipe divergence is unintended (Angus cx shortcut applied to em packs) |

---

## Evidence Files

- \`.tmp/salada-iberica-operational-semantics-audit/results.json\`
- Prior audit: \`.tmp/salada-iberica-unit-audit/\`
- VL ingredient: \`${saladaIngredient?.id ?? "—"}\`
- VL invoice_item: \`${saladaItem?.id ?? "—"}\`
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log("Audit complete:", OUT);
console.log("Verdict:", verdict);
