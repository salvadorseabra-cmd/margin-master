/**
 * Call-site wiring fix validation — persistence path passes quantity to resolver
 * Validation Lab: bjhnlrgodcqoyzddbpbd (52 invoice_items)
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { defaultIsGenericUnit } from "../../src/lib/ingredient-auto-persist.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLinePurchaseUnit,
  resolveInvoicePersistedItemUnit,
} from "../../src/lib/invoice-purchase-format.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/embedded-measure-callsite-fix-validation";

const EXPECTED_FIXES = [
  { key: "paccheri", pattern: /paccheri.*lisci/i, label: "Paccheri 500g" },
  { key: "ginger", pattern: /ginger\s*beer/i, label: "Ginger Beer 0.20cl" },
];

const MUST_NOT_REGRESS = [
  { key: "peroni", pattern: /peroni.*33cl/i, label: "Peroni 33cl×24" },
  { key: "pellegrino", pattern: /pellegrino.*75cl/i, label: "Pellegrino 75cl×15" },
  { key: "acucar", pattern: /açúcar.*10x1|acucar.*10x1/i, label: "Açúcar 10x1kg" },
  { key: "pomodori", pattern: /pomodori.*2[.,]5.*kg/i, label: "Pomodori 2.5kg×6" },
  { key: "mozzarella", pattern: /mozzarella.*125/i, label: "Mozzarella 125g×8" },
  { key: "guanciale", pattern: /guanciale/i, label: "Guanciale" },
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

type Line = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

/** Pre-fix invoices.tsx call site — name + unit only. */
function beforePersistenceResolve(normalized: ReturnType<typeof normalizeInvoiceItemFields>) {
  return resolveInvoicePersistedItemUnit(
    { name: String(normalized.name), unit: normalized.unit },
    defaultIsGenericUnit,
  );
}

/** Post-fix invoices.tsx call site — name + quantity + unit. */
function afterPersistenceResolve(normalized: ReturnType<typeof normalizeInvoiceItemFields>) {
  return resolveInvoicePersistedItemUnit(
    {
      name: String(normalized.name),
      quantity: normalized.quantity,
      unit: normalized.unit,
    },
    defaultIsGenericUnit,
  );
}

