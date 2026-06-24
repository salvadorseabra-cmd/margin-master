/**
 * STRICT READ-ONLY Fresh Herb Conversion Weight Audit — VL bjhnlrgodcqoyzddbpbd
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
const OUT = ".tmp/tomilho-conversion-weight-audit";

const PRODUCE_CONVERSION_HINTS_FRESH_HERBS = {
  tokens: ["COENTROS", "SALSA", "MANJERICAO", "HORTELA", "CEBOLINHO"],
  estimatedQuantity: 100,
  label: "fresh herbs",
  confidence: 0.58,
  sourceFile: "src/lib/ingredient-unit-inference.ts",
  lines: "412-417",
  gitIntroduced: "04cefd7c6e7093e624d0e7699cf7a0bcb3bce297",
  gitDate: "2026-05-18",
  gitMessage: "Add conservative ingredient matching and invoice identity improvements",
};

const TARGET_HERBS = [
  { token: "MANJERICAO", displayName: "Manjericão" },
  { token: "SALSA", displayName: "Salsa" },
  { token: "COENTROS", displayName: "Coentros" },
  { token: "HORTELA", displayName: "Hortelã" },
  { token: "CEBOLINHO", displayName: "Cebolinho" },
  { token: "TOMILHO", displayName: "Tomilho" },
  { token: "ALECRIM", displayName: "Alecrim" },
  { token: "ESTRAGAO", displayName: "Estragão" },
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

function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
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

function traceLine(raw: {
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
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const hint = detectConversionHint(metadata.name ?? "");
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective =
    metadata.unit_price == null
      ? null
      : computeEffectiveUsableCost(metadata.unit_price, metadata, structured, metadata.name ?? "");
  const recipe = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  return {
    invoiceItemId: raw.id ?? null,
    metadata,
    hint,
    structuredKind: structured.kind,
    normalizedUsableQuantity: structured.normalizedUsableQuantity,
    usableQuantityUnit: structured.usableQuantityUnit,
    perUnit,
    effective,
    procurementLabel: presentation.priceDisplayLabel,
    operationalLabel: presentation.effectiveUsableCostLabel,
    purchaseQtyLabel: formatRowPurchaseQuantityLabel(metadata),
    recipe,
  };
}

function hypotheticalTomilhoWith100g(unitPrice = 2.06) {
  const meta = { name: "Tomilho", quantity: 1, unit: "mo", unit_price: unitPrice, line_total: unitPrice };
  const fields = { current_price: unitPrice, purchase_quantity: 100, cost_base_unit: "g" as const };
  return {
    operationalKg: unitPrice / (100 / 1000),
    operationalLabel: `€${(unitPrice / (100 / 1000)).toFixed(2)} / kg`,
    recipeFields: fields,
    recipeCosts: [1, 5, 10].map((grams) => ({
      grams,
      cost: (grams * unitPrice) / 100,
    })),
  };
}

// TASK 1 — git history per herb
const task1HerbHistory = TARGET_HERBS.map((h) => ({
  token: h.token,
  displayName: h.displayName,
  conversion: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.tokens.includes(h.token) ? 100 : null,
  inTable: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.tokens.includes(h.token),
  firstIntroduction: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.tokens.includes(h.token)
    ? {
        commit: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.gitIntroduced,
        date: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.gitDate,
        message: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.gitMessage,
        note: "All five fresh-herb tokens introduced together in single PRODUCE_CONVERSION_HINTS group at 100g",
      }
    : null,
  comments: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.tokens.includes(h.token)
    ? [
        "L426-429: lightweight operational hints, intentionally not persisted automatically",
        `L443: reason template '${PRODUCE_CONVERSION_HINTS_FRESH_HERBS.label} token \"TOKEN\" → estimated 100g usable'`,
        `confidence ${PRODUCE_CONVERSION_HINTS_FRESH_HERBS.confidence}`,
      ]
    : ["Absent from PRODUCE_CONVERSION_HINTS fresh herbs group"],
  tests: PRODUCE_CONVERSION_HINTS_FRESH_HERBS.tokens.includes(h.token)
    ? [
        "No dedicated test asserts 100g for this herb token",
        "invoice-purchase-format.test.ts: ALFACE estimated_yield (leafy 500g group parallel, not herbs)",
        "invoice-purchase-price-semantics.test.ts: formatRowPurchaseQuantityLabel for Manjericão/Tomilho bunch labels only",
      ]
    : ["No test references this token in PRODUCE_CONVERSION_HINTS"],
  detectConversionHint: detectConversionHint(h.displayName),
}));

// VL queries
const herbNames = TARGET_HERBS.map((h) => h.displayName);
const { data: ingredients } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit")
  .in("name", herbNames);

const { data: allItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total,invoice_id")
  .order("name");

const herbInvoiceItems = (allItems ?? []).filter((item) => {
  const n = normalizeName(item.name ?? "");
  return TARGET_HERBS.some((h) => n.includes(h.token));
});

const ingredientIds = (ingredients ?? []).map((i) => i.id);
const { data: recipeLines } =
  ingredientIds.length > 0
    ? await sb
        .from("recipe_ingredients")
        .select("id,recipe_id,quantity,unit,ingredient_id,ingredients(name)")
        .in("ingredient_id", ingredientIds)
    : { data: [] };

// TASK 3 — VL corpus per herb product
const task3VlCorpus = TARGET_HERBS.map((h) => {
  const ing = (ingredients ?? []).find((i) => i.name === h.displayName);
  const invRows = herbInvoiceItems.filter((i) => normalizeName(i.name ?? "").includes(h.token));
  const traces = invRows.map((i) => traceLine(i));
  const latest = traces[0] ?? null;
  const recipes = (recipeLines ?? []).filter((r) => r.ingredient_id === ing?.id);
  return {
    product: h.displayName,
    token: h.token,
    inProduceConversionHints: h.token !== "TOMILHO" && h.token !== "ALECRIM" && h.token !== "ESTRAGAO"
      ? PRODUCE_CONVERSION_HINTS_FRESH_HERBS.tokens.includes(h.token)
      : false,
    ingredientId: ing?.id ?? null,
    dbState: ing
      ? {
          current_price: ing.current_price,
          purchase_quantity: ing.purchase_quantity,
          purchase_unit: ing.purchase_unit,
          base_unit: ing.base_unit,
        }
      : null,
    purchaseUnit: latest?.metadata.unit ?? invRows[0]?.unit ?? null,
    conversion: latest?.hint?.estimated_quantity ?? null,
    conversionLabel: latest?.hint
      ? `${latest.hint.estimated_quantity} g/bunch`
      : latest?.perUnit
        ? `${latest.perUnit.amount} ${latest.perUnit.unit}`
        : null,
    operationalCost: latest?.operationalLabel ?? null,
    procurementLabel: latest?.procurementLabel ?? null,
    structuredKind: latest?.structuredKind ?? null,
    invoiceRowCount: invRows.length,
    recipeLineCount: recipes.length,
    recipeLines: recipes.map((r) => ({
      recipe_id: r.recipe_id,
      quantity: r.quantity,
      unit: r.unit,
    })),
  };
});

// TASK 4 — safety if TOMILHO → 100g
const tomilhoTrace = traceLine({
  name: "Tomilho",
  quantity: 1,
  unit: "mo",
  unit_price: 2.06,
  total: 2.06,
});
const manjericaoTrace = traceLine({
  name: "Manjericão",
  quantity: 1,
  unit: "mo",
  unit_price: 2.06,
  total: 2.06,
});
const hypothetical = hypotheticalTomilhoWith100g(2.06);

const task4Safety = {
  currentTomilho: {
    operationalLabel: tomilhoTrace.operationalLabel,
    recipeFields: tomilhoTrace.recipe,
    structuredKind: tomilhoTrace.structuredKind,
  },
  ifTomilho100g: hypothetical,
  manjericaoReference: {
    operationalLabel: manjericaoTrace.operationalLabel,
    recipeFields: manjericaoTrace.recipe,
    perUnit: manjericaoTrace.perUnit,
  },
  operationalEurPerKg: hypothetical.operationalKg,
  recipeDenominator: 100,
  recipeDenominatorUnit: "g",
  existingIngredientsChange: {
    manjericao: "unchanged — already MANJERICAO token at 100g",
    otherTableHerbs: "unchanged — same group",
    tomilhoDbUntilReread: {
      note: "ingredients row persists purchase_quantity=1, base_unit=un until invoice re-read",
      current: (ingredients ?? []).find((i) => i.name === "Tomilho"),
    },
    recipeLinesAffected: (recipeLines ?? []).filter(
      (r) => r.ingredients?.name === "Tomilho",
    ).length,
  },
  sideEffects: [
    "detectConversionHint('Tomilho') would return fresh herbs 100g (same as siblings)",
    "structured.kind would become inferred (from row_only)",
    "operational display €20.60/kg at €2.06/bunch (identical math to Manjericão)",
    "recipeOperationalCostFieldsFromInvoiceLine → purchase_quantity=100, cost_base_unit=g",
    "recipe lines in g would cost qty × €0.0206/g vs current null for g",
    "recipe lines in un would remain N × €2.06 if cost_base_unit stays un until persistence refresh",
  ],
};

// TASK 5 — ALECRIM / ESTRAGAO
const task5Family = {
  alecrim: {
    inTable: false,
    detectConversionHint: detectConversionHint("Alecrim"),
    vlInvoiceRows: herbInvoiceItems.filter((i) => normalizeName(i.name ?? "").includes("ALECRIM")).length,
    vlIngredient: (ingredients ?? []).find((i) => i.name === "Alecrim") ?? null,
  },
  estragao: {
    inTable: false,
    detectConversionHint: detectConversionHint("Estragão"),
    vlInvoiceRows: herbInvoiceItems.filter((i) => normalizeName(i.name ?? "").includes("ESTRAGAO")).length,
    vlIngredient: (ingredients ?? []).find((i) => i.name === "Estragão") ?? null,
  },
  evidenceForSameTreatment: [
    "Same PRODUCE_CONVERSION_HINTS architecture: token-list group with single estimatedQuantity per label",
    "ALECRIM and ESTRAGAO absent from table alongside TOMILHO — 3/8 target herbs missing",
    "No VL invoice_items rows for Alecrim or Estragão (blast radius 0 in VL)",
    "No ingredient catalog rows for Alecrim or Estragão on VL",
    "If added at 100g, would follow identical fresh herbs group pattern as MANJERICAO et al.",
  ],
  verdict: "YES — architecturally parallel (same missing-token gap, same fresh-herb group semantics); VL evidence N/A (no rows)",
};

// TASK 6 — blast radius
const missingTokens = ["TOMILHO", "ALECRIM", "ESTRAGAO"];
const blastTomilhoOnly = herbInvoiceItems.filter((i) =>
  normalizeName(i.name ?? "").includes("TOMILHO"),
);
const blastAllMissing = herbInvoiceItems.filter((i) => {
  const n = normalizeName(i.name ?? "");
  return missingTokens.some((t) => n.includes(t));
});
const bunchBlastTomilho = blastTomilhoOnly.filter((i) =>
  BUNCH_UNITS.has((i.unit ?? "").toLowerCase()),
);
const bunchBlastAll = blastAllMissing.filter((i) =>
  BUNCH_UNITS.has((i.unit ?? "").toLowerCase()),
);

const task6BlastRadius = {
  tomilhoOnly: {
    allUnitRows: blastTomilhoOnly.length,
    bunchRows: bunchBlastTomilho.length,
    products: [...new Set(blastTomilhoOnly.map((i) => i.name))],
    rowIds: blastTomilhoOnly.map((i) => i.id),
  },
  tomilhoAlecrimEstragao: {
    allUnitRows: blastAllMissing.length,
    bunchRows: bunchBlastAll.length,
    products: [...new Set(blastAllMissing.map((i) => i.name))],
    rowIds: blastAllMissing.map((i) => i.id),
    note: "ALECRIM and ESTRAGAO contribute 0 VL rows",
  },
};

// Required table
const requiredTable = TARGET_HERBS.map((h) => {
  const row = task3VlCorpus.find((r) => r.token === h.token)!;
  const inTable = PRODUCE_CONVERSION_HINTS_FRESH_HERBS.tokens.includes(h.token);
  let evidenceLevel = "none";
  if (inTable && row.invoiceRowCount > 0) evidenceLevel = "code+VL";
  else if (inTable) evidenceLevel = "code-only";
  else if (row.invoiceRowCount > 0) evidenceLevel = "VL-gap";
  return {
    herb: h.displayName,
    currentConversion: inTable ? "100 g/bunch (fresh herbs group)" : null,
    intendedConversion: "100 g/bunch (fresh herbs group pattern)",
    evidenceLevel,
  };
});

// Verdict A/B/C/D for what 100g is
const hundredGramOrigin = {
  question: "Is 100g: A) generic herb assumption B) product-specific C) restaurant assumption D) arbitrary placeholder?",
  evidence: {
    A_genericHerbAssumption: [
      "Single 'fresh herbs' group with one estimatedQuantity: 100 shared by all 5 tokens",
      "No per-token weight differentiation in code",
      "detectConversionHint reason: 'fresh herbs token X → estimated 100g usable'",
      "Parallel leafy produce group uses single 500g for 7 tokens",
    ],
    B_productSpecific: ["No product-specific weights; Manjericão and Hortelã share same 100g despite different VL purchase units (mo vs kg)"],
    C_restaurantAssumption: ["No restaurant-specific yield data, supplier spec, or VL weighing evidence in code or commits"],
    D_arbitraryPlaceholder: [
      "confidence 0.58 (lowest of three produce groups)",
      "comment: 'estimated usable yield', 'lightweight operational hints'",
      "no test pins 100g to measured bunch weight",
      "introduced without per-herb justification in commit message",
    ],
  },
  selected: "A",
  selectedLabel: "generic herb assumption",
};

const finalVerdict = {
  question: "Is 100g for Tomilho consistent with existing herb-conversion architecture?",
  selected: "A",
  selectedLabel: "generic herb assumption — YES, consistent",
  answer:
    "Adding TOMILHO at 100g matches the existing fresh-herb group design: one shared estimatedQuantity per label, same pipeline as MANJERICAO. Tomilho is the only VL bunch herb missing the token; €20.60/kg and recipe denominator 100g follow Manjericão math at identical €2.06/bunch.",
  safetyNote:
    "Code-token addition alone does not rewrite persisted ingredients row (purchase_quantity=1, base_unit=un) until re-read; 0 VL recipe_ingredients rows for Tomilho today.",
};

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  task1_produceConversionHintsOrigin: {
    group: PRODUCE_CONVERSION_HINTS_FRESH_HERBS,
    perHerb: task1HerbHistory,
  },
  task2_architectureAudit: {
    whyAllShare100g: "Architecture uses category-level estimatedQuantity per PRODUCE_CONVERSION_HINTS entry, not per-product weights. Fresh herbs group assigns one value (100g) to all tokens in the array.",
    oneBunchEquals100g: "Code maps mo/bunch purchases through detectConversionHint → estimated_quantity 100 → resolveUsablePerPricedUnit 100g per priced bunch → €/kg operational",
    notIndividualWeights: "No herb-specific weight table; Hortelã on VL is kg-priced but still matches HORTELA token at 100g hint (parallel path)",
    evidence: [
      "ingredient-unit-inference.ts L412-417: single fresh herbs entry, estimatedQuantity: 100",
      "ingredient-unit-inference.ts L426-429: estimated, not persisted",
      "stock-normalization.ts L1690-1695: conversion_hint multiplies purchaseQuantity × estimated_quantity",
      "invoice-purchase-format.test.ts L519-529: leafy parallel — estimated_yield for ALFACE at group 500g",
      "manjericao-audit: €2.06/bunch ÷ 0.1kg = €20.60/kg verified",
    ],
  },
  task3_vlCorpus: task3VlCorpus,
  task4_safetyAnalysis: task4Safety,
  task5_family: task5Family,
  task6_blastRadius: task6BlastRadius,
  requiredTable,
  hundredGramOrigin,
  finalVerdict,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const report = `# Fresh Herb Conversion Weight Audit

**Validation Lab:** \`${VL}\`
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments
**Generated:** ${results.auditedAt}

---

## Executive Summary

PRODUCE_CONVERSION_HINTS **fresh herbs** group: **5** tokens at **100 g/bunch** (commit \`04cefd7c\`, 2026-05-18). **Missing:** TOMILHO, ALECRIM, ESTRAGAO. VL bunch herbs: **Manjericão** (SAFE, €20.60/kg) vs **Tomilho** (MISSING, no operational). At €2.06/bunch, 100g → **€20.60/kg** and recipe denominator **100g** (same as Manjericão).

**100g origin:** **A — generic herb assumption** (single group value, not product-specific, no restaurant data).

**FINAL VERDICT:** **A** — 100g for Tomilho is consistent with existing herb-conversion architecture (shared fresh-herbs group estimate).

---

## TASK 1 — PRODUCE_CONVERSION_HINTS Origin

| Token | Conversion | First Introduction | Comments | Tests |
|-------|------------|-------------------|----------|-------|
${task1HerbHistory
  .map(
    (h) =>
      `| ${h.token} | ${h.conversion ? `${h.conversion}g` : "—"} | ${h.firstIntroduction ? `${h.firstIntroduction.date} \`${h.firstIntroduction.commit.slice(0, 7)}\`` : "—"} | ${h.inTable ? "fresh herbs group; confidence 0.58; not persisted" : "absent from table"} | ${h.inTable ? "No herb-specific 100g test" : "none"} |`,
  )
  .join("\n")}

Git blame: entire PRODUCE_CONVERSION_HINTS block introduced in single commit \`04cefd7c\` ("Add conservative ingredient matching and invoice identity improvements"). All five in-table herbs added together at 100g.

---

## TASK 2 — Architecture Audit

**Why all share 100g?** Category-level \`estimatedQuantity\` per hint entry — not per-herb weights. Pattern mirrors leafy produce (500g × 7 tokens) and whole vegetable (700g × 4 tokens).

**"1 bunch herb = 100g"?** Yes in pipeline: \`detectConversionHint\` → \`estimated_quantity: 100\` → \`resolveUsablePerPricedUnit\` = 100g per priced bunch → \`computeEffectiveUsableCost\` → €/kg.

**Evidence:**
- \`ingredient-unit-inference.ts\` L412-417, L426-429, L443
- \`stock-normalization.ts\` L1690-1695
- \`invoice-purchase-format.test.ts\` — ALFACE \`estimated_yield\` (500g group analogue)
- No test asserts per-herb bunch gram weight

---

## TASK 3 — VL Corpus

| Product | Purchase Unit | Conversion | Operational Cost | Invoice Rows | Recipe Lines |
|---------|---------------|------------|------------------|--------------|--------------|
${task3VlCorpus
  .map(
    (r) =>
      `| ${r.product} | ${r.purchaseUnit ?? "—"} | ${r.conversionLabel ?? "—"} | ${r.operationalCost ?? "—"} | ${r.invoiceRowCount} | ${r.recipeLineCount} |`,
  )
  .join("\n")}

---

## TASK 4 — Safety Analysis (TOMILHO → 100g)

| Aspect | Current | If TOMILHO → 100g |
|--------|---------|-------------------|
| Operational | null | €20.60 / kg |
| Recipe denominator | purchase_quantity=1, cost_base_unit=un | purchase_quantity=100, cost_base_unit=g |
| 1g recipe cost | null | €0.0206 |
| 10g recipe cost | null | €0.206 |
| Manjericão (reference) | €20.60/kg, pq=100 | unchanged |

**Side effects:** structured.kind inferred; operational display appears; recipe g-costing enabled on re-read. **Existing ingredients:** Manjericão and other table herbs unchanged. Tomilho DB row (pq=1, un) unchanged until persistence re-read. **VL recipe_ingredients for Tomilho:** ${task4Safety.existingIngredientsChange.recipeLinesAffected}.

---

## TASK 5 — Family (ALECRIM, ESTRAGAO)

**YES** — same architectural gap (missing from fresh herbs token list). VL: **0** invoice rows, **0** catalog ingredients for Alecrim/Estragão. Would follow identical 100g group pattern if tokens added.

---

## TASK 6 — Blast Radius

| Scope | Bunch Rows | Products | Row IDs |
|-------|------------|----------|---------|
| TOMILHO only | ${task6BlastRadius.tomilhoOnly.bunchRows} | ${task6BlastRadius.tomilhoOnly.products.join(", ") || "—"} | ${task6BlastRadius.tomilhoOnly.rowIds.length} |
| TOMILHO+ALECRIM+ESTRAGAO | ${task6BlastRadius.tomilhoAlecrimEstragao.bunchRows} | ${task6BlastRadius.tomilhoAlecrimEstragao.products.join(", ") || "—"} | ${task6BlastRadius.tomilhoAlecrimEstragao.note} |

---

## Required Table

| Herb | Current Conversion | Intended Conversion | Evidence Level |
|------|-------------------|---------------------|----------------|
${requiredTable.map((r) => `| ${r.herb} | ${r.currentConversion ?? "—"} | ${r.intendedConversion} | ${r.evidenceLevel} |`).join("\n")}

---

## 100g Origin Verdict

**A — generic herb assumption**

Evidence: single \`fresh herbs\` group, one \`estimatedQuantity: 100\` for all five in-table tokens; parallel category-level design (leafy 500g, vegetable 700g). Not product-specific (Hortelã kg row still uses HORTELA token). No restaurant/yield measurement data. Confidence 0.58 and "estimated" wording indicate heuristic, but applied uniformly as category rule — not arbitrary per-product placeholder.

---

## FINAL VERDICT

**A** — Is 100g for Tomilho consistent with existing herb-conversion architecture? **Yes.** Tomilho at 100g would use the same fresh-herbs group semantics as MANJERICAO, SALSA, COENTROS, HORTELA, CEBOLINHO.

---

## Evidence Files

- \`.tmp/tomilho-conversion-weight-audit/results.json\`
- Prior: \`.tmp/fresh-produce-conversion-audit/\`, \`.tmp/manjericao-audit/\`, \`.tmp/tomilho-audit/\`
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log(`Wrote ${OUT}/REPORT.md and results.json`);
console.log(JSON.stringify({ finalVerdict: finalVerdict.selected, vlHerbs: task3VlCorpus.length, blast: task6BlastRadius }, null, 2));
