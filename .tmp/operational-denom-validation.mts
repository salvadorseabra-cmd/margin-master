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

console.debug = () => {};
console.info = () => {};
console.log = () => {};

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
  "Mozzarella fior di latte",
];

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
  let best: {
    date: string;
    invoiceId: string;
    lineName: string;
    qty: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
    opPq: number;
    opUnit: string;
    pack: number;
    expectedHistory: number | null;
  } | null = null;
  for (const [, invoiceItems] of byInvoice) {
    const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
    for (const item of invoiceItems) {
      const norm = normalizeInvoiceItemFields(item);
      const supplierScope = normalizeSupplierDisplayName((item.invoices as { supplier_name?: string })?.supplier_name)?.trim() || null;
      const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
      if (match?.ingredient.id !== ingredientId) continue;
      if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
      const op = operationalCostFieldsFromInvoiceLine(
        { name: norm.name, quantity: norm.quantity, unit: norm.unit, unit_price: norm.unit_price, line_total: norm.total },
        { isGenericUnit: defaultIsGenericUnit },
      );
      if (!op) continue;
      const date = (item.invoices as { invoice_date?: string })?.invoice_date ?? "";
      const row = {
        date,
        invoiceId: item.invoice_id,
        lineName: item.name,
        qty: norm.quantity,
        unit: norm.unit,
        unit_price: norm.unit_price,
        total: norm.total,
        opPq: purchaseQuantityDenom(op.purchase_quantity),
        opUnit: op.cost_base_unit,
        pack: op.current_price,
        expectedHistory: operationalUnitPriceForPriceHistory(op.current_price, op.purchase_quantity),
      };
      if (!best || date.localeCompare(best.date) >= 0) best = row;
    }
  }
  return best;
}

const TOL = 0.05;
const targetResults = [];
for (const tname of TARGETS) {
  const ing = catalog.find((i) => i.name.toLowerCase() === tname.toLowerCase() || i.name === tname);
  if (!ing) {
    targetResults.push({ name: tname, error: "not found" });
    continue;
  }
  const catalogPq = purchaseQuantityDenom(ing.purchase_quantity);
  const line = latestMatchedLine(ing.id);
  const opPq = line?.opPq ?? null;
  const latest = latestHistory(ing.id);
  const historyOp = latest ? Number(latest.new_price) : null;
  const dbCurrent = ing.current_price == null ? null : Number(ing.current_price);
  const rebuilt = historyOp != null && opPq != null ? historyOp * opPq : null;
  const impliedDenom = historyOp != null && line?.pack != null && historyOp > 0 ? line.pack / historyOp : null;
  targetResults.push({
    name: ing.name,
    db_current: dbCurrent,
    catalog_pq: catalogPq,
    history_new_price: historyOp,
    operational_pq: opPq,
    operational_unit: line?.opUnit ?? null,
    latest_pack: line?.pack ?? null,
    rebuilt,
    match: rebuilt != null && dbCurrent != null && Math.abs(rebuilt - dbCurrent) < TOL,
    implied_denom_from_history: impliedDenom,
    history_matches_expected: line?.expectedHistory != null && historyOp != null ? Math.abs(line.expectedHistory - historyOp) < 1e-6 : null,
    latest_line: line,
  });
}

const allResults = [];
for (const ing of catalog) {
  const line = latestMatchedLine(ing.id);
  const opPq = line?.opPq ?? null;
  const latest = latestHistory(ing.id);
  const historyOp = latest ? Number(latest.new_price) : null;
  const dbCurrent = ing.current_price == null ? null : Number(ing.current_price);
  const rebuilt = historyOp != null && opPq != null ? historyOp * opPq : null;
  const ok = rebuilt != null && dbCurrent != null && Math.abs(rebuilt - dbCurrent) < TOL;
  allResults.push({
    name: ing.name,
    db_current: dbCurrent,
    history_new_price: historyOp,
    operational_pq: opPq,
    operational_unit: line?.opUnit ?? null,
    rebuilt,
    match: ok,
    has_history: historyOp != null,
    has_op_pq: opPq != null,
    latest_pack: line?.pack ?? null,
    history_matches_expected: line?.expectedHistory != null && historyOp != null ? Math.abs(line.expectedHistory - historyOp) < 1e-6 : null,
  });
}

const withBoth = allResults.filter((r) => r.has_history && r.has_op_pq);
const correct = withBoth.filter((r) => r.match);
const incorrect = withBoth.filter((r) => !r.match);

process.stdout.write(
  JSON.stringify(
    {
      targets: targetResults,
      simulation: {
        total: catalog.length,
        with_history_and_op_pq: withBoth.length,
        correct: correct.length,
        incorrect: incorrect.length,
        no_history: allResults.filter((r) => !r.has_history).map((r) => r.name),
        no_op_pq: allResults.filter((r) => r.has_history && !r.has_op_pq).map((r) => r.name),
        incorrect_list: incorrect.map((r) => ({
          name: r.name,
          db: r.db_current,
          rebuilt: r.rebuilt,
          history: r.history_new_price,
          op_pq: r.operational_pq,
          op_unit: r.operational_unit,
          pack: r.latest_pack,
          history_matches_expected: r.history_matches_expected,
          delta: r.rebuilt != null && r.db_current != null ? +(r.rebuilt - r.db_current).toFixed(4) : null,
        })),
      },
    },
    null,
    2,
  ),
);
