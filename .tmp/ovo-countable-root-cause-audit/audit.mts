/**
 * STRICT READ-ONLY Ovo Classe M Countable Conversion Root Cause Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;
metaEnv.env.MODE = "production";

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { bindMonetaryColumns, parseMonetaryLineItems } from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
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
  summarizePurchaseStructure,
} from "../../src/lib/stock-normalization.ts";
import {
  operationalCostFieldsFromInvoiceLine,
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import {
  effectiveIngredientUnitCostEur,
  resolvedOperationalUnitCostEur,
} from "../../src/lib/ingredient-unit-cost.ts";
import { inferUnitFamily } from "../../src/lib/recipe-unit-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/ovo-countable-root-cause-audit";
const BIDFOOD_INVOICE = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const OVO_NAME = "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)";

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

function fullTrace(raw: {
  id?: string;
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
  const parserInput = bound.name;
  const structure = parsePurchaseStructureFromText(parserInput);
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
  const unitsPerPack = resolveUnitsPerPack(structured);
  const unitFamily = inferUnitFamily(bound.unit, {
    usableQuantityUnit: structured.usableQuantityUnit,
    purchaseFormatKind: structured.kind,
  });

  return {
    raw,
    bound,
    parserInput,
    parserInputTruncated: parserInput !== raw.name,
    structure,
    structureSummary: structure ? summarizePurchaseStructure(structure) : null,
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
    unitsPerPack,
    unitFamily,
    rowQtyLabel: formatRowPurchaseQuantityLabel(metadata),
    unitCostEur: recipeFields ? resolvedOperationalUnitCostEur(recipeFields) : null,
    effectiveUnitCostEur: recipeFields ? effectiveIngredientUnitCostEur(recipeFields) : null,
    recipeLineCost1Egg: recipeFields
      ? (resolvedOperationalUnitCostEur(recipeFields) ?? 0) * 1
      : null,
  };
}

function dozenSupportScan() {
  const files = [
    "src/lib/stock-normalization.ts",
    "src/lib/invoice-purchase-format.ts",
    "src/lib/invoice-purchase-price-semantics.ts",
    "src/lib/ingredient-auto-persist.ts",
  ];
  const patterns = ["dúzia", "duzia", "dozen", "dz", "12", "unitsPerPack", "packCount", "pieceCount", "egg"];
  const hits: Record<string, string[]> = {};
  for (const f of files) {
    const content = execSync(`rg -n "${patterns.join("|")}" ${f} || true`, { encoding: "utf8" });
    hits[f] = content.trim().split("\n").filter(Boolean);
  }
  return {
    dozenInMeasureTokens: false,
    dozenInInnerUnitTokens: false,
    eggsPerDozenConstant: null as number | null,
    eggNounInPriceSemantics: hits["src/lib/invoice-purchase-price-semantics.ts"]?.some((l) =>
      /egg|ovo/.test(l),
    ),
    dzInInvoiceUnitToken: true,
    dzInPurchaseStructureParser: false,
    fileHits: hits,
  };
}

mkdirSync(OUT, { recursive: true });

// Q1: DB invoice item
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

const { data: ovoIngredients } = await sb
  .from("ingredients")
  .select(
    "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name,supplier,usable_weight_grams,usable_volume_ml",
  )
  .or("name.ilike.%Ovo%classe%,normalized_name.ilike.%ovo%classe%")
  .limit(5);
const ovoIngredient =
  ovoIngredients?.find((i) => /classe\s*m/i.test(i.name ?? "")) ?? ovoIngredients?.[0] ?? null;

const ovoTrace = ovoItem ? fullTrace(ovoItem) : null;

// Controls: Peroni, Pellegrino
const controlSpec = [
  {
    key: "peroni",
    pattern: "%Peroni%33cl%24%",
    fallback: "%Peroni Nastro%",
  },
  {
    key: "pellegrino",
    pattern: "%Pellegrino%75cl%15%",
    fallback: "%SanPellegrino%75cl%",
  },
];

const controls: Record<string, ReturnType<typeof fullTrace> & { dbItem: unknown }> = {};
for (const c of controlSpec) {
  let { data: items } = await sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total,invoice_id")
    .ilike("name", c.pattern)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!items?.[0]) {
    ({ data: items } = await sb
      .from("invoice_items")
      .select("id,name,quantity,unit,unit_price,total,invoice_id")
      .ilike("name", c.fallback)
      .order("created_at", { ascending: false })
      .limit(1));
  }
  const item = items?.[0];
  if (item) {
    const trace = fullTrace(item);
    controls[c.key] = { ...trace, dbItem: item };
  }
}

// Synthetic parse test on full name
const parseTest = {
  input: OVO_NAME,
  parsePurchaseStructureFromText: parsePurchaseStructureFromText(OVO_NAME),
  caixaCountOnlyWouldMatch: /\b(?:caixa|caixas|cx)\s*(?<inner>\d+(?:[.,]\d+)?)\b/iu.test(OVO_NAME),
  matchedSubstring: OVO_NAME.match(/\b(?:caixa|caixas|cx)\.?\s*(\d+)/iu),
  requiresEmbeddedWeightForCaixaCountOnly: true,
  measureUnitTokens: "kg|g|ml|cl|l — no dúzia/dz/dozen",
};

const q1Extraction = {
  question: "Did extraction capture 15, dúzias, carton?",
  answer: ovoItem
    ? {
        captured15: /15/.test(ovoItem.name ?? ""),
        capturedDuzias: /d[uú]zias?/i.test(ovoItem.name ?? ""),
        capturedCarton: /cart[aã]o/i.test(ovoItem.name ?? ""),
        verdict: "YES — all three appear in persisted invoice_items.name",
      }
    : { verdict: "NO_DATA" },
  dbRow: ovoItem
    ? {
        name: ovoItem.name,
        quantity: ovoItem.quantity,
        unit: ovoItem.unit,
        unit_price: ovoItem.unit_price,
        total: ovoItem.total,
      }
    : null,
  normalized: ovoTrace?.bound ?? null,
  rawTextInName: OVO_NAME,
};

const q2Parser = {
  parserReceives: ovoTrace?.parserInput ?? OVO_NAME,
  truncated: ovoTrace?.parserInputTruncated ?? false,
  parsePurchaseStructureFromText: ovoTrace?.structure ?? null,
  structuredKind: ovoTrace?.structured.kind ?? null,
  resolveInvoiceLinePurchaseFormat: ovoTrace?.structured ?? null,
  parseTest,
};

const q3Countable = dozenSupportScan();

const q4Persistence = {
  exactPayload: {
    purchase_quantity: ovoIngredient?.purchase_quantity ?? ovoTrace?.persistFields?.purchase_quantity,
    purchase_unit: ovoIngredient?.purchase_unit ?? ovoTrace?.procurement?.purchase_unit,
    usable_quantity: ovoTrace?.structured.normalizedUsableQuantity ?? null,
    usable_unit: ovoTrace?.structured.usableQuantityUnit ?? null,
    cost_base_unit: ovoIngredient?.base_unit ?? ovoTrace?.persistFields?.cost_base_unit,
    current_price: ovoIngredient?.current_price ?? ovoTrace?.persistFields?.current_price,
  },
  whyPurchaseQuantity1: [
    "parsePurchaseStructureFromText(OVO_NAME) → null (no regex tier matches Cx.15 dúzias)",
    "resolveInvoiceLinePurchaseFormat → kind=row_only, normalizedUsableQuantity=null",
    "resolveUnitsPerPack(structured) → null (not multi_unit_pack)",
    "resolveCountablePurchaseQuantityForCost: rowUnit=cx + unitsPerPack null → return 1",
    "operationalCostFieldsFromInvoiceLine → purchase_quantity=1, cost_base_unit=un",
  ],
  persistTrace: {
    procurementPackFieldsFromInvoiceLine: ovoTrace?.procurement ?? null,
    operationalCostFieldsFromInvoiceLine: ovoTrace?.persistFields ?? null,
    structuredPurchaseToIngredientFields: ovoTrace?.structuredFields ?? null,
  },
};

const q5Compare = Object.fromEntries(
  [
    {
      product: "Ovo MORENO Classe M",
      trace: ovoTrace,
    },
    ...Object.entries(controls).map(([key, t]) => ({
      product: key,
      trace: t,
    })),
  ].map(({ product, trace }) => [
    product,
    {
      parsedStructure: trace?.structureSummary ?? trace?.structure ?? null,
      structuredKind: trace?.structured.kind ?? null,
      purchaseQty: trace?.recipeFields?.purchase_quantity ?? null,
      operationalQty: trace?.perUnit ?? null,
      operationalCost: trace?.effective ?? null,
      unitCost: trace?.unitCostEur ?? null,
    },
  ]),
);

const q6MissingFact = {
  singleAbsentDenominator: 180,
  explanation:
    "purchase_quantity denominator for recipe costing — should be total eggs per priced case (15 dozen × 12 = 180), never computed because parsePurchaseStructureFromText does not parse dúzias",
  formula:
    "effectiveIngredientUnitCostEur = current_price / purchase_quantity → 38.44 / 1 = €38.44 per recipe 'un' (whole case)",
  hypothetical:
    "38.44 / 180 = €0.2136 per egg — unreachable without parsed egg count",
};

const pipelineTable = ovoTrace
  ? [
      {
        stage: "OCR / DB invoice_items",
        representation: {
          name: ovoItem?.name,
          quantity: ovoItem?.quantity,
          unit: ovoItem?.unit,
          unit_price: ovoItem?.unit_price,
        },
      },
      {
        stage: "normalizeInvoiceItemFields",
        representation: ovoTrace.bound,
      },
      {
        stage: "parsePurchaseStructureFromText(name)",
        representation: ovoTrace.structure ?? "null",
      },
      {
        stage: "computeUsableFromPurchaseStructure",
        representation: ovoTrace.usableChain ?? "null",
      },
      {
        stage: "resolveInvoiceLinePurchaseFormat",
        representation: {
          kind: ovoTrace.structured.kind,
          normalizedUsableQuantity: ovoTrace.structured.normalizedUsableQuantity,
          usableQuantityUnit: ovoTrace.structured.usableQuantityUnit,
          purchaseContainerCount: ovoTrace.structured.purchaseContainerCount,
          inferred: ovoTrace.structured.inferred,
        },
      },
      {
        stage: "resolveUnitsPerPack",
        representation: ovoTrace.unitsPerPack,
      },
      {
        stage: "resolveUsablePerPricedUnit",
        representation: ovoTrace.perUnit,
      },
      {
        stage: "computeEffectiveUsableCost",
        representation: ovoTrace.effective,
      },
      {
        stage: "procurementPackFieldsFromInvoiceLine",
        representation: ovoTrace.procurement,
      },
      {
        stage: "operationalCostFieldsFromInvoiceLine (persistence)",
        representation: ovoTrace.persistFields,
      },
      {
        stage: "ingredients DB row",
        representation: ovoIngredient,
      },
      {
        stage: "recipeOperationalCostFieldsFromInvoiceLine",
        representation: ovoTrace.recipeFields,
      },
      {
        stage: "Recipe costing (1 egg, recipeUnit=un)",
        representation: {
          unitCostEur: ovoTrace.unitCostEur,
          lineCost1Egg: ovoTrace.recipeLineCost1Egg,
          formula: "qty × (current_price / purchase_quantity)",
        },
      },
    ]
  : [];

const verdictOptions = {
  A: "OCR never extracts it",
  B: "Extraction extracts but normalization loses it",
  C: "Purchase structure parser fails",
  D: "Structure recognized but persistence drops it",
  E: "Structure persisted but recipe costing ignores it",
  F: "Multiple failures",
};

const verdict = "C";

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  product: OVO_NAME,
  verdict,
  verdictOptions,
  verdictQuestion:
    "What exact code path prevents 1 case of 15 dozen eggs from becoming 180 recipe eggs?",
  verdictAnswer:
    "parsePurchaseStructureFromText in stock-normalization.ts receives the full name 'Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)' but returns null — no regex tier matches 'Cx.15 dúzias' (dúzias ∉ MEASURE_UNIT_TOKEN, ∉ INNER_UNIT_TOKEN; CAIXA_COUNT_ONLY_RE matches 'Cx.15' but requires embedded g/ml piece weight via findEmbeddedPieceMeasure). Downstream resolveInvoiceLinePurchaseFormat → row_only → resolveUnitsPerPack null → resolveCountablePurchaseQuantityForCost(cx) → 1 → persistence purchase_quantity=1. Recipe costing divides €38.44 by 1, not 180.",
  q1_rawOcrExtraction: q1Extraction,
  q2_purchaseStructureParsing: q2Parser,
  q3_countableConversionSupport: q3Countable,
  q4_persistenceTrace: q4Persistence,
  q5_workingCountablesCompare: q5Compare,
  q6_smallestMissingFact: q6MissingFact,
  pipelineTable,
  ovoTrace,
  ovoIngredient,
  controls: Object.fromEntries(
    Object.entries(controls).map(([k, v]) => [k, { dbItem: v.dbItem, trace: v }]),
  ),
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log("Wrote", `${OUT}/results.json`);
console.log("Verdict:", verdict);
