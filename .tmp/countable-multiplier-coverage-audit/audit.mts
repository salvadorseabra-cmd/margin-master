/**
 * STRICT READ-ONLY Countable Multiplier Coverage Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;
metaEnv.env.MODE = "production";

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveUnitsPerPack,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  parsePurchaseStructureFromText,
  summarizePurchaseStructure,
} from "../../src/lib/stock-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/countable-multiplier-coverage-audit";

const VL_INVOICES = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
];

const MEASURE_UNIT_RE = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs)\b/i;

const FAMILY_PATTERNS: Record<string, RegExp> = {
  dozen: /\b(d[uú]zias?|dozens?|dozen)\b/i,
  unit: /\b(unidades?|unids?|units?|\bovos?\b|\bovo\b)\b/i,
  capsule: /\b(c[aá]psulas?|capsulas?|doses?|saquetas?|envelopes?|sticks?|tablets?|comprimidos?|\btabs?\b)\b/i,
  portion: /\b(por[cç][oõ]es?|porcoes?)\b/i,
  multiplier: /\b(?:x\s*(?:12|24|48|100)|(?:12|24|48|100)\s*x)\b/i,
};

const CORPUS_SCAN_RE = new RegExp(
  [
    "d[uú]zias?",
    "duzia",
    "dozen",
    "ovos?",
    "\\bovo\\b",
    "unidades?",
    "unids?",
    "c[aá]psulas?",
    "capsulas?",
    "doses?",
    "saquetas?",
    "envelopes?",
    "sticks?",
    "por[cç][oõ]es?",
    "porcoes?",
    "tablets?",
    "comprimidos?",
    "\\btabs\\b",
    "x12",
    "x24",
    "x48",
    "x100",
    "12x",
    "24x",
    "48x",
    "100x",
    "cx\\.\\s*\\d+",
    "\\bcx\\s+\\d+",
  ].join("|"),
  "iu",
);

const CONTROL_SPECS = [
  { key: "peroni", label: "Peroni 24x33cl", patterns: ["%Peroni%33cl%24%", "%Peroni Nastro%"] },
  { key: "pellegrino", label: "Pellegrino 15x75cl", patterns: ["%Pellegrino%75cl%15%", "%SanPellegrino%75cl%"] },
  { key: "nata", label: "Nata 6x1L", patterns: ["%Nata%6x1%", "%Nata%Reny%Picot%"] },
  { key: "chocolate", label: "Chocolate 10x200g", patterns: ["%Chocolate%10x200%", "%Chocolate%Pantagruel%"] },
  { key: "acucar", label: "Açúcar 10x1kg", patterns: ["%açúcar%10x1%", "%acucar%10x1%"] },
];

type Status = "SAFE" | "BROKEN" | "PARTIAL";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

function parseNum(s: string): number {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
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

function detectMatchedPatterns(name: string): string[] {
  const hits: string[] = [];
  for (const [key, re] of Object.entries(FAMILY_PATTERNS)) {
    if (re.test(name)) hits.push(key);
  }
  if (/\bcx\.?\s*\d+/i.test(name)) hits.push("cx_count");
  if (CORPUS_SCAN_RE.test(name) && hits.length === 0) hits.push("corpus_other");
  return [...new Set(hits)];
}

function classifyFamily(hits: string[]): string {
  if (hits.includes("dozen")) return "Dozen";
  if (hits.includes("capsule")) return "Capsule";
  if (hits.includes("portion")) return "Portion";
  if (hits.includes("unit") || hits.includes("cx_count")) return "Unit";
  if (hits.includes("multiplier")) return "Other";
  return "Other";
}

/** Countable-only multiplier (no g/ml/cl/kg in the multiplier phrase). */
function isCountableOnlyMultiplier(name: string): boolean {
  if (FAMILY_PATTERNS.dozen!.test(name)) return true;
  if (FAMILY_PATTERNS.capsule!.test(name)) return true;
  if (FAMILY_PATTERNS.portion!.test(name)) return true;

  const cxMatch = name.match(/\bcx\.?\s*(\d+(?:[.,]\d+)?)/i);
  if (cxMatch) {
    const after = name.slice((cxMatch.index ?? 0) + cxMatch[0].length, (cxMatch.index ?? 0) + cxMatch[0].length + 30);
    if (!MEASURE_UNIT_RE.test(after) && !/\bx\s*\d/i.test(after.replace(/d[uú]zias?/i, ""))) {
      if (FAMILY_PATTERNS.dozen!.test(name) || FAMILY_PATTERNS.unit!.test(name)) return true;
      if (/\bcx\.?\s*\d+/i.test(name) && !MEASURE_UNIT_RE.test(name)) {
        const hasSizeCount = /\d+(?:[.,]\d+)?\s*(?:cl|ml|l|kg|g)\s*[x×*]\s*\d+/i.test(name);
        const hasCountSize = /\d+\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:cl|ml|l|kg|g)/i.test(name);
        if (!hasSizeCount && !hasCountSize) return true;
      }
    }
  }

  const unitCount = name.match(/\b(\d+(?:[.,]\d+)?)\s*(?:unidades?|unids?|units?|ovos?)\b/i);
  if (unitCount) {
    const tail = name.slice((unitCount.index ?? 0) + unitCount[0].length);
    if (!/\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|l)\b/i.test(tail)) {
      if (!/\d+(?:[.,]\d+)?\s*(?:cl|ml|l|kg|g)\s*[x×*]/i.test(name)) return true;
    }
  }

  return false;
}

