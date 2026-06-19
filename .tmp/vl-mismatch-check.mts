import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist.ts";
import {
  INGREDIENT_PRICE_EQ_EPS,
  operationalUnitPriceForPriceHistory,
} from "../src/lib/ingredient-price-history.ts";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const MOZ_ID = "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });

const findings = JSON.parse(
  readFileSync(".tmp/historical-pricing-integrity-audit/findings.json", "utf8"),
) as {
  priceHistoryRowAudits: Array<{
    historyId: string;
    ingredientId: string;
    ingredientName: string;
    classification: string[];
    stored: { new_price: number | null; previous_price: number | null };
    computed: { expectedOperationalNew: number | null };
  }>;
};

const mismatches = findings.priceHistoryRowAudits.filter((r) =>
  r.classification.includes("stale_operational_mismatch"),
);

const ids = mismatches.map((r) => r.historyId);
const { data: hist } = await sb.from("ingredient_price_history").select("*").in("id", ids);
const invoiceIds = [...new Set((hist ?? []).map((h) => h.invoice_id))];
const ingIds = [...new Set((hist ?? []).map((h) => h.ingredient_id))];

const [{ data: items }, { data: matches }] = await Promise.all([
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total").in("invoice_id", invoiceIds),
  sb.from("invoice_item_matches").select("invoice_item_id,ingredient_id,status").in("ingredient_id", ingIds).eq("status", "confirmed"),
]);

const rows = [];
for (const audit of mismatches) {
  const h = (hist ?? []).find((x) => x.id === audit.historyId);
  if (!h) {
    rows.push({ historyId: audit.historyId, status: "missing" });
    continue;
  }
  const match = (matches ?? []).find((m) => {
    const item = (items ?? []).find((i) => i.id === m.invoice_item_id);
    return m.ingredient_id === h.ingredient_id && item?.invoice_id === h.invoice_id;
  });
  const item = (items ?? []).find((i) => i.id === match?.invoice_item_id);
  let expected: number | null = null;
  if (item) {
    const norm = normalizeInvoiceItemFields(item);
    const fields = operationalCostFieldsFromInvoiceLine(norm);
    expected = operationalUnitPriceForPriceHistory(fields?.current_price, fields?.purchase_quantity);
  }
  const stored = Number(h.new_price);
  const needsRepair =
    expected != null && Math.abs(stored - expected) > INGREDIENT_PRICE_EQ_EPS;
  rows.push({
    historyId: h.id,
    ingredient: h.ingredient_name,
    ingredientId: h.ingredient_id,
    stored,
    expected,
    auditExpected: audit.computed.expectedOperationalNew,
    needsRepair,
    hasItem: Boolean(item),
    excluded: h.ingredient_id === MOZ_ID,
  });
}

console.log(JSON.stringify({ mismatchCount: rows.length, needsRepair: rows.filter((r) => r.needsRepair && !r.excluded).length, rows }, null, 2));
