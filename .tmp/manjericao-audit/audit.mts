/**
 * STRICT READ-ONLY Manjericão Procurement → Operational Audit — VL bjhnlrgodcqoyzddbpbd
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
import { inferUnitFamily } from "../../src/lib/recipe-unit-normalization.ts";
import { detectConversionHint } from "../../src/lib/ingredient-unit-inference.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/manjericao-audit";
const BIDFOOD_INVOICE = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";

const PRODUCE_CONVERSION_HINTS_MANJERICAO = {
  token: "MANJERICAO",
  group: "fresh herbs",
  estimatedQuantity: 100,
  unit: "g",
  confidence: 0.58,
  sourceFile: "src/lib/ingredient-unit-inference.ts",
  lines: "413-417",
};

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
  const conversionHint = detectConversionHint(bound.name);

  return {
    invoiceItemId: raw.id,
    invoiceId: raw.invoice_id ?? null,
    bound,
    structure,
    usableChain,
    structured,
    presentation,
    structuredFields,
    procurement,
    persistFields,
    recipeFields,
    perUnit,
    effective,
    rowQtyLabel,
    unitsPerPack,
    detailPresentation,
    unitFamily,
    conversionHint,
  };
}

function recipeCostForQty(
  fields: {
    current_price: number;
    purchase_quantity: number;
    cost_base_unit: string;
    usable_weight_grams?: number | null;
  } | null,
  qty: number,
  recipeUnit: "un" | "g",
) {
  if (!fields) return null;
  const unitCost = fields.current_price / Math.max(fields.purchase_quantity, 1);
  const lineCost = qty * unitCost;
  return {
    qty,
    recipeUnit,
    formula:
      recipeUnit === "g"
        ? "ingredientLineCostEur(qty, fields, { recipeUnit: 'g' }) → qty × (current_price / purchase_quantity) when cost_base_unit=g"
        : "ingredientLineCostEur(qty, fields, { recipeUnit: 'un' }) → qty × (current_price / purchase_quantity)",
    unitCostEur: unitCost,
    effectiveIngredientUnitCostEur: unitCost,
    lineCostEur: lineCost,
    denominator: fields.purchase_quantity,
    calculation: `${qty} × (${fields.current_price} / ${fields.purchase_quantity}) = ${lineCost}`,
  };
}

function derivePurchaseStructureKind(trace: ReturnType<typeof traceLine> | null): string | null {
  return trace?.structure?.tier ?? trace?.structured.kind ?? null;
}

mkdirSync(OUT, { recursive: true });

// Q1: Manjericão ingredient
const { data: manjericaoIngredients } = await sb
  .from("ingredients")
  .select(
    "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier",
  )
  .ilike("name", "%Manjeric%o%")
  .limit(10);

const manjericaoIngredient =
  manjericaoIngredients?.find((i) => /^Manjericão$/i.test(i.name ?? "")) ??
  manjericaoIngredients?.[0] ??
  null;

// Q2: Latest Manjericão invoice line (Bidfood da472b7f preferred)
const { data: manjericaoItems } = await sb
  .from("invoice_items")
  .select(
    "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(id,supplier_name,invoice_date)",
  )
  .ilike("name", "%Manjeric%o%")
  .order("created_at", { ascending: false })
  .limit(10);

const manjericaoItem =
  manjericaoItems?.find((i) => i.invoice_id === BIDFOOD_INVOICE) ?? manjericaoItems?.[0] ?? null;

const manjericaoTrace = manjericaoItem ? traceLine(manjericaoItem) : null;

const { data: manjericaoMatch } = manjericaoItem
  ? await sb
      .from("invoice_item_matches")
      .select("ingredient_id,status,match_kind")
      .eq("invoice_item_id", manjericaoItem.id)
      .maybeSingle()
  : { data: null };

const { data: priceHistory } = manjericaoIngredient
  ? await sb
      .from("ingredient_price_history")
      .select("id,invoice_id,new_price,created_at")
      .eq("ingredient_id", manjericaoIngredient.id)
      .order("created_at", { ascending: false })
      .limit(5)
  : { data: null };

const { data: aliases } = manjericaoIngredient
  ? await sb
      .from("ingredient_aliases")
      .select("alias_name,confirmed_by_user,supplier_name")
      .eq("ingredient_id", manjericaoIngredient.id)
  : { data: null };

// Controls
const controlsSpec = [
  { key: "tomilho", label: "Tomilho", pattern: "%Tomilho%" },
  { key: "ovo", label: "Ovo Classe M", pattern: "%Ovo%MORENO%Classe%M%" },
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
      conversionHint: detectConversionHint(item.name ?? ""),
    };
  }
}

const dbFieldsFromIngredient = manjericaoIngredient
  ? {
      ingredient_id: manjericaoIngredient.id,
      name: manjericaoIngredient.name,
      current_price: manjericaoIngredient.current_price,
      purchase_quantity: manjericaoIngredient.purchase_quantity,
      purchase_unit: manjericaoIngredient.purchase_unit,
      cost_base_unit: manjericaoIngredient.base_unit ?? manjericaoIngredient.unit,
      usable_quantity: manjericaoTrace?.structured.normalizedUsableQuantity ?? null,
      usable_unit: manjericaoTrace?.structured.usableQuantityUnit ?? null,
      purchase_structure_kind: derivePurchaseStructureKind(manjericaoTrace),
      catalog: {
        base_unit: manjericaoIngredient.base_unit,
        unit: manjericaoIngredient.unit,
      },
      match: manjericaoMatch ?? null,
    }
  : null;

const recipeFieldsFromTrace = manjericaoTrace?.recipeFields ?? null;
const recipeFieldsFromDb = manjericaoIngredient
  ? {
      current_price: Number(manjericaoIngredient.current_price),
      purchase_quantity: Number(manjericaoIngredient.purchase_quantity),
      cost_base_unit: (manjericaoIngredient.base_unit ?? manjericaoIngredient.unit ?? "g") as
        | "g"
        | "ml"
        | "un",
    }
  : null;

const recipeGrams = [10, 25, 50, 100];
const q5RecipeCosts = recipeGrams.flatMap((n) => [
  {
    source: "invoiceTrace_g",
    ...recipeCostForQty(recipeFieldsFromTrace, n, "g"),
  },
  {
    source: "dbPersisted_g",
    ...recipeCostForQty(recipeFieldsFromDb, n, "g"),
  },
]);

const q3Pipeline = manjericaoTrace
  ? [
      {
        stage: "invoice_item (DB)",
        quantity: manjericaoItem?.quantity,
        unit: manjericaoItem?.unit,
        unit_price: manjericaoItem?.unit_price,
        total: manjericaoItem?.total,
      },
      {
        stage: "normalizeInvoiceItemFields",
        quantity: manjericaoTrace.bound.quantity,
        unit: manjericaoTrace.bound.unit,
      },
      {
        stage: "parsePurchaseStructureFromText",
        tier: manjericaoTrace.structure?.tier ?? null,
        matchedText: manjericaoTrace.structure?.matchedText ?? null,
        unitSize: manjericaoTrace.structure?.unitSize ?? null,
        unitMeasurement: manjericaoTrace.structure?.unitMeasurement ?? null,
      },
      {
        stage: "detectConversionHint (ingredient-unit-inference)",
        hint: manjericaoTrace.conversionHint,
      },
      {
        stage: "computeUsableFromPurchaseStructure",
        usableQuantity: manjericaoTrace.usableChain?.usableQuantity ?? null,
        usableUnit: manjericaoTrace.usableChain?.usableUnit ?? null,
        usableSource: manjericaoTrace.usableChain?.usableSource ?? null,
      },
      {
        stage: "resolveInvoiceLinePurchaseFormat",
        kind: manjericaoTrace.structured.kind,
        normalizedUsableQuantity: manjericaoTrace.structured.normalizedUsableQuantity,
        usableQuantityUnit: manjericaoTrace.structured.usableQuantityUnit,
        purchaseContainerCount: manjericaoTrace.structured.purchaseContainerCount,
        purchaseContainerUnit: manjericaoTrace.structured.purchaseContainerUnit,
        inferred: manjericaoTrace.structured.inferred,
      },
      {
        stage: "resolveUnitsPerPack",
        unitsPerPack: manjericaoTrace.unitsPerPack,
      },
      {
        stage: "resolveUsablePerPricedUnit",
        perUnit: manjericaoTrace.perUnit,
      },
      {
        stage: "computeEffectiveUsableCost",
        effective: manjericaoTrace.effective,
      },
      {
        stage: "resolveInvoiceLinePricingPresentation",
        priceDisplay: manjericaoTrace.presentation.priceDisplay,
        effectiveUsableCostLabel: manjericaoTrace.presentation.effectiveUsableCostLabel,
      },
      {
        stage: "procurementPackFieldsFromInvoiceLine",
        fields: manjericaoTrace.procurement,
      },
      {
        stage: "operationalCostFieldsFromInvoiceLine (persistence)",
        fields: manjericaoTrace.persistFields,
      },
      {
        stage: "recipeOperationalCostFieldsFromInvoiceLine",
        fields: manjericaoTrace.recipeFields,
      },
      {
        stage: "buildLastPurchaseCostPresentation (detail UI)",
        lastPurchase: manjericaoTrace.detailPresentation?.lastPurchase ?? null,
        procurementCost: manjericaoTrace.detailPresentation?.procurementCost ?? null,
        operationalCost: manjericaoTrace.detailPresentation?.operationalCost ?? null,
      },
      {
        stage: "inferUnitFamily",
        unitFamily: manjericaoTrace.unitFamily,
      },
    ]
  : null;

const q6Compare = {
  manjericao: manjericaoTrace
    ? {
        ingredient: "Manjericão",
        procurement: manjericaoTrace.presentation.priceDisplay,
        operational: manjericaoTrace.presentation.effectiveUsableCostLabel,
        recipeUnit: manjericaoTrace.recipeFields?.cost_base_unit ?? manjericaoIngredient?.base_unit ?? null,
        purchase_quantity:
          manjericaoTrace.recipeFields?.purchase_quantity ?? manjericaoIngredient?.purchase_quantity,
        conversionHint: manjericaoTrace.conversionHint,
        structuredKind: manjericaoTrace.structured.kind,
        perUnitUsable: manjericaoTrace.perUnit,
      }
    : null,
  ...Object.fromEntries(
    Object.entries(controls).map(([key, val]) => {
      const v = val as {
        label: string;
        trace: ReturnType<typeof traceLine>;
        conversionHint: ReturnType<typeof detectConversionHint>;
      };
      return [
        key,
        {
          ingredient: v.label,
          procurement: v.trace.presentation.priceDisplay,
          operational: v.trace.presentation.effectiveUsableCostLabel,
          recipeUnit: v.trace.recipeFields?.cost_base_unit ?? null,
          purchase_quantity: v.trace.recipeFields?.purchase_quantity ?? null,
          conversionHint: v.conversionHint,
          structuredKind: v.trace.structured.kind,
          perUnitUsable: v.trace.perUnit,
        },
      ];
    }),
  ),
};

const unitPrice = manjericaoItem?.unit_price ?? 2.06;
const rowQty = manjericaoItem?.quantity ?? 5;
const perBunchG = manjericaoTrace?.perUnit?.amount ?? 100;
const expectedKgCost = unitPrice / (perBunchG / 1000);
const expectedTotalUsableG = rowQty * perBunchG;

const q7Math = {
  inputs: {
    bunches: rowQty,
    unitPricePerBunch: unitPrice,
    gramsPerBunch: perBunchG,
    lineTotal: manjericaoItem?.total ?? rowQty * unitPrice,
  },
  operationalKg: {
    formula: "unit_price / (gramsPerBunch / 1000)",
    calculation: `${unitPrice} / (${perBunchG} / 1000)`,
    result: expectedKgCost,
    displayed: manjericaoTrace?.presentation.effectiveUsableCostLabel ?? null,
    matchesDisplay: manjericaoTrace?.presentation.effectiveUsableCostLabel === `€${expectedKgCost.toFixed(2)} / kg`,
  },
  totalUsable: {
    formula: "rowQuantity × gramsPerBunch",
    calculation: `${rowQty} × ${perBunchG}`,
    result: expectedTotalUsableG,
    normalizedUsableQuantity: manjericaoTrace?.structured.normalizedUsableQuantity ?? null,
    matches: manjericaoTrace?.structured.normalizedUsableQuantity === expectedTotalUsableG,
  },
  recipeDenominator: {
    purchase_quantity: recipeFieldsFromTrace?.purchase_quantity ?? null,
    cost_base_unit: recipeFieldsFromTrace?.cost_base_unit ?? null,
    expected: { purchase_quantity: perBunchG, cost_base_unit: "g" },
    matches:
      recipeFieldsFromTrace?.purchase_quantity === perBunchG &&
      recipeFieldsFromTrace?.cost_base_unit === "g",
  },
  recipeAligned: recipeGrams.every((g) => {
    const expected = (unitPrice / perBunchG) * g;
    const actual = (recipeFieldsFromTrace!.current_price / recipeFieldsFromTrace!.purchase_quantity) * g;
    return Math.abs(actual - expected) < 0.001;
  }),
  dbAligned:
    recipeFieldsFromDb != null &&
    recipeFieldsFromTrace != null &&
    recipeFieldsFromDb.current_price === recipeFieldsFromTrace.current_price &&
    recipeFieldsFromDb.purchase_quantity === recipeFieldsFromTrace.purchase_quantity &&
    recipeFieldsFromDb.cost_base_unit === recipeFieldsFromTrace.cost_base_unit,
  overallYes:
    manjericaoTrace?.presentation.effectiveUsableCostLabel === `€${expectedKgCost.toFixed(2)} / kg` &&
    manjericaoTrace?.structured.normalizedUsableQuantity === expectedTotalUsableG &&
    recipeFieldsFromTrace?.purchase_quantity === perBunchG &&
    recipeFieldsFromTrace?.cost_base_unit === "g",
};

const requiredTable = [
  {
    concept: "Purchase Unit",
    current: manjericaoTrace?.rowQtyLabel ?? "—",
    intendedByArchitecture:
      "bunch — formatRowPurchaseQuantityLabel maps mo → bunch; invoice row qty=5 mo",
  },
  {
    concept: "Procurement Unit",
    current: manjericaoTrace?.presentation.priceDisplay ?? "—",
    intendedByArchitecture:
      "bunch — resolvePriceSuffix maps mo → bunch; unit_price is €/bunch on invoice",
  },
  {
    concept: "Operational Unit",
    current: manjericaoTrace?.presentation.effectiveUsableCostLabel ?? "null / not shown",
    intendedByArchitecture:
      "kg — detectConversionHint MANJERICAO → 100g/bunch → computeEffectiveUsableCost → €/kg",
  },
  {
    concept: "Recipe Consumption Unit",
    current: `g (persisted base_unit=${manjericaoIngredient?.base_unit ?? "?"}, purchase_quantity=${manjericaoIngredient?.purchase_quantity ?? "?"})`,
    intendedByArchitecture:
      "g with purchase_quantity=100 (grams per priced bunch from conversion hint); current_price=€/bunch",
  },
  {
    concept: "Conversion Hint",
    current: manjericaoTrace?.conversionHint
      ? `${manjericaoTrace.conversionHint.estimated_quantity}g/bunch (runtime)`
      : "null",
    intendedByArchitecture:
      "PRODUCE_CONVERSION_HINTS fresh herbs MANJERICAO → 100g usable per bunch; runtime only (not persisted)",
  },
];

const q4ConversionHintAudit = {
  definedAt: PRODUCE_CONVERSION_HINTS_MANJERICAO,
  detectConversionHintResult: detectConversionHint("Manjericão"),
  appliedAt: [
    "inferPurchaseUnitsFromLineItemName → conversion_hint on UnitInferenceResult",
    "resolveInvoiceLinePurchaseFormat → kind=inferred when conversion_hint present",
    "stock-normalization computeUsableFromPurchaseStructure → purchaseQuantity × estimated_quantity",
    "resolveUsablePerPricedUnit → per-bunch grams (100g when row qty > 1)",
    "computeEffectiveUsableCost → unit_price / (grams/1000) → €/kg",
    "recipeOperationalCostFieldsFromInvoiceLine → purchase_quantity=100, cost_base_unit=g",
  ],
  persisted: false,
  persistenceNote:
    "detectConversionHint comment: intentionally not persisted — schema has no field for estimated usable yield distinct from pack cost fields; operational fields derived at runtime from invoice line",
  persistedIngredientFields: manjericaoTrace?.persistFields ?? null,
  tests: [
    {
      file: "src/lib/invoice-purchase-price-semantics.test.ts",
      assertion: 'formatRowPurchaseQuantityLabel({ name: "Manjericão", quantity: 2, unit: "mo" }) → "2 bunches"',
    },
    {
      file: ".tmp/fresh-produce-conversion-audit/results.json",
      assertion: "MANJERICAO in PRODUCE_CONVERSION_HINTS; detectConversionHint → 100g",
    },
    {
      file: "src/lib/ingredient-unit-inference.ts",
      assertion: "PRODUCE_CONVERSION_HINTS tokens include MANJERICAO at 100g fresh herbs group",
    },
  ],
};

const verdictOptions = {
  A: "Correct — 100g/bunch conversion, €20.60/kg operational, recipe g-costing aligned end-to-end",
  B: "Display correct but recipe misaligned — operational shown but persistence/recipe fields diverge",
  C: "Conversion hint runtime-only gap — operational works on invoice trace but DB fields differ",
  D: "Math error — €20.60/kg or recipe denominator incorrect for 5×€2.06 / 100g/bunch",
  E: "Unsafe for recipe costing — null operational, wrong unit family, or g-recipe returns null",
};

const verdict = q7Math.overallYes && q7Math.dbAligned ? "A" : q7Math.overallYes ? "B" : "D";

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  product: "Manjericão",
  canonicalName: "Manjericão",
  bidfoodInvoiceId: BIDFOOD_INVOICE,
  verdict,
  verdictOptions,
  verdictQuestion: "Can Marginly safely use Manjericão for recipe costing today?",
  verdictAnswer:
    verdict === "A"
      ? `Yes. Invoice 5 mo × €2.06/bunch → detectConversionHint MANJERICAO → 100g/bunch → operational €${expectedKgCost.toFixed(2)}/kg. Recipe fields: current_price=${unitPrice}, purchase_quantity=${perBunchG}, cost_base_unit=g → ingredientLineCostEur(qty, fields, { recipeUnit: 'g' }) = qty × (€${unitPrice}/${perBunchG}). DB persisted fields match trace.`
      : `Evidence incomplete or misaligned — see q7_consistency.`,
  q1_dbState: dbFieldsFromIngredient,
  q1_dbStateTable: dbFieldsFromIngredient
    ? [
        {
          field: "ingredient_id",
          currentValue: dbFieldsFromIngredient.ingredient_id,
          source: "ingredients.id",
        },
        { field: "name", currentValue: dbFieldsFromIngredient.name, source: "ingredients.name" },
        {
          field: "current_price",
          currentValue: dbFieldsFromIngredient.current_price,
          source: "ingredients.current_price (€/bunch)",
        },
        {
          field: "purchase_quantity",
          currentValue: dbFieldsFromIngredient.purchase_quantity,
          source: "ingredients.purchase_quantity (grams per bunch for recipe denominator)",
        },
        {
          field: "purchase_unit",
          currentValue: dbFieldsFromIngredient.purchase_unit,
          source: "ingredients.purchase_unit",
        },
        {
          field: "cost_base_unit",
          currentValue: dbFieldsFromIngredient.cost_base_unit,
          source: "ingredients.base_unit",
        },
        {
          field: "usable_quantity",
          currentValue: dbFieldsFromIngredient.usable_quantity,
          source: "resolveInvoiceLinePurchaseFormat.normalizedUsableQuantity (trace: 5×100g=500g)",
        },
        {
          field: "usable_unit",
          currentValue: dbFieldsFromIngredient.usable_unit,
          source: "resolveInvoiceLinePurchaseFormat.usableQuantityUnit (trace)",
        },
        {
          field: "purchase_structure_kind",
          currentValue: dbFieldsFromIngredient.purchase_structure_kind,
          source: "structured.kind=inferred via conversion_hint",
        },
      ]
    : null,
  q2_latestPurchase: manjericaoItem
    ? {
        invoice_item_id: manjericaoItem.id,
        invoice_id: manjericaoItem.invoice_id,
        quantity: manjericaoItem.quantity,
        unit: manjericaoItem.unit,
        unit_price: manjericaoItem.unit_price,
        line_total: manjericaoItem.total,
        purchase_structure_kind: derivePurchaseStructureKind(manjericaoTrace),
        parsedStructure: {
          tier: manjericaoTrace?.structure?.tier ?? null,
          matchedText: manjericaoTrace?.structure?.matchedText ?? null,
          structuredKind: manjericaoTrace?.structured.kind ?? null,
          unitsPerPack: manjericaoTrace?.unitsPerPack ?? null,
          conversionHint: manjericaoTrace?.conversionHint ?? null,
        },
        persistedAs: manjericaoTrace?.rowQtyLabel ?? null,
        persistedInterpretation:
          "operationalCostFieldsFromInvoiceLine → current_price=unit_price, purchase_quantity=100, cost_base_unit=g",
        supplier: (manjericaoItem.invoices as { supplier_name?: string } | null)?.supplier_name ?? null,
        invoice_date: (manjericaoItem.invoices as { invoice_date?: string } | null)?.invoice_date ?? null,
        match: manjericaoMatch ?? null,
      }
    : null,
  q3_fullTrace: q3Pipeline,
  q4_conversionHintAudit: q4ConversionHintAudit,
  q5_recipeCosting: {
    formula:
      "resolvedOperationalUnitCostEur = current_price / purchase_quantity; ingredientLineCostEur(qty, fields, { recipeUnit: 'g' }) = qty × unitCost",
    sourceFields: recipeFieldsFromTrace,
    dbPersistedFields: recipeFieldsFromDb,
    scenarios: q5RecipeCosts,
  },
  q6_compare: q6Compare,
  q7_consistency: {
    ...q7Math,
    answer: q7Math.overallYes ? "YES" : "NO",
    summary:
      `5 bunches × €${unitPrice} = €${(rowQty * unitPrice).toFixed(2)} line total; ` +
      `100g/bunch → ${expectedTotalUsableG}g usable; ` +
      `€${unitPrice}/bunch ÷ 0.1kg = €${expectedKgCost.toFixed(2)}/kg`,
  },
  requiredTable,
  manjericaoTrace: manjericaoTrace
    ? {
        invoiceItemId: manjericaoTrace.invoiceItemId,
        procurement: manjericaoTrace.procurement,
        persistFields: manjericaoTrace.persistFields,
        recipeFields: manjericaoTrace.recipeFields,
        structuredFields: manjericaoTrace.structuredFields,
        conversionHint: manjericaoTrace.conversionHint,
        perUnit: manjericaoTrace.perUnit,
        effective: manjericaoTrace.effective,
      }
    : null,
  manjericaoIngredient,
  manjericaoMatch: manjericaoMatch ?? null,
  priceHistory: priceHistory ?? [],
  aliases: aliases ?? [],
  manjericaoItems: manjericaoItems ?? [],
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log("Audit complete:", OUT);
console.log("Verdict:", verdict);
console.log("Ingredient:", manjericaoIngredient?.id, manjericaoIngredient?.name);
console.log("Invoice item:", manjericaoItem?.id);
console.log("Q7:", q7Math.overallYes ? "YES" : "NO", "operational:", manjericaoTrace?.presentation.effectiveUsableCostLabel);