function inferExpectedCountableQty(name: string, rowQty: number, rowUnit: string | null): number | null {
  const dozenCx = name.match(/\bcx\.?\s*(\d+(?:[.,]\d+)?)\s*d[uú]zias?\b/i);
  if (dozenCx) {
    const dozens = parseNum(dozenCx[1]!);
    if (Number.isFinite(dozens)) return Math.round(dozens * 12 * (rowUnit === "cx" ? rowQty : 1));
  }

  const dozenOnly = name.match(/\b(\d+(?:[.,]\d+)?)\s*d[uú]zias?\b/i);
  if (dozenOnly && !dozenCx) {
    const dozens = parseNum(dozenOnly[1]!);
    if (Number.isFinite(dozens)) return Math.round(dozens * 12);
  }

  const cxUnits = name.match(/\bcx\.?\s*(\d+(?:[.,]\d+)?)\s*(?:un(?:id(?:ades?)?)?|units?|ovos?|pc?s?)\b/i);
  if (cxUnits) {
    const n = parseNum(cxUnits[1]!);
    if (Number.isFinite(n)) return Math.round(n * (rowUnit === "cx" ? rowQty : 1));
  }

  const countNoun = name.match(
    /\b(\d+(?:[.,]\d+)?)\s*(?:c[aá]psulas?|capsulas?|doses?|saquetas?|envelopes?|sticks?|tablets?|comprimidos?|por[cç][oõ]es?|porcoes?)\b/i,
  );
  if (countNoun) {
    const n = parseNum(countNoun[1]!);
    if (Number.isFinite(n)) return Math.round(n * rowQty);
  }

  const bareUnits = name.match(/\b(\d+(?:[.,]\d+)?)\s*(?:unidades?|unids?|units?)\b/i);
  if (bareUnits && isCountableOnlyMultiplier(name)) {
    const n = parseNum(bareUnits[1]!);
    if (Number.isFinite(n)) return Math.round(n * rowQty);
  }

  return null;
}

function commercialQtyLabel(name: string, rowQty: number, rowUnit: string | null): string {
  const expected = inferExpectedCountableQty(name, rowQty, rowUnit);
  if (expected != null) return String(expected);
  const m = name.match(/\b(\d+(?:[.,]\d+)?)\s*d[uú]zias?\b/i);
  if (m) return `${m[1]} dozen`;
  const cx = name.match(/\bcx\.?\s*(\d+(?:[.,]\d+)?)/i);
  if (cx) return `cx×${cx[1]}`;
  return rowUnit ? `${rowQty} ${rowUnit}` : String(rowQty);
}

