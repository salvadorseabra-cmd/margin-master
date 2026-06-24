/**
 * STRICT READ-ONLY Ovo Classe M Procurement → Operational Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
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
  resolveInvoiceLinePurchaseUnit,
  structuredPurchaseToIngredientFields,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
  resolveUnitsPerPack,
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
import {
  effectiveIngredientUnitCostEur,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { ingredientLineCostEur } from "../../src/lib/recipe-prep-cost.ts";
import { inferUnitFamily } from "../../src/lib/recipe-unit-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/ovo-classe-m-audit";
const BIDFOOD_INVOICE = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";

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
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const purchaseUnitResolution = resolveInvoiceLinePurchaseUnit(metadata, defaultIsGenericUnit);
  const structuredFields = structuredPurchaseToIngredientFields(
    structured,
    bound.unit,
    defaultIsGenericUnit,
  );
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
  const isCasePieceWeight = isCaseRowWithEmbeddedPieceWeightOnly(bound.name, bound.unit);
  const rowQtyLabel = formatRowPurchaseQuantityLabel(metadata);
  const unitsPerPack = resolveUnitsPerPack(structured);
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

  return {
    invoiceItemId: raw.id,
    invoiceId: raw.invoice_id ?? null,
    bound,
    structure,
    usableChain,
    structured,
    presentation,
    purchaseUnitResolution,
    structuredFields,
    procurement,
    persistFields,
    recipeFields,
    perUnit,
    effective,
    isCasePieceWeight,
    rowQtyLabel,
    unitsPerPack,
    detailPresentation,
    unitFamily,
  };
}

function recipeCostForEggs(
  fields: {
    current_price: number;
    purchase_quantity: number;
    cost_base_unit: string;
    usable_weight_grams?: number | null;
  } | null,
  eggCount: number,
) {
  if (!fields) return null;
  const unitCost = resolvedOperationalUnitCostEur(fields);
  const lineCostUn = ingredientLineCostEur(eggCount, fields, { recipeUnit: "un" });
  const lineCostG = ingredientLineCostEur(eggCount * 60, fields, { recipeUnit: "g" });
  return {
    eggCount,
    formula: "ingredientLineCostEur(qty, { current_price, purchase_quantity, cost_base_unit }, { recipeUnit: 'un' })",
    unitCostEur: unitCost,
    effectiveIngredientUnitCostEur: effectiveIngredientUnitCostEur(fields),
    lineCostRecipeUn: lineCostUn,
    lineCostRecipeG60gPerEgg: lineCostG,
    impliedPerEggIf180InCase: 38.44 / 180,
    impliedPerEggIf1UnIsCase: 38.44,
  };
}

mkdirSync(OUT, { recursive: true });

// Q1: Ovo ingredient
const { data: ovoIngredients } = await sb
  .from("ingredients")
  .select(
    "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier",
  )
  .or("name.ilike.%Ovo%classe%M%,normalized_name.ilike.%ovo%classe%m%")
  .limit(10);

const ovoIngredient =
  ovoIngredients?.find((i) => /classe\s*m/i.test(i.name ?? "")) ?? ovoIngredients?.[0] ?? null;

// Q2: Latest Ovo invoice line (Bidfood da472b7f preferred)
const { data: ovoItems } = await sb
  .from("invoice_items")
  .select(
    "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(id,supplier_name,invoice_date)",
  )
  .ilike("name", "%Ovo%MORENO%Classe%M%")
  .order("created_at", { ascending: false })
  .limit(5);

const ovoItem =
  ovoItems?.find((i) => i.invoice_id === BIDFOOD_INVOICE) ?? ovoItems?.[0] ?? null;

const ovoTrace = ovoItem ? traceLine(ovoItem) : null;

// Match + price history
const { data: ovoMatch } = ovoItem
  ? await sb
      .from("invoice_item_matches")
      .select("ingredient_id,status,match_kind")
      .eq("invoice_item_id", ovoItem.id)
      .maybeSingle()
  : { data: null };

const { data: priceHistory } = ovoIngredient
  ? await sb
      .from("ingredient_price_history")
      .select("id,invoice_id,new_price,created_at")
      .eq("ingredient_id", ovoIngredient.id)
      .order("created_at", { ascending: false })
      .limit(5)
  : { data: null };

const { data: aliases } = ovoIngredient
  ? await sb
      .from("ingredient_aliases")
      .select("alias_name,confirmed_by_user,supplier_name")
      .eq("ingredient_id", ovoIngredient.id)
  : { data: null };

// Controls: Tomilho, Manjericão, Salada ibérica
const controlsSpec = [
  { key: "tomilho", label: "Tomilho", pattern: "%Tomilho%" },
  { key: "manjericao", label: "Manjericão", pattern: "%Manjeric%o%" },
  { key: "salada", label: "Salada ibérica", pattern: "%Salada%Ib%rica%" },
];

const controls: Record<string, unknown> = {};
for (const c of controlsSpec) {
  const { data: items } = await sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total,invoice_id")
    .ilike("name", c.pattern)
    .order("created_at", { ascending: false })
    .limit(1);
  const item = items?.[0];
  if (item) {
    controls[c.key] = {
      label: c.label,
      trace: traceLine(item),
      db: item,
    };
  }
}

function deriveProcurementUnit(trace: ReturnType<typeof traceLine> | null): string | null {
  return trace?.presentation.priceDisplay?.split(" / ")[1] ?? null;
}

function deriveOperationalUnit(trace: ReturnType<typeof traceLine> | null): string | null {
  return trace?.effective?.unit ?? trace?.presentation.effectiveUsableCostLabel?.split(" / ")[1] ?? null;
}

function derivePurchaseStructureKind(trace: ReturnType<typeof traceLine> | null): string | null {
  return trace?.structure?.tier ?? trace?.structured.kind ?? null;
}

const dbFieldsFromIngredient = ovoIngredient
  ? {
      ingredient_id: ovoIngredient.id,
      name: ovoIngredient.name,
      current_price: ovoIngredient.current_price,
      purchase_quantity: ovoIngredient.purchase_quantity,
      purchase_unit: ovoIngredient.purchase_unit,
      cost_base_unit: ovoIngredient.base_unit ?? ovoIngredient.unit,
      usable_quantity: ovoTrace?.structured.normalizedUsableQuantity ?? null,
      usable_unit: ovoTrace?.structured.usableQuantityUnit ?? null,
      purchase_structure_kind: derivePurchaseStructureKind(ovoTrace),
    }
  : null;

const recipeFieldsFromTrace = ovoTrace?.recipeFields ?? null;
const recipeFieldsFromDb = ovoIngredient
  ? {
      current_price: Number(ovoIngredient.current_price),
      purchase_quantity: Number(ovoIngredient.purchase_quantity),
      cost_base_unit: (ovoIngredient.base_unit ?? ovoIngredient.unit ?? "un") as "g" | "ml" | "un",
    }
  : null;

const q5RecipeCosts = [1, 2, 6, 12].map((n) => ({
  fromInvoiceTrace: recipeCostForEggs(recipeFieldsFromTrace, n),
  fromDbIngredient: recipeCostForEggs(recipeFieldsFromDb, n),
}));

const q3Pipeline = ovoTrace
  ? [
      {
        stage: "invoice_item (DB)",
        quantity: ovoItem?.quantity,
        unit: ovoItem?.unit,
        unit_price: ovoItem?.unit_price,
        total: ovoItem?.total,
      },
      {
        stage: "normalizeInvoiceItemFields",
        quantity: ovoTrace.bound.quantity,
        unit: ovoTrace.bound.unit,
      },
      {
        stage: "parsePurchaseStructureFromText",
        tier: ovoTrace.structure?.tier ?? null,
        matchedText: ovoTrace.structure?.matchedText ?? null,
        unitSize: ovoTrace.structure?.unitSize ?? null,
        unitMeasurement: ovoTrace.structure?.unitMeasurement ?? null,
      },
      {
        stage: "computeUsableFromPurchaseStructure",
        usableQuantity: ovoTrace.usableChain?.usableQuantity ?? null,
        usableUnit: ovoTrace.usableChain?.usableUnit ?? null,
        usableSource: ovoTrace.usableChain?.usableSource ?? null,
      },
      {
        stage: "resolveInvoiceLinePurchaseFormat",
        kind: ovoTrace.structured.kind,
        normalizedUsableQuantity: ovoTrace.structured.normalizedUsableQuantity,
        usableQuantityUnit: ovoTrace.structured.usableQuantityUnit,
        purchaseContainerCount: ovoTrace.structured.purchaseContainerCount,
        purchaseContainerUnit: ovoTrace.structured.purchaseContainerUnit,
        inferred: ovoTrace.structured.inferred,
      },
      {
        stage: "resolveUnitsPerPack",
        unitsPerPack: ovoTrace.unitsPerPack,
      },
      {
        stage: "resolveUsablePerPricedUnit",
        perUnit: ovoTrace.perUnit,
      },
      {
        stage: "computeEffectiveUsableCost",
        effective: ovoTrace.effective,
      },
      {
        stage: "resolveInvoiceLinePricingPresentation",
        priceDisplay: ovoTrace.presentation.priceDisplay,
        effectiveUsableCostLabel: ovoTrace.presentation.effectiveUsableCostLabel,
      },
      {
        stage: "procurementPackFieldsFromInvoiceLine",
        fields: ovoTrace.procurement,
      },
      {
        stage: "operationalCostFieldsFromInvoiceLine (persistence)",
        fields: ovoTrace.persistFields,
      },
      {
        stage: "recipeOperationalCostFieldsFromInvoiceLine",
        fields: ovoTrace.recipeFields,
      },
      {
        stage: "buildLastPurchaseCostPresentation (detail UI)",
        lastPurchase: ovoTrace.detailPresentation?.lastPurchase ?? null,
        procurementCost: ovoTrace.detailPresentation?.procurementCost ?? null,
        operationalCost: ovoTrace.detailPresentation?.operationalCost ?? null,
      },
      {
        stage: "inferUnitFamily",
        unitFamily: ovoTrace.unitFamily,
      },
    ]
  : null;

const q6Compare = {
  ovo: ovoTrace
    ? {
        ingredient: "Ovo classe M",
        procurement: ovoTrace.presentation.priceDisplay,
        operational: ovoTrace.presentation.effectiveUsableCostLabel,
        recipeUnit: ovoTrace.recipeFields?.cost_base_unit ?? ovoIngredient?.base_unit ?? null,
        purchase_quantity: ovoTrace.recipeFields?.purchase_quantity ?? ovoIngredient?.purchase_quantity,
      }
    : null,
  ...Object.fromEntries(
    Object.entries(controls).map(([key, val]) => {
      const v = val as { label: string; trace: ReturnType<typeof traceLine> };
      return [
        key,
        {
          ingredient: v.label,
          procurement: v.trace.presentation.priceDisplay,
          operational: v.trace.presentation.effectiveUsableCostLabel,
          recipeUnit: v.trace.recipeFields?.cost_base_unit ?? null,
          purchase_quantity: v.trace.recipeFields?.purchase_quantity ?? null,
        },
      ];
    }),
  ),
};

const requiredTable = [
  {
    concept: "Purchase Unit",
    current: ovoTrace?.rowQtyLabel ?? "—",
    intendedByArchitecture:
      "case — invoice row cx priced as one procurement container; formatRowPurchaseQuantityLabel maps cx → case",
  },
  {
    concept: "Procurement Unit",
    current: ovoTrace?.presentation.priceDisplay ?? "—",
    intendedByArchitecture:
      "case — resolvePriceSuffix maps cx → case; unit_price is €/case on invoice",
  },
  {
    concept: "Operational Unit",
    current: ovoTrace?.presentation.effectiveUsableCostLabel ?? "null / not shown",
    intendedByArchitecture:
      "egg (countable) — inferCountableCostUnit returns 'egg' when usable per-unit count is derivable; requires parsing nested 15×dozen structure",
  },
  {
    concept: "Recipe Consumption Unit",
    current: `un (persisted base_unit=${ovoIngredient?.base_unit ?? "?"}, purchase_quantity=${ovoIngredient?.purchase_quantity ?? "?"})`,
    intendedByArchitecture:
      "un (egg) — recipeOperationalCostFieldsFromInvoiceLine uses cost_base_unit=un; denominator should be total eggs per case (15 dozen = 180) not 1",
  },
];

const q7Options = {
  A: "no usable conversion — resolveUsablePerPricedUnit returns null (row_only, no parsed dozen count)",
  B: "countable architecture — inferUnitFamily(cx)→countable; operational display suppressed when no per-unit usable",
  C: "display suppression — effectiveUsableCostLabel omitted when computeEffectiveUsableCost returns null",
  D: "bug — should show €/egg but pipeline fails to parse Cx.15 dúzias",
};

const q7Evidence = {
  resolveUsablePerPricedUnit: ovoTrace?.perUnit ?? null,
  computeEffectiveUsableCost: ovoTrace?.effective ?? null,
  effectiveUsableCostLabel: ovoTrace?.presentation.effectiveUsableCostLabel ?? null,
  structuredKind: ovoTrace?.structured.kind ?? null,
  isCasePieceWeight: ovoTrace?.isCasePieceWeight ?? null,
  unitFamily: ovoTrace?.unitFamily ?? null,
};

const q7Selected = ["A", "B", "C"];

const verdictOptions = {
  A: "Correct",
  B: "Display bug",
  C: "Missing operational conversion",
  D: "Architecture ambiguity",
  E: "Data inconsistency",
};

const verdict = "C";

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  product: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)",
  canonicalName: "Ovo classe M",
  bidfoodInvoiceId: BIDFOOD_INVOICE,
  verdict,
  verdictOptions,
  verdictQuestion:
    "How does Marginly intend to cost 1 egg in a recipe when purchase is 1 case of 15 dozen eggs for €38.44?",
  verdictAnswer:
    "Current code persists purchase_quantity=1, cost_base_unit=un → ingredientLineCostEur(N, fields, { recipeUnit: 'un' }) = N × €38.44 (treats one recipe 'un' as one priced purchase unit = whole case). No pipeline stage parses '15 dúzias' into 180 eggs; computeEffectiveUsableCost returns null so Operational Cost is suppressed. Architecture intent for countable eggs (inferCountableCostUnit → 'egg') is unreachable without a usable per-unit denominator.",
  q1_dbState: dbFieldsFromIngredient,
  q1_dbStateTable: dbFieldsFromIngredient
    ? [
        { field: "ingredient_id", currentValue: dbFieldsFromIngredient.ingredient_id, source: "ingredients.id" },
        { field: "name", currentValue: dbFieldsFromIngredient.name, source: "ingredients.name" },
        { field: "current_price", currentValue: dbFieldsFromIngredient.current_price, source: "ingredients.current_price (pack/case price)" },
        { field: "purchase_quantity", currentValue: dbFieldsFromIngredient.purchase_quantity, source: "ingredients.purchase_quantity" },
        { field: "purchase_unit", currentValue: dbFieldsFromIngredient.purchase_unit, source: "ingredients.purchase_unit" },
        { field: "cost_base_unit", currentValue: dbFieldsFromIngredient.cost_base_unit, source: "ingredients.base_unit" },
        { field: "usable_quantity", currentValue: dbFieldsFromIngredient.usable_quantity, source: "resolveInvoiceLinePurchaseFormat.normalizedUsableQuantity (trace)" },
        { field: "usable_unit", currentValue: dbFieldsFromIngredient.usable_unit, source: "resolveInvoiceLinePurchaseFormat.usableQuantityUnit (trace)" },
        { field: "purchase_structure_kind", currentValue: dbFieldsFromIngredient.purchase_structure_kind, source: "parsePurchaseStructureFromText.tier / structured.kind" },
      ]
    : null,
  q2_latestPurchase: ovoItem
    ? {
        invoice_item_id: ovoItem.id,
        invoice_id: ovoItem.invoice_id,
        quantity: ovoItem.quantity,
        unit: ovoItem.unit,
        unit_price: ovoItem.unit_price,
        total: ovoItem.total,
        purchase_structure_kind: derivePurchaseStructureKind(ovoTrace),
        parsedStructure: {
          tier: ovoTrace?.structure?.tier ?? null,
          matchedText: ovoTrace?.structure?.matchedText ?? null,
          structuredKind: ovoTrace?.structured.kind ?? null,
          unitsPerPack: ovoTrace?.unitsPerPack ?? null,
        },
        persistedAs: ovoTrace?.rowQtyLabel ?? null,
        persistedInterpretation: "case (cx → 1 case via formatRowPurchaseQuantityLabel)",
        supplier: (ovoItem.invoices as { supplier_name?: string } | null)?.supplier_name ?? null,
        invoice_date: (ovoItem.invoices as { invoice_date?: string } | null)?.invoice_date ?? null,
      }
    : null,
  q3_fullTrace: q3Pipeline,
  q4_intendedOperationalUnit: {
    selected: "D",
    options: { A: "case", B: "dozen", C: "egg", D: "unclear" },
    evidence: [
      "inferCountableCostUnit(name) returns 'egg' when computeEffectiveUsableCost reaches countable branch — but only if resolveUsablePerPricedUnit yields un with amount>0",
      "resolveUsablePerPricedUnit returns null for row_only (no normalizedUsableQuantity)",
      "resolveCountablePurchaseQuantityForCost(cx, row_only) → purchase_quantity=1 (resolveUnitsPerPack null)",
      "No dozen/dúzia parser in stock-normalization.ts or invoice-purchase-format.ts",
      "Product name embeds 'Cx.15 dúzias' but structured.kind=row_only — nested count not extracted",
    ],
  },
  q5_recipeCosting: {
    formula:
      "effectiveIngredientUnitCostEur = current_price / max(purchase_quantity, 1); ingredientLineCostEur(qty, fields, { recipeUnit: 'un' }) via directCountableLineCostEur when recipe unit is un",
    sourceFields: recipeFieldsFromTrace,
    dbPersistedFields: recipeFieldsFromDb,
    scenarios: q5RecipeCosts,
    hypotheticalIf180Eggs: {
      purchase_quantity: 180,
      unitCostPerEgg: 38.44 / 180,
      lineCosts: [1, 2, 6, 12].map((n) => ({ eggs: n, cost: (38.44 / 180) * n })),
    },
  },
  q6_compare: q6Compare,
  q7_shouldOperationalDisplay: {
    selected: q7Selected,
    options: q7Options,
    evidence: q7Evidence,
    operationalShown: Boolean(ovoTrace?.presentation.effectiveUsableCostLabel),
  },
  requiredTable,
  ovoTrace: ovoTrace
    ? {
        invoiceItemId: ovoTrace.invoiceItemId,
        isCasePieceWeight: ovoTrace.isCasePieceWeight,
        procurement: ovoTrace.procurement,
        persistFields: ovoTrace.persistFields,
        recipeFields: ovoTrace.recipeFields,
        structuredFields: ovoTrace.structuredFields,
      }
    : null,
  ovoIngredient,
  ovoMatch: ovoMatch ?? null,
  priceHistory: priceHistory ?? [],
  aliases: aliases ?? [],
  ovoItems: ovoItems ?? [],
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log("Audit complete:", OUT);
console.log("Verdict:", verdict);
console.log("Ingredient:", ovoIngredient?.id, ovoIngredient?.name);
console.log("Invoice item:", ovoItem?.id);
