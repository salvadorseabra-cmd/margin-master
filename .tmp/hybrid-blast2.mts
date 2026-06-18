import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "@/lib/ingredient-auto-persist";
import { purchaseQuantityDenom } from "@/lib/ingredient-unit-cost";
import { structuredPurchaseToIngredientFields, resolveInvoiceLinePurchaseFormat } from "@/lib/invoice-purchase-format";
import { buildConfirmedAliasMapFromRows } from "@/lib/ingredient-alias-memory";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import { resolveInvoiceTableRowIngredientMatch, invoiceRowMatchSummaryBucket } from "@/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

console.debug = () => {}; console.info = () => {};

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
  let best: { date: string; pack: number; opPq: number; catalogPq: number; opUnit: string; usableMl?: number; usableG?: number } | null = null;
  for (const [_, invoiceItems] of byInvoice) {
    const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
    for (const item of invoiceItems) {
      const norm = normalizeInvoiceItemFields(item);
      const supplierScope = normalizeSupplierDisplayName((item.invoices as { supplier_name?: string })?.supplier_name)?.trim() || null;
      const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
      if (match?.ingredient.id !== ingredientId) continue;
      if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
      const op = operationalCostFieldsFromInvoiceLine({ name: norm.name, quantity: norm.quantity, unit: norm.unit, unit_price: norm.unit_price, line_total: norm.total }, { isGenericUnit: defaultIsGenericUnit });
      if (!op) continue;
      const structured = resolveInvoiceLinePurchaseFormat({ name: norm.name, quantity: norm.quantity, unit: norm.unit });
      const catalogFields = structuredPurchaseToIngredientFields(structured, norm.unit, defaultIsGenericUnit);
      const date = (item.invoices as { invoice_date?: string })?.invoice_date ?? "";
      const row = {
        date,
        pack: op.current_price,
        opPq: purchaseQuantityDenom(op.purchase_quantity),
        catalogPq: purchaseQuantityDenom(catalogFields.purchase_quantity),
        opUnit: op.cost_base_unit,
        usableMl: op.usable_volume_ml ?? undefined,
        usableG: op.usable_weight_grams ?? undefined,
      };
      if (!best || date.localeCompare(best.date) >= 0) best = row;
    }
  }
  return best;
}

type Row = {
  name: string;
  catalog_pq: number;
  catalog_pq_from_invoice: number | null;
  operational_pq_from_invoice: number | null;
  hybrid_catalog_vs_operational: boolean;
  db_current: number | null;
  history_op: number | null;
  latest_pack: number | null;
  implied_op_denom_from_history: number | null;
  rebuild_A: number | null;
  rebuild_B_invoice_op: number | null;
  rebuild_D_implied: number | null;
  rebuild_ok: "Y" | "N" | "partial";
};

const rows: Row[] = [];
for (const ing of catalog) {
  const line = latestMatchedLine(ing.id);
  const catalogPq = purchaseQuantityDenom(ing.purchase_quantity);
  const catalogFromInv = line?.catalogPq ?? null;
  const opPqFromInv = line?.opPq ?? null;
  const hybrid = catalogFromInv != null && opPqFromInv != null && catalogFromInv !== opPqFromInv;
  const latest = latestHistory(ing.id);
  const historyOp = latest ? Number(latest.new_price) : null;
  const dbCurrent = ing.current_price == null ? null : Number(ing.current_price);
  const latestPack = line?.pack ?? null;
  const impliedOpDenom = historyOp != null && latestPack != null && historyOp > 0 ? latestPack / historyOp : null;
  const rebuildA = historyOp != null ? historyOp * catalogPq : null;
  const rebuildB = historyOp != null && opPqFromInv != null ? historyOp * opPqFromInv : null;
  const rebuildD = historyOp != null && impliedOpDenom != null ? historyOp * impliedOpDenom : null;

  let rebuild_ok: Row["rebuild_ok"] = "N";
  if (dbCurrent != null && rebuildD != null && Math.abs(rebuildD - dbCurrent) < 0.05) rebuild_ok = "Y";
  else if (dbCurrent != null && rebuildA != null && Math.abs(rebuildA - dbCurrent) < 0.05) rebuild_ok = "Y";
  else if (dbCurrent != null && latestPack != null && Math.abs(latestPack - dbCurrent) < 0.05) rebuild_ok = "partial";

  if (hybrid || (historyOp != null && dbCurrent != null && rebuildA != null && Math.abs(rebuildA - dbCurrent) > 0.05)) {
    rows.push({
      name: ing.name,
      catalog_pq: catalogPq,
      catalog_pq_from_invoice: catalogFromInv,
      operational_pq_from_invoice: opPqFromInv,
      hybrid_catalog_vs_operational: hybrid,
      db_current: dbCurrent,
      history_op: historyOp,
      latest_pack: latestPack,
      implied_op_denom_from_history: impliedOpDenom,
      rebuild_A: rebuildA,
      rebuild_B_invoice_op: rebuildB,
      rebuild_D_implied: rebuildD,
      rebuild_ok,
    });
  }
}

console.log(JSON.stringify({
  summary: {
    total: catalog.length,
    flagged: rows.length,
    hybrid: rows.filter(r => r.hybrid_catalog_vs_operational).length,
    rebuild_Y: rows.filter(r => r.rebuild_ok === 'Y').length,
    rebuild_partial: rows.filter(r => r.rebuild_ok === 'partial').length,
    rebuild_N: rows.filter(r => r.rebuild_ok === 'N').length,
    sync_corrupts: rows.filter(r => r.rebuild_A != null && r.db_current != null && Math.abs(r.rebuild_A - r.db_current) > 0.05).length,
  },
  rows,
}, null, 2));