function classifyStatus(
  name: string,
  parsed: ReturnType<typeof parsePurchaseStructureFromText>,
  recipeFields: ReturnType<typeof recipeOperationalCostFieldsFromInvoiceLine>,
  rowQty: number,
  rowUnit: string | null,
  countableOnly: boolean,
): Status {
  const persisted = recipeFields?.purchase_quantity ?? null;
  const expected = inferExpectedCountableQty(name, rowQty, rowUnit);

  if (parsed != null && !countableOnly) {
    if (recipeFields?.cost_base_unit === "ml" || recipeFields?.cost_base_unit === "g") return "SAFE";
    if (persisted != null && persisted > 1) return "SAFE";
    return "SAFE";
  }

  if (parsed != null && countableOnly) {
    if (expected != null && persisted != null && Math.abs(persisted - expected) > 0.5) return "BROKEN";
    if (expected != null && persisted === 1 && expected > 1) return "BROKEN";
    if (persisted != null && persisted > 1) return "PARTIAL";
    return "PARTIAL";
  }

  if (parsed == null && countableOnly) {
    if (expected != null && expected > 1) return "BROKEN";
    if (expected == null && /\bcx\.?\s*\d+/i.test(name)) return "BROKEN";
    return "BROKEN";
  }

  if (parsed != null) return "SAFE";
  return "PARTIAL";
}

