console.debug = () => {}; console.info = () => {}; console.log = () => {};
if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
} else (import.meta as { env: Record<string, unknown> }).env.DEV = false;

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";
import { derivePurchaseContractSnapshot, shouldBlockHistoryInsert } from "../src/lib/ingredient-price-chain-guard.ts";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory.ts";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis.ts";
import { resolveInvoiceTableRowIngredientMatch, invoiceRowMatchSummaryBucket } from "../src/lib/invoice-ingredient-row-display.ts";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields.ts";
import { normalizeSupplierDisplayName } from "../src/lib/supplier-identity.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });
const [{ data: ings }, { data: aliases }, { data: items }] = await Promise.all([
  sb.from("ingredients").select("id,name,unit"),
  sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total,invoices(supplier_name)"),
]);
const aliasesMap = buildConfirmedAliasMapFromRows(aliases ?? []);
const catalog = ings ?? [];
const blocked: unknown[] = [];
const byInvoice = new Map<string, NonNullable<typeof items>>();
for (const item of items ?? []) {
  (byInvoice.get(item.invoice_id) ?? byInvoice.set(item.invoice_id, []).get(item.invoice_id)!).push(item);
}
for (const [, invoiceItems] of byInvoice) {
  const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
  for (const item of invoiceItems) {
    const norm = normalizeInvoiceItemFields(item);
    const supplierScope = normalizeSupplierDisplayName((item.invoices as { supplier_name?: string })?.supplier_name)?.trim() || null;
    const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
    if (!match || invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
    const fields = operationalCostFieldsFromInvoiceLine({ name: norm.name, quantity: norm.quantity, unit: norm.unit, unit_price: norm.unit_price, total: norm.total }, { isGenericUnit: defaultIsGenericUnit });
    if (!fields?.current_price) continue;
    const stored = operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity);
    if (stored == null) continue;
    const snap = derivePurchaseContractSnapshot({ name: match.ingredient.name, operationalUnitPrice: stored, purchaseQuantity: fields.purchase_quantity, ingredientUnit: match.ingredient.unit ?? null });
    if (shouldBlockHistoryInsert(snap)) blocked.push({ ingredient: match.ingredient.name, line: item.name, stored, snap: { unitFamily: snap.unitFamily, purchaseQuantity: snap.purchaseQuantity } });
  }
}
process.stdout.write(JSON.stringify({ blocked_count: blocked.length, blocked }, null, 2));
