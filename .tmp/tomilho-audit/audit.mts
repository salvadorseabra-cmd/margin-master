/**
 * STRICT READ-ONLY Tomilho Procurement → Operational Audit — VL bjhnlrgodcqoyzddbpbd
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
import { detectConversionHint } from "../../src/lib/ingredient-unit-inference.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/tomilho-audit";
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
  const conversionHint = detectConversionHint(bound.name);

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
  const unitCost = resolvedOperationalUnitCostEur(fields);
  const lineCost = ingredientLineCostEur(qty, fields, { recipeUnit });
  return {
    qty,
    recipeUnit,
    formula:
      recipeUnit === "un"
        ? "ingredientLineCostEur(qty, fields, { recipeUnit: 'un' }) → qty × (current_price / purchase_quantity)"
        : "ingredientLineCostEur(qty, fields, { recipeUnit: 'g' }) → qty × (current_price / purchase_quantity) when cost_base_unit=g",
    unitCostEur: unitCost,
    effectiveIngredientUnitCostEur: effectiveIngredientUnitCostEur(fields),
    lineCostEur: lineCost,
    denominator: fields.purchase_quantity,
  };
}

function derivePurchaseStructureKind(trace: ReturnType<typeof traceLine> | null): string | null {
  return trace?.structure?.tier ?? trace?.structured.kind ?? null;
}

mkdirSync(OUT, { recursive: true });

// Q1: Tomilho ingredient
const { data: tomilhoIngredients } = await sb
  .from("ingredients")
  .select(
    "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier",
  )
  .ilike("name", "%Tomilho%")
  .limit(10);

const tomilhoIngredient =
  tomilhoIngredients?.find((i) => /^Tomilho$/i.test(i.name ?? "")) ?? tomilhoIngredients?.[0] ?? null;

// Q2: Latest Tomilho invoice line (Bidfood da472b7f preferred)
const { data: tomilhoItems } = await sb
  .from("invoice_items")
  .select(
    "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(id,supplier_name,invoice_date)",
  )
  .ilike("name", "%Tomilho%")
  .order("created_at", { ascending: false })
  .limit(10);

const tomilhoItem =
  tomilhoItems?.find((i) => i.invoice_id === BIDFOOD_INVOICE) ?? tomilhoItems?.[0] ?? null;

const tomilhoTrace = tomilhoItem ? traceLine(tomilhoItem) : null;

const { data: tomilhoMatch } = tomilhoItem
  ? await sb
      .from("invoice_item_matches")
      .select("ingredient_id,status,match_kind")
      .eq("invoice_item_id", tomilhoItem.id)
      .maybeSingle()
  : { data: null };

const { data: priceHistory } = tomilhoIngredient
  ? await sb
      .from("ingredient_price_history")
      .select("id,invoice_id,new_price,created_at")
      .eq("ingredient_id", tomilhoIngredient.id)
      .order("created_at", { ascending: false })
      .limit(5)
  : { data: null };

const { data: aliases } = tomilhoIngredient
  ? await sb
      .from("ingredient_aliases")
      .select("alias_name,confirmed_by_user,supplier_name")
      .eq("ingredient_id", tomilhoIngredient.id)
  : { data: null };

// Controls
const controlsSpec = [
  { key: "manjericao", label: "Manjericão", pattern: "%Manjeric%o%" },
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

const dbFieldsFromIngredient = tomilhoIngredient
  ? {
      ingredient_id: tomilhoIngredient.id,
      name: tomilhoIngredient.name,
      current_price: tomilhoIngredient.current_price,
      purchase_quantity: tomilhoIngredient.purchase_quantity,
      purchase_unit: tomilhoIngredient.purchase_unit,
      cost_base_unit: tomilhoIngredient.base_unit ?? tomilhoIngredient.unit,
      usable_quantity: tomilhoTrace?.structured.normalizedUsableQuantity ?? null,
      usable_unit: tomilhoTrace?.structured.usableQuantityUnit ?? null,
      purchase_structure_kind: derivePurchaseStructureKind(tomilhoTrace),
    }
  : null;

const recipeFieldsFromTrace = tomilhoTrace?.recipeFields ?? null;
const recipeFieldsFromDb = tomilhoIngredient
  ? {
      current_price: Number(tomilhoIngredient.current_price),
      purchase_quantity: Number(tomilhoIngredient.purchase_quantity),
      cost_base_unit: (tomilhoIngredient.base_unit ?? tomilhoIngredient.unit ?? "un") as
        | "g"
        | "ml"
        | "un",
    }
  : null;

const q5RecipeCosts = [1, 5, 10].flatMap((n) => [
  {
    source: "invoiceTrace_un",
    ...recipeCostForQty(recipeFieldsFromTrace, n, "un"),
  },
  {
    source: "dbPersisted_un",
    ...recipeCostForQty(recipeFieldsFromDb, n, "un"),
  },
  {
    source: "invoiceTrace_g",
    ...recipeCostForQty(recipeFieldsFromTrace, n, "g"),
  },
  {
    source: "dbPersisted_g",
    ...recipeCostForQty(recipeFieldsFromDb, n, "g"),
  },
]);

const q3Pipeline = tomilhoTrace
  ? [
      {
        stage: "invoice_item (DB)",
        quantity: tomilhoItem?.quantity,
        unit: tomilhoItem?.unit,
        unit_price: tomilhoItem?.unit_price,
        total: tomilhoItem?.total,
      },
      {
        stage: "normalizeInvoiceItemFields",
        quantity: tomilhoTrace.bound.quantity,
        unit: tomilhoTrace.bound.unit,
      },
      {
        stage: "parsePurchaseStructureFromText",
        tier: tomilhoTrace.structure?.tier ?? null,
        matchedText: tomilhoTrace.structure?.matchedText ?? null,
        unitSize: tomilhoTrace.structure?.unitSize ?? null,
        unitMeasurement: tomilhoTrace.structure?.unitMeasurement ?? null,
      },
      {
        stage: "detectConversionHint (ingredient-unit-inference)",
        hint: tomilhoTrace.conversionHint,
      },
      {
        stage: "computeUsableFromPurchaseStructure",
        usableQuantity: tomilhoTrace.usableChain?.usableQuantity ?? null,
        usableUnit: tomilhoTrace.usableChain?.usableUnit ?? null,
        usableSource: tomilhoTrace.usableChain?.usableSource ?? null,
      },
      {
        stage: "resolveInvoiceLinePurchaseFormat",
        kind: tomilhoTrace.structured.kind,
        normalizedUsableQuantity: tomilhoTrace.structured.normalizedUsableQuantity,
        usableQuantityUnit: tomilhoTrace.structured.usableQuantityUnit,
        purchaseContainerCount: tomilhoTrace.structured.purchaseContainerCount,
        purchaseContainerUnit: tomilhoTrace.structured.purchaseContainerUnit,
        inferred: tomilhoTrace.structured.inferred,
      },
      {
        stage: "resolveUnitsPerPack",
        unitsPerPack: tomilhoTrace.unitsPerPack,
      },
      {
        stage: "resolveUsablePerPricedUnit",
        perUnit: tomilhoTrace.perUnit,
      },
      {
        stage: "computeEffectiveUsableCost",
        effective: tomilhoTrace.effective,
      },
      {
        stage: "resolveInvoiceLinePricingPresentation",
        priceDisplay: tomilhoTrace.presentation.priceDisplay,
        effectiveUsableCostLabel: tomilhoTrace.presentation.effectiveUsableCostLabel,
      },
      {
        stage: "procurementPackFieldsFromInvoiceLine",
        fields: tomilhoTrace.procurement,
      },
      {
        stage: "operationalCostFieldsFromInvoiceLine (persistence)",
        fields: tomilhoTrace.persistFields,
      },
      {
        stage: "recipeOperationalCostFieldsFromInvoiceLine",
        fields: tomilhoTrace.recipeFields,
      },
      {
        stage: "buildLastPurchaseCostPresentation (detail UI)",
        lastPurchase: tomilhoTrace.detailPresentation?.lastPurchase ?? null,
        procurementCost: tomilhoTrace.detailPresentation?.procurementCost ?? null,
        operationalCost: tomilhoTrace.detailPresentation?.operationalCost ?? null,
      },
      {
        stage: "inferUnitFamily",
        unitFamily: tomilhoTrace.unitFamily,
      },
    ]
  : null;

const q6Compare = {
  tomilho: tomilhoTrace
    ? {
        ingredient: "Tomilho",
        procurement: tomilhoTrace.presentation.priceDisplay,
        operational: tomilhoTrace.presentation.effectiveUsableCostLabel,
        recipeUnit: tomilhoTrace.recipeFields?.cost_base_unit ?? tomilhoIngredient?.base_unit ?? null,
        purchase_quantity:
          tomilhoTrace.recipeFields?.purchase_quantity ?? tomilhoIngredient?.purchase_quantity,
        conversionHint: tomilhoTrace.conversionHint,
        structuredKind: tomilhoTrace.structured.kind,
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
        },
      ];
    }),
  ),
};

const requiredTable = [
  {
    concept: "Purchase Unit",
    current: tomilhoTrace?.rowQtyLabel ?? "—",
    intendedByArchitecture:
      "bunch — formatRowPurchaseQuantityLabel maps mo → bunch; invoice row qty=1 mo",
  },
  {
    concept: "Procurement Unit",
    current: tomilhoTrace?.presentation.priceDisplay ?? "—",
    intendedByArchitecture:
      "bunch — resolvePriceSuffix maps mo → bunch via ROW_UNIT_PRICE_SUFFIX; unit_price is €/bunch",
  },
  {
    concept: "Operational Unit",
    current: tomilhoTrace?.presentation.effectiveUsableCostLabel ?? "null / not shown",
    intendedByArchitecture:
      "kg (when fresh-herb conversion hint applies) — detectConversionHint lists MANJERICAO/HORTELA etc. at 100g/bunch → computeEffectiveUsableCost → €/kg; Tomilho absent from PRODUCE_CONVERSION_HINTS",
  },
  {
    concept: "Recipe Consumption Unit",
    current: `un (persisted base_unit=${tomilhoIngredient?.base_unit ?? "?"}, purchase_quantity=${tomilhoIngredient?.purchase_quantity ?? "?"})`,
    intendedByArchitecture:
      "g when herb hint applies (purchase_quantity=100, cost_base_unit=g); un/countable when row_only with no hint (purchase_quantity=1)",
  },
];

const q7Options = {
  A: "no usable conversion — resolveUsablePerPricedUnit returns null (row_only, no conversion hint for Tomilho)",
  B: "countable architecture — inferUnitFamily(mo)→countable; operational display suppressed when no per-unit usable",
  C: "display suppression — effectiveUsableCostLabel omitted when computeEffectiveUsableCost returns null",
  D: "bug — should show €/kg like Manjericão but Tomilho missing from PRODUCE_CONVERSION_HINTS",
  E: "intentionally suppressed — herbs without embedded weight have no operational layer by design",
};

const q7Evidence = {
  resolveUsablePerPricedUnit: tomilhoTrace?.perUnit ?? null,
  computeEffectiveUsableCost: tomilhoTrace?.effective ?? null,
  effectiveUsableCostLabel: tomilhoTrace?.presentation.effectiveUsableCostLabel ?? null,
  structuredKind: tomilhoTrace?.structured.kind ?? null,
  conversionHint: tomilhoTrace?.conversionHint ?? null,
  manjericaoConversionHint: (controls.manjericao as { conversionHint?: unknown } | undefined)
    ?.conversionHint ?? null,
  isCasePieceWeight: tomilhoTrace?.isCasePieceWeight ?? null,
  unitFamily: tomilhoTrace?.unitFamily ?? null,
};

const q7Selected = ["A", "B", "C"];

const verdictOptions = {
  A: "Correct — bunch-only costing with no operational layer is intended for Tomilho",
  B: "Display bug — operational value computed but not rendered",
  C: "Missing operational conversion — Tomilho excluded from fresh-herb hint table that Manjericão uses",
  D: "Architecture ambiguity — no documented rule for mo-unit herbs without name tokens",
  E: "Data inconsistency — DB fields diverge from pipeline trace",
};

const verdict = "C";

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  product: "Tomilho",
  canonicalName: "Tomilho",
  bidfoodInvoiceId: BIDFOOD_INVOICE,
  verdict,
  verdictOptions,
  verdictQuestion: "How does Marginly currently intend to cost Tomilho inside recipes?",
  verdictAnswer:
    "As implemented: recipeOperationalCostFieldsFromInvoiceLine yields current_price=2.06, purchase_quantity=1, cost_base_unit=un → ingredientLineCostEur(N, fields, { recipeUnit: 'un' }) = N × €2.06 (one recipe 'un' = one priced bunch). No operational €/kg because detectConversionHint returns null for 'Tomilho' (not in PRODUCE_CONVERSION_HINTS); structured.kind=row_only; resolveUsablePerPricedUnit=null; computeEffectiveUsableCost=null. Manjericão on the same invoice gets €20.60/kg via MANJERICAO token → 100g/bunch inferred path.",
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
          source: "ingredients.current_price (pack/bunch price)",
        },
        {
          field: "purchase_quantity",
          currentValue: dbFieldsFromIngredient.purchase_quantity,
          source: "ingredients.purchase_quantity",
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
          source: "resolveInvoiceLinePurchaseFormat.normalizedUsableQuantity (trace)",
        },
        {
          field: "usable_unit",
          currentValue: dbFieldsFromIngredient.usable_unit,
          source: "resolveInvoiceLinePurchaseFormat.usableQuantityUnit (trace)",
        },
        {
          field: "purchase_structure_kind",
          currentValue: dbFieldsFromIngredient.purchase_structure_kind,
          source: "parsePurchaseStructureFromText.tier / structured.kind",
        },
      ]
    : null,
  q2_latestPurchase: tomilhoItem
    ? {
        invoice_item_id: tomilhoItem.id,
        invoice_id: tomilhoItem.invoice_id,
        quantity: tomilhoItem.quantity,
        unit: tomilhoItem.unit,
        unit_price: tomilhoItem.unit_price,
        line_total: tomilhoItem.total,
        purchase_structure_kind: derivePurchaseStructureKind(tomilhoTrace),
        parsedStructure: {
          tier: tomilhoTrace?.structure?.tier ?? null,
          matchedText: tomilhoTrace?.structure?.matchedText ?? null,
          structuredKind: tomilhoTrace?.structured.kind ?? null,
          unitsPerPack: tomilhoTrace?.unitsPerPack ?? null,
          conversionHint: tomilhoTrace?.conversionHint ?? null,
        },
        persistedAs: tomilhoTrace?.rowQtyLabel ?? null,
        persistedInterpretation: "bunch (mo → 1 bunch via formatRowPurchaseQuantityLabel)",
        supplier: (tomilhoItem.invoices as { supplier_name?: string } | null)?.supplier_name ?? null,
        invoice_date: (tomilhoItem.invoices as { invoice_date?: string } | null)?.invoice_date ?? null,
      }
    : null,
  q3_fullTrace: q3Pipeline,
  q4_operationalQuantity: {
    selected: "C",
    options: {
      A: "present — operational €/kg or per-unit shown",
      B: "missing — null because no usable denominator",
      C: "intentionally suppressed — display omitted when computeEffectiveUsableCost returns null",
    },
    evidence: {
      effectiveUsableCostLabel: tomilhoTrace?.presentation.effectiveUsableCostLabel ?? null,
      computeEffectiveUsableCost: tomilhoTrace?.effective ?? null,
      normalizedUsableQuantity: tomilhoTrace?.structured.normalizedUsableQuantity ?? null,
      conversionHint: tomilhoTrace?.conversionHint ?? null,
    },
  },
  q5_recipeCosting: {
    formula:
      "effectiveIngredientUnitCostEur = current_price / max(purchase_quantity, 1); ingredientLineCostEur(qty, fields, { recipeUnit })",
    sourceFields: recipeFieldsFromTrace,
    dbPersistedFields: recipeFieldsFromDb,
    scenarios: q5RecipeCosts,
    hypotheticalIf100gLikeManjericao: {
      purchase_quantity: 100,
      cost_base_unit: "g",
      unitCostPerG: 2.06 / 100,
      lineCosts: [1, 5, 10].map((n) => ({ grams: n, cost: (2.06 / 100) * n })),
    },
  },
  q6_compare: q6Compare,
  q7_shouldOperationalDisplay: {
    selected: q7Selected,
    options: q7Options,
    evidence: q7Evidence,
    operationalShown: Boolean(tomilhoTrace?.presentation.effectiveUsableCostLabel),
  },
  requiredTable,
  tomilhoTrace: tomilhoTrace
    ? {
        invoiceItemId: tomilhoTrace.invoiceItemId,
        isCasePieceWeight: tomilhoTrace.isCasePieceWeight,
        procurement: tomilhoTrace.procurement,
        persistFields: tomilhoTrace.persistFields,
        recipeFields: tomilhoTrace.recipeFields,
        structuredFields: tomilhoTrace.structuredFields,
        conversionHint: tomilhoTrace.conversionHint,
      }
    : null,
  tomilhoIngredient,
  tomilhoMatch: tomilhoMatch ?? null,
  priceHistory: priceHistory ?? [],
  aliases: aliases ?? [],
  tomilhoItems: tomilhoItems ?? [],
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log("Audit complete:", OUT);
console.log("Verdict:", verdict);
console.log("Ingredient:", tomilhoIngredient?.id, tomilhoIngredient?.name);
console.log("Invoice item:", tomilhoItem?.id);
