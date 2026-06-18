import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "@/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "@/lib/ingredient-price-history";
import { purchaseQuantityDenom } from "@/lib/ingredient-unit-cost";
import { buildConfirmedAliasMapFromRows } from "@/lib/ingredient-alias-memory";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import { resolveInvoiceTableRowIngredientMatch, invoiceRowMatchSummaryBucket } from "@/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";
import { structuredPurchaseToIngredientFields, resolveInvoiceLinePurchaseFormat } from "@/lib/invoice-purchase-format";

// silence dev logs
const noop = () => {};
console.debug = noop;
console.info = noop;

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });

const [{ data: ings }, { data: aliases }, { data: items }, { data: hist }] = await Promise.all([
  sb.from("ingredients").select("id,name,current_price,purchase_quantity,purchase_unit,base_unit"),
  sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total,invoices(invoice_date,supplier_name)"),
  sb.from("ingredient_price_history").select("ingredient_id,invoice_id,new_price,created_at").not("invoice_id", "is", null).order("created_at", { ascending: true }),
]);

const aliasesMap = buildConfirmedAliasMapFromRows(aliases ?? []);
const catalog = ings ?? [];

function latestHistory(ingredientId: string) {
  const rows = (hist ?? []).filter((h) => h.ingredient_id === ingredientId);
  return rows[rows.length - 1] ?? null;
}

function latestMatchedLine(ingredientId: string) {
  const byInvoice = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const list = byInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    byInvoice.set(item.invoice_id, list);
  }
  let best: { date: string; opPq: number; pack: number; opUnit: string; invoiceId: string } | null = null;
  for (const [invoiceId, invoiceItems] of byInvoice) {
    const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
    for (const item of invoiceItems) {
      const norm = normalizeInvoiceItemFields(item);
      const supplierScope = normalizeSupplierDisplayName((item.invoices as { supplier_name?: string })?.supplier_name)?.trim() || null;
      const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
      if (match?.ingredient.id !== ingredientId) continue;
      if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
      const op = operationalCostFieldsFromInvoiceLine({ name: norm.name, quantity: norm.quantity, unit: norm.unit, unit_price: norm.unit_price, line_total: norm.total }, { isGenericUnit: defaultIsGenericUnit });
      if (!op) continue;
      const date = (item.invoices as { invoice_date?: string })?.invoice_date ?? "";
      const row = { date, opPq: purchaseQuantityDenom(op.purchase_quantity), pack: op.current_price, opUnit: op.cost_base_unit, invoiceId };
      if (!best || date.localeCompare(best.date) >= 0) best = row;
    }
  }
  return best;
}

type Row = {
  name: string;
  catalog_pq: number;
  operational_pq: number | null;
  hybrid: boolean;
  db_current: number | null;
  history_op: number | null;
  rebuild_B: number | null;
  rebuild_A: number | null;
  rebuild_possible: "Y" | "N" | "partial";
  reason: string;
};

const rows: Row[] = [];
for (const ing of catalog) {
  const catalogPq = purchaseQuantityDenom(ing.purchase_quantity);
  const line = latestMatchedLine(ing.id);
  const opPq = line?.opPq ?? null;
  const hybrid = opPq != null && catalogPq !== opPq;
  const latest = latestHistory(ing.id);
  const historyOp = latest ? Number(latest.new_price) : null;
  const dbCurrent = ing.current_price == null ? null : Number(ing.current_price);
  const rebuildA = historyOp != null ? historyOp * catalogPq : null;
  const rebuildB = historyOp != null && opPq != null ? historyOp * opPq : null;

  let rebuild_possible: Row["rebuild_possible"] = "N";
  let reason = "no history";
  if (historyOp != null && dbCurrent != null) {
    const matchB = rebuildB != null && Math.abs(rebuildB - dbCurrent) < 0.05;
    const matchA = rebuildA != null && Math.abs(rebuildA - dbCurrent) < 0.05;
    const matchSameDenom = catalogPq === opPq && matchA;
    if (matchB) { rebuild_possible = "Y"; reason = hybrid ? "formula B (history × operational pq)" : "formula A/B equivalent"; }
    else if (matchA) { rebuild_possible = "Y"; reason = "formula A (history × catalog pq)"; }
    else if (matchSameDenom) { rebuild_possible = "Y"; reason = "aligned denominators"; }
    else if (hybrid && opPq != null) { rebuild_possible = "partial"; reason = "needs operational pq metadata; B would work if op pq known"; }
    else { rebuild_possible = "N"; reason = `history stores ${historyOp}, db ${dbCurrent}, no op pq`; }
  } else if (dbCurrent != null && line) {
    rebuild_possible = "partial";
    reason = "no history; could use latest invoice pack price (formula C)";
  }

  if (hybrid || (historyOp != null && dbCurrent != null && rebuildA != null && Math.abs(rebuildA - dbCurrent) > 0.05)) {
    rows.push({ name: ing.name, catalog_pq: catalogPq, operational_pq: opPq, hybrid, db_current: dbCurrent, history_op: historyOp, rebuild_A: rebuildA, rebuild_B: rebuildB, rebuild_possible, reason });
  }
}

const hybridRows = rows.filter((r) => r.hybrid);
const summary = {
  total_ingredients: catalog.length,
  hybrid_mismatch_count: hybridRows.length,
  rebuild_Y: hybridRows.filter((r) => r.rebuild_possible === "Y").length,
  rebuild_partial: hybridRows.filter((r) => r.rebuild_possible === "partial").length,
  rebuild_N: hybridRows.filter((r) => r.rebuild_possible === "N").length,
  sync_would_corrupt: hybridRows.filter((r) => r.rebuild_A != null && r.db_current != null && Math.abs(r.rebuild_A - r.db_current) > 0.05).length,
};

console.log(JSON.stringify({ summary, hybridRows }, null, 2));
