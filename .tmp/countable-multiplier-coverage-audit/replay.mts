/**
 * STRICT READ-ONLY Countable Multiplier Coverage Audit — VL bjhnlrgodcqoyzddbpbd
 * Scans ALL invoice_items for countable multiplier patterns; replays parser pipeline.
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
  structuredPurchaseToIngredientFields,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
  resolveUnitsPerPack,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  parsePurchaseStructureFromText,
  summarizePurchaseStructure,
  type PurchaseStructure,
} from "../../src/lib/stock-normalization.ts";
import { defaultIsGenericUnit } from "../../src/lib/ingredient-auto-persist.ts";
import { effectiveIngredientUnitCostEur, resolvedOperationalUnitCostEur } from "../../src/lib/ingredient-unit-cost.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/countable-multiplier-coverage-audit";

const MEASURE_UNIT_TOKEN = String.raw`kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs`;
const MULTIPLIER_SEP = String.raw`(?:x|×|\*|X)`;

/** Candidate: name suggests nested countable pack structure without mass/volume multiplier. */
const COUNTABLE_MULTIPLIER_PATTERNS: Array<{ id: string; re: RegExp; family: string }> = [
  { id: "dozen_unit", re: /\d+(?:[.,]\d+)?\s*d[uú]zias?\b/iu, family: "dozen_countable" },
  { id: "dozen_abbrev", re: /\b\d+(?:[.,]\d+)?\s*dz\b/iu, family: "dozen_countable" },
  { id: "dozen_en", re: /\b\d+(?:[.,]\d+)?\s*dozen\b/iu, family: "dozen_countable" },
  {
    id: "cx_dot_count",
    re: /\b(?:cx|caixa|caixas)\.\s*\d+(?:[.,]\d+)?\b/iu,
    family: "container_dot_count",
  },
  {
    id: "cx_count_no_measure",
    re: new RegExp(
      String.raw`\b(?:cx|caixa|caixas|case|cases|pack|packs)\.?\s*(?<inner>\d+(?:[.,]\d+)?)\s*(?!${MEASURE_UNIT_TOKEN}\b)(?:d[uú]zias?|dz|dozen|un\b|uni|unid|und|uds|pc|pcs|par|pares)\b`,
      "iu",
    ),
    family: "container_countable_inner",
  },
  {
    id: "count_x_countable_unit",
    re: new RegExp(
      String.raw`\b(?<inner>\d+(?:[.,]\d+)?)\s*${MULTIPLIER_SEP}\s*(?<unit>d[uú]zias?|dz|dozen|par|pares)\b`,
      "iu",
    ),
    family: "multiplier_countable_unit",
  },
  {
    id: "container_x_count_no_measure",
    re: new RegExp(
      String.raw`\b(?:cx|caixa|caixas|case|pack)\.?\s*(?<inner>\d+(?:[.,]\d+)?)\s*(?!.*\b${MEASURE_UNIT_TOKEN}\b)`,
      "iu",
    ),
    family: "container_bare_count",
  },
  {
    id: "egg_product",
    re: /\b(?:ovo|ovos|egg|eggs)\b.*(?:cx|caixa|d[uú]zias?|dz|dozen)/iu,
    family: "egg_countable",
  },
  {
    id: "bakery_unit_count_tail",
    re: new RegExp(
      String.raw`\b\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\s+(?<inner>\d+(?:[.,]\d+)?)\s*(?:un|uni|und|unid|pc|pcs)\s*$`,
      "iu",
    ),
    family: "bakery_piece_then_units",
  },
];

