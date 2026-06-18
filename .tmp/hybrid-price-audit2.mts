import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "@/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "@/lib/ingredient-price-history";
import { purchaseQuantityDenom, resolvedOperationalUnitCostEur } from "@/lib/ingredient-unit-cost";
import { buildConfirmedAliasMapFromRows } from "@/lib/ingredient-alias-memory";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import { resolveInvoiceTableRowIngredientMatch } from "@/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";
import { resolveInvoiceLinePurchaseFormat } from "@/lib/invoice-purchase-format";
import { structuredPurchaseToIngredientFields } from "@/lib/invoice-purchase-format";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });

const TARGETS = [
  "Birra peroni nastro azzurro 33cl",
  "Água san pellegrino",
  "Aceto balsamico di modena IGP",
  "Courgettes",
  "Alho francês",
  "Atum em óleo",
  "Gema líquida",
  "Anchoas",
];

const [{ data: ings }, { data: aliases }, { data: items }, { data: hist }] = await Promise.all([
  sb.from("ingredients").select("id,name,unit,current_price,purchase_quantity,purchase_unit,base_unit"),
  sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total,invoices(invoice_date,supplier_name,created_at)"),
  sb.from("ingredient_price_history").select("id,ingredient_id,invoice_id,previous_price,new_price,created_at,invoices(invoice_date)").order("created_at", { ascending: true }),
]);

const aliasesMap = buildConfirmedAliasMapFromRows(aliases ?? []);
const catalog = ings ?? [];

function matchLinesForIngredient(ing: { id: string; name: string }) {
  const hits: Array<Record<string, unknown>> = [];
  const byInvoice = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const list = byInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    byInvoice.set(item.invoice_id, list);
  }
  for (const [invoiceId, invoiceItems] of byInvoice) {
    const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
    for (const item of invoiceItems) {
      const norm = normalizeInvoiceItemFields(item);
      const supplierScope = normalizeSupplierDisplayName((item.invoices as { supplier_name?: string })?.supplier_name)?.trim() || null;
      const { match } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
      if (match?.ingredient.id !== ing.id) continue;
      const opFields = operationalCostFieldsFromInvoiceLine({
        name: norm.name,
        quantity: norm.quantity,
        unit: norm.unit,
        unit_price: norm.unit_price,
        line_total: norm.total,
      }, { isGenericUnit: defaultIsGenericUnit });
      const structured = resolveInvoiceLinePurchaseFormat({ name: norm.name, quantity: norm.quantity, unit: norm.unit });
      const catalogFields = structuredPurchaseToIngredientFields(structured, norm.unit, defaultIsGenericUnit);
      const histRow = (hist ?? []).find((h) => h.ingredient_id === ing.id && h.invoice_id === invoiceId);
      hits.push({
        invoice_id: invoiceId,
        invoice_date: (item.invoices as { invoice_date?: string })?.invoice_date,
        supplier: (item.invoices as { supplier_name?: string })?.supplier_name,
        line: { name: item.name, qty: item.quantity, unit: item.unit, unit_price: item.unit_price, total: item.total },
        operational: opFields,
        catalog_from_invoice: catalogFields,
        expected_history_new_price: opFields ? operationalUnitPriceForPriceHistory(opFields.current_price, opFields.purchase_quantity) : null,
        actual_history_new_price: histRow ? Number(histRow.new_price) : null,
      });
    }
  }
  return hits.sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)));
}

function latestLinkedHistory(ingredientId: string) {
  const rows = (hist ?? []).filter((h) => h.ingredient_id === ingredientId && h.invoice_id);
  return rows[rows.length - 1] ?? null;
}

const results = TARGETS.map((name) => {
  const ing = catalog.find((i) => i.name === name)!;
  const lines = matchLinesForIngredient(ing);
  const latest = latestLinkedHistory(ing.id);
  const latestLine = lines[lines.length - 1] ?? null;
  const catalogPq = purchaseQuantityDenom(ing.purchase_quantity);
  const opPq = latestLine?.operational ? purchaseQuantityDenom((latestLine.operational as { purchase_quantity: number }).purchase_quantity) : null;
  const latestOp = latest ? Number(latest.new_price) : null;
  const dbCurrent = ing.current_price == null ? null : Number(ing.current_price);
  const opFields = latestLine?.operational as { current_price: number; purchase_quantity: number; cost_base_unit: string; usable_volume_ml?: number } | null;

  const formulaA = latestOp != null ? latestOp * catalogPq : null;
  const formulaB = latestOp != null && opPq != null ? latestOp * opPq : null;
  const formulaC = opFields?.current_price ?? null;
  const formulaE_dbOperational_x_catalogPq = latestOp != null ? null : null; // placeholder

  // Verify history write arithmetic from latest matched line
  const historyWrite = latestLine && opFields ? {
    pack_price: opFields.current_price,
    operational_denom: opFields.purchase_quantity,
    cost_base_unit: opFields.cost_base_unit,
    stored_new_price: latestOp,
    computed: operationalUnitPriceForPriceHistory(opFields.current_price, opFields.purchase_quantity),
    arithmetic: `${opFields.current_price} / ${opFields.purchase_quantity} = ${operationalUnitPriceForPriceHistory(opFields.current_price, opFields.purchase_quantity)}`,
    matches_stored: latestOp != null && Math.abs(latestOp - (operationalUnitPriceForPriceHistory(opFields.current_price, opFields.purchase_quantity) ?? NaN)) < 1e-9,
  } : null;

  return {
    name,
    db: { current_price: dbCurrent, purchase_quantity: catalogPq, purchase_unit: ing.purchase_unit, base_unit: ing.base_unit },
    hybrid: opPq != null && catalogPq !== opPq,
    catalog_pq: catalogPq,
    operational_pq: opPq,
    operational_base_unit: opFields?.cost_base_unit ?? null,
    history_write: historyWrite,
    current_price_meaning: {
      db_is_procurement_pack: dbCurrent,
      operational_from_db_catalog_pq: dbCurrent != null ? dbCurrent / catalogPq : null,
      operational_from_history: latestOp,
      procurement_pack_from_history_x_operational_pq: formulaB,
    },
    formulas: { A: formulaA, B: formulaB, C: formulaC },
    matches: {
      A: formulaA != null && dbCurrent != null && Math.abs(formulaA - dbCurrent) < 0.02,
      B: formulaB != null && dbCurrent != null && Math.abs(formulaB - dbCurrent) < 0.02,
      C: formulaC != null && dbCurrent != null && Math.abs(formulaC - dbCurrent) < 0.02,
    },
    matched_invoice_lines: lines,
  };
});

console.log(JSON.stringify(results, null, 2));
