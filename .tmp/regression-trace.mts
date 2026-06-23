if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
}
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const key = (
  JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
  ) as { name: string; api_key: string }[]
).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

const patterns = ["Prosciutto", "San Pellegrino", "Mortadella", "Atum", "Anchoas", "Aceto"];
const out: unknown[] = [];

for (const p of patterns) {
  const { data: ings } = await sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit")
    .ilike("name", `%${p}%`);
  for (const ing of ings ?? []) {
    const { data: hist } = await sb
      .from("ingredient_price_history")
      .select("invoice_id,new_price,created_at")
      .eq("ingredient_id", ing.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: matches } = await sb
      .from("invoice_item_matches")
      .select("status,invoice_item_id,invoice_items(id,invoice_id,name,quantity,unit,unit_price,total)")
      .eq("ingredient_id", ing.id);
    const rows = [];
    for (const m of matches ?? []) {
      const item = m.invoice_items as Record<string, unknown> | null;
      if (!item) continue;
      const norm = normalizeInvoiceItemFields(item as never);
      const [bound] = bindMonetaryColumns(
        parseMonetaryLineItems([
          {
            name: norm.name,
            quantity: norm.quantity,
            unit: norm.unit,
            gross_unit_price: null,
            discount_pct: null,
            line_total_net: null,
            unit_price: norm.unit_price,
            total: norm.total,
          },
        ]),
      );
      const line = {
        name: norm.name,
        quantity: bound.quantity,
        unit: norm.unit,
        unit_price: bound.unit_price,
        total: bound.total,
      };
      const proc = procurementPackFieldsFromInvoiceLine(line, {
        isGenericUnit: defaultIsGenericUnit,
      });
      const op = operationalUnitPriceForPriceHistory(proc?.current_price, proc?.purchase_quantity);
      const curOp = resolvedOperationalUnitCostEur({
        current_price: ing.current_price,
        purchase_quantity: ing.purchase_quantity,
      });
      rows.push({
        status: m.status,
        item: item.name,
        invoice_id: item.invoice_id,
        qty: norm.quantity,
        up: norm.unit_price,
        total: norm.total,
        binding_changed: Math.abs(Number(bound.unit_price) - Number(norm.unit_price)) > 0.02,
        proc,
        op,
        curOp,
        cp_match: Math.abs(Number(ing.current_price) - Number(proc?.current_price)) < 0.01,
        pq_match: Number(ing.purchase_quantity) === Number(proc?.purchase_quantity),
        op_match: op != null && curOp != null && Math.abs(op - curOp) < 0.001,
        is_hist_source: hist?.[0]?.invoice_id === item.invoice_id,
      });
    }
    out.push({ ingredient: ing.name, catalog: ing, latest_hist: hist?.[0], matches: rows });
  }
}
console.log(JSON.stringify(out, null, 2));
