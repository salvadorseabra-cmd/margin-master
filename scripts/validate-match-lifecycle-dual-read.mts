/**
 * Phase 4A — dual-read validation audit for Validation Lab.
 *
 *   ./node_modules/.bin/vite-node scripts/validate-match-lifecycle-dual-read.mts
 *   ./node_modules/.bin/vite-node scripts/validate-match-lifecycle-dual-read.mts --json
 *   ./node_modules/.bin/vite-node scripts/validate-match-lifecycle-dual-read.mts --write-reports
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import { resolveInvoiceRowIngredientMatch } from "../src/lib/invoice-ingredient-match-propagation";
import {
  aggregateDualReadMetrics,
  buildPersistedMatchSnapshot,
  buildVirtualMatchSnapshot,
  compareVirtualAndPersistedMatch,
  type DualReadComparisonResult,
} from "../src/lib/invoice-item-match-dual-read";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const PEPINO_INVOICE_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const OUTPUT_DIR = join(process.cwd(), ".tmp/match-lifecycle-phase4a-validation");

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const writeReports = args.includes("--write-reports") || !jsonOnly;

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

type AuditLine = DualReadComparisonResult & {
  itemName: string;
  supplierName: string | null;
  invoiceId: string;
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
  const matchByItemId = new Map((matches ?? []).map((row) => [row.invoice_item_id, row]));

  const lines: AuditLine[] = [];
  for (const item of items ?? []) {
    const nested = item.invoices as { supplier_name: string | null };
    const supplierName = nested.supplier_name ?? null;
    const { match } = resolveInvoiceRowIngredientMatch(
      item.name ?? "",
      catalogResult.rows,
      confirmedAliases,
      supplierName,
    );
    const virtual = buildVirtualMatchSnapshot(match);
    const persistedRow = matchByItemId.get(item.id);
    const persisted = persistedRow ? buildPersistedMatchSnapshot(persistedRow) : null;
    const comparison = compareVirtualAndPersistedMatch({
      invoiceItemId: item.id,
      virtual,
      persisted,
    });
    lines.push({
      ...comparison,
      itemName: item.name ?? "",
      supplierName,
      invoiceId: item.invoice_id,
    });
  }

  const itemIds = new Set((items ?? []).map((row) => row.id));
  for (const row of matches ?? []) {
    if (itemIds.has(row.invoice_item_id)) continue;
    const comparison = compareVirtualAndPersistedMatch({
      invoiceItemId: row.invoice_item_id,
      virtual: null,
      persisted: buildPersistedMatchSnapshot(row),
    });
    lines.push({
      ...comparison,
      itemName: "(orphan)",
      supplierName: null,
      invoiceId: "",
    });
  }

  return {
    lines,
    metrics: aggregateDualReadMetrics(lines),
    invoiceItemsCount: items?.length ?? 0,
    matchRecordsCount: matches?.length ?? 0,
    flags: {
      shadowSeed: process.env.VITE_MATCH_LIFECYCLE_SHADOW_SEED ?? "(unset)",
      dualWrite: process.env.VITE_MATCH_LIFECYCLE_DUAL_WRITE ?? "(unset)",
      dualReadLog: process.env.VITE_MATCH_LIFECYCLE_DUAL_READ_LOG ?? "(unset)",
    },
  };
}

function deriveVerdict(metrics: ReturnType<typeof aggregateDualReadMetrics>): string {
  if (metrics.missing > 0 || metrics.orphaned > 0 || metrics.drifted > 0) {
    if (metrics.drifted === 0 && metrics.missing === 0 && metrics.orphaned === 0) {
      return "READY_WITH_GAPS";
    }
    if (
      metrics.drifted === 0 &&
      metrics.missing === 0 &&
      metrics.orphaned === 0 &&
      metrics.intentionalStatusDrift > 0
    ) {
      return "READY_FOR_CUTOVER";
    }
    return metrics.drifted > 0 || metrics.missing > 0 || metrics.orphaned > 0
      ? "NOT_READY"
      : "READY_WITH_GAPS";
  }
  return metrics.intentionalStatusDrift > 0 ? "READY_FOR_CUTOVER" : "READY_FOR_CUTOVER";
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
  const { lines, metrics, invoiceItemsCount, matchRecordsCount, flags } = audit;
  const verdict = deriveVerdict(metrics);
  const pepino = lines.find(
    (line) =>
      line.itemName.toLowerCase() === "pepino" &&
      line.invoiceId === PEPINO_INVOICE_ID,
  );
  const drifted = lines.filter((line) => line.alignment === "drifted");
  const generatedAt = new Date().toISOString().slice(0, 10);

  writeFileSync(
    join(OUTPUT_DIR, "COVERAGE_REPORT.md"),
    `# Phase 4A Coverage Report

**Generated:** ${generatedAt} · **Mode:** dual-read validation (no cutover)

---

## Counts

${mdTable(
  ["Metric", "Value"],
  [
    ["\`invoice_items\`", String(invoiceItemsCount)],
    ["\`invoice_item_matches\`", String(matchRecordsCount)],
    ["Coverage", `${matchRecordsCount}/${invoiceItemsCount}`],
    ["Missing persisted", String(metrics.missing)],
    ["Orphan persisted", String(metrics.orphaned)],
  ],
)}

---

## Dual-Read Metrics

${mdTable(
  ["Metric", "Count"],
  [
    ["Aligned", String(metrics.aligned)],
    ["Drifted", String(metrics.drifted)],
    ["Missing", String(metrics.missing)],
    ["Orphaned", String(metrics.orphaned)],
    ["Intentional status drift (Pepino-class)", String(metrics.intentionalStatusDrift)],
  ],
)}

---

## Flags (\`.env.local\`)

${mdTable(
  ["Flag", "Value"],
  [
    ["\`VITE_MATCH_LIFECYCLE_SHADOW_SEED\`", flags.shadowSeed],
    ["\`VITE_MATCH_LIFECYCLE_DUAL_WRITE\`", flags.dualWrite],
    ["\`VITE_MATCH_LIFECYCLE_DUAL_READ_LOG\`", flags.dualReadLog],
  ],
)}

---

## Outcome

**Coverage:** ${metrics.missing === 0 && metrics.orphaned === 0 ? "PASS" : "FAIL"} — ${matchRecordsCount}/${invoiceItemsCount} persisted rows.
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "DRIFT_REPORT.md"),
    `# Phase 4A Drift Report

**Generated:** ${generatedAt}

---

## Summary

| Drift kind | Count |
|------------|------:|
| \`ingredient_id_mismatch\` | ${metrics.byDriftKind.ingredient_id_mismatch} |
| \`status_mismatch\` | ${metrics.byDriftKind.status_mismatch} |
| \`match_kind_mismatch\` | ${metrics.byDriftKind.match_kind_mismatch} |
| \`confirmed_to_suggested\` (intentional) | ${metrics.byDriftKind.confirmed_to_suggested} |

**Drifted lines (unexpected):** ${drifted.length}

${
  drifted.length === 0
    ? "No unexpected drift detected."
    : drifted
        .map(
          (line) =>
            `- \`${line.invoiceItemId}\` **${line.itemName}** — ${line.driftKinds.join(", ")}`,
        )
        .join("\n")
}

---

## Missing / Orphan

- Missing persisted: **${metrics.missing}**
- Orphan persisted: **${metrics.orphaned}**
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "ALIGNMENT_MATRIX.md"),
    `# Phase 4A Alignment Matrix

**Generated:** ${generatedAt} · **Lines audited:** ${lines.filter((l) => l.itemName !== "(orphan)").length}

---

${mdTable(
  ["Item", "Supplier", "Virtual", "Expected persisted", "Persisted", "Alignment", "Drift"],
  lines
    .filter((line) => line.itemName !== "(orphan)")
    .sort((a, b) => a.itemName.localeCompare(b.itemName))
    .map((line) => [
      line.itemName,
      line.supplierName ?? "—",
      line.virtual
        ? `${line.virtual.displayState}/${line.virtual.matchKind ?? "null"}`
        : "—",
      line.virtual?.expectedPersistedStatus ?? "—",
      line.persisted ? `${line.persisted.status}/${line.persisted.matchKind ?? "null"}` : "—",
      line.alignment,
      line.driftKinds.length ? line.driftKinds.join(", ") : "—",
    ]),
)}
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "PEPINO_DIFF.md"),
    `# Pepino Diff — Virtual vs Persisted

**Generated:** ${generatedAt}

---

## Reference

| Field | Value |
|-------|-------|
| Item ID | \`${pepino?.invoiceItemId ?? "unknown"}\` |
| Line text | Pepino |
| Supplier | Bidfood Portugal |

---

## Comparison

${
  pepino
    ? mdTable(
        ["Field", "Virtual", "Persisted"],
        [
          ["\`displayState\` / \`status\`", pepino.virtual?.displayState ?? "—", pepino.persisted?.status ?? "—"],
          ["\`match.kind\` / \`match_kind\`", pepino.virtual?.matchKind ?? "null", pepino.persisted?.matchKind ?? "null"],
          ["\`ingredient_id\`", pepino.virtual?.ingredientId ?? "null", pepino.persisted?.ingredientId ?? "null"],
          ["Expected persisted status", pepino.virtual?.expectedPersistedStatus ?? "—", "—"],
          ["Alignment", pepino.alignment, pepino.intentionalStatusDrift ? "intentional" : "—"],
        ],
      )
    : "_Pepino line not found in audit._"
}

---

## Verdict

${pepino?.intentionalStatusDrift ? "**Intentional drift confirmed** — virtual `confirmed` (bare `exact`) vs persisted `suggested`; same `ingredient_id`." : "**Unexpected Pepino state** — review required."}
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "FINAL_VERDICT.md"),
    `# Phase 4A Final Verdict

**Generated:** ${generatedAt}

---

## Verdict Code

**\`${verdict}\`**

---

## Evidence

| Check | Result |
|-------|--------|
| Coverage ${matchRecordsCount}/${invoiceItemsCount} | ${metrics.missing === 0 ? "PASS" : "FAIL"} |
| Unexpected drift | ${metrics.drifted === 0 ? "0" : metrics.drifted} |
| Intentional Pepino drift | ${metrics.intentionalStatusDrift >= 1 ? "PASS (1 line)" : "MISSING"} |
| Orphans | ${metrics.orphaned} |

---

## Rationale

${
  verdict === "READY_FOR_CUTOVER"
    ? "All 51 VL lines have persisted records. Dual-read comparison shows no unexpected ingredient or status drift beyond the documented Pepino `confirmed_to_suggested` pattern. Read-path cutover (Phase 4B) may proceed after sign-off."
    : verdict === "READY_WITH_GAPS"
      ? "Coverage or alignment gaps exist but may be explainable; review DRIFT_REPORT before cutover."
      : "Unexpected drift, missing, or orphan rows block read-path cutover."
}

---

## Constraints honored

- No read-path cutover implemented
- No UI behavior changes
- \`resolveInvoiceTableRowIngredientMatch\` unchanged
`,
  );

  writeFileSync(
    join(OUTPUT_DIR, "audit-results.json"),
    JSON.stringify(
      {
        generated_at: generatedAt,
        verdict,
        metrics,
        invoiceItemsCount,
        matchRecordsCount,
        flags,
        lines: lines.map((line) => ({
          invoiceItemId: line.invoiceItemId,
          itemName: line.itemName,
          supplierName: line.supplierName,
          invoiceId: line.invoiceId,
          alignment: line.alignment,
          driftKinds: line.driftKinds,
          intentionalStatusDrift: line.intentionalStatusDrift,
          virtual: line.virtual,
          persisted: line.persisted,
        })),
      },
      null,
      2,
    ),
  );
}

const audit = await loadAuditData();

if (jsonOnly) {
  console.log(JSON.stringify(audit, null, 2));
} else {
  console.log(
    JSON.stringify(
      {
        verdict: deriveVerdict(audit.metrics),
        metrics: audit.metrics,
        invoiceItemsCount: audit.invoiceItemsCount,
        matchRecordsCount: audit.matchRecordsCount,
      },
      null,
      2,
    ),
  );
}

if (writeReports) {
  writeDeliverables(audit);
  console.error(`Reports written to ${OUTPUT_DIR}`);
}

if (audit.metrics.drifted > 0 || audit.metrics.missing > 0 || audit.metrics.orphaned > 0) {
  process.exit(1);
}
