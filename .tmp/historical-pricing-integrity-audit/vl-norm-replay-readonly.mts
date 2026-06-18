if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
} else {
  const meta = import.meta as { env: Record<string, unknown> };
  meta.env.DEV = false;
}

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "../../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../../src/lib/ingredient-price-history.ts";
import { isOperationalPricingResolved } from "../../src/lib/ingredient-unit-cost.ts";
import { buildConfirmedAliasMapFromRows } from "../../src/lib/ingredient-alias-memory.ts";
import { buildInvoiceMatchCatalog } from "../../src/lib/ingredient-canonical-synthesis.ts";
import { resolveInvoiceTableRowIngredientMatch, invoiceRowMatchSummaryBucket } from "../../src/lib/invoice-ingredient-row-display.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { normalizeSupplierDisplayName } from "../../src/lib/supplier-identity.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });

const [{ data: ings }, { data: aliases }, { data: items }, { data: hist }] = await Promise.all([
  sb.from("ingredients").select("id,name,unit,current_price,purchase_quantity"),
  sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total,invoices(invoice_date,supplier_name,created_at)"),
  sb.from("ingredient_price_history").select("ingredient_id,invoice_id,new_price").not("invoice_id", "is", null),
]);

const aliasesMap = buildConfirmedAliasMapFromRows(aliases ?? []);
const catalog = ings ?? [];
const histSet = new Set((hist ?? []).map((h) => `${h.ingredient_id}:${h.invoice_id}`));

type Row = Record<string, unknown>;
const failures: Row[] = [];
const successes: Row[] = [];
const parserNull: Row[] = [];
let unmatchedCount = 0;

const byInvoice = new Map<string, NonNullable<typeof items>>();
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
    const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
    if (!match || invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") {
      unmatchedCount++;
      continue;
    }
    const ing = match.ingredient;
    const fields = operationalCostFieldsFromInvoiceLine(
      { name: norm.name, quantity: norm.quantity, unit: norm.unit, unit_price: norm.unit_price, total: norm.total },
      { isGenericUnit: defaultIsGenericUnit },
    );

    const base = {
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      invoice_id: invoiceId,
      invoice_date: (item.invoices as { invoice_date?: string })?.invoice_date,
      supplier: (item.invoices as { supplier_name?: string })?.supplier_name,
      description: item.name,
      qty: norm.quantity,
      unit: norm.unit,
      unit_price: norm.unit_price,
      total: norm.total,
      has_history: histSet.has(`${ing.id}:${invoiceId}`),
    };

    if (!fields || fields.current_price == null) {
      parserNull.push({ ...base, reason: "operationalCostFieldsFromInvoiceLine_null" });
      continue;
    }

    const stored = operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity);

    if (stored == null || !Number.isFinite(stored)) {
      const pack = Number(fields.current_price);
      const pq = Number(fields.purchase_quantity);
      let why = "unknown";
      if (!Number.isFinite(pack)) why = "pack_not_finite";
      else if (pack <= 0) why = "pack_zero_or_negative";
      else if (!Number.isFinite(pq) || pq <= 0) why = "purchase_quantity_invalid";
      else why = "resolvedOperationalUnitCostEur_null";

      failures.push({
        ...base,
        purchase_quantity: fields.purchase_quantity,
        cost_base_unit: fields.cost_base_unit,
        pack_price: fields.current_price,
        why,
        isOperationalPricingResolved: isOperationalPricingResolved({ current_price: fields.current_price, purchase_quantity: fields.purchase_quantity }),
        arithmetic: `${pack} / ${fields.purchase_quantity}`,
      });
    } else {
      successes.push({
        ...base,
        purchase_quantity: fields.purchase_quantity,
        cost_base_unit: fields.cost_base_unit,
        pack_price: fields.current_price,
        operational_price: stored,
        arithmetic: `${fields.current_price} / ${fields.purchase_quantity} = ${stored}`,
      });
    }
  }
}

console.log(JSON.stringify({
  totals: {
    invoice_lines: (items ?? []).length,
    matched_lines: successes.length + failures.length + parserNull.length,
    unmatched_lines: unmatchedCount,
    normalization_success: successes.length,
    normalization_failed: failures.length,
    parser_null_before_normalization: parserNull.length,
    failure_rate_of_matched: failures.length / Math.max(1, successes.length + failures.length),
  },
  failures,
  parser_null: parserNull,
}, null, 2));