async function fetchAllInvoiceItems(): Promise<Line[]> {
  const pageSize = 1000;
  let offset = 0;
  const all: Line[] = [];
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

function findFocus<T extends { product: string }>(
  rows: T[],
  patterns: { key: string; pattern: RegExp; label: string }[],
) {
  return patterns.map((p) => {
    const row = rows.find((r) => p.pattern.test(r.product));
    return { ...p, row: row ?? null };
  });
}

type RowResult = {
  invoiceItemId: string;
  product: string;
  dbQuantity: number | null;
  dbUnit: string | null;
  ocrUnit: string | null;
  structuredKind: string;
  beforeInsertUnit: string | null;
  afterInsertUnit: string | null;
  unitChanged: boolean;
};

mkdirSync(OUT, { recursive: true });

const allItems = await fetchAllInvoiceItems();

const rows: RowResult[] = allItems.map((item) => {
  const normalized = normalizeInvoiceItemFields(item);
  const before = beforePersistenceResolve(normalized);
  const after = afterPersistenceResolve(normalized);
  const structured = resolveInvoiceLinePurchaseFormat({
    name: normalized.name,
    quantity: normalized.quantity,
    unit: normalized.unit,
  });

  return {
    invoiceItemId: item.id,
    product: normalized.name,
    dbQuantity: normalized.quantity == null ? null : Number(normalized.quantity),
    dbUnit: item.unit,
    ocrUnit: normalized.unit,
    structuredKind: structured.kind,
    beforeInsertUnit: before,
    afterInsertUnit: after,
    unitChanged: before !== after,
  };
});

const changedRows = rows.filter((r) => r.unitChanged);
const expectedFixes = findFocus(rows, EXPECTED_FIXES);
const mustNotRegress = findFocus(rows, MUST_NOT_REGRESS);

const paccheri = expectedFixes.find((f) => f.key === "paccheri")?.row;
const ginger = expectedFixes.find((f) => f.key === "ginger")?.row;

const paccheriOk = paccheri?.beforeInsertUnit == null && paccheri?.afterInsertUnit === "un";
const gingerOk = ginger?.beforeInsertUnit == null && ginger?.afterInsertUnit === "un";
const noRegressions = mustNotRegress.every((m) => {
  if (!m.row) return true;
  return m.row.beforeInsertUnit === m.row.afterInsertUnit;
});
const blastRadiusOk = changedRows.length === 2;

const safeToMerge = paccheriOk && gingerOk && noRegressions && blastRadiusOk;

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  fix: "invoices.tsx resolveInvoiceItemUnit now passes quantity to resolveInvoicePersistedItemUnit",
  totalInvoiceItems: rows.length,
  changedRowCount: changedRows.length,
  changedRows,
  expectedFixes: expectedFixes.map((f) => ({
    key: f.key,
    label: f.label,
    found: Boolean(f.row),
    before: f.row?.beforeInsertUnit ?? null,
    after: f.row?.afterInsertUnit ?? null,
    dbUnit: f.row?.dbUnit ?? null,
    quantity: f.row?.dbQuantity ?? null,
    pass: f.key === "paccheri" ? paccheriOk : f.key === "ginger" ? gingerOk : null,
  })),
  mustNotRegress: mustNotRegress.map((m) => ({
    key: m.key,
    label: m.label,
    found: Boolean(m.row),
    before: m.row?.beforeInsertUnit ?? null,
    after: m.row?.afterInsertUnit ?? null,
    dbUnit: m.row?.dbUnit ?? null,
    unchanged: m.row ? m.row.beforeInsertUnit === m.row.afterInsertUnit : null,
  })),
  checks: {
    paccheri500gToUn: paccheriOk,
    gingerBeer020clToUn: gingerOk,
    noRegressionOnControls: noRegressions,
    blastRadiusOnlyPaccheriAndGinger: blastRadiusOk,
  },
  verdict: safeToMerge ? "Safe to merge" : "Needs adjustment",
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const fmtUnit = (v: string | null | undefined) => (v == null ? "null" : v);

const report = `# Embedded-measure call-site fix validation

**Generated:** ${results.generatedAt}  
**Validation Lab:** \`${VL}\`  
**Items replayed:** ${rows.length}

## Verdict: **${results.verdict}**

## Root cause fixed

Persistence call site in \`invoices.tsx\` now passes \`quantity\` into \`resolveInvoiceItemUnit\` / \`resolveInvoicePersistedItemUnit\`. The gated \`shouldInferUnForEmbeddedMeasureCountable\` requires integer quantity > 1; without quantity the resolver returned \`null\` even when resolver logic was deployed.

## Before / after — focus products

| Product | DB qty | OCR unit | Before (no qty) | After (with qty) | DB unit |
|---------|--------|----------|-----------------|------------------|---------|
| Paccheri 500g | ${paccheri?.dbQuantity ?? "—"} | ${fmtUnit(paccheri?.ocrUnit)} | **${fmtUnit(paccheri?.beforeInsertUnit)}** | **${fmtUnit(paccheri?.afterInsertUnit)}** | ${fmtUnit(paccheri?.dbUnit)} |
| Ginger Beer 0.20cl | ${ginger?.dbQuantity ?? "—"} | ${fmtUnit(ginger?.ocrUnit)} | **${fmtUnit(ginger?.beforeInsertUnit)}** | **${fmtUnit(ginger?.afterInsertUnit)}** | ${fmtUnit(ginger?.dbUnit)} |

## Regression controls (unchanged insert unit)

${mustNotRegress
  .map(
    (m) =>
      `- **${m.label}**: before=${m.row?.beforeInsertUnit ?? "not found"}, after=${m.row?.afterInsertUnit ?? "—"} ${m.row && m.row.beforeInsertUnit === m.row.afterInsertUnit ? "✓" : m.row ? "✗" : "(missing)"}`,
  )
  .join("\n")}

## Blast radius

Rows whose insert unit changes with this fix: **${changedRows.length}** (expected: 2 — Paccheri + Ginger only).

${changedRows.length > 0 ? changedRows.map((r) => `- ${r.product}: ${r.beforeInsertUnit} → ${r.afterInsertUnit}`).join("\n") : "_none_"}

## Tests

- \`src/lib/invoice-purchase-format.test.ts\` — resolver gate (unchanged)
- \`src/lib/invoice-persistence-unit-call-site.test.ts\` — persistence call-shape regression (new)

## Checks

| Check | Pass |
|-------|------|
| Paccheri 500g → un | ${paccheriOk ? "✓" : "✗"} |
| Ginger Beer 0.20cl → un | ${gingerOk ? "✓" : "✗"} |
| No regression on controls | ${noRegressions ? "✓" : "✗"} |
| Blast radius = 2 rows only | ${blastRadiusOk ? "✓" : "✗"} |
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log(JSON.stringify({ verdict: results.verdict, changedRowCount: changedRows.length }, null, 2));
