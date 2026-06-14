/**
 * Phase 4B — read cutover validation for Validation Lab.
 *
 *   ./node_modules/.bin/vite-node scripts/validate-match-lifecycle-read-cutover.mts
 *   ./node_modules/.bin/vite-node scripts/validate-match-lifecycle-read-cutover.mts --write-reports
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import {
  aggregateDualReadMetrics,
  buildPersistedMatchSnapshot,
  buildVirtualMatchSnapshot,
  compareVirtualAndPersistedMatch,
} from "../src/lib/invoice-item-match-dual-read";
import { resolveInvoiceTableRowIngredientMatch } from "../src/lib/invoice-ingredient-row-display";
import { resolveInvoiceRowIngredientMatch } from "../src/lib/invoice-ingredient-match-propagation";
import {
  aggregateReadCutoverMetrics,
  buildPersistedMatchMapFromRows,
  type ReadCutoverOutcome,
} from "../src/lib/invoice-item-match-read-cutover";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();
process.env.VITE_MATCH_LIFECYCLE_READ_CUTOVER = "true";

const PEPINO_INVOICE_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const OUTPUT_DIR = join(process.cwd(), ".tmp/match-lifecycle-phase4b-validation");

const writeReports = process.argv.includes("--write-reports") || !process.argv.includes("--json");

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !serviceRoleKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AuditLine = {
  invoiceItemId: string;
  itemName: string;
  supplierName: string | null;
  invoiceId: string;
  virtualDisplayState: string;
  cutoverDisplayState: string;
  persistedStatus: string | null;
  outcome: ReadCutoverOutcome | undefined;
  dualReadAlignment: string;
  intentionalStatusDrift: boolean;
};

async function loadAuditData() {
  const [{ data: items, error: itemsErr }, { data: matches, error: matchesErr }] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select("id,name,invoice_id,invoices!inner(supplier_name)"),
      supabase
        .from("invoice_item_matches")
        .select("invoice_item_id,ingredient_id,status,match_kind"),
    ]);

  if (itemsErr) throw itemsErr;
  if (matchesErr) throw matchesErr;

  const [{ data: aliasRows, error: aliasErr }, catalogResult] = await Promise.all([
    supabase
      .from("ingredient_aliases")
      .select("ingredient_id, alias_name, normalized_alias, supplier_name")
      .eq("confirmed_by_user", true),
    loadCanonicalIngredientCatalog(supabase),
  ]);
  if (aliasErr) throw aliasErr;
  if (catalogResult.error) throw catalogResult.error;

  const confirmedAliases = buildConfirmedAliasMapFromRows(aliasRows ?? []);
  const matchByItemId = buildPersistedMatchMapFromRows(matches ?? []);

  const lines: AuditLine[] = [];
  const outcomes: (ReadCutoverOutcome | undefined)[] = [];
  const dualReadResults = [];

  for (const item of items ?? []) {
    const nested = item.invoices as { supplier_name: string | null };
    const supplierName = nested.supplier_name ?? null;
    const persisted = matchByItemId.get(item.id) ?? null;

    const { match: virtualMatch } = resolveInvoiceRowIngredientMatch(
      item.name ?? "",
      catalogResult.rows,
      confirmedAliases,
      supplierName,
    );
    const virtualDisplay = buildVirtualMatchSnapshot(virtualMatch).displayState;

    const { state: cutoverState } = resolveInvoiceTableRowIngredientMatch(
      item.name ?? "",
      catalogResult.rows,
      confirmedAliases,
      supplierName,
      undefined,
      {
        invoiceItemId: item.id,
        persistedMatch: persisted,
      },
    );

    const dualRead = compareVirtualAndPersistedMatch({
      invoiceItemId: item.id,
      virtual: buildVirtualMatchSnapshot(virtualMatch),
      persisted: persisted ? buildPersistedMatchSnapshot(persisted) : null,
    });
    dualReadResults.push(dualRead);

    let outcome: ReadCutoverOutcome | undefined;
    if (!persisted) {
      outcome = "missing_record";
    } else if (dualRead.alignment === "drifted") {
      outcome = "mismatch";
    } else {
      outcome = "persisted_hit";
    }
    outcomes.push(outcome);

    lines.push({
      invoiceItemId: item.id,
      itemName: item.name ?? "",
      supplierName,
      invoiceId: item.invoice_id,
      virtualDisplayState: virtualDisplay,
      cutoverDisplayState: cutoverState.displayState,
      persistedStatus: persisted?.status ?? null,
      outcome,
      dualReadAlignment: dualRead.alignment,
      intentionalStatusDrift: dualRead.intentionalStatusDrift,
    });
  }

  const dualReadMetrics = aggregateDualReadMetrics(dualReadResults);
  const cutoverMetrics = aggregateReadCutoverMetrics(outcomes, dualReadResults);

  return {
    lines,
    dualReadMetrics,
    cutoverMetrics,
    invoiceItemsCount: items?.length ?? 0,
    matchRecordsCount: matches?.length ?? 0,
    flags: {
      shadowSeed: process.env.VITE_MATCH_LIFECYCLE_SHADOW_SEED ?? "(unset)",
      dualWrite: process.env.VITE_MATCH_LIFECYCLE_DUAL_WRITE ?? "(unset)",
      readCutover: process.env.VITE_MATCH_LIFECYCLE_READ_CUTOVER ?? "(unset)",
    },
  };
}

function deriveVerdict(audit: Awaited<ReturnType<typeof loadAuditData>>): string {
  const { dualReadMetrics, cutoverMetrics, invoiceItemsCount, matchRecordsCount } = audit;
  if (dualReadMetrics.drifted > 0 || dualReadMetrics.missing > 0 || dualReadMetrics.orphaned > 0) {
    return "ROLLBACK_RECOMMENDED";
  }
  if (cutoverMetrics.missingRecords > 0) {
    return "CUTOVER_WITH_FALLBACKS";
  }
  if (matchRecordsCount < invoiceItemsCount) {
    return "CUTOVER_WITH_FALLBACKS";
  }
  if (cutoverMetrics.mismatches > 0) {
    return "ROLLBACK_RECOMMENDED";
  }
  return "CUTOVER_SUCCESSFUL";
}

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => "---");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function writeDeliverables(audit: Awaited<ReturnType<typeof loadAuditData>>) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const { lines, dualReadMetrics, cutoverMetrics, invoiceItemsCount, matchRecordsCount, flags } =
    audit;
  const verdict = deriveVerdict(audit);
  const pepino = lines.find(
    (line) =>
      line.itemName.toLowerCase() === "pepino" && line.invoiceId === PEPINO_INVOICE_ID,
  );
  const fallbackLines = lines.filter((line) => line.outcome === "missing_record");
  const generatedAt = new Date().toISOString().slice(0, 10);

  writeFileSync(
    join(OUTPUT_DIR, "READ_CUTOVER_REPORT.md"),
    `# Phase 4B Read Cutover Report

**Generated:** ${generatedAt} · **Mode:** read cutover ON (simulated)

---

## Coverage

${mdTable(
  ["Metric", "Value"],
  [
    ["\`invoice_items\`", String(invoiceItemsCount)],
    ["\`invoice_item_matches\`", String(matchRecordsCount)],
    ["Coverage", `${matchRecordsCount}/${invoiceItemsCount}`],
  ],
)}

---

## Cutover Metrics

${mdTable(
  ["Metric", "Count"],
  [
    ["Persisted hits", String(cutoverMetrics.persistedHits)],
    ["Fallback hits", String(cutoverMetrics.fallbackHits)],
    ["Missing persisted rows", String(cutoverMetrics.missingRecords)],
    ["Unexpected mismatches", String(cutoverMetrics.mismatches)],
    ["Intentional status drift (Pepino-class)", String(cutoverMetrics.intentionalStatusDrift)],
  ],
)}

---

## Dual-Read Baseline (unchanged)

${mdTable(
  ["Metric", "Count"],
  [
    ["Aligned", String(dualReadMetrics.aligned)],
    ["Drifted", String(dualReadMetrics.drifted)],
    ["Missing", String(dualReadMetrics.missing)],
    ["Orphaned", String(dualReadMetrics.orphaned)],
  ],
)}

---

## Flags

${mdTable(
  ["Flag", "Value"],
  [
    ["\`VITE_MATCH_LIFECYCLE_SHADOW_SEED\`", flags.shadowSeed],
    ["\`VITE_MATCH_LIFECYCLE_DUAL_WRITE\`", flags.dualWrite],
    ["\`VITE_MATCH_LIFECYCLE_READ_CUTOVER\`", flags.readCutover],
  ],
)}
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "FALLBACK_ANALYSIS.md"),
    `# Phase 4B Fallback Analysis

**Generated:** ${generatedAt}

---

## Summary

- **Missing persisted rows:** ${cutoverMetrics.missingRecords}
- **Fallback resolution lines:** ${fallbackLines.length}

${
  fallbackLines.length === 0
    ? "All VL lines resolved from persisted records — no fallbacks required."
    : fallbackLines
        .map((line) => `- \`${line.invoiceItemId}\` **${line.itemName}** — virtual \`${line.virtualDisplayState}\``)
        .join("\n")
}
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "PEPINO_BEHAVIOR.md"),
    `# Pepino Behavior — Read Cutover

**Generated:** ${generatedAt}

---

${
  pepino
    ? mdTable(
        ["Field", "Virtual (flag OFF)", "Cutover (flag ON)", "Persisted"],
        [
          ["Display / status", pepino.virtualDisplayState, pepino.cutoverDisplayState, pepino.persistedStatus ?? "—"],
          ["Outcome", "—", pepino.outcome ?? "—", "—"],
          ["Intentional drift", "—", pepino.intentionalStatusDrift ? "yes" : "no", "—"],
        ],
      )
    : "_Pepino line not found._"
}

---

## Expected

Cutover ON: Pepino shows **suggested** (persisted \`suggested\`) instead of virtual **confirmed** (bare \`exact\`).
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "VALIDATION_RESULTS.md"),
    `# Phase 4B Validation Results

**Generated:** ${generatedAt}

---

## Test execution

Run locally:

\`\`\`bash
npm test -- src/lib/invoice-item-match-read-cutover.test.ts src/lib/invoice-item-match-dual-read.test.ts src/lib/invoice-ingredient-row-display.test.ts
./node_modules/.bin/vite-node scripts/validate-match-lifecycle-read-cutover.mts --write-reports
\`\`\`

---

## VL audit summary

| Check | Result |
|-------|--------|
| Coverage | ${matchRecordsCount}/${invoiceItemsCount} |
| Persisted hits | ${cutoverMetrics.persistedHits} |
| Fallbacks | ${cutoverMetrics.fallbackHits} |
| Unexpected dual-read drift | ${dualReadMetrics.drifted} |
| Pepino intentional drift | ${pepino?.intentionalStatusDrift ? "PASS" : "MISSING"} |
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "FINAL_VERDICT.md"),
    `# Phase 4B Final Verdict

**Generated:** ${generatedAt}

---

## Verdict

**\`${verdict}\`**

---

## Evidence

| Check | Result |
|-------|--------|
| VL coverage ${matchRecordsCount}/${invoiceItemsCount} | ${cutoverMetrics.missingRecords === 0 ? "PASS" : "FALLBACK"} |
| Unexpected dual-read drift | ${dualReadMetrics.drifted} |
| Cutover mismatches | ${cutoverMetrics.mismatches} |
| Pepino suggested under cutover | ${pepino?.cutoverDisplayState === "suggested" ? "PASS" : "FAIL"} |

---

## Rationale

${
  verdict === "CUTOVER_SUCCESSFUL"
    ? "All VL lines have persisted records. Read cutover resolves from invoice_item_matches with no unexpected drift beyond documented Pepino status alignment."
    : verdict === "CUTOVER_WITH_FALLBACKS"
      ? "Cutover is safe but some lines still fall back to virtual matcher when persisted rows are absent."
      : "Unexpected drift or mismatches block production cutover — keep VITE_MATCH_LIFECYCLE_READ_CUTOVER=false."
}
`,
  );
}

const audit = await loadAuditData();
const verdict = deriveVerdict(audit);

console.log(
  JSON.stringify(
    {
      verdict,
      cutoverMetrics: audit.cutoverMetrics,
      dualReadMetrics: audit.dualReadMetrics,
      invoiceItemsCount: audit.invoiceItemsCount,
      matchRecordsCount: audit.matchRecordsCount,
    },
    null,
    2,
  ),
);

if (writeReports) {
  writeDeliverables(audit);
  console.error(`Reports written to ${OUTPUT_DIR}`);
}

if (verdict === "ROLLBACK_RECOMMENDED") {
  process.exit(1);
}