/** Which regex tiers would match if we probe individually (for controls + broken rows). */
const TIER_PROBES: Array<{ tier: string; re: RegExp }> = [
  {
    tier: "triple_nested",
    re: new RegExp(
      String.raw`\b\d+(?:[.,]\d+)?\s*(?:bottle|pack|caixa|cx|case)\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\b`,
      "iu",
    ),
  },
  {
    tier: "caixa_units_size",
    re: new RegExp(
      String.raw`\b(?:caixa|cx)\s*\d+(?:[.,]\d+)?\s*(?:un|uni|und|can|lata|garrafa|bottle)\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\b`,
      "iu",
    ),
  },
  {
    tier: "caixa_compact_size",
    re: new RegExp(
      String.raw`\b(?:caixa|cx)\s*\d+(?:[.,]\d+)?\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\b`,
      "iu",
    ),
  },
  {
    tier: "units_size",
    re: new RegExp(
      String.raw`\b\d+(?:[.,]\d+)?\s*(?:un|uni|und|ud|uds|unid|pc|pcs)\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\b`,
      "iu",
    ),
  },
  {
    tier: "size_count",
    re: new RegExp(
      String.raw`\b\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:un|uni|und|ud|uds|unid|pc|pcs)?\b`,
      "iu",
    ),
  },
  {
    tier: "caixa_count_only",
    re: /\b(?:caixa|caixas|cx)\s*(?<inner>\d+(?:[.,]\d+)?)\b/iu,
  },
  {
    tier: "container_with_size",
    re: new RegExp(
      String.raw`\b\d+(?:[.,]\d+)?\s*(?:pack|caixa|cx|case|bottle|garrafa|lata)\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\b`,
      "iu",
    ),
  },
  {
    tier: "count_size",
    re: new RegExp(
      String.raw`\b\d+(?:[.,]\d+)?\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\b`,
      "iu",
    ),
  },
  {
    tier: "embedded_bare_measure",
    re: new RegExp(String.raw`\b\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\b`, "iu"),
  },
];

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