function replay(item: {
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
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const unitsPerPack = resolveUnitsPerPack(structured);
  const countableQty = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const patterns = detectMatchedPatterns(bound.name);
  const family = classifyFamily(patterns);
  const countableOnly = isCountableOnlyMultiplier(bound.name);
  const rowQty = bound.quantity ?? 1;
  const status = classifyStatus(
    bound.name,
    structure,
    recipeFields,
    rowQty,
    bound.unit,
    countableOnly,
  );

  return {
    product: bound.name,
    invoiceId: item.invoice_id,
    patterns,
    family,
    countableOnly,
    parserResult: structure ? summarizePurchaseStructure(structure) : null,
    parsed: structure != null,
    tier: structure?.tier ?? null,
    unitsPerPack,
    countableQty,
    structuredKind: structured.kind,
    recipeFields,
    persistedQty: recipeFields?.purchase_quantity ?? null,
    expectedQty: inferExpectedCountableQty(bound.name, rowQty, bound.unit),
    commercialQty: commercialQtyLabel(bound.name, rowQty, bound.unit),
    status,
    bound,
  };
}

mkdirSync(OUT, { recursive: true });

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const { data: items, error: itemsError } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total")
  .in("invoice_id", VL_INVOICES);
if (itemsError) throw new Error(itemsError.message);

const { data: invoices } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date")
  .in("id", VL_INVOICES);
const invById = new Map((invoices ?? []).map((i) => [i.id, i]));

const itemIds = (items ?? []).map((r) => r.id);
const { data: matches } =
  itemIds.length > 0
    ? await sb
        .from("invoice_item_ingredient_matches")
        .select("invoice_item_id,ingredient_id,ingredients(id,name,purchase_quantity,purchase_unit,base_unit,current_price)")
        .in("invoice_item_id", itemIds)
    : { data: [] };

const { data: allIngredients } = await sb
  .from("ingredients")
  .select("id,name,normalized_name,purchase_quantity,purchase_unit,base_unit,current_price");

const ingredientByItem = new Map<string, (typeof matches extends (infer T)[] | null ? T : never)["ingredients"]>();
for (const m of matches ?? []) {
  if (m.ingredients) ingredientByItem.set(m.invoice_item_id, m.ingredients);
}

function findIngredientByProductName(productName: string) {
  const norm = productName.toLowerCase().replace(/\s+/g, " ");
  return (allIngredients ?? []).find((ing) => {
    const n = (ing.normalized_name ?? ing.name ?? "").toLowerCase();
    if (/ovo.*classe.*m|classe.*m.*ovo/.test(norm) && /ovo.*classe|classe.*m/.test(n)) return true;
    if (n && norm.includes(n.slice(0, Math.min(12, n.length)))) return true;
    return false;
  });
}

const allItems = items ?? [];
const corpusHits = allItems.filter((i) => CORPUS_SCAN_RE.test(i.name ?? ""));

const candidateRows = corpusHits.map((item) => {
  const r = replay(item);
  const ing = ingredientByItem.get(item.id) ?? findIngredientByProductName(item.name ?? "");
  const invoice = invById.get(item.invoice_id);
  return {
    ...r,
    invoiceItemId: item.id,
    invoice: invoice?.supplier_name ?? item.invoice_id.slice(0, 8),
    invoiceDate: invoice?.invoice_date ?? null,
    ingredientPersistedQty: ing?.purchase_quantity ?? null,
    ingredientName: ing?.name ?? null,
    ingredientBaseUnit: ing?.base_unit ?? null,
    ingredientId: ing?.id ?? null,
    dbPersistedQty: ing?.purchase_quantity ?? r.persistedQty,
  };
});

const requiredTable = candidateRows.map((r) => ({
  product: r.product,
  invoice: r.invoice,
  pattern: r.patterns.join(", ") || "corpus_scan",
  parserResult: r.parserResult ?? "null",
  persistedQty: r.dbPersistedQty,
  expectedQty: r.expectedQty,
  status: r.status,
}));

const brokenRows = candidateRows.filter((r) => r.status === "BROKEN");
const denominatorLoss = brokenRows
  .filter((r) => r.expectedQty != null && r.dbPersistedQty != null)
  .map((r) => ({
    product: r.product,
    commercialQty: r.commercialQty,
    persistedQty: r.dbPersistedQty,
    missingDenominator: r.expectedQty! - r.dbPersistedQty!,
    expectedQty: r.expectedQty,
  }));

const familyClassification: Record<string, number> = {
  Dozen: 0,
  Unit: 0,
  Capsule: 0,
  Portion: 0,
  Other: 0,
};
for (const r of candidateRows) {
  familyClassification[r.family] = (familyClassification[r.family] ?? 0) + 1;
}

const controls: Record<string, ReturnType<typeof replay> & { dbItem: unknown; invoice: string }> = {};
for (const spec of CONTROL_SPECS) {
  let item = null;
  for (const pat of spec.patterns) {
    const { data } = await sb
      .from("invoice_items")
      .select("id,invoice_id,name,quantity,unit,unit_price,total")
      .ilike("name", pat)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) {
      item = data[0];
      break;
    }
  }
  if (item) {
    const trace = replay(item);
    const invoice = invById.get(item.invoice_id);
    controls[spec.key] = {
      ...trace,
      dbItem: item,
      invoice: invoice?.supplier_name ?? item.invoice_id.slice(0, 8),
      label: spec.label,
    } as never;
  }
}

const parserCoverage = candidateRows.map((r) => ({
  product: r.product,
  invoice: r.invoice,
  parserResult: r.parserResult ?? "null",
  parsed: r.parsed,
  tier: r.tier,
  unitsPerPack: r.unitsPerPack,
  countableQty: r.countableQty,
  status: r.status,
}));

const dozenRows = candidateRows.filter((r) => r.family === "Dozen");
const brokenCountableOnly = candidateRows.filter((r) => r.countableOnly && r.status === "BROKEN");
const uniqueBrokenProducts = [...new Set(brokenCountableOnly.map((r) => r.product))];

let architecturalGap: "A" | "B" | "C" | "D";
if (brokenCountableOnly.length === 0) architecturalGap = "A";
else if (dozenRows.length === brokenCountableOnly.length && brokenCountableOnly.every((r) => r.family === "Dozen"))
  architecturalGap = "A";
else if (
  brokenCountableOnly.every((r) => r.parsed === false) &&
  brokenCountableOnly.some((r) => r.family !== "Dozen")
)
  architecturalGap = "B";
else if (brokenCountableOnly.some((r) => r.parsed === true)) architecturalGap = "C";
else architecturalGap = "B";

