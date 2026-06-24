/**
 * STRICT READ-ONLY Fresh Produce Conversion Coverage Audit — VL bjhnlrgodcqoyzddbpbd
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
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { detectConversionHint } from "../../src/lib/ingredient-unit-inference.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/fresh-produce-conversion-audit";

// Source-of-truth from ingredient-unit-inference.ts PRODUCE_CONVERSION_HINTS
const PRODUCE_CONVERSION_HINTS_INVENTORY = [
  {
    label: "leafy produce",
    estimatedQuantity: 500,
    unit: "g",
    confidence: 0.62,
    tokens: ["ALFACE", "LETTUCE", "RUCULA", "ARUGULA", "AGRIAO", "ESPINAFRE", "COUVE"],
    sourceFile: "src/lib/ingredient-unit-inference.ts",
  },
  {
    label: "fresh herbs",
    estimatedQuantity: 100,
    unit: "g",
    confidence: 0.58,
    tokens: ["COENTROS", "SALSA", "MANJERICAO", "HORTELA", "CEBOLINHO"],
    sourceFile: "src/lib/ingredient-unit-inference.ts",
  },
  {
    label: "whole vegetable",
    estimatedQuantity: 700,
    unit: "g",
    confidence: 0.56,
    tokens: ["BROCOLOS", "COUVE-FLOR", "COUVE FLOR", "REPOLHO"],
    sourceFile: "src/lib/ingredient-unit-inference.ts",
  },
];

const TARGET_HERBS = [
  "MANJERICAO",
  "SALSA",
  "COENTROS",
  "HORTELA",
  "ALECRIM",
  "CEBOLINHO",
  "ESTRAGAO",
  "TOMILHO",
];

const BUNCH_UNITS = new Set(["mo", "maço", "maco", "ma co"]);

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
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective =
    bound.unit_price != null
      ? computeEffectiveUsableCost(bound.unit_price, metadata, structured, bound.name)
      : null;
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const conversionHint = detectConversionHint(bound.name);

  return {
    invoiceItemId: raw.id,
    invoiceId: raw.invoice_id ?? null,
    bound,
    structured,
    presentation,
    perUnit,
    effective,
    recipeFields,
    conversionHint,
    rowQtyLabel: formatRowPurchaseQuantityLabel(metadata),
    operationalVisible: presentation.effectiveUsableCostLabel != null,
    parsedConversion: conversionHint != null || structured.normalizedUsableQuantity != null,
    structuredKind: structured.kind,
    normalizedUsableQuantity: structured.normalizedUsableQuantity,
    usableQuantityUnit: structured.usableQuantityUnit,
  };
}

function classifyHintCategory(label: string): "Herbs" | "Vegetables" | "Fruit" | "Other" {
  if (label === "fresh herbs") return "Herbs";
  if (label === "leafy produce" || label === "whole vegetable") return "Vegetables";
  return "Other";
}

function corpusStatus(trace: ReturnType<typeof traceLine>): "SAFE" | "PARTIAL" | "MISSING" {
  if (trace.operationalVisible) return "SAFE";
  if (trace.parsedConversion || trace.structuredKind !== "row_only") return "PARTIAL";
  return "MISSING";
}

function normalizeUnit(u: string | null | undefined): string {
  return (u ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function isBunchPurchase(unit: string | null | undefined): boolean {
  const n = normalizeUnit(unit);
  return BUNCH_UNITS.has(n) || n === "mo";
}

mkdirSync(OUT, { recursive: true });

// TASK 1 — inventory (flatten tokens)
const task1Inventory = PRODUCE_CONVERSION_HINTS_INVENTORY.flatMap((group) =>
  group.tokens.map((token) => ({
    ingredientToken: token,
    conversion: group.estimatedQuantity,
    unit: group.unit,
    sourceFile: group.sourceFile,
    hintLabel: group.label,
    confidence: group.confidence,
  })),
);

// Target herb probe (including names not in table)
const targetHerbProbe = TARGET_HERBS.map((token) => {
  const displayNames: Record<string, string> = {
    MANJERICAO: "Manjericão",
    SALSA: "Salsa",
    COENTROS: "Coentros",
    HORTELA: "Hortelã",
    ALECRIM: "Alecrim",
    CEBOLINHO: "Cebolinho",
    ESTRAGAO: "Estragão",
    TOMILHO: "Tomilho",
  };
  const name = displayNames[token] ?? token;
  const hint = detectConversionHint(name);
  const inTable = task1Inventory.some((e) => e.ingredientToken === token);
  return {
    token,
    displayName: name,
    inProduceConversionHints: inTable,
    detectConversionHint: hint
      ? {
          estimated_quantity: hint.estimated_quantity,
          stock_unit: hint.stock_unit,
          label: hint.label,
          reason: hint.reason,
        }
      : null,
  };
});

// TASK 2 — coverage analysis
const task2Coverage = PRODUCE_CONVERSION_HINTS_INVENTORY.map((group) => ({
  ingredientGroup: group.label,
  conversion: group.estimatedQuantity,
  operationalUnit: "kg",
  category: classifyHintCategory(group.label),
  tokenCount: group.tokens.length,
  tokens: group.tokens,
}));

const task2Counts = task2Coverage.reduce(
  (acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + row.tokenCount;
    return acc;
  },
  {} as Record<string, number>,
);

// TASK 3 — VL corpus: all invoice_items, filter bunch units
const { data: allItems, error: itemsError } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
  .order("created_at", { ascending: false });

if (itemsError) throw itemsError;

const bunchItems = (allItems ?? []).filter((row) => isBunchPurchase(row.unit));

// Also scan for molho in name (sauce vs bunch — document separately)
const molhoNameItems = (allItems ?? []).filter((row) => /\bmolho\b/i.test(row.name ?? ""));

const corpusTraces = bunchItems.map((item) => {
  const trace = traceLine(item);
  return {
    product: item.name,
    invoiceItemId: item.id,
    invoiceId: item.invoice_id,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unit_price,
    parsedConversion: trace.parsedConversion,
    conversionHint: trace.conversionHint,
    structuredKind: trace.structuredKind,
    normalizedUsableQuantity: trace.normalizedUsableQuantity,
    usableQuantityUnit: trace.usableQuantityUnit,
    operationalVisible: trace.operationalVisible,
    operationalLabel: trace.presentation.effectiveUsableCostLabel,
    procurementLabel: trace.presentation.priceDisplay,
    source: "invoice_items",
    status: corpusStatus(trace),
    detectConversionHintToken: trace.conversionHint?.reason ?? null,
  };
});

// Unique products in corpus
const uniqueBunchProducts = [...new Set(corpusTraces.map((r) => r.product))];

// Herb-like bunch rows (name heuristic)
const HERB_NAME_RE =
  /\b(tomilho|manjeric|coentro|salsa|hortel|alecrim|cebolinho|estrag|oreg|salsa)\b/i;

const herbBunchRows = corpusTraces.filter((r) => HERB_NAME_RE.test(r.product ?? ""));
const herbBunchMissing = herbBunchRows.filter((r) => r.status === "MISSING");
const herbBunchSafe = herbBunchRows.filter((r) => r.status === "SAFE");

// Broader VL fresh-produce scan (all units) for context beyond mo-only corpus
const PRODUCE_NAME_RE =
  /\b(tomilho|manjeric|coentro|salsa|hortel|alecrim|cebolinho|estrag|alface|couve|brocol|repolho|espinaf|tomate|pepino|courgette|abobora|salada|alho frances)\b/i;

const broaderProduceTraces = (allItems ?? [])
  .filter((row) => PRODUCE_NAME_RE.test(row.name ?? ""))
  .map((item) => {
    const trace = traceLine(item);
    return {
      product: item.name,
      unit: item.unit,
      parsedConversion: trace.parsedConversion,
      operationalVisible: trace.operationalVisible,
      operationalLabel: trace.presentation.effectiveUsableCostLabel,
      structuredKind: trace.structuredKind,
      conversionHint: trace.conversionHint?.reason ?? null,
      status: corpusStatus(trace),
    };
  });

const codeLevelMissingHerbs = targetHerbProbe.filter((h) => !h.inProduceConversionHints);

// TASK 4 — Tomilho vs Manjericão divergence
const { data: tomilhoItems } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total")
  .ilike("name", "%Tomilho%")
  .order("created_at", { ascending: false })
  .limit(5);

const { data: manjericaoItems } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total")
  .ilike("name", "%Manjeric%o%")
  .order("created_at", { ascending: false })
  .limit(5);

const tomilhoTrace = tomilhoItems?.[0] ? traceLine(tomilhoItems[0]) : null;
const manjericaoTrace = manjericaoItems?.[0] ? traceLine(manjericaoItems[0]) : null;

const divergencePath = [
  {
    stage: "invoice_item.unit",
    tomilho: tomilhoTrace?.bound.unit ?? null,
    manjericao: manjericaoTrace?.bound.unit ?? null,
    diverges: false,
  },
  {
    stage: "detectConversionHint(name)",
    tomilho: tomilhoTrace?.conversionHint ?? null,
    manjericao: manjericaoTrace?.conversionHint ?? null,
    diverges: Boolean(tomilhoTrace?.conversionHint !== manjericaoTrace?.conversionHint),
    codeRef: "src/lib/ingredient-unit-inference.ts detectConversionHint / PRODUCE_CONVERSION_HINTS",
  },
  {
    stage: "resolveInvoiceLinePurchaseFormat.kind",
    tomilho: tomilhoTrace?.structuredKind ?? null,
    manjericao: manjericaoTrace?.structuredKind ?? null,
    diverges: tomilhoTrace?.structuredKind !== manjericaoTrace?.structuredKind,
    codeRef: "src/lib/invoice-purchase-format.ts",
  },
  {
    stage: "normalizedUsableQuantity",
    tomilho: tomilhoTrace?.normalizedUsableQuantity ?? null,
    manjericao: manjericaoTrace?.normalizedUsableQuantity ?? null,
    diverges:
      tomilhoTrace?.normalizedUsableQuantity !== manjericaoTrace?.normalizedUsableQuantity,
    codeRef: "src/lib/stock-normalization.ts computeUsableFromInference conversion_hint branch",
  },
  {
    stage: "resolveUsablePerPricedUnit",
    tomilho: tomilhoTrace?.perUnit ?? null,
    manjericao: manjericaoTrace?.perUnit ?? null,
    diverges: JSON.stringify(tomilhoTrace?.perUnit) !== JSON.stringify(manjericaoTrace?.perUnit),
    codeRef: "src/lib/invoice-purchase-price-semantics.ts",
  },
  {
    stage: "computeEffectiveUsableCost",
    tomilho: tomilhoTrace?.effective ?? null,
    manjericao: manjericaoTrace?.effective ?? null,
    diverges: JSON.stringify(tomilhoTrace?.effective) !== JSON.stringify(manjericaoTrace?.effective),
    codeRef: "src/lib/invoice-purchase-price-semantics.ts",
  },
  {
    stage: "effectiveUsableCostLabel",
    tomilho: tomilhoTrace?.presentation.effectiveUsableCostLabel ?? null,
    manjericao: manjericaoTrace?.presentation.effectiveUsableCostLabel ?? null,
    diverges:
      tomilhoTrace?.presentation.effectiveUsableCostLabel !==
      manjericaoTrace?.presentation.effectiveUsableCostLabel,
    codeRef: "src/lib/invoice-purchase-price-semantics.ts resolveInvoiceLinePricingPresentation",
  },
  {
    stage: "recipeOperationalCostFieldsFromInvoiceLine",
    tomilho: tomilhoTrace?.recipeFields ?? null,
    manjericao: manjericaoTrace?.recipeFields ?? null,
    diverges: JSON.stringify(tomilhoTrace?.recipeFields) !== JSON.stringify(manjericaoTrace?.recipeFields),
    codeRef: "src/lib/invoice-purchase-price-semantics.ts recipeOperationalCostFieldsFromInvoiceLine",
  },
];

const firstDivergence = divergencePath.find((s) => s.diverges);

// TASK 5 — Architectural intent
const architecturalIntentOptions = {
  A: "Isolated missing hint — Tomilho alone lacks token; other mo herbs covered",
  B: "Small herb-family gap — multiple herbs (e.g. Tomilho, Alecrim, Estragão) missing from fresh-herb table while siblings covered",
  C: "Broad fresh-produce gap — PRODUCE_CONVERSION_HINTS covers only 17 tokens; many VL bunch/whole-produce rows lack operational conversion",
  D: "Architecture ambiguity — hints are lightweight/estimated, intentionally not persisted; no rule mandates all mo herbs get €/kg",
};

// TASK 6 — Blast radius: rows that would gain operational cost if TOMILHO token added (same class as Manjericão)
const wouldGainIfTomilhoHint = corpusTraces.filter(
  (r) =>
    r.status === "MISSING" &&
    r.structuredKind === "row_only" &&
    !r.conversionHint &&
    HERB_NAME_RE.test(r.product ?? ""),
);

const wouldGainAllMissingBunch = corpusTraces.filter((r) => r.status === "MISSING");

// Required table — per unique bunch product (latest row)
const latestByProduct = new Map<string, (typeof corpusTraces)[number]>();
for (const row of corpusTraces) {
  if (!latestByProduct.has(row.product)) latestByProduct.set(row.product, row);
}

const requiredTable = [...latestByProduct.values()].map((row) => {
  const hint = row.conversionHint;
  return {
    ingredient: row.product,
    purchaseUnit: row.unit ?? "mo",
    conversion: hint
      ? `${hint.estimated_quantity} ${hint.stock_unit}/bunch`
      : row.normalizedUsableQuantity != null
        ? `${row.normalizedUsableQuantity} ${row.usableQuantityUnit}`
        : null,
    operationalUnit: row.operationalLabel?.split(" / ")[1] ?? null,
    status: row.status,
    procurementLabel: row.procurementLabel,
    operationalLabel: row.operationalLabel,
  };
});

// Verdict logic
let finalVerdict: "A" | "B" | "C" | "D";
let finalVerdictExplanation: string;

const missingHerbTokens = targetHerbProbe.filter((h) => !h.inProduceConversionHints);
const coveredHerbTokens = targetHerbProbe.filter((h) => h.inProduceConversionHints);
const missingHerbInVl = herbBunchMissing.map((r) => r.product);
const uniqueMissingHerbs = [...new Set(missingHerbInVl)];

if (
  herbBunchMissing.length === 1 &&
  uniqueMissingHerbs.length === 1 &&
  /tomilho/i.test(uniqueMissingHerbs[0] ?? "")
) {
  finalVerdict = "A";
  finalVerdictExplanation =
    "Only Tomilho among VL mo-bunch herb rows lacks operational conversion. VL mo corpus is Tomilho (MISSING) + Manjericão (SAFE). Code table also omits ALECRIM/ESTRAGAO but those are untriggered in VL.";
} else if (
  missingHerbTokens.length <= 3 &&
  herbBunchMissing.length > 0 &&
  herbBunchMissing.length < herbBunchRows.length
) {
  finalVerdict = "B";
  finalVerdictExplanation = `Herb-family gap: ${missingHerbTokens.map((h) => h.token).join(", ")} absent from fresh-herb table; ${herbBunchSafe.length}/${herbBunchRows.length} VL herb bunch rows SAFE.`;
} else if (wouldGainAllMissingBunch.length > herbBunchMissing.length + 2) {
  finalVerdict = "C";
  finalVerdictExplanation = `Broad gap: ${wouldGainAllMissingBunch.length} VL mo-bunch rows MISSING operational cost beyond herbs (${uniqueBunchProducts.length} unique products, ${task1Inventory.length} hint tokens).`;
} else {
  finalVerdict = "B";
  finalVerdictExplanation = `Herb-family gap: tokens missing from table: ${missingHerbTokens.map((h) => h.displayName).join(", ")}; VL herb bunch MISSING: ${uniqueMissingHerbs.join(", ") || "none"}.`;
}

const task5ArchitecturalIntent = "D";
const task5Evidence = [
  "ingredient-unit-inference.ts L426-429: hints are 'lightweight operational hints' 'intentionally not persisted automatically because the schema has no field for estimated usable yield'",
  "invoice-purchase-format.test.ts: estimated_yield renderSource for ALFACE without explicit pack — partial token coverage by design",
  "stock-normalization.test.ts: 'does not invent usable weight without shorthand or match signal' for Tomate cherry",
  "No test asserts all mo-unit herbs must match PRODUCE_CONVERSION_HINTS; Manjericão path tested via formatRowPurchaseQuantityLabel only",
];

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  task1_produceConversionHintsInventory: task1Inventory,
  task1_targetHerbProbe: targetHerbProbe,
  task2_coverageAnalysis: task2Coverage,
  task2_categoryCounts: task2Counts,
  task3_vlCorpus: {
    totalInvoiceItems: allItems?.length ?? 0,
    bunchUnitRows: bunchItems.length,
    uniqueBunchProducts: uniqueBunchProducts.length,
    molhoNameRows: molhoNameItems.length,
    rows: corpusTraces,
    herbBunchSummary: {
      total: herbBunchRows.length,
      safe: herbBunchSafe.length,
      partial: herbBunchRows.filter((r) => r.status === "PARTIAL").length,
      missing: herbBunchMissing.length,
      missingProducts: uniqueMissingHerbs,
    },
    broaderProduceScan: {
      rowCount: broaderProduceTraces.length,
      rows: broaderProduceTraces,
      missingOperational: broaderProduceTraces.filter((r) => r.status === "MISSING"),
      safeOperational: broaderProduceTraces.filter((r) => r.status === "SAFE"),
    },
  },
  codeLevelHerbTokenGap: {
    missingFromTable: codeLevelMissingHerbs.map((h) => ({
      token: h.token,
      displayName: h.displayName,
    })),
    inTable: targetHerbProbe.filter((h) => h.inProduceConversionHints).map((h) => h.token),
    latentGapNote:
      "3/8 target herbs absent from PRODUCE_CONVERSION_HINTS (TOMILHO, ALECRIM, ESTRAGAO); only TOMILHO appears in VL with operational impact",
  },
  task4_tomilhoRootCause: {
    tomilhoItem: tomilhoItems?.[0] ?? null,
    manjericaoItem: manjericaoItems?.[0] ?? null,
    divergencePath,
    firstDivergenceStage: firstDivergence?.stage ?? null,
    firstDivergence: firstDivergence ?? null,
    exactDivergence:
      "detectConversionHint: Tomilho → null (TOMILHO not in PRODUCE_CONVERSION_HINTS); Manjericão → MANJERICAO token → 100g/bunch → structured.kind=inferred → €/kg operational",
  },
  task5_architecturalIntent: {
    selected: task5ArchitecturalIntent,
    options: architecturalIntentOptions,
    evidence: task5Evidence,
  },
  task6_blastRadius: {
    ifTomilhoGotManjericaoTreatment: {
      herbRowsGainingOperational: wouldGainIfTomilhoHint.length,
      products: [...new Set(wouldGainIfTomilhoHint.map((r) => r.product))],
      rowIds: wouldGainIfTomilhoHint.map((r) => r.invoiceItemId),
    },
    allMissingBunchRows: wouldGainAllMissingBunch.length,
    allMissingBunchProducts: [...new Set(wouldGainAllMissingBunch.map((r) => r.product))],
  },
  requiredTable,
  finalVerdict,
  finalVerdictQuestion: "Is Tomilho one-off or larger coverage problem?",
  finalVerdictAnswer:
    finalVerdict === "A"
      ? "Tomilho is an isolated missing-hint case among VL herb bunch purchases."
      : finalVerdict === "B"
        ? "Tomilho reflects a small herb-family token gap, not a broad fresh-produce parser failure."
        : finalVerdict === "C"
          ? "Tomilho is one instance of a broad fresh-produce conversion coverage gap."
          : "Architecture documents estimated hints as partial/opt-in; Tomilho exclusion is consistent with undocumented token list, not a isolated data bug.",
  finalVerdictExplanation,
  verdictOptions: architecturalIntentOptions,
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// REPORT.md
const reportLines: string[] = [];
reportLines.push("# Fresh Produce Conversion Coverage Audit");
reportLines.push("");
reportLines.push(`**Validation Lab:** \`${VL}\``);
reportLines.push("**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments");
reportLines.push(`**Generated:** ${results.auditedAt}`);
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## Executive Summary");
reportLines.push("");
reportLines.push(
  `VL corpus: **${bunchItems.length}** invoice_items with unit \`mo\` (bunch), **${uniqueBunchProducts.length}** unique products. ` +
    `PRODUCE_CONVERSION_HINTS defines **${task1Inventory.length}** tokens across 3 groups (leafy 500g, fresh herbs 100g, whole vegetable 700g). ` +
    `Among target herbs, **${coveredHerbTokens.length}** have hints; **${missingHerbTokens.length}** do not (${missingHerbTokens.map((h) => h.token).join(", ")}). ` +
    `Tomilho vs Manjericão diverge at **${firstDivergence?.stage ?? "detectConversionHint"}**. ` +
    `Blast radius if Tomilho-class hint applied to all missing herb bunch rows: **${wouldGainIfTomilhoHint.length}** rows.`,
);
reportLines.push("");
reportLines.push(
  `**FINAL VERDICT: ${finalVerdict}** — ${finalVerdictExplanation}`,
);
reportLines.push("");
reportLines.push(`**Is Tomilho one-off or larger coverage problem?** ${results.finalVerdictAnswer}`);
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## TASK 1 — PRODUCE_CONVERSION_HINTS Inventory");
reportLines.push("");
reportLines.push("| Ingredient Token | Conversion | Unit | Source File |");
reportLines.push("|------------------|------------|------|-------------|");
for (const row of task1Inventory) {
  reportLines.push(
    `| ${row.ingredientToken} | ${row.conversion} | ${row.unit} | ${row.sourceFile} |`,
  );
}
reportLines.push("");
reportLines.push("### Target Herb Probe");
reportLines.push("");
reportLines.push("| Token | Display Name | In Table | detectConversionHint |");
reportLines.push("|-------|--------------|----------|----------------------|");
for (const h of targetHerbProbe) {
  const hint = h.detectConversionHint
    ? `${h.detectConversionHint.estimated_quantity}${h.detectConversionHint.stock_unit} (${h.detectConversionHint.label})`
    : "null";
  reportLines.push(
    `| ${h.token} | ${h.displayName} | ${h.inProduceConversionHints ? "yes" : "no"} | ${hint} |`,
  );
}
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## TASK 2 — Coverage Analysis");
reportLines.push("");
reportLines.push("| Ingredient Group | Conversion | Operational Unit | Category | Tokens |");
reportLines.push("|------------------|------------|------------------|----------|--------|");
for (const row of task2Coverage) {
  reportLines.push(
    `| ${row.ingredientGroup} | ${row.conversion}g | ${row.operationalUnit} | ${row.category} | ${row.tokens.join(", ")} |`,
  );
}
reportLines.push("");
reportLines.push("### Category Counts (tokens)");
reportLines.push("");
for (const [cat, count] of Object.entries(task2Counts)) {
  reportLines.push(`- **${cat}:** ${count}`);
}
reportLines.push(`- **Fruit:** 0`);
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## TASK 3 — VL Corpus (mo/maço/bunch purchases)");
reportLines.push("");
reportLines.push(`Total invoice_items: ${allItems?.length ?? 0}; bunch-unit rows: ${bunchItems.length}`);
reportLines.push("");
reportLines.push("| Product | Parsed Conversion? | Operational Visible? | Source | Status |");
reportLines.push("|---------|-------------------|----------------------|--------|--------|");
for (const row of corpusTraces) {
  reportLines.push(
    `| ${row.product} | ${row.parsedConversion ? "yes" : "no"} | ${row.operationalVisible ? "yes" : "no"} | invoice_items | ${row.status} |`,
  );
}
reportLines.push("");
reportLines.push(
  `Herb bunch subset: ${herbBunchRows.length} rows — SAFE ${herbBunchSafe.length}, MISSING ${herbBunchMissing.length}`,
);
if (uniqueMissingHerbs.length) {
  reportLines.push(`Missing herb products: ${uniqueMissingHerbs.join(", ")}`);
}
reportLines.push("");
reportLines.push("### Broader VL Fresh Produce (all units)");
reportLines.push("");
reportLines.push("| Product | Unit | Parsed Conversion? | Operational Visible? | Status |");
reportLines.push("|---------|------|-------------------|----------------------|--------|");
for (const row of broaderProduceTraces) {
  reportLines.push(
    `| ${row.product} | ${row.unit ?? "—"} | ${row.parsedConversion ? "yes" : "no"} | ${row.operationalVisible ? "yes" : "no"} | ${row.status} |`,
  );
}
reportLines.push("");
reportLines.push(
  `Code-level herb token gap (latent): ${codeLevelMissingHerbs.map((h) => h.token).join(", ")} absent from PRODUCE_CONVERSION_HINTS; only TOMILHO triggered in VL.`,
);
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## TASK 4 — Tomilho Root Cause vs Manjericão");
reportLines.push("");
reportLines.push("| Stage | Tomilho | Manjericão | Diverges |");
reportLines.push("|-------|---------|------------|----------|");
for (const s of divergencePath) {
  const fmt = (v: unknown) =>
    v == null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
  reportLines.push(
    `| ${s.stage} | ${fmt(s.tomilho).slice(0, 80)} | ${fmt(s.manjericao).slice(0, 80)} | ${s.diverges ? "**yes**" : "no"} |`,
  );
}
reportLines.push("");
reportLines.push(`**First divergence:** ${firstDivergence?.stage ?? "none"}`);
reportLines.push("");
reportLines.push(
  `Exact path: ${results.task4_tomilhoRootCause.exactDivergence}`,
);
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## TASK 5 — Architectural Intent");
reportLines.push("");
reportLines.push(`**Selected: ${task5ArchitecturalIntent}** — ${architecturalIntentOptions[task5ArchitecturalIntent]}`);
reportLines.push("");
reportLines.push("Evidence:");
for (const e of task5Evidence) {
  reportLines.push(`- ${e}`);
}
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## TASK 6 — Blast Radius");
reportLines.push("");
reportLines.push(
  `If Tomilho received Manjericão-class hint (100g/bunch → €/kg), **${wouldGainIfTomilhoHint.length}** VL herb bunch rows would gain operational cost:`,
);
for (const p of results.task6_blastRadius.ifTomilhoGotManjericaoTreatment.products) {
  reportLines.push(`- ${p}`);
}
reportLines.push("");
reportLines.push(
  `All MISSING mo-bunch rows (any product): **${wouldGainAllMissingBunch.length}** across ${results.task6_blastRadius.allMissingBunchProducts.length} products.`,
);
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## Required Table");
reportLines.push("");
reportLines.push("| Ingredient | Purchase Unit | Conversion | Operational Unit | Status |");
reportLines.push("|------------|---------------|------------|------------------|--------|");
for (const row of requiredTable) {
  reportLines.push(
    `| ${row.ingredient} | ${row.purchaseUnit} | ${row.conversion ?? "—"} | ${row.operationalUnit ?? "—"} | ${row.status} |`,
  );
}
reportLines.push("");
reportLines.push("---");
reportLines.push("");
reportLines.push("## FINAL VERDICT");
reportLines.push("");
reportLines.push(`**${finalVerdict}** — ${finalVerdictExplanation}`);
reportLines.push("");
reportLines.push(`**Question:** Is Tomilho one-off or larger coverage problem?`);
reportLines.push(`**Answer:** ${results.finalVerdictAnswer}`);
reportLines.push("");
reportLines.push("## Evidence Files");
reportLines.push("");
reportLines.push(`- \`${OUT}/results.json\``);
reportLines.push(`- \`${OUT}/audit.mts\``);
reportLines.push(`- Prior: \`.tmp/tomilho-audit/REPORT.md\``);

writeFileSync(`${OUT}/REPORT.md`, reportLines.join("\n"));
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
console.log(`Verdict: ${finalVerdict} — ${herbBunchRows.length} herb bunch rows, ${herbBunchMissing.length} MISSING`);
