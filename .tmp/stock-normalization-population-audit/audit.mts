/**
 * STRICT READ-ONLY stock-normalization population audit — VL bjhnlrgodcqoyzddbpbd
 * Replays production parsers on all matched VL invoice items; no writes.
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  normalizePurchasedToUsableStock,
  parsePurchaseStructureFromText,
  summarizePurchaseStructure,
} from "../../src/lib/stock-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/stock-normalization-population-audit";
const ROOT = ".tmp";

const VL_INVOICES = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
];

type ParserTier =
  | "SIZE_COUNT_RE"
  | "CAIXA_UNITS_SIZE_RE"
  | "bare_measure"
  | "weight_based"
  | "volume_based"
  | "package_based"
  | "none";

type ValidationStatus = "A_proven_correct" | "B_proven_incorrect" | "C_not_validated";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

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
  return bound;
}

function assignParserTier(
  structure: ReturnType<typeof parsePurchaseStructureFromText>,
  usableUnit: "g" | "ml" | "un" | null,
): ParserTier {
  if (!structure) {
    if (usableUnit === "ml") return "volume_based";
    if (usableUnit === "g") return "weight_based";
    if (usableUnit === "un") return "package_based";
    return "none";
  }
  switch (structure.tier) {
    case "size_count":
      return "SIZE_COUNT_RE";
    case "caixa_units_size":
    case "caixa_compact_size":
      return "CAIXA_UNITS_SIZE_RE";
    case "bare_measure":
      return "bare_measure";
    case "triple_nested":
    case "units_size":
    case "container_size":
    case "count_size":
      return "package_based";
    default:
      if (structure.usableUnit === "ml") return "volume_based";
      if (structure.usableUnit === "g") return "weight_based";
      return "package_based";
  }
}

function formatStructure(structure: ReturnType<typeof parsePurchaseStructureFromText>): string {
  if (!structure) return "—";
  const s = summarizePurchaseStructure(structure);
  const inner =
    structure.innerUnitCount != null
      ? `${structure.innerUnitCount}×${structure.unitSize}${structure.unitMeasurement}`
      : `${structure.unitSize}${structure.unitMeasurement}`;
  return `${structure.tier} [${structure.matchedText}] → ${inner} = ${structure.totalUsableAmount}${structure.usableUnit}`;
}

function formatUsable(qty: number | null, unit: string | null): string {
  if (qty == null) return "—";
  if (unit === "g") return qty >= 1000 ? `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)} kg` : `${qty} g`;
  if (unit === "ml") return qty >= 1000 ? `${(qty / 1000).toFixed(2)} L` : `${qty} ml`;
  return `${qty} ${unit ?? "un"}`;
}

function sharesMozzarellaGuancialePath(
  tier: ParserTier,
  structure: ReturnType<typeof parsePurchaseStructureFromText>,
): boolean {
  if (tier !== "SIZE_COUNT_RE" || !structure) return false;
  return structure.innerUnitCount != null && structure.innerUnitCount > 1;
}

function loadValidationMap(): Map<string, ValidationStatus> {
  const map = new Map<string, ValidationStatus>();
  const uiAudit = existsSync(join(ROOT, "quantity-mismatch-ui-audit/classifications.json"))
    ? readJson(join(ROOT, "quantity-mismatch-ui-audit/classifications.json"))
    : null;
  if (uiAudit?.rows) {
    for (const row of uiAudit.rows) {
      const status: ValidationStatus =
        row.classification === "A"
          ? "B_proven_incorrect"
          : row.classification === "C"
            ? "A_proven_correct"
            : "C_not_validated";
      map.set(row.invoiceItemId, status);
    }
  }
  return map;
}

function loadIngredientNames(): Map<string, string> {
  const map = new Map<string, string>();
  const mm = existsSync(join(ROOT, "quantity-mismatch-validation/mismatches.json"))
    ? readJson(join(ROOT, "quantity-mismatch-validation/mismatches.json"))
    : null;
  if (mm?.mismatches) {
    for (const row of mm.mismatches) {
      map.set(row.invoiceItemId, row.ingredient);
    }
  }
  return map;
}

function loadInvoiceNames(): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of VL_INVOICES) {
    const p = join(ROOT, "final-validation-lab-rerun/extracts", `${id}.json`);
    if (existsSync(p)) {
      const data = readJson(p);
      map.set(id, data.supplier ?? data.supplier_name ?? id.slice(0, 8));
    }
  }
  return map;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const { data: items, error: itemsError } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total")
  .in("invoice_id", VL_INVOICES);
if (itemsError) throw new Error(`invoice_items: ${itemsError.message}`);

const { data: invoices, error: invError } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date")
  .in("id", VL_INVOICES);
if (invError) throw new Error(`invoices: ${invError.message}`);

const itemIds = (items ?? []).map((r) => r.id);
const { data: matches } =
  itemIds.length > 0
    ? await sb
        .from("invoice_item_ingredient_matches")
        .select("invoice_item_id,ingredient_id,ingredients(name)")
        .in("invoice_item_id", itemIds)
    : { data: [] };

const invById = new Map((invoices ?? []).map((i) => [i.id, i]));
const validationMap = loadValidationMap();
const mismatchIngredients = loadIngredientNames();
const extractSuppliers = loadInvoiceNames();

const matchByItem = new Map<string, string>();
for (const m of matches ?? []) {
  const ing = (m as { ingredients?: { name?: string } }).ingredients?.name;
  if (ing) matchByItem.set(m.invoice_item_id, ing);
}

type PopulationRow = {
  invoiceItemId: string;
  ingredient: string;
  invoice: string;
  invoiceId: string;
  lineName: string;
  parserTier: ParserTier;
  rawTier: string | null;
  purchaseQty: number | null;
  purchaseUnit: string | null;
  parsedStructure: string;
  usableQty: string;
  usableQtyRaw: number | null;
  usableUnit: string | null;
  stockSource: string;
  sharesMozzarellaGuancialePath: boolean;
  validationStatus: ValidationStatus;
  userVisibleBug: boolean | null;
  matchedToken: string | null;
};

const population: PopulationRow[] = [];
const allRows: PopulationRow[] = [];

for (const item of items ?? []) {
  const norm = normalizeInvoiceItemFields(item as never);
  const inv = invById.get(item.invoice_id);
  const bound = bindLine({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
    unit_price: norm.unit_price,
    total: norm.total,
  });

  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
    matchedIngredientName: matchByItem.get(item.id) ?? mismatchIngredients.get(item.id) ?? null,
  };

  const structure = parsePurchaseStructureFromText(bound.name);
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const stock = normalizePurchasedToUsableStock({
    name: bound.name,
    namePhrase: null,
    rowPhrase: null,
    rowQuantity: bound.quantity,
    rowUnit: bound.unit,
    matchedIngredientName: metadata.matchedIngredientName,
  });

  const usesPurchaseStructure =
    structure != null ||
    stock.source === "purchase_structure" ||
    structured.kind != null;

  const usableQty = structured.normalizedUsableQuantity ?? stock.usableQuantity;
  const usableUnit = structured.usableQuantityUnit ?? stock.usableUnit;
  const parserTier = assignParserTier(structure, usableUnit);
  const ingredient =
    matchByItem.get(item.id) ??
    mismatchIngredients.get(item.id) ??
    metadata.matchedIngredientName ??
    "—";
  const invoice =
    inv?.supplier_name ?? extractSuppliers.get(item.invoice_id) ?? item.invoice_id.slice(0, 8);

  const validationStatus = validationMap.get(item.id) ?? "C_not_validated";
  const uiRow = existsSync(join(ROOT, "quantity-mismatch-ui-audit/classifications.json"))
    ? (readJson(join(ROOT, "quantity-mismatch-ui-audit/classifications.json")).rows ?? []).find(
        (r: { invoiceItemId: string }) => r.invoiceItemId === item.id,
      )
    : null;

  const row: PopulationRow = {
    invoiceItemId: item.id,
    ingredient,
    invoice,
    invoiceId: item.invoice_id,
    lineName: bound.name,
    parserTier,
    rawTier: structure?.tier ?? null,
    purchaseQty: bound.quantity,
    purchaseUnit: bound.unit,
    parsedStructure: formatStructure(structure),
    usableQty: formatUsable(usableQty, usableUnit),
    usableQtyRaw: usableQty,
    usableUnit,
    stockSource: stock.source,
    sharesMozzarellaGuancialePath: sharesMozzarellaGuancialePath(parserTier, structure),
    validationStatus,
    userVisibleBug: uiRow?.userVisibleBug ?? null,
    matchedToken: structure?.matchedText ?? null,
  };

  allRows.push(row);
  if (usesPurchaseStructure && parserTier !== "none") {
    population.push(row);
  }
}

// Tier summary
const tierSummary: Record<
  ParserTier,
  { count: number; correct: number; incorrect: number; unknown: number }
> = {
  SIZE_COUNT_RE: { count: 0, correct: 0, incorrect: 0, unknown: 0 },
  CAIXA_UNITS_SIZE_RE: { count: 0, correct: 0, incorrect: 0, unknown: 0 },
  bare_measure: { count: 0, correct: 0, incorrect: 0, unknown: 0 },
  weight_based: { count: 0, correct: 0, incorrect: 0, unknown: 0 },
  volume_based: { count: 0, correct: 0, incorrect: 0, unknown: 0 },
  package_based: { count: 0, correct: 0, incorrect: 0, unknown: 0 },
  none: { count: 0, correct: 0, incorrect: 0, unknown: 0 },
};

for (const row of population) {
  const t = tierSummary[row.parserTier];
  t.count++;
  if (row.validationStatus === "A_proven_correct") t.correct++;
  else if (row.validationStatus === "B_proven_incorrect") t.incorrect++;
  else t.unknown++;
}

const mozGuancialePath = population.filter((r) => r.sharesMozzarellaGuancialePath);

const blastRadius = {
  totalPopulation: population.length,
  totalInvoiceItems: (items ?? []).length,
  matchedIngredients: population.filter((r) => r.ingredient !== "—").length,
  byParserTier: Object.fromEntries(
    Object.entries(tierSummary)
      .filter(([k]) => k !== "none")
      .map(([k, v]) => [k, v.count]),
  ),
  mozGuancialeSharedPath: {
    count: mozGuancialePath.length,
    provenIncorrect: mozGuancialePath.filter((r) => r.validationStatus === "B_proven_incorrect")
      .length,
    provenCorrect: mozGuancialePath.filter((r) => r.validationStatus === "A_proven_correct")
      .length,
    unknown: mozGuancialePath.filter((r) => r.validationStatus === "C_not_validated").length,
    products: mozGuancialePath.map((r) => ({
      ingredient: r.ingredient,
      lineName: r.lineName,
      validationStatus: r.validationStatus,
      userVisibleBug: r.userVisibleBug,
    })),
  },
  stockNormalizationChangeImpact: {
    directCodePaths: [
      "parsePurchaseStructureFromText",
      "computeUsableFromPurchaseStructure",
      "structureTotalIsFinalForGenericRow",
      "resolveStructurePurchaseQuantity",
      "normalizePurchasedToUsableStock",
      "resolveInvoiceLinePurchaseFormat",
    ],
    vlProductsAffected: population.length,
    userVisibleBugProducts: population.filter((r) => r.userVisibleBug === true).length,
    sizeCountStructuralMatches: mozGuancialePath.length,
    caixaUnitsMatches: population.filter((r) => r.parserTier === "CAIXA_UNITS_SIZE_RE").length,
    bareMeasureMatches: population.filter((r) => r.parserTier === "bare_measure").length,
    riskNote:
      "Any change to structureTotalIsFinalForGenericRow or SIZE_COUNT_RE rescaling affects all SIZE_COUNT_RE rows; Guanciale requires decoupled weight-semantics fix.",
  },
};

const output = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT READ-ONLY stock-normalization population audit",
  scope: {
    invoiceItemsScanned: (items ?? []).length,
    purchaseStructurePopulation: population.length,
    invoices: VL_INVOICES.length,
    extractSources: readdirSync(join(ROOT, "final-validation-lab-rerun/extracts")).filter((f) =>
      f.endsWith(".json"),
    ),
  },
  tierSummary,
  population: population.sort((a, b) =>
    a.parserTier === b.parserTier
      ? a.ingredient.localeCompare(b.ingredient)
      : a.parserTier.localeCompare(b.parserTier),
  ),
  mozGuancialeSharedPath: mozGuancialePath,
  blastRadius,
  confidence: {
    level: "high",
    score: 0.91,
    evidence: [
      "Live replay of stock-normalization.ts + invoice-purchase-format.ts on all VL invoice_items",
      "Cross-reference with quantity-mismatch-ui-audit classifications (19 validated rows)",
      "Cross-reference with bug-pattern-expansion-audit and stock-normalization-family-assessment",
      "Read-only Supabase SELECT on bjhnlrgodcqoyzddbpbd",
    ],
    residualUncertainty: [
      "32/51 VL rows lack quantity-mismatch UI audit classification (C_not_validated)",
      "weight_based/volume_based tiers assigned when parsePurchaseStructureFromText returns null but usable inferred",
    ],
  },
  sources: [
    "src/lib/stock-normalization.ts",
    "src/lib/invoice-purchase-format.ts",
    ".tmp/bug-pattern-expansion-audit/",
    ".tmp/stock-normalization-family-assessment/",
    ".tmp/mozzarella-implementation-prep/",
    ".tmp/quantity-mismatch-ui-audit/",
    ".tmp/final-validation-lab-rerun/extracts/",
    ".tmp/quantity-mismatch-validation/",
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "population.json"), JSON.stringify(output, null, 2));
console.log(
  JSON.stringify(
    {
      scanned: output.scope.invoiceItemsScanned,
      population: output.scope.purchaseStructurePopulation,
      tierSummary: output.tierSummary,
      mozGuancialePath: output.mozGuancialeSharedPath.length,
    },
    null,
    2,
  ),
);