let finalVerdict: "A" | "B" | "C";
if (brokenCountableOnly.length <= 1 && dozenRows.length >= 1) finalVerdict = "A";
else if (uniqueBrokenProducts.length <= 3 && brokenCountableOnly.every((r) => /ovo|d[uú]zia|duzia/i.test(r.product)))
  finalVerdict = "A";
else if (brokenCountableOnly.length > 1 && brokenCountableOnly.some((r) => !/ovo|d[uú]zia|duzia|egg/i.test(r.product)))
  finalVerdict = "C";
else if (uniqueBrokenProducts.length <= 2) finalVerdict = "B";
else finalVerdict = "C";

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  corpusScan: {
    totalInvoiceItems: allItems.length,
    patternMatches: corpusHits.length,
    uniqueProducts: new Set(corpusHits.map((i) => i.name)).size,
    patternsScanned: Object.keys(FAMILY_PATTERNS).concat(["cx_count", "corpus_scan_re"]),
  },
  task1_fullCorpusScan: {
    hitCount: corpusHits.length,
    hits: corpusHits.map((i) => ({
      name: i.name,
      invoiceId: i.invoice_id,
      quantity: i.quantity,
      unit: i.unit,
    })),
  },
  task2_parserCoverage: parserCoverage,
  task3_denominatorLoss: denominatorLoss,
  task4_familyClassification: familyClassification,
  task5_workingControls: Object.fromEntries(
    Object.entries(controls).map(([k, c]) => [
      k,
      {
        label: (c as { label?: string }).label,
        product: c.product,
        invoice: c.invoice,
        parsed: c.parsed,
        tier: c.tier,
        parserResult: c.parserResult,
        structuredKind: c.structuredKind,
        unitsPerPack: c.unitsPerPack,
        persistedQty: c.persistedQty,
        expectedQty: c.expectedQty,
        recipeFields: c.recipeFields,
        whyRecognized: c.parsed
          ? `${c.tier} tier — measure-based inner count (requires g/ml/cl/kg suffix in regex)`
          : "null — no tier matched",
      },
    ]),
  ),
  task6_architecturalGap: {
    answer: architecturalGap,
    options: {
      A: "Dozen parsing only",
      B: "Countable multiplier parsing",
      C: "Countable normalization",
      D: "Multiple",
    },
    rationale: "",
  },
  requiredTable,
  finalVerdict: {
    answer: finalVerdict,
    options: {
      A: "Ovo isolated",
      B: "Small family",
      C: "General countable parsing gap",
    },
    question: "If we fix Ovo, are we fixing only eggs or entire missing parser family?",
    explanation: "",
  },
  summary: {
    totalCandidates: candidateRows.length,
    safe: candidateRows.filter((r) => r.status === "SAFE").length,
    broken: brokenRows.length,
    partial: candidateRows.filter((r) => r.status === "PARTIAL").length,
    brokenCountableOnly: brokenCountableOnly.length,
    uniqueBrokenProducts,
    dozenCandidateCount: dozenRows.length,
  },
  candidateRows,
};

results.task6_architecturalGap.rationale =
  architecturalGap === "A"
    ? "Only dozen-pattern lines fail parser; no other countable-only multiplier family in broken set."
    : architecturalGap === "B"
      ? "Parser returns null for countable-only multipliers (dúzias, cx.N without g/ml) — upstream regex gap, not normalization."
      : architecturalGap === "C"
        ? "Some lines parse but persisted denominator still wrong — downstream normalization gap."
        : "Multiple layers implicated.";

results.finalVerdict.explanation =
  finalVerdict === "A"
    ? "Corpus scan shows dozen/egg pattern is the sole broken countable-only multiplier in VL invoice_items."
    : finalVerdict === "B"
      ? "A small cluster of related countable-only patterns fail together (same parser null path)."
      : "Multiple distinct countable multiplier families fail parser — fixing Ovo alone would not cover corpus.";

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log("Wrote", `${OUT}/results.json`);
console.log("Corpus hits:", corpusHits.length);
console.log("Broken:", brokenRows.length);
console.log("Final verdict:", finalVerdict);
console.log("Architectural gap:", architecturalGap);
