/**
 * Bootstrap first ingredient_price_history rows for VL ingredients with confirmed
 * invoice_item_matches but zero linked history (bootstrap fix in append path).
 *
 *   npx vite-node scripts/bootstrap-ingredient-price-history.mts          # dry-run
 *   npx vite-node scripts/bootstrap-ingredient-price-history.mts --apply  # write
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  defaultIsGenericUnit,
  operationalCostFieldsFromInvoiceLine,
} from "../src/lib/ingredient-auto-persist";
import {
  appendIngredientPriceHistoryFromInvoiceLine,
  operationalUnitPriceForPriceHistory,
} from "../src/lib/ingredient-price-history";
import {
  derivePurchaseContractSnapshot,
  shouldBlockHistoryInsert,
} from "../src/lib/ingredient-price-chain-guard";
import {
  compareInvoiceChronologyDesc,
  resolveInvoiceChronology,
} from "../src/lib/invoice-chronology";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { normalizeSupplierDisplayName } from "../src/lib/supplier-identity";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const VL_INVOICE_IDS = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
];

const applyMode = process.argv.includes("--apply");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(process.cwd(), ".tmp", "bootstrap-ingredient-price-history");
mkdirSync(outDir, { recursive: true });

function compareInvoiceChronologyAsc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return -compareInvoiceChronologyDesc(a, b);
}

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const sb = createClient<Database>(
  `https://${VL_REF}.supabase.co`,
  projectKey("service_role"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type MatchRow = {
  invoice_item_id: string;
  ingredient_id: string;
  status: string;
  invoice_items: {
    id: string;
    invoice_id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
  } | null;
  invoices: {
    id: string;
    supplier_name: string | null;
    invoice_date: string | null;
    created_at: string | null;
  } | null;
};

type IngredientRow = {
  id: string;
  name: string;
  unit: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
};

type HistoryCountRow = { ingredient_id: string };

const [{ data: matches }, { data: ingredients }, { data: historyCounts }] = await Promise.all([
  sb
    .from("invoice_item_matches")
    .select(
      "invoice_item_id,ingredient_id,status,invoice_items(id,invoice_id,name,quantity,unit,unit_price,total),invoices(id,supplier_name,invoice_date,created_at)",
    )
    .eq("status", "confirmed"),
  sb.from("ingredients").select("id,name,unit,current_price,purchase_quantity"),
  sb.from("ingredient_price_history").select("ingredient_id"),
]);

const ingredientById = new Map((ingredients ?? []).map((ing) => [ing.id, ing as IngredientRow]));

const historyCountByIngredient = new Map<string, number>();
for (const row of (historyCounts ?? []) as HistoryCountRow[]) {
  const id = row.ingredient_id?.trim();
  if (!id) continue;
  historyCountByIngredient.set(id, (historyCountByIngredient.get(id) ?? 0) + 1);
}

const confirmedVlMatches = (matches ?? []).filter((m) => {
  const item = (m as MatchRow).invoice_items;
  return item?.invoice_id && VL_INVOICE_IDS.includes(item.invoice_id);
}) as MatchRow[];

const staleIngredientIds = [
  ...new Set(
    confirmedVlMatches
      .map((m) => m.ingredient_id?.trim())
      .filter((id): id is string => Boolean(id))
      .filter((id) => (historyCountByIngredient.get(id) ?? 0) === 0),
  ),
].sort((a, b) =>
  (ingredientById.get(a)?.name ?? "").localeCompare(ingredientById.get(b)?.name ?? ""),
);

const beforeList = staleIngredientIds.map((id) => ({
  ingredient_id: id,
  name: ingredientById.get(id)?.name ?? id,
  history_rows: 0,
}));

type PlannedInsert = {
  ingredient_id: string;
  ingredient_name: string;
  invoice_id: string;
  invoice_item_id: string;
  line_name: string;
  invoice_date: string | null;
  new_price_pack: number;
  new_price_operational: number;
  previous_price_pack: number | null;
  bootstrap: boolean;
  blocked?: boolean;
  block_reason?: string;
  skipped_reason?: string;
  history_id?: string;
};

const linesByIngredient = new Map<string, Array<{
  match: MatchRow;
  sortDate: string | null;
  supplierName: string | null;
}>>();

for (const match of confirmedVlMatches) {
  const ingredientId = match.ingredient_id?.trim();
  if (!ingredientId || !staleIngredientIds.includes(ingredientId)) continue;
  const item = match.invoice_items;
  if (!item) continue;
  const chrono = resolveInvoiceChronology(match.invoices);
  const bucket = linesByIngredient.get(ingredientId) ?? [];
  bucket.push({
    match,
    sortDate: chrono.displayDateIso,
    supplierName: normalizeSupplierDisplayName(match.invoices?.supplier_name),
  });
  linesByIngredient.set(ingredientId, bucket);
}

for (const [, lines] of linesByIngredient) {
  lines.sort((a, b) => compareInvoiceChronologyAsc(a.sortDate, b.sortDate));
}

const lastPackByIngredient = new Map<string, number | null>();
const lastQtyByIngredient = new Map<string, number | null>();
for (const id of staleIngredientIds) {
  const ing = ingredientById.get(id);
  const pack = ing?.current_price == null ? null : Number(ing.current_price);
  lastPackByIngredient.set(id, pack != null && Number.isFinite(pack) ? pack : null);
  const qty = ing?.purchase_quantity == null ? null : Number(ing.purchase_quantity);
  lastQtyByIngredient.set(id, qty != null && Number.isFinite(qty) ? qty : null);
}

const planned: PlannedInsert[] = [];
const blocked: PlannedInsert[] = [];
const created: PlannedInsert[] = [];
const skipped: PlannedInsert[] = [];
const errors: string[] = [];

for (const ingredientId of staleIngredientIds) {
  const meta = ingredientById.get(ingredientId);
  const lines = linesByIngredient.get(ingredientId) ?? [];

  for (const { match, sortDate, supplierName } of lines) {
    const item = match.invoice_items!;
    const norm = normalizeInvoiceItemFields(item);
    const fields = operationalCostFieldsFromInvoiceLine(norm, {
      isGenericUnit: defaultIsGenericUnit,
    });
    if (!fields || fields.current_price == null) {
      skipped.push({
        ingredient_id: ingredientId,
        ingredient_name: meta?.name ?? ingredientId,
        invoice_id: item.invoice_id,
        invoice_item_id: item.id,
        line_name: norm.name,
        invoice_date: sortDate,
        new_price_pack: NaN,
        new_price_operational: NaN,
        previous_price_pack: lastPackByIngredient.get(ingredientId) ?? null,
        bootstrap: (historyCountByIngredient.get(ingredientId) ?? 0) === 0,
        skipped_reason: "no_operational_fields",
      });
      continue;
    }

    const newPrice = fields.current_price;
    const storedNew = operationalUnitPriceForPriceHistory(newPrice, fields.purchase_quantity);
    if (storedNew == null) {
      skipped.push({
        ingredient_id: ingredientId,
        ingredient_name: meta?.name ?? ingredientId,
        invoice_id: item.invoice_id,
        invoice_item_id: item.id,
        line_name: norm.name,
        invoice_date: sortDate,
        new_price_pack: newPrice,
        new_price_operational: NaN,
        previous_price_pack: lastPackByIngredient.get(ingredientId) ?? null,
        bootstrap: (historyCountByIngredient.get(ingredientId) ?? 0) === 0,
        skipped_reason: "normalization_failed",
      });
      continue;
    }

    const snap = derivePurchaseContractSnapshot({
      name: meta?.name ?? norm.name,
      operationalUnitPrice: storedNew,
      purchaseQuantity: fields.purchase_quantity ?? null,
      ingredientUnit: meta?.unit ?? null,
    });

    const previousPrice = lastPackByIngredient.get(ingredientId) ?? null;
    const previousQty = lastQtyByIngredient.get(ingredientId) ?? null;
    const isBootstrap = (historyCountByIngredient.get(ingredientId) ?? 0) === 0;

    const plan: PlannedInsert = {
      ingredient_id: ingredientId,
      ingredient_name: meta?.name ?? ingredientId,
      invoice_id: item.invoice_id,
      invoice_item_id: item.id,
      line_name: norm.name,
      invoice_date: sortDate,
      new_price_pack: newPrice,
      new_price_operational: storedNew,
      previous_price_pack: isBootstrap ? null : previousPrice,
      bootstrap: isBootstrap,
    };

    if (shouldBlockHistoryInsert(snap)) {
      plan.blocked = true;
      plan.block_reason = "shouldBlockHistoryInsert";
      blocked.push(plan);
      planned.push(plan);
      continue;
    }

    planned.push(plan);

    if (!applyMode) continue;

    const append = await appendIngredientPriceHistoryFromInvoiceLine(sb, {
      ingredientId,
      invoiceId: item.invoice_id,
      ingredientName: meta?.name?.trim() || norm.name,
      ingredientUnit: meta?.unit ?? null,
      supplierName: supplierName,
      previousPrice,
      newPrice,
      previousPurchaseQuantity: previousQty,
      newPurchaseQuantity: fields.purchase_quantity,
      invoiceDate: sortDate,
      invoiceCreatedAt: match.invoices?.created_at ?? null,
    });

    if (append.error) {
      errors.push(`${ingredientId}/${item.invoice_id}: ${append.error.message}`);
      continue;
    }

    if (append.skippedReason) {
      plan.skipped_reason = append.skippedReason;
      skipped.push(plan);
      continue;
    }

    if (append.inserted || append.updated) {
      const { data: row } = await sb
        .from("ingredient_price_history")
        .select("id,new_price,previous_price")
        .eq("ingredient_id", ingredientId)
        .eq("invoice_id", item.invoice_id)
        .maybeSingle();

      plan.history_id = row?.id;
      plan.new_price_operational = row?.new_price == null ? storedNew : Number(row.new_price);
      created.push(plan);
      historyCountByIngredient.set(ingredientId, (historyCountByIngredient.get(ingredientId) ?? 0) + 1);
      lastPackByIngredient.set(ingredientId, newPrice);
      lastQtyByIngredient.set(ingredientId, fields.purchase_quantity ?? null);
    }
  }
}

const { data: historyAfter } = await sb
  .from("ingredient_price_history")
  .select("ingredient_id");

const afterCountByIngredient = new Map<string, number>();
for (const row of historyAfter ?? []) {
  const id = row.ingredient_id?.trim();
  if (!id) continue;
  afterCountByIngredient.set(id, (afterCountByIngredient.get(id) ?? 0) + 1);
}

const stillStale = confirmedVlMatches
  .map((m) => m.ingredient_id?.trim())
  .filter((id): id is string => Boolean(id))
  .filter((id, idx, arr) => arr.indexOf(id) === idx)
  .filter((id) => (afterCountByIngredient.get(id) ?? 0) === 0)
  .map((id) => ({
    ingredient_id: id,
    name: ingredientById.get(id)?.name ?? id,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const report = {
  mode: applyMode ? "apply" : "dry-run",
  generated_at: new Date().toISOString(),
  project_ref: VL_REF,
  before: {
    matched_with_zero_history_count: beforeList.length,
    ingredients: beforeList,
  },
  planned_inserts: planned.filter((p) => !p.blocked && !p.skipped_reason),
  blocked,
  skipped,
  created,
  errors,
  after: {
    matched_with_zero_history_count: stillStale.length,
    ingredients: stillStale,
  },
};

const reportPath = join(outDir, `${applyMode ? "apply" : "dry-run"}-${timestamp}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      mode: report.mode,
      report_path: reportPath,
      before_count: beforeList.length,
      before_ingredients: beforeList.map((i) => i.name),
      planned_count: planned.filter((p) => !p.blocked).length,
      blocked_count: blocked.length,
      blocked_ingredients: blocked.map((b) => b.ingredient_name),
      created_count: created.length,
      skipped_count: skipped.length,
      after_count: stillStale.length,
      after_ingredients: stillStale.map((i) => i.name),
      errors,
    },
    null,
    2,
  ),
);

if (errors.length > 0) process.exit(1);
