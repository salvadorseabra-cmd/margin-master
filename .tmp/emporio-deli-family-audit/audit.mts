/**
 * STRICT READ-ONLY Emporio Italia Deli Family Mathematical Audit — VL bjhnlrgodcqoyzddbpbd
 * Extends .tmp/ingredient-procurement-operational-duplication-audit with deeper math.
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
  resolveInvoiceLinePurchaseFormat,
  structuredPurchaseToIngredientFields,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
  resolveUnitsPerPack,
  shouldCollapseInvoiceOperationalDisplay,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  parsePurchaseStructureFromText,
} from "../../src/lib/stock-normalization.ts";
import {
  operationalCostFieldsFromInvoiceLine,
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import { buildLastPurchaseCostPresentation } from "../../src/lib/ingredient-detail-panel.ts";
import { detectConversionHint } from "../../src/lib/ingredient-unit-inference.ts";
import {
  effectiveIngredientUnitCostEur,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { formatDisplayUnitCost } from "../../src/lib/display-unit-cost.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const EMPORIO_INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const OUT = ".tmp/emporio-deli-family-audit";

const TARGET_SPECS = [
  {
    key: "gorgonzola",
    displayName: "Gorgonzola DOP dolce",
    ingredientPattern: "%Gorgonzola%DOP%dolce%",
    invoicePattern: "%Gorgonzola%",
    expectedOperationalEurPerKg: 10.88,
  },
  {
    key: "prosciutto",
    displayName: "Prosciutto cotto scelto",
    ingredientPattern: "%Prosciutto%Cotto%Scelto%",
    invoicePattern: "%Prosciutto%Cotto%Scelto%",
    expectedOperationalEurPerKg: 8.5,
  },
  {
    key: "mortadella",
    displayName: "Mortadella IGP massima con pistacchio",
    ingredientPattern: "%Mortadella%IGP%Massima%Pistacchio%",
    invoicePattern: "%Mortadella%IGP%Massima%Pistacchio%",
    expectedOperationalEurPerKg: 9.99,
  },
  {
    key: "bresaola",
    displayName: "Bresaola punta d'anca oro",
    ingredientPattern: "%Bresaola%Punta%Anca%Oro%",
    invoicePattern: "%Bresaola%Punta%Anca%Oro%",
    expectedOperationalEurPerKg: 27.04,
  },
] as const;

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

function resolvePurchaseCostLabels(metadata: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total?: number | null;
}) {
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  return {
    procurementCostLabel: presentation.priceDisplay,
    operationalCostLabel: presentation.effectiveUsableCostLabel,
    presentation,
  };
}

function traceLine(raw: {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  invoice_id?: string;
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
  const stockPresentation = structured;
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const costLabels = resolvePurchaseCostLabels(metadata);
  const procurement = procurementPackFieldsFromInvoiceLine(metadata, {
    isGenericUnit: defaultIsGenericUnit,
  });
  const persistFields = operationalCostFieldsFromInvoiceLine(bound);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective =
    bound.unit_price != null
      ? computeEffectiveUsableCost(bound.unit_price, metadata, structured, bound.name)
      : null;
  const rowQtyLabel = formatRowPurchaseQuantityLabel(metadata);
  const unitsPerPack = resolveUnitsPerPack(structured);
  const conversionHint = detectConversionHint(bound.name);
  const inferredFields = structured.inferred
    ? structuredPurchaseToIngredientFields(structured, bound.unit, defaultIsGenericUnit)
    : null;

  const collapseOperational = shouldCollapseInvoiceOperationalDisplay({
    metadata,
    stock: stockPresentation,
    unitPrice: bound.unit_price,
    priceSuffix: presentation.priceDisplay?.split("/").pop()?.trim() ?? null,
    effective,
    usableStockLabel: presentation.usableStockLabel,
  });

  const detailPresentation = buildLastPurchaseCostPresentation({
    purchaseQuantityLabel: rowQtyLabel,
    procurementCostLabel: presentation.priceDisplay,
    operationalCostLabel: presentation.effectiveUsableCostLabel,
    priceLabel: bound.total != null ? `€${bound.total.toFixed(2)}` : null,
    supplierLabel: null,
    dateLabel: null,
  });

  const unitCostEurPerG = recipeFields ? resolvedOperationalUnitCostEur(recipeFields) : null;
  const lineCost = (grams: number) =>
    unitCostEurPerG != null ? unitCostEurPerG * grams : null;
  const recipeCosting = recipeFields
    ? {
        purchase_quantity: recipeFields.purchase_quantity,
        cost_base_unit: recipeFields.cost_base_unit,
        current_price: recipeFields.current_price,
        unitCostEurPerBase: unitCostEurPerG,
        cost100g: lineCost(100),
        cost250g: lineCost(250),
        cost1kg: lineCost(1000),
        displayDenominator: `${recipeFields.purchase_quantity}${recipeFields.cost_base_unit}`,
        kpiLabel: formatDisplayUnitCost(
          effectiveIngredientUnitCostEur(recipeFields),
          recipeFields.cost_base_unit,
        ).formattedLabel,
        operationalDisplayEurPerKg:
          recipeFields.cost_base_unit === "g"
            ? (unitCostEurPerG ?? 0) * 1000
            : null,
      }
    : null;

  const procurementUnit = procurement?.purchase_unit ?? bound.unit;
  const procurementCostNumeric = bound.unit_price;
  const operationalCostNumeric = effective?.cost ?? null;
  const operationalUnit = effective?.unit ?? null;

  const gorgonzolaMath =
    bound.unit?.toLowerCase() === "kg" && perUnit?.unit === "g"
      ? {
          line_total: bound.total,
          unit_price: bound.unit_price,
          extractedQty: bound.quantity,
          extractedUnit: bound.unit,
          purchase_structure_kind: structured.kind,
          usable_quantity_from_structure: usableChain?.usableQuantity ?? null,
          usable_unit: usableChain?.usableUnit ?? null,
          purchase_quantity_recipe: recipeFields?.purchase_quantity ?? null,
          current_price: recipeFields?.current_price ?? null,
          operational_denominator_g: perUnit.amount,
          operational_denominator_kg: perUnit.amount / 1000,
          formula_effective:
            "unit_price / (operational_denominator_g / 1000) = effective.cost €/kg",
          computed_effective_eur_per_kg:
            bound.unit_price != null
              ? bound.unit_price / (perUnit.amount / 1000)
              : null,
          line_total_div_operational_denominator_g:
            bound.total != null ? bound.total / perUnit.amount : null,
          line_total_div_purchased_g:
            bound.total != null && bound.quantity != null
              ? bound.total / (bound.quantity * 1000)
              : null,
          line_total_div_qty_kg:
            bound.total != null && bound.quantity != null
              ? bound.total / bound.quantity
              : null,
          recipe_eur_per_kg:
            recipeFields != null
              ? (recipeFields.current_price / recipeFields.purchase_quantity) * 1000
              : null,
          reconciles_to_expected_eur_per_kg:
            recipeFields != null
              ? Math.abs(
                  (recipeFields.current_price / recipeFields.purchase_quantity) * 1000 -
                    (bound.unit_price ?? 0),
                ) < 0.01
              : false,
        }
      : null;

  return {
    invoiceItemId: raw.id,
    invoiceId: raw.invoice_id ?? null,
    bound,
    structure,
    usableChain,
    structured,
    presentation,
    costLabels,
    procurement,
    persistFields,
    recipeFields,
    perUnit,
    effective,
    rowQtyLabel,
    unitsPerPack,
    conversionHint,
    inferredFields,
    collapseOperational,
    detailPresentation,
    recipeCosting,
    procurementUnit,
    procurementCostNumeric,
    operationalCostNumeric,
    operationalUnit,
    gorgonzolaMath,
    procurementDenominator: procurement?.purchase_quantity ?? structured.normalizedUsableQuantity,
    procurementUnitLabel: procurement?.cost_base_unit ?? structured.usableQuantityUnit ?? bound.unit,
  };
}

function costsEquivalent(a: number | null, b: number | null, tolerance = 0.005): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) < tolerance;
}

function labelsEquivalent(proc: string | null, op: string | null): boolean {
  if (!proc || !op) return false;
  return proc.trim() === op.trim();
}

function procurementEqualsOperational(trace: ReturnType<typeof traceLine>): {
  sameUnit: boolean;
  sameCost: boolean;
  same: boolean;
  transformation: string | null;
  formula: string;
} {
  const unitPrice = trace.bound.unit_price;
  const effective = trace.effective;
  const sameCost =
    unitPrice != null &&
    effective != null &&
    costsEquivalent(unitPrice, effective.cost) &&
    trace.bound.unit?.toLowerCase() === effective.unit?.toLowerCase();
  const procLabel = trace.presentation.priceDisplay ?? "";
  const opLabel = trace.presentation.effectiveUsableCostLabel ?? "";
  const sameLabel = labelsEquivalent(procLabel, opLabel);
  const same = sameCost && sameLabel;
  const transformation = same
    ? null
    : `procurement ${procLabel} → operational ${opLabel}`;
  const formula = same
    ? `unit_price (${unitPrice}) / (usable_per_unit ${trace.perUnit?.amount}${trace.perUnit?.unit}) = effective.cost (${effective?.cost?.toFixed(4)}) ${effective?.unit}`
    : `unit_price=${unitPrice}, effective=${effective?.cost} ${effective?.unit}; procurement="${procLabel}", operational="${opLabel}"`;
  return {
    sameUnit: sameLabel,
    sameCost: sameCost,
    same,
    transformation,
    formula,
  };
}

function presentationAddsInformation(trace: ReturnType<typeof traceLine>): boolean {
  const proc = trace.costLabels.procurementCostLabel;
  const op = trace.costLabels.operationalCostLabel;
  if (!proc || !op) return false;
  return proc.trim() !== op.trim();
}

async function findIngredient(pattern: string) {
  const { data } = await sb
    .from("ingredients")
    .select(
      "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier",
    )
    .ilike("name", pattern)
    .limit(20);
  return data?.[0] ?? null;
}

async function findLatestMatchedItem(ingredientId: string, invoicePattern: string) {
  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select(
      "invoice_item_id,status,match_kind,invoice_items(id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(id,supplier_name,invoice_date,created_at))",
    )
    .eq("ingredient_id", ingredientId)
    .order("created_at", { ascending: false })
    .limit(20);

  const matched = matches?.filter((m) => {
    const item = m.invoice_items as { name?: string } | null;
    return item?.name;
  });

  if (matched?.length) {
    const item = matched[0]!.invoice_items as {
      id: string;
      invoice_id: string;
      name: string;
      quantity: number | null;
      unit: string | null;
      unit_price: number | null;
      total: number | null;
    };
    return { item, match: matched[0] };
  }

  const { data: items } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
    .ilike("name", invoicePattern)
    .order("created_at", { ascending: false })
    .limit(1);
  return { item: items?.[0] ?? null, match: null };
}

mkdirSync(OUT, { recursive: true });

// Emporio invoice lines (19 May)
const { data: emporioInvoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,created_at")
  .eq("id", EMPORIO_INVOICE_ID)
  .maybeSingle();

const { data: emporioItems } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
  .eq("invoice_id", EMPORIO_INVOICE_ID)
  .order("created_at", { ascending: true });

const results: Record<string, unknown> = {
  validationLab: VL,
  emporioInvoiceId: EMPORIO_INVOICE_ID,
  emporioInvoice,
  generatedAt: new Date().toISOString(),
  priorAudit: ".tmp/ingredient-procurement-operational-duplication-audit",
  codePaths: {
    invoiceBinding: "bindMonetaryColumns → normalizeInvoiceItemFields",
    purchaseFormat: "resolveInvoiceLinePurchaseFormat",
    stockNormalization: "parsePurchaseStructureFromText → computeUsableFromPurchaseStructure",
    procurement: "procurementPackFieldsFromInvoiceLine",
    operational: "operationalCostFieldsFromInvoiceLine",
    recipeCosting: "recipeOperationalCostFieldsFromInvoiceLine → ingredientLineCostEur",
    presentation: "resolveInvoiceLinePricingPresentation → buildLastPurchaseCostPresentation",
    purchaseMemory: "resolvePurchaseCostLabels (ingredient-purchase-memory.ts)",
  },
  targets: [] as unknown[],
  equalityTable: [] as unknown[],
  requiredTable: [] as unknown[],
  gorgonzolaDeepAudit: null as unknown,
  blastRadius: null as unknown,
  verdict: null as unknown,
};

for (const spec of TARGET_SPECS) {
  const ingredient = await findIngredient(spec.ingredientPattern);
  const { item, match } = ingredient
    ? await findLatestMatchedItem(ingredient.id, spec.invoicePattern)
    : { item: null, match: null };

  const emporioLine = emporioItems?.find((i) =>
    i.name?.toLowerCase().includes(spec.key === "gorgonzola" ? "gorgonzola" : spec.key),
  );

  const traceItem = item ?? emporioLine;
  const trace = traceItem ? traceLine({ ...traceItem, id: traceItem.id }) : null;
  const comparison = trace
    ? procurementEqualsOperational(trace)
    : {
        sameUnit: false,
        sameCost: false,
        same: false,
        transformation: "no data",
        formula: "no data",
      };

  let recipeLines: unknown[] = [];
  if (ingredient) {
    const { data: lines } = await sb
      .from("recipe_ingredients")
      .select("id,quantity,unit,recipes(name)")
      .eq("ingredient_id", ingredient.id)
      .limit(10);
    recipeLines = lines ?? [];
  }

  const entry = {
    key: spec.key,
    displayName: spec.displayName,
    ingredient: ingredient ?? null,
    latestInvoiceItem: item ?? null,
    emporioInvoiceLine: emporioLine ?? null,
    match: match ?? null,
    fullTrace: trace
      ? {
          stage1_invoiceItem: {
            id: trace.invoiceItemId,
            name: trace.bound.name,
            quantity: trace.bound.quantity,
            unit: trace.bound.unit,
            unit_price: trace.bound.unit_price,
            line_total: trace.bound.total,
          },
          stage2_bound: trace.bound,
          stage3_purchaseStructure: trace.structure,
          stage4_stockNormalization: trace.usableChain,
          stage5_structuredPurchase: {
            kind: trace.structured.kind,
            purchaseContainerCount: trace.structured.purchaseContainerCount,
            purchaseContainerUnit: trace.structured.purchaseContainerUnit,
            packageQuantity: trace.structured.packageQuantity,
            packageMeasurementUnit: trace.structured.packageMeasurementUnit,
            normalizedUsableQuantity: trace.structured.normalizedUsableQuantity,
            usableQuantityUnit: trace.structured.usableQuantityUnit,
            inferred: trace.structured.inferred,
          },
          stage6_procurement: trace.procurement,
          stage7_operationalPersist: trace.persistFields,
          stage8_recipeFields: trace.recipeFields,
          stage9_presentation: {
            priceDisplay: trace.presentation.priceDisplay,
            effectiveUsableCostLabel: trace.presentation.effectiveUsableCostLabel,
            usableStockLabel: trace.presentation.usableStockLabel,
            card: trace.presentation.card,
            collapseOperational: trace.collapseOperational,
          },
          stage10_detailPresentation: trace.detailPresentation,
          stage11_recipeCosting: trace.recipeCosting,
          perUnit: trace.perUnit,
          effective: trace.effective,
          conversionHint: trace.conversionHint,
        }
      : null,
    equality: comparison,
    recipeCosting: trace?.recipeCosting ?? null,
    presentation: trace
      ? {
          resolvePurchaseCostLabels: trace.costLabels,
          buildLastPurchaseCostPresentation: trace.detailPresentation,
          effectiveUsableCostLabel: trace.presentation.effectiveUsableCostLabel,
          addsInformation: presentationAddsInformation(trace),
        }
      : null,
    catalogPersisted: ingredient
      ? {
          current_price: ingredient.current_price,
          purchase_quantity: ingredient.purchase_quantity,
          purchase_unit: ingredient.purchase_unit,
          base_unit: ingredient.base_unit,
          unit: ingredient.unit,
          matchesRecipeFields:
            trace?.recipeFields != null
              ? ingredient.current_price === trace.recipeFields.current_price &&
                ingredient.purchase_quantity === trace.recipeFields.purchase_quantity &&
                ingredient.base_unit === trace.recipeFields.cost_base_unit
              : null,
        }
      : null,
    recipeLines,
  };

  (results.targets as unknown[]).push(entry);

  (results.equalityTable as unknown[]).push({
    product: spec.displayName,
    procurement_unit: trace?.presentation.priceDisplay?.split("/").pop()?.trim() ?? "—",
    operational_unit: trace?.presentation.effectiveUsableCostLabel?.split("/").pop()?.trim() ?? "—",
    procurement_unit_eq_operational_unit: comparison.sameUnit ? "YES" : "NO",
    procurement_cost: trace?.presentation.priceDisplay ?? "—",
    operational_cost: trace?.presentation.effectiveUsableCostLabel ?? "—",
    procurement_cost_eq_operational_cost: comparison.sameCost ? "YES" : "NO",
    equal: comparison.same ? "YES" : "NO",
    transformation: comparison.transformation,
  });

  (results.requiredTable as unknown[]).push({
    product: spec.displayName,
    procurementCost: trace?.presentation.priceDisplay ?? "—",
    operationalCost: trace?.presentation.effectiveUsableCostLabel ?? "—",
    sameUnit: comparison.sameUnit ? "YES" : "NO",
    sameCost: comparison.sameCost ? "YES" : "NO",
    addsInformation: trace ? (presentationAddsInformation(trace) ? "YES" : "NO") : "—",
  });

  if (spec.key === "gorgonzola" && trace) {
    results.gorgonzolaDeepAudit = {
      invoiceItem: trace.bound,
      extractedQtyUnit: { quantity: trace.bound.quantity, unit: trace.bound.unit },
      purchase_structure_kind: trace.structured.kind,
      usable_quantity: trace.usableChain,
      purchase_quantity: trace.recipeFields?.purchase_quantity,
      current_price: trace.recipeFields?.current_price,
      operational_denominator: trace.perUnit,
      math: trace.gorgonzolaMath,
      expectedEurPerKg: spec.expectedOperationalEurPerKg,
      proof: {
        unit_price_is_operational_for_kg_row: trace.bound.unit?.toLowerCase() === "kg",
        effective_cost_equals_unit_price:
          trace.effective?.cost != null &&
          Math.abs(trace.effective.cost - (trace.bound.unit_price ?? 0)) < 0.01,
        recipe_current_price_over_purchase_quantity_times_1000:
          trace.recipeFields != null
            ? (trace.recipeFields.current_price / trace.recipeFields.purchase_quantity) * 1000
            : null,
        reconciles_to_10_88_eur_per_kg:
          trace.recipeFields != null &&
          Math.abs(
            (trace.recipeFields.current_price / trace.recipeFields.purchase_quantity) * 1000 - 10.88,
          ) < 0.01,
        note_line_total_not_used_for_operational_cost:
          "Operational cost derives from unit_price (€/kg), not line_total/qty. line_total/qty_kg = weighed effective rate; line_total/operational_denominator_g ≠ €/kg because denominator is per-priced-kg (1000g), not purchased weight.",
      },
    };
  }
}

// Blast radius: all VL ingredients with latest matched invoice line
const { data: allIngredients } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity,base_unit,unit")
  .order("name");

type BlastRow = {
  ingredientId: string;
  name: string;
  procurementCost: string | null;
  operationalCost: string | null;
  sameUnit: boolean;
  sameCost: boolean;
  duplicate: boolean;
  addsInformation: boolean;
};

const blastRows: BlastRow[] = [];
const blastDuplicates: BlastRow[] = [];

for (const ing of allIngredients ?? []) {
  const { item } = await findLatestMatchedItem(ing.id, "%");
  if (!item?.unit_price) continue;
  const trace = traceLine({ ...item, id: item.id });
  const cmp = procurementEqualsOperational(trace);
  const row: BlastRow = {
    ingredientId: ing.id,
    name: ing.name ?? "",
    procurementCost: trace.presentation.priceDisplay,
    operationalCost: trace.presentation.effectiveUsableCostLabel,
    sameUnit: cmp.sameUnit,
    sameCost: cmp.sameCost,
    duplicate: cmp.same,
    addsInformation: presentationAddsInformation(trace),
  };
  blastRows.push(row);
  if (row.duplicate) blastDuplicates.push(row);
}

results.blastRadius = {
  totalIngredients: allIngredients?.length ?? 0,
  ingredientsWithMatchedInvoiceLine: blastRows.length,
  procurementEqualsOperationalCount: blastDuplicates.length,
  duplicateRows: blastDuplicates,
  allRows: blastRows,
};

const allTargetsSame = (results.targets as { equality: { same: boolean } }[]).every(
  (t) => t.equality.same,
);
const anyAddsInfo = (results.requiredTable as { addsInformation: string }[]).some(
  (r) => r.addsInformation === "YES",
);

results.verdict = {
  classification: allTargetsSame ? "B" : "mixed",
  finalVerdictLetter: allTargetsSame ? "B" : anyAddsInfo ? "A" : "C",
  question:
    "Would hiding Operational Cost change recipe costing, intelligence, pricing history, or operational calculations?",
  answer: allTargetsSame ? "NO" : "PARTIAL — see per-product evidence",
  answerText: allTargetsSame
    ? "For all four Emporio deli family products, procurement and operational €/kg are mathematically identical. Recipe costing uses recipeOperationalCostFieldsFromInvoiceLine (current_price=unit_price, purchase_quantity=1000, cost_base_unit=g) yielding the same €/kg as procurement display. Hiding Operational Cost on ingredient detail removes no computation input; presentation-only duplicate."
    : "See per-product equality table.",
  blastRadiusDuplicateCount: blastDuplicates.length,
  deliFamilyInBlastRadius: blastDuplicates
    .filter((r) =>
      TARGET_SPECS.some((s) => r.name.toLowerCase().includes(s.key.slice(0, 5))),
    )
    .map((r) => r.name),
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// Markdown report
const lines: string[] = [];
lines.push("# Emporio Italia Deli Family — Mathematical Audit");
lines.push("");
lines.push(`**Validation Lab:** \`${VL}\` · **Invoice:** \`${EMPORIO_INVOICE_ID}\` (19 May 2026) · **Read-only** · ${new Date().toISOString().slice(0, 10)}`);
lines.push(`**Extends:** [.tmp/ingredient-procurement-operational-duplication-audit](../ingredient-procurement-operational-duplication-audit/REPORT.md)`);
lines.push("");

lines.push("## Required table");
lines.push("");
lines.push("| Product | Procurement Cost | Operational Cost | Same Unit | Same Cost | Adds Information? |");
lines.push("|---------|------------------|------------------|-----------|-----------|-------------------|");
for (const row of results.requiredTable as {
  product: string;
  procurementCost: string;
  operationalCost: string;
  sameUnit: string;
  sameCost: string;
  addsInformation: string;
}[]) {
  lines.push(
    `| ${row.product} | ${row.procurementCost} | ${row.operationalCost} | ${row.sameUnit} | ${row.sameCost} | ${row.addsInformation} |`,
  );
}
lines.push("");

lines.push("## Task 3 — Equality test (all four)");
lines.push("");
lines.push("| Product | Procurement | Operational | Equal? | Transformation? |");
lines.push("|---------|-------------|-------------|--------|-----------------|");
for (const row of results.equalityTable as {
  product: string;
  procurement_cost: string;
  operational_cost: string;
  equal: string;
  transformation: string | null;
}[]) {
  lines.push(
    `| ${row.product} | ${row.procurement_cost} | ${row.operational_cost} | ${row.equal} | ${row.transformation ?? "—"} |`,
  );
}
lines.push("");

const gorg = results.gorgonzolaDeepAudit as {
  math: Record<string, unknown>;
  proof: Record<string, unknown>;
} | null;
if (gorg) {
  lines.push("## Task 2 — Gorgonzola deep audit");
  lines.push("");
  lines.push("### Variables");
  lines.push("");
  lines.push("| Variable | Value |");
  lines.push("|----------|-------|");
  for (const [k, v] of Object.entries(gorg.math ?? {})) {
    lines.push(`| ${k} | ${typeof v === "object" ? JSON.stringify(v) : v} |`);
  }
  lines.push("");
  lines.push("### Reconciliation to €10.88/kg");
  lines.push("");
  for (const [k, v] of Object.entries(gorg.proof ?? {})) {
    lines.push(`- **${k}:** ${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
  lines.push("");
  lines.push("For kg-priced invoice rows, `recipeOperationalCostFieldsFromInvoiceLine` short-circuits to `{ current_price: unit_price, purchase_quantity: 1000, cost_base_unit: g }`. Operational €/kg = `unit_price / (perUnit_g/1000)` = `unit_price` = **€10.88/kg**. `line_total ÷ purchased_g` reflects weighed quantity (1.05 kg → €12.80/kg effective from total); operational cost intentionally uses list `unit_price`, not derived line_total rate.");
  lines.push("");
}

for (const t of results.targets as {
  displayName: string;
  fullTrace: Record<string, unknown> | null;
  equality: { formula: string; same: boolean };
  recipeCosting: {
    cost100g: number;
    cost250g: number;
    cost1kg: number;
    displayDenominator: string;
    kpiLabel: string;
    operationalDisplayEurPerKg: number;
  } | null;
  presentation: { addsInformation: boolean } | null;
}[]) {
  lines.push(`## Task 1 — ${t.displayName}`);
  lines.push("");
  if (t.fullTrace) {
    const ft = t.fullTrace as {
      stage1_invoiceItem: Record<string, unknown>;
      stage5_structuredPurchase: Record<string, unknown>;
      stage6_procurement: Record<string, unknown>;
      stage7_operationalPersist: Record<string, unknown>;
      stage8_recipeFields: Record<string, unknown>;
      stage9_presentation: Record<string, unknown>;
      stage10_detailPresentation: Record<string, unknown>;
      perUnit: Record<string, unknown>;
      effective: Record<string, unknown>;
    };
    lines.push("### Pipeline trace");
    lines.push("");
    lines.push("| Stage | Key fields |");
    lines.push("|-------|------------|");
    lines.push(`| Invoice item | ${JSON.stringify(ft.stage1_invoiceItem)} |`);
    lines.push(`| Purchase format | kind=${(ft.stage5_structuredPurchase as { kind: string }).kind}, normalized=${(ft.stage5_structuredPurchase as { normalizedUsableQuantity: number }).normalizedUsableQuantity}${(ft.stage5_structuredPurchase as { usableQuantityUnit: string }).usableQuantityUnit} |`);
    lines.push(`| Procurement | ${JSON.stringify(ft.stage6_procurement)} |`);
    lines.push(`| Operational persist | ${JSON.stringify(ft.stage7_operationalPersist)} |`);
    lines.push(`| Recipe fields | ${JSON.stringify(ft.stage8_recipeFields)} |`);
    lines.push(`| perUnit | ${JSON.stringify(ft.perUnit)} |`);
    lines.push(`| effective | ${JSON.stringify(ft.effective)} |`);
    lines.push(`| Presentation | procurement=${(ft.stage9_presentation as { priceDisplay: string }).priceDisplay}, operational=${(ft.stage9_presentation as { effectiveUsableCostLabel: string }).effectiveUsableCostLabel} |`);
  }
  lines.push("");
  lines.push(`**Equality:** ${t.equality.same ? "YES" : "NO"} — ${t.equality.formula}`);
  lines.push("");
  if (t.recipeCosting) {
    lines.push("### Task 4 — Recipe costing");
    lines.push("");
    lines.push("| Quantity | Cost (€) |");
    lines.push("|----------|----------|");
    lines.push(`| 100 g | ${t.recipeCosting.cost100g?.toFixed(4)} |`);
    lines.push(`| 250 g | ${t.recipeCosting.cost250g?.toFixed(4)} |`);
    lines.push(`| 1 kg | ${t.recipeCosting.cost1kg?.toFixed(4)} |`);
    lines.push(`| Denominator | ${t.recipeCosting.displayDenominator} |`);
    lines.push(`| KPI label | ${t.recipeCosting.kpiLabel} |`);
    lines.push(`| €/kg from operational fields | €${t.recipeCosting.operationalDisplayEurPerKg?.toFixed(2)}/kg |`);
    lines.push("");
  }
  if (t.presentation) {
    lines.push(`### Task 5 — Presentation: adds information? **${t.presentation.addsInformation ? "YES" : "NO"}**`);
    lines.push("");
  }
}

const blast = results.blastRadius as {
  totalIngredients: number;
  ingredientsWithMatchedInvoiceLine: number;
  procurementEqualsOperationalCount: number;
  duplicateRows: { name: string; procurementCost: string; operationalCost: string }[];
};
lines.push("## Task 6 — Blast radius (VL)");
lines.push("");
lines.push(`- Total ingredients: **${blast.totalIngredients}**`);
lines.push(`- With matched invoice line traced: **${blast.ingredientsWithMatchedInvoiceLine}**`);
lines.push(`- Procurement == Operational (unit + cost): **${blast.procurementEqualsOperationalCount}**`);
lines.push("");
if (blast.duplicateRows.length > 0) {
  lines.push("| Ingredient | Procurement | Operational |");
  lines.push("|------------|-------------|-------------|");
  for (const r of blast.duplicateRows) {
    lines.push(`| ${r.name} | ${r.procurementCost} | ${r.operationalCost} |`);
  }
}
lines.push("");

const verdict = results.verdict as {
  finalVerdictLetter: string;
  question: string;
  answer: string;
  answerText: string;
};
lines.push("## Final verdict");
lines.push("");
lines.push(`**Classification: ${verdict.finalVerdictLetter}**`);
lines.push("");
lines.push(`**${verdict.question}**`);
lines.push("");
lines.push(`**${verdict.answer}** — ${verdict.answerText}`);

writeFileSync(`${OUT}/REPORT.md`, lines.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
