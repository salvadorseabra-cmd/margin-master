/**
 * Wave 2A: repair exactly 10 HIGH-confidence PACK_PRICE_BUG rows (production).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx vite-node scripts/repair-price-history-wave2a.mts [--execute]
 *
 * Without --execute: backup + allowlist + dry-run only.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import type { IngredientAliasMap, IngredientCanonicalInput } from "../src/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis";
import {
  defaultIsGenericUnit,
  operationalCostFieldsFromInvoiceLine,
} from "../src/lib/ingredient-auto-persist";
import {
  computePriceHistoryDelta,
  INGREDIENT_PRICE_EQ_EPS,
  operationalUnitPriceForPriceHistory,
  type PriceHistoryRecord,
} from "../src/lib/ingredient-price-history";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "../src/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { isEligibleInvoiceIngredientRow } from "../src/lib/invoice-unresolved-ingredient-count";
import { normalizeSupplierDisplayName } from "../src/lib/supplier-identity";
import {
  buildOperationalAlertItems,
  type MarginAlertData,
} from "../src/lib/margin-alert-data";
import { buildSupplierWatchlist } from "../src/lib/operational-intelligence-view";

const PROJECT_REF = "lhackrnlnrsiamorzmkb";
const WAVE2A_COUNT = 10;
const EPS = 0.01;
const EPS_REL = 0.005;
const PACK_RATIO_HIGH = 5;
const EXCLUDED_OUTLIER_IDS = new Set([
  "f6594a4e-8c5b-4ab1-be48-ae153c89f70e",
  "a2cde747-592f-4e4d-a894-de0965f1f454",
]);

const executeMode = process.argv.includes("--execute");
const allowlistFileArg = process.argv.find((a) => a.startsWith("--allowlist="));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function withinEps(a: number, b: number | null): boolean {
  if (b == null || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= EPS) return true;
  return diff / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= EPS_REL;
}

type ItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  invoices: { supplier_name: string | null } | null;
};

type HistoryRow = PriceHistoryRecord & { ingredient_unit?: string | null };

type Category = "PACK_PRICE_BUG" | "VALID" | "ORPHAN" | "UNKNOWN" | "STALE_HISTORY";

type ClassifiedRow = {
  row: HistoryRow;
  category: Category;
  hits: Array<{ unit_price: number; pq: number | null; operational: number }>;
  expectedNew: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  outlier: boolean;
};

function findMatches(
  h: HistoryRow,
  catalog: IngredientCanonicalInput[],
  aliases: IngredientAliasMap,
  itemsByInvoice: Map<string, ItemRow[]>,
) {
  if (!h.invoice_id) return [];
  const invoiceItems = itemsByInvoice.get(h.invoice_id) ?? [];
  const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
  const hits: ClassifiedRow["hits"] = [];
  for (const item of invoiceItems) {
    const norm = normalizeInvoiceItemFields(item);
    if (!isEligibleInvoiceIngredientRow(norm)) continue;
    const supplierScope = normalizeSupplierDisplayName(item.invoices?.supplier_name)?.trim() || null;
    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      norm.name,
      matchCatalog,
      aliases,
      supplierScope,
    );
    if (match?.ingredient.id !== h.ingredient_id) continue;
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
    const fields = operationalCostFieldsFromInvoiceLine(norm, { isGenericUnit: defaultIsGenericUnit });
    if (!fields?.current_price) continue;
    const op = operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity);
    if (op == null) continue;
    hits.push({
      unit_price: Number(item.unit_price),
      pq: fields.purchase_quantity ?? null,
      operational: op,
    });
  }
  return hits;
}

function classifyRow(
  h: HistoryRow,
  hits: ClassifiedRow["hits"],
  invoiceExists: boolean,
): Omit<ClassifiedRow, "row" | "expectedNew" | "confidence" | "outlier"> & {
  category: Category;
  hits: ClassifiedRow["hits"];
} {
  if (h.invoice_id == null || !invoiceExists) return { category: "ORPHAN", hits };
  if (hits.length === 0) return { category: "UNKNOWN", hits };
  const stored = Number(h.new_price);
  const op = hits[0]!.operational;
  const unitPrice = hits[0]!.unit_price;
  if (withinEps(stored, op)) return { category: "VALID", hits };
  if (withinEps(stored, unitPrice) && !withinEps(stored, op)) return { category: "PACK_PRICE_BUG", hits };
  if (!withinEps(stored, unitPrice) && !withinEps(stored, op)) return { category: "STALE_HISTORY", hits };
  return { category: "UNKNOWN", hits };
}

function repairConfidence(
  hits: ClassifiedRow["hits"],
  stored: number,
  expectedNew: number,
): "HIGH" | "MEDIUM" | "LOW" {
  if (hits.length !== 1) return "LOW";
  const ratio = expectedNew > 0 ? stored / expectedNew : null;
  if (ratio != null && ratio >= PACK_RATIO_HIGH) return "HIGH";
  if (ratio != null && ratio >= 1.5) return "MEDIUM";
  return "LOW";
}

type RepairPlan = {
  history_row_id: string;
  ingredient_id: string;
  ingredient: string;
  supplier: string | null;
  invoice_id: string;
  old_previous_price: number | null;
  old_new_price: number;
  old_delta: number | null;
  old_delta_percent: number | null;
  new_previous_price: number | null;
  new_new_price: number;
  new_delta: number | null;
  new_delta_percent: number | null;
  unit_price: number;
  pq: number | null;
  pack_to_operational_ratio: number;
};

function computeRollingRepairs(
  allHistory: HistoryRow[],
  repairIds: Set<string>,
): Map<string, RepairPlan> {
  const byIng = new Map<string, HistoryRow[]>();
  for (const r of allHistory) {
    const list = byIng.get(r.ingredient_id) ?? [];
    list.push(r);
    byIng.set(r.ingredient_id, list);
  }

  const plans = new Map<string, RepairPlan>();

  for (const list of byIng.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    let lastOperationalNew: number | null = null;
    for (const row of list) {
      const storedNew = Number(row.new_price);
      const isRepairTarget = repairIds.has(row.id);
      const newNew = isRepairTarget ? plans.get(row.id)?.new_new_price ?? storedNew : storedNew;
      const newPrev = isRepairTarget ? lastOperationalNew : (row.previous_price == null ? null : Number(row.previous_price));

      if (isRepairTarget) {
        const plan = plans.get(row.id)!;
        plan.new_previous_price = lastOperationalNew;
        const { delta, delta_percent } = computePriceHistoryDelta(lastOperationalNew, plan.new_new_price);
        plan.new_delta = delta;
        plan.new_delta_percent = delta_percent;
      }

      const chainNew = isRepairTarget ? plans.get(row.id)!.new_new_price : storedNew;
      lastOperationalNew = chainNew;
    }
  }

  return plans;
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !serviceKey) {
  console.error(JSON.stringify({ error: "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" }));
  process.exit(1);
}

if (!url.includes(PROJECT_REF)) {
  console.error(JSON.stringify({ error: `URL must target project ${PROJECT_REF}`, url }));
  process.exit(1);
}

const sb = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const [{ data: history, error: histErr }, { data: catalog }, { data: aliases }, { data: items }, { data: invoices }] =
  await Promise.all([
    sb.from("ingredient_price_history").select("*").order("created_at", { ascending: true }),
    sb.from("ingredients").select("id,name,normalized_name,unit,current_price,purchase_quantity,base_unit,purchase_unit"),
    sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
    sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,invoices!inner(supplier_name)"),
    sb.from("invoices").select("id"),
  ]);

if (histErr) throw new Error(histErr.message);

const allHistory = (history ?? []) as HistoryRow[];
const aliasesMap = buildConfirmedAliasMapFromRows(aliases ?? []);
const invoiceSet = new Set((invoices ?? []).map((i) => i.id));
const itemsByInvoice = new Map<string, ItemRow[]>();
for (const row of (items ?? []) as ItemRow[]) {
  const list = itemsByInvoice.get(row.invoice_id) ?? [];
  list.push(row);
  itemsByInvoice.set(row.invoice_id, list);
}

// STEP 0: Backup
const backupDir = join(process.cwd(), "scripts", "backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = join(backupDir, `ingredient_price_history_pre-wave2a-${timestamp}.json`);
writeFileSync(backupPath, JSON.stringify(allHistory, null, 2));

const checksums = {
  row_count: allHistory.length,
  id_hash: createHash("sha256").update(allHistory.map((r) => r.id).sort().join(",")).digest("hex").slice(0, 16),
  new_price_sum: allHistory.reduce((s, r) => s + Number(r.new_price), 0),
  timestamp,
  backup_path: backupPath,
};

// STEP 1: Classify and select allowlist
const classified: ClassifiedRow[] = [];
for (const h of allHistory) {
  const hits = findMatches(h, catalog as IngredientCanonicalInput[], aliasesMap, itemsByInvoice);
  const invoiceExists = h.invoice_id ? invoiceSet.has(h.invoice_id) : false;
  const { category, hits: h2 } = classifyRow(h, hits, invoiceExists);
  const stored = Number(h.new_price);
  let expectedNew: number | null = null;
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  let outlier = false;
  if (category === "PACK_PRICE_BUG" && hits.length > 0) {
    if (hits.length > 1) {
      const ops = [...new Set(hits.map((x) => x.operational))];
      if (ops.length > 1) outlier = true;
    }
    expectedNew = hits[0]!.operational;
    confidence = repairConfidence(hits, stored, expectedNew);
    if (hits.length !== 1) confidence = "LOW";
  }
  classified.push({ row: h, category, hits: h2, expectedNew, confidence, outlier });
}

const highCandidates = classified
  .filter(
    (c) =>
      c.category === "PACK_PRICE_BUG" &&
      c.confidence === "HIGH" &&
      !c.outlier &&
      !EXCLUDED_OUTLIER_IDS.has(c.row.id) &&
      c.expectedNew != null,
  )
  .sort((a, b) => a.row.created_at.localeCompare(b.row.created_at));

let allowlist = highCandidates.slice(0, WAVE2A_COUNT);
if (allowlistFileArg) {
  const fileIds = JSON.parse(readFileSync(allowlistFileArg.split("=")[1]!, "utf8")) as string[];
  allowlist = highCandidates.filter((c) => fileIds.includes(c.row.id));
  if (allowlist.length !== fileIds.length) {
    console.error(
      JSON.stringify({
        error: "Allowlist file mismatch",
        file_count: fileIds.length,
        resolved_count: allowlist.length,
      }),
    );
    process.exit(1);
  }
}
const allowlistIds = new Set(allowlist.map((c) => c.row.id));
const allowlistOutPath = join(backupDir, `wave2a-allowlist-${timestamp}.json`);
writeFileSync(allowlistOutPath, JSON.stringify([...allowlistIds], null, 2));

if (allowlist.length < WAVE2A_COUNT) {
  console.error(JSON.stringify({ error: `Only ${allowlist.length} HIGH candidates found, need ${WAVE2A_COUNT}` }));
  process.exit(1);
}

const repairPlans = new Map<string, RepairPlan>();
for (const c of allowlist) {
  const h = c.row;
  const hit = c.hits[0]!;
  repairPlans.set(h.id, {
    history_row_id: h.id,
    ingredient_id: h.ingredient_id,
    ingredient: h.ingredient_name ?? "",
    supplier: h.supplier_name,
    invoice_id: h.invoice_id!,
    old_previous_price: h.previous_price == null ? null : Number(h.previous_price),
    old_new_price: Number(h.new_price),
    old_delta: h.delta == null ? null : Number(h.delta),
    old_delta_percent: h.delta_percent == null ? null : Number(h.delta_percent),
    new_previous_price: null,
    new_new_price: c.expectedNew!,
    new_delta: null,
    new_delta_percent: null,
    unit_price: hit.unit_price,
    pq: hit.pq,
    pack_to_operational_ratio: Number((Number(h.new_price) / c.expectedNew!).toFixed(2)),
  });
}

// Rolling previous across full ingredient chronology
const byIng = new Map<string, HistoryRow[]>();
for (const r of allHistory) {
  const list = byIng.get(r.ingredient_id) ?? [];
  list.push(r);
  byIng.set(r.ingredient_id, list);
}
for (const list of byIng.values()) {
  list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  let lastOperationalNew: number | null = null;
  for (const row of list) {
    const plan = repairPlans.get(row.id);
    if (plan) {
      plan.new_previous_price = lastOperationalNew;
      const { delta, delta_percent } = computePriceHistoryDelta(lastOperationalNew, plan.new_new_price);
      plan.new_delta = delta;
      plan.new_delta_percent = delta_percent;
    }
    const chainNew = plan ? plan.new_new_price : Number(row.new_price);
    lastOperationalNew = chainNew;
  }
}

const allowlistReport = [...repairPlans.values()].map((p) => ({
  history_row_id: p.history_row_id,
  ingredient: p.ingredient,
  supplier: p.supplier,
  current_stored_new_price: p.old_new_price,
  expected_normalized_new_price: p.new_new_price,
  pack_to_operational_ratio: p.pack_to_operational_ratio,
}));

console.log(
  JSON.stringify(
    {
      phase: "pre_repair",
      selection_criteria:
        "PACK_PRICE_BUG + HIGH confidence (single match, ratio>=5, not outlier) + exclude f6594a4e/a2cde747; first 10 by created_at ASC",
      checksums,
      allowlist: allowlistReport,
      execute_mode: executeMode,
    },
    null,
    2,
  ),
);

if (!executeMode) {
  console.log(
    JSON.stringify({
      message: "Dry run complete. Pass --execute --allowlist=<path> to apply repairs.",
      allowlist_path: allowlistOutPath,
    }),
  );
  process.exit(0);
}

if (!allowlistFileArg) {
  console.error(
    JSON.stringify({
      error: "Execute requires --allowlist=<path> from dry run to prevent accidental re-selection.",
      hint: allowlistOutPath,
    }),
  );
  process.exit(1);
}

// STEP 2: Execute repairs
const updateResults: Array<{ id: string; ok: boolean; error?: string }> = [];
for (const plan of repairPlans.values()) {
  if (Math.abs(plan.old_new_price - plan.new_new_price) <= INGREDIENT_PRICE_EQ_EPS) {
    updateResults.push({ id: plan.history_row_id, ok: true });
    continue;
  }
  const { error } = await sb
    .from("ingredient_price_history")
    .update({
      previous_price: plan.new_previous_price,
      new_price: plan.new_new_price,
      delta: plan.new_delta,
      delta_percent: plan.new_delta_percent,
    })
    .eq("id", plan.history_row_id);
  updateResults.push({
    id: plan.history_row_id,
    ok: !error,
    error: error?.message,
  });
}

const failed = updateResults.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ phase: "repair_failed", failed }));
  process.exit(1);
}

// STEP 3: Post-repair validation
const { data: historyAfter } = await sb.from("ingredient_price_history").select("*");
const afterRows = (historyAfter ?? []) as HistoryRow[];

const postClassified: Array<{ id: string; category: Category }> = [];
for (const h of afterRows) {
  const hits = findMatches(h, catalog as IngredientCanonicalInput[], aliasesMap, itemsByInvoice);
  const invoiceExists = h.invoice_id ? invoiceSet.has(h.invoice_id) : false;
  const { category } = classifyRow(h, hits, invoiceExists);
  postClassified.push({ id: h.id, category });
}

const repairedValidation = [...repairPlans.values()].map((p) => {
  const after = afterRows.find((r) => r.id === p.history_row_id)!;
  const hits = findMatches(after, catalog as IngredientCanonicalInput[], aliasesMap, itemsByInvoice);
  const op = hits[0]?.operational ?? null;
  const stored = Number(after.new_price);
  return {
    history_row_id: p.history_row_id,
    post_category: postClassified.find((c) => c.id === p.history_row_id)?.category,
    reproducible: op != null && withinEps(stored, op),
    stored_new: stored,
    expected_operational: op,
  };
});

const categoryCounts = postClassified.reduce(
  (m, c) => {
    m[c.category] = (m[c.category] ?? 0) + 1;
    return m;
  },
  {} as Record<string, number>,
);

// Impact simulation (read-only)
const marginDataBefore: MarginAlertData = {
  ingredients: (catalog ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    base_unit: (i as { base_unit?: string }).base_unit ?? null,
    purchase_unit: (i as { purchase_unit?: string }).purchase_unit ?? null,
    current_price: i.current_price,
    purchase_quantity: i.purchase_quantity,
  })),
  recipes: [],
  priceHistory: allHistory as PriceHistoryRecord[],
  invoices: [],
};

const marginDataAfter: MarginAlertData = {
  ...marginDataBefore,
  priceHistory: afterRows as PriceHistoryRecord[],
};

const beforeAlerts = buildOperationalAlertItems(marginDataBefore);
const afterAlerts = buildOperationalAlertItems(marginDataAfter);
const affectedSuppliers = new Set([...repairPlans.values()].map((p) => p.supplier).filter(Boolean));

const beforeWatch = buildSupplierWatchlist(marginDataBefore, beforeAlerts, 50);
const afterWatch = buildSupplierWatchlist(marginDataAfter, afterAlerts, 50);

const watchDiff = [...affectedSuppliers].map((name) => {
  const b = beforeWatch.find((s) => s.supplierName === name);
  const a = afterWatch.find((s) => s.supplierName === name);
  return {
    supplier: name,
    before_increases: b?.increaseCount ?? 0,
    after_increases: a?.increaseCount ?? 0,
    before_maxPct: b?.maxChangePct ?? null,
    after_maxPct: a?.maxChangePct ?? null,
  };
});

const beforeAfter = [...repairPlans.values()].map((p) => ({
  history_row_id: p.history_row_id,
  ingredient: p.ingredient,
  supplier: p.supplier,
  old_previous_price: p.old_previous_price,
  new_previous_price: p.new_previous_price,
  old_new_price: p.old_new_price,
  new_new_price: p.new_new_price,
  old_delta: p.old_delta,
  new_delta: p.new_delta,
  old_delta_percent: p.old_delta_percent,
  new_delta_percent: p.new_delta_percent,
}));

console.log(
  JSON.stringify(
    {
      phase: "post_repair",
      updates_applied: updateResults.length,
      before_after: beforeAfter,
      validation: {
        repaired_all_valid: repairedValidation.every((r) => r.post_category === "VALID"),
        repaired_reproducibility: repairedValidation,
        category_counts: categoryCounts,
      },
      impact: {
        opportunities_before: beforeAlerts.length,
        opportunities_after: afterAlerts.length,
        opportunity_ids_removed: beforeAlerts.filter((a) => !afterAlerts.some((b) => b.id === a.id)).map((a) => a.id),
        opportunity_ids_added: afterAlerts.filter((a) => !beforeAlerts.some((b) => b.id === a.id)).map((a) => a.id),
        supplier_watch_diff: watchDiff,
      },
      financial_risks_note:
        "buildOwnerReviewFinancialRisks in operational-intelligence-synthesis.ts — not re-run here; depends on synthesis VM",
    },
    null,
    2,
  ),
);