async function fetchAllInvoiceItems() {
  const pageSize = 1000;
  let offset = 0;
  const all: Array<{
    id: string;
    invoice_id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
  }> = [];
  for (;;) {
    const { data, error } = await sb
      .from("invoice_items")
      .select("id,invoice_id,name,quantity,unit,unit_price,total")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
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
  return normalizeInvoiceItemFields(bound);
}

function probeTiers(name: string): string[] {
  return TIER_PROBES.filter((p) => p.re.test(name)).map((p) => p.tier);
}

function detectCandidatePatterns(name: string): Array<{ id: string; family: string; match: string }> {
  const hits: Array<{ id: string; family: string; match: string }> = [];
  for (const p of COUNTABLE_MULTIPLIER_PATTERNS) {
    const m = name.match(p.re);
    if (m) hits.push({ id: p.id, family: p.family, match: m[0] ?? "" });
  }
  return hits;
}

function inferExpectedDenominator(name: string, rowQty: number): { expected: number | null; formula: string | null } {
  const dozen = name.match(/(?:cx|caixa|caixas|case)\.?\s*(\d+(?:[.,]\d+)?)\s*d[uú]zias?/iu);
  if (dozen) {
    const dozens = Number.parseFloat(dozen[1].replace(",", "."));
    if (Number.isFinite(dozens) && dozens > 0) {
      return { expected: Math.round(rowQty * dozens * 12), formula: `${rowQty} cx × ${dozens} dozen × 12` };
    }
  }
  const cxDot = name.match(/\b(?:cx|caixa)\.\s*(\d+(?:[.,]\d+)?)\s*d[uú]zias?/iu);
  if (cxDot) {
    const dozens = Number.parseFloat(cxDot[1].replace(",", "."));
    if (Number.isFinite(dozens) && dozens > 0) {
      return { expected: Math.round(rowQty * dozens * 12), formula: `${rowQty} × ${dozens} dozen × 12 eggs/dozen` };
    }
  }
  const bareDozen = name.match(/(\d+(?:[.,]\d+)?)\s*d[uú]zias?/iu);
  if (bareDozen && /\b(?:ovo|ovos|egg)\b/iu.test(name)) {
    const dozens = Number.parseFloat(bareDozen[1].replace(",", "."));
    if (Number.isFinite(dozens) && dozens > 0) {
      return { expected: Math.round(rowQty * dozens * 12), formula: `${rowQty} × ${dozens} dozen × 12` };
    }
  }
  const cxCount = name.match(/\b(?:cx|caixa)\.?\s*(\d+(?:[.,]\d+)?)\b/iu);
  const embeddedG = name.match(/\b(\d+(?:[.,]\d+)?)\s*g\b/iu);
  if (cxCount && embeddedG && !/\b(?:cl|ml|l|kg)\b/iu.test(name)) {
    const inner = Number.parseFloat(cxCount[1].replace(",", "."));
    if (Number.isFinite(inner) && inner > 1) {
      return { expected: Math.round(rowQty * inner), formula: `${rowQty} cx × ${inner} units (caixa_count_only family)` };
    }
  }
  const unitTail = name.match(/\b(\d+(?:[.,]\d+)?)\s*g\s+(\d+(?:[.,]\d+)?)\s*(?:un|uni|und|unid|pc|pcs)\s*$/iu);
  if (unitTail) {
    const inner = Number.parseFloat(unitTail[2].replace(",", "."));
    if (Number.isFinite(inner) && inner > 1) {
      return { expected: Math.round(rowQty * inner), formula: `${rowQty} × ${inner} units (bakery tail)` };
    }
  }
  return { expected: null, formula: null };
}

type RowStatus = "WORKING" | "BROKEN" | "N_A_VOLUME" | "N_A_OTHER";

function classifyRow(
  item: { name: string; quantity: number | null; unit: string | null; unit_price: number | null; total: number | null },
  structure: PurchaseStructure | null,
  structured: ReturnType<typeof resolveInvoiceLinePurchaseFormat>,
  purchaseQty: number | null,
  expected: number | null,
): { status: RowStatus; reason: string } {
  const hasMeasureMultiplier = new RegExp(
    String.raw`\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})\s*${MULTIPLIER_SEP}\s*\d+|\d+\s*${MULTIPLIER_SEP}\s*\d+(?:[.,]\d+)?\s*(?:${MEASURE_UNIT_TOKEN})`,
    "iu",
  ).test(item.name);

  if (hasMeasureMultiplier && structure?.unitMeasurement !== "un") {
    const usable = structured.normalizedUsableQuantity;
    if (usable != null && usable > 0 && structured.kind !== "row_only") {
      return { status: "N_A_VOLUME", reason: "mass/volume multiplier — handled by measure tiers" };
    }
  }

  if (expected == null) {
    if (structure != null && purchaseQty != null && purchaseQty > 1) {
      return { status: "WORKING", reason: "parser produced structure with denominator" };
    }
    return { status: "N_A_OTHER", reason: "no inferable countable denominator" };
  }

  if (purchaseQty == null || purchaseQty <= 1) {
    return { status: "BROKEN", reason: "expected denominator >1 but purchase_quantity collapsed to 1" };
  }
  if (Math.abs(purchaseQty - expected) / expected > 0.05) {
    return { status: "BROKEN", reason: `purchase_quantity=${purchaseQty} ≠ expected≈${expected}` };
  }
  return { status: "WORKING", reason: `purchase_quantity=${purchaseQty} matches expected ${expected}` };
}

function traceItem(item: {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const bound = bindLine(item);
  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
  };
  const structure = parsePurchaseStructureFromText(bound.name);
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const usableChain = structure
    ? computeUsableFromPurchaseStructure(structure, bound.quantity, bound.unit)
    : null;
  const purchaseQty = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const unitsPerPack = resolveUnitsPerPack(structured);
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective =
    bound.unit_price != null
      ? computeEffectiveUsableCost(bound.unit_price, metadata, structured, bound.name)
      : null;
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const rowQty = bound.quantity ?? 1;
  const { expected, formula } = inferExpectedDenominator(bound.name, rowQty);
  const { status, reason } = classifyRow(item, structure, structured, purchaseQty, expected);
  const patterns = detectCandidatePatterns(bound.name);
  const tierProbes = probeTiers(bound.name);

  return {
    id: item.id,
    invoice_id: item.invoice_id,
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    total: bound.total,
    candidatePatterns: patterns,
    primaryFamily: patterns[0]?.family ?? "none",
    tierProbes,
    parsePurchaseStructureFromText: structure,
    structureSummary: structure ? summarizePurchaseStructure(structure) : null,
    parseTier: structure?.tier ?? null,
    structuredKind: structured.kind,
    normalizedUsableQuantity: structured.normalizedUsableQuantity,
    usableQuantityUnit: structured.usableQuantityUnit,
    usableChain,
    purchaseQty,
    unitsPerPack,
    perUnit,
    effective,
    recipeFields,
    presentation,
    expectedDenominator: expected,
    expectedFormula: formula,
    status,
    statusReason: reason,
    unitCostEur: recipeFields ? resolvedOperationalUnitCostEur(recipeFields) : null,
    effectiveUnitCostEur: recipeFields ? effectiveIngredientUnitCostEur(recipeFields) : null,
    hypotheticalUnitCost:
      expected != null && bound.unit_price != null && expected > 0
        ? bound.unit_price / expected
        : null,
  };
}

const CONTROL_SPECS = [
  { key: "peroni", patterns: ["%Peroni%33cl%24%", "%Peroni Nastro%33cl%"] },
  { key: "pellegrino", patterns: ["%Pellegrino%75cl%15%", "%SanPellegrino%75cl%15%", "%Pellegrino%75cl%"] },
  { key: "nata", patterns: ["%Nata%1L%6%", "%Nata%litro%6%", "%Nata%"] },
  { key: "chocolate", patterns: ["%Chocolate%80g%120%", "%Chocolate%80G%120%", "%Chocolate%"] },
  { key: "acucar", patterns: ["%Açúcar%1kg%10%", "%Acucar%1kg%10%", "%Açúcar%5kg%", "%Acucar%"] },
];

mkdirSync(OUT, { recursive: true });

const allItems = await fetchAllInvoiceItems();
console.log(`Fetched ${allItems.length} invoice_items`);

const candidates = allItems.filter((item) => {
  const patterns = detectCandidatePatterns(item.name ?? "");
  if (patterns.length > 0) return true;
  // Also include any row with multiplier + container but parser might fail
  const name = item.name ?? "";
  if (/\b(?:cx|caixa|pack|case)\b/iu.test(name) && /\d+\s*(?:d[uú]zias?|dz|dozen|un\b|uni|unid)/iu.test(name)) {
    return true;
  }
  if (/\b(?:ovo|ovos|egg|eggs)\b/iu.test(name) && /\d+/u.test(name)) return true;
  return false;
});

const traced = candidates.map((item) => traceItem(item));
const broken = traced.filter((r) => r.status === "BROKEN");
const working = traced.filter((r) => r.status === "WORKING");

const denominatorLossTable = broken.map((r) => ({
  id: r.id,
  name: r.name,
  rowQty: r.quantity,
  rowUnit: r.unit,
  unitPrice: r.unit_price,
  expectedDenominator: r.expectedDenominator,
  expectedFormula: r.expectedFormula,
  actualPurchaseQty: r.purchaseQty,
  parseTier: r.parseTier,
  structuredKind: r.structuredKind,
  unitsPerPack: r.unitsPerPack,
  lossFactor:
    r.expectedDenominator != null && r.purchaseQty != null && r.purchaseQty > 0
      ? r.expectedDenominator / r.purchaseQty
      : null,
  unitCostActual: r.unitCostEur,
  unitCostHypothetical: r.hypotheticalUnitCost,
  primaryFamily: r.primaryFamily,
  candidatePatterns: r.candidatePatterns,
  tierProbes: r.tierProbes,
  statusReason: r.statusReason,
}));

const familyGroups = Object.groupBy(traced, (r) => r.primaryFamily);
const familySummary = Object.fromEntries(
  Object.entries(familyGroups).map(([family, rows]) => [
    family,
    {
      total: rows?.length ?? 0,
      WORKING: rows?.filter((r) => r.status === "WORKING").length ?? 0,
      BROKEN: rows?.filter((r) => r.status === "BROKEN").length ?? 0,
      N_A_VOLUME: rows?.filter((r) => r.status === "N_A_VOLUME").length ?? 0,
      N_A_OTHER: rows?.filter((r) => r.status === "N_A_OTHER").length ?? 0,
      examples: (rows ?? []).slice(0, 3).map((r) => ({ name: r.name, status: r.status, parseTier: r.parseTier })),
    },
  ]),
);

const controls: Record<string, ReturnType<typeof traceItem> & { dbItem: unknown }> = {};
for (const spec of CONTROL_SPECS) {
  let item: (typeof allItems)[0] | undefined;
  for (const pattern of spec.patterns) {
    const { data } = await sb
      .from("invoice_items")
      .select("id,invoice_id,name,quantity,unit,unit_price,total")
      .ilike("name", pattern)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) {
      item = data[0];
      break;
    }
  }
  if (item) {
    const trace = traceItem(item);
    controls[spec.key] = { ...trace, dbItem: item };
  }
}

