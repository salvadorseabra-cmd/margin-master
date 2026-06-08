/**
 * Post-repair validation for Wave 2A (read-only).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import type { IngredientCanonicalInput } from "../src/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis";
import { defaultIsGenericUnit, operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history";
import { invoiceRowMatchSummaryBucket, resolveInvoiceTableRowIngredientMatch } from "../src/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { isEligibleInvoiceIngredientRow } from "../src/lib/invoice-unresolved-ingredient-count";
import { normalizeSupplierDisplayName } from "../src/lib/supplier-identity";
import { buildOperationalAlertItems, type MarginAlertData } from "../src/lib/margin-alert-data";
import { buildSupplierWatchlist } from "../src/lib/operational-intelligence-view";
import { readFileSync } from "node:fs";

const WAVE2A_IDS = [
  "45c891bb-06b0-4268-a785-71bb7e40a0d7",
  "8651aa39-fe42-49cc-9a40-283defb9042b",
  "2aa734f1-91fc-4ca3-b97a-8e01b3bf7916",
  "92162d54-9d0c-4f96-8798-85f232e69f9b",
  "22db9eb8-24f3-443e-9b04-da3ecda170e7",
  "22c8efba-8464-487e-a69e-3457c7b857e4",
  "19225c9b-fa2f-42de-9ac9-cf660c8536b8",
  "f5a55cf8-4116-4b0a-8ebc-0ef2967e7037",
  "fe28be38-eb32-4b72-93d2-6289111d0b71",
  "38651eea-7bf1-4911-92cf-fd0eef36d6fc",
];

const EPS = 0.01;
const EPS_REL = 0.005;
function withinEps(a: number, b: number | null): boolean {
  if (b == null || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= EPS) return true;
  return diff / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= EPS_REL;
}

const backupPath = process.argv[2];
const backup = backupPath ? JSON.parse(readFileSync(backupPath, "utf8")) : null;
const backupById = new Map((backup ?? []).map((r: { id: string }) => [r.id, r]));

const sb = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const [{ data: history }, { data: catalog }, { data: aliases }, { data: items }, { data: invoices }] =
  await Promise.all([
    sb.from("ingredient_price_history").select("*"),
    sb.from("ingredients").select("id,name,normalized_name,unit,current_price,purchase_quantity,base_unit,purchase_unit"),
    sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
    sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,invoices!inner(supplier_name)"),
    sb.from("invoices").select("id"),
  ]);

const aliasesMap = buildConfirmedAliasMapFromRows(aliases ?? []);
const invoiceSet = new Set((invoices ?? []).map((i) => i.id));
const itemsByInvoice = new Map<string, typeof items>();
for (const row of items ?? []) {
  const list = itemsByInvoice.get(row.invoice_id) ?? [];
  list.push(row);
  itemsByInvoice.set(row.invoice_id, list);
}

type Cat = "PACK_PRICE_BUG" | "VALID" | "ORPHAN" | "UNKNOWN" | "STALE_HISTORY";

function classify(h: (typeof history)[0]): Cat {
  if (!h.invoice_id || !invoiceSet.has(h.invoice_id)) return "ORPHAN";
  const invoiceItems = itemsByInvoice.get(h.invoice_id) ?? [];
  const matchCatalog = buildInvoiceMatchCatalog(catalog as IngredientCanonicalInput[], invoiceItems.map((r) => ({ name: r.name })));
  const hits: number[] = [];
  for (const item of invoiceItems) {
    const norm = normalizeInvoiceItemFields(item);
    if (!isEligibleInvoiceIngredientRow(norm)) continue;
    const supplierScope = normalizeSupplierDisplayName(item.invoices?.supplier_name)?.trim() || null;
    const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
    if (match?.ingredient.id !== h.ingredient_id) continue;
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
    const fields = operationalCostFieldsFromInvoiceLine(norm, { isGenericUnit: defaultIsGenericUnit });
    if (!fields?.current_price) continue;
    const op = operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity);
    if (op == null) continue;
    hits.push(op);
  }
  if (hits.length === 0) return "UNKNOWN";
  const stored = Number(h.new_price);
  const op = hits[0]!;
  const up = Number(invoiceItems.find(() => true)?.unit_price);
  if (withinEps(stored, op)) return "VALID";
  const item = invoiceItems.find((it) => {
    const norm = normalizeInvoiceItemFields(it);
    const supplierScope = normalizeSupplierDisplayName(it.invoices?.supplier_name)?.trim() || null;
    const { match } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
    return match?.ingredient.id === h.ingredient_id;
  });
  const unitPrice = item ? Number(item.unit_price) : NaN;
  if (withinEps(stored, unitPrice) && !withinEps(stored, op)) return "PACK_PRICE_BUG";
  return "UNKNOWN";
}

const counts: Record<string, number> = {};
for (const h of history ?? []) {
  const c = classify(h);
  counts[c] = (counts[c] ?? 0) + 1;
}

const repairedRows = (history ?? []).filter((h) => WAVE2A_IDS.includes(h.id));
const beforeAfter = WAVE2A_IDS.map((id) => {
  const after = repairedRows.find((r) => r.id === id);
  const before = backupById.get(id);
  return {
    history_row_id: id,
    ingredient: after?.ingredient_name,
    post_category: after ? classify(after) : null,
    old_previous_price: before?.previous_price ?? null,
    new_previous_price: after?.previous_price ?? null,
    old_new_price: before?.new_price ?? null,
    new_new_price: after?.new_price ?? null,
    old_delta: before?.delta ?? null,
    new_delta: after?.delta ?? null,
    old_delta_percent: before?.delta_percent ?? null,
    new_delta_percent: after?.delta_percent ?? null,
  };
});

const marginData: MarginAlertData = {
  ingredients: (catalog ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    current_price: i.current_price,
    purchase_quantity: i.purchase_quantity,
  })),
  recipes: [],
  priceHistory: (history ?? []) as MarginAlertData["priceHistory"],
  invoices: [],
};

const alerts = buildOperationalAlertItems(marginData);
const watch = buildSupplierWatchlist(marginData, alerts, 50);
const fsWatch = watch.find((s) => s.supplierName === "FOODSERVICE NORTE");

console.log(
  JSON.stringify(
    {
      category_counts: counts,
      before_after: beforeAfter,
      all_repaired_valid: beforeAfter.every((r) => r.post_category === "VALID"),
      opportunities_count: alerts.length,
      foodservice_watch: fsWatch
        ? { increases: fsWatch.increaseCount, maxPct: fsWatch.maxChangePct }
        : null,
    },
    null,
    2,
  ),
);