const architecturalGapOptions = {
  A: "OCR never extracts countable multiplier text",
  B: "Extraction OK but normalization strips multiplier",
  C: "Purchase structure parser fails — no tier for countable-only multipliers (dúzias, cx.N without g/ml)",
  D: "Structure parsed but persistence/costing drops denominator",
};

let architecturalGap = "C";
const brokenWithFullName = broken.filter(
  (r) => r.candidatePatterns.length > 0 && r.name.length > 10,
);
const ocrMissing = brokenWithFullName.filter(
  (r) => !/\d/.test(r.name) || !/(?:d[uú]zias?|cx|caixa|un\b|uni)/iu.test(r.name),
);
if (ocrMissing.length === broken.length && broken.length > 0) architecturalGap = "A";
else if (
  broken.some((r) => r.structuredKind !== "row_only" && r.purchaseQty === 1)
) {
  architecturalGap = "D";
} else if (broken.every((r) => r.parseTier == null)) {
  architecturalGap = "C";
}

const brokenFamilies = new Set(broken.map((r) => r.primaryFamily));
const brokenProductNames = broken.map((r) => r.name);

let finalVerdictABC: "A" | "B" | "C";
let finalVerdictExplanation: string;

if (broken.length === 0) {
  finalVerdictABC = "A";
  finalVerdictExplanation = "No broken countable multiplier rows in VL corpus — gap appears isolated/untriggered.";
} else if (broken.length === 1 && broken[0].name.match(/ovo|egg/iu)) {
  finalVerdictABC = "A";
  finalVerdictExplanation =
    "Only Ovo MORENO Classe M (egg/dozen) is broken; all other countable multiplier candidates parse or N/A. Fixing Ovo is an isolated egg/dozen parser addition.";
} else if (
  broken.length <= 3 &&
  [...brokenFamilies].every((f) =>
    ["dozen_countable", "egg_countable", "container_dot_count", "container_countable_inner"].includes(f),
  )
) {
  finalVerdictABC = "B";
  finalVerdictExplanation = `Small family (${broken.length} rows): ${brokenProductNames.join("; ")} — shared dozen/cx-without-measure pattern, not general mass/volume parser.`;
} else {
  finalVerdictABC = "C";
  finalVerdictExplanation = `General parser gap: ${broken.length} broken rows across families ${[...brokenFamilies].join(", ")} — missing countable-only multiplier tier affects multiple product types.`;
}

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  totalInvoiceItems: allItems.length,
  candidateCount: candidates.length,
  brokenCount: broken.length,
  workingCount: working.length,
  architecturalGap,
  architecturalGapOptions,
  finalVerdictABC,
  finalVerdictQuestion: "If we fix Ovo, only eggs or entire missing parser family?",
  finalVerdictExplanation,
  familySummary,
  denominatorLossTable,
  controls: Object.fromEntries(
    Object.entries(controls).map(([k, v]) => [
      k,
      {
        name: v.name,
        quantity: v.quantity,
        unit: v.unit,
        parseTier: v.parseTier,
        structuredKind: v.structuredKind,
        tierProbes: v.tierProbes,
        structureSummary: v.structureSummary,
        purchaseQty: v.purchaseQty,
        normalizedUsableQuantity: v.normalizedUsableQuantity,
        usableQuantityUnit: v.usableQuantityUnit,
        perUnit: v.perUnit,
        effective: v.effective,
      },
    ]),
  ),
  allCandidates: traced,
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`Wrote ${OUT}/results.json`);
console.log(`Candidates: ${candidates.length}, BROKEN: ${broken.length}, Verdict: ${finalVerdictABC}`);
