/**
 * Read-only historical pricing validation for Validation Lab sample ingredients.
 *
 * Audits per-invoice pipeline math, history alignment, and current_price consistency.
 *
 *   npx vite-node scripts/validate-historical-pricing.mts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist";
import {
  computePriceHistoryDelta,
  operationalUnitPriceForPriceHistory,
} from "../src/lib/ingredient-price-history";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { resolveInvoiceLinePurchaseFormat } from "../src/lib/invoice-purchase-format";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INGREDIENTS = [
  { label: "Anchovas (Anchoas)", id: "c811f67f-df4d-4194-ba8b-7a15d4af38bd" },
  { label: "Pepino conserva", id: "635a1189-36ea-4ff2-9012-8172ab1ab81d" },
  { label: "Arroz agulha", id: "07a55cf5-b98d-4aae-b330-b4944882e4d3" },
  { label: "Atum em óleo", id: "0f30ccb3-bb47-40bb-83cc-ae2a4018066d" },
  { label: "Mozzarella fior di latte", id: "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d" },
  { label: "Gema líquida", id: "32dbf47d-347c-45f3-bd9f-c6e90640e767" },
] as const;

function rawInvoiceMath(item: {
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  unit: string | null;
}) {
  const up = item.unit_price == null ? null : Number(item.unit_price);
  const q = item.quantity == null ? null : Number(item.quantity);
  const t = item.total == null ? null : Number(item.total);
  const perUnitFromTotal = q && t && q > 0 ? t / q : null;
  return { unit_price: up, qty: q, total: t, implied_unit_price: perUnitFromTotal };
}

type PurchaseRow = {
  invoice_id: string;
  invoice_date: string | null;
  supplier: string | null;
  item_id: string;
  line: {
    name: string;
    qty: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
  };
  raw_math: ReturnType<typeof rawInvoiceMath>;
  usable: { qty: number | null; unit: string | null };
  normalized: {
    pack_price: number | null | undefined;
    purchase_qty: number | null | undefined;
    base: string | null | undefined;
    operational_eur_per_base: number | null;
  };
  history: {
    id: string;
    prev_op: number | null;
    new_op: number | null;
    delta: number | null;
    delta_pct: number | null;
    recomputed: ReturnType<typeof computePriceHistoryDelta>;
    op_matches_invoice: boolean | null;
    ingredient_unit: string | null;
    created_at: string;
  } | null;
};

const report: Record<string, unknown> = {};

for (const { label, id } of INGREDIENTS) {
  const { data: ing } = await sb
    .from("ingredients")
    .select("id,name,unit,base_unit,purchase_unit,current_price,purchase_quantity")
    .eq("id", id)
    .single();

  const { data: hist } = await sb
    .from("ingredient_price_history")
    .select(
      "id,invoice_id,ingredient_name,supplier_name,ingredient_unit,previous_price,new_price,delta,delta_percent,created_at, invoices(invoice_date, supplier_name)",
    )
    .eq("ingredient_id", id)
    .order("created_at", { ascending: true });

  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select(
      "invoice_item_id, status, ingredient_id, invoice_items(id, invoice_id, name, quantity, unit, unit_price, total), invoices(id, supplier_name, invoice_date, created_at)",
    )
    .eq("ingredient_id", id)
    .eq("status", "confirmed");

  const purchases: PurchaseRow[] = [];

  for (const m of matches ?? []) {
    const item = m.invoice_items;
    const inv = m.invoices;
    if (!item) continue;

    const norm = normalizeInvoiceItemFields(item);
    const fields = operationalCostFieldsFromInvoiceLine(norm);
    const structured = resolveInvoiceLinePurchaseFormat({
      name: norm.name,
      quantity: norm.quantity,
      unit: norm.unit,
      matchedIngredientName: ing?.name,
    });
    const expectedOp = fields
      ? operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity)
      : null;
    const histRow = (hist ?? []).find((h) => h.invoice_id === item.invoice_id);
    const raw = rawInvoiceMath(norm);
    const histNew = histRow?.new_price == null ? null : Number(histRow.new_price);

    purchases.push({
      invoice_id: item.invoice_id,
      invoice_date: inv?.invoice_date ?? null,
      supplier: inv?.supplier_name ?? null,
      item_id: item.id,
      line: {
        name: norm.name,
        qty: norm.quantity,
        unit: norm.unit,
        unit_price: norm.unit_price,
        total: norm.total,
      },
      raw_math: raw,
      usable: {
        qty: structured.normalizedUsableQuantity,
        unit: structured.usableQuantityUnit,
      },
      normalized: {
        pack_price: fields?.current_price,
        purchase_qty: fields?.purchase_quantity,
        base: fields?.cost_base_unit,
        operational_eur_per_base: expectedOp,
      },
      history: histRow
        ? {
            id: histRow.id,
            prev_op: histRow.previous_price,
            new_op: histRow.new_price,
            delta: histRow.delta,
            delta_pct: histRow.delta_percent,
            recomputed: computePriceHistoryDelta(
              histRow.previous_price == null ? null : Number(histRow.previous_price),
              Number(histRow.new_price),
            ),
            op_matches_invoice:
              expectedOp != null && histNew != null
                ? Math.abs(expectedOp - histNew) < 1e-6
                : null,
            ingredient_unit: histRow.ingredient_unit,
            created_at: histRow.created_at,
          }
        : null,
    });
  }

  const linkedHist = (hist ?? []).filter((h) => h.invoice_id);
  const catalogOp =
    ing?.current_price != null
      ? operationalUnitPriceForPriceHistory(ing.current_price, ing.purchase_quantity)
      : null;
  const latestLinked = [...linkedHist].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  )[0];
  const latestOp = latestLinked?.new_price == null ? null : Number(latestLinked.new_price);

  report[label] = {
    id,
    catalog: ing,
    catalog_operational: catalogOp,
    latest_history_operational: latestOp,
    current_price_from_latest_history:
      latestOp != null && catalogOp != null ? Math.abs(catalogOp - latestOp) < 1e-6 : null,
    all_history: (hist ?? []).map((h) => ({
      id: h.id,
      invoice_id: h.invoice_id,
      supplier: h.supplier_name,
      invoice_date: h.invoices?.invoice_date ?? null,
      prev: h.previous_price,
      new: h.new_price,
      delta: h.delta,
      delta_pct: h.delta_percent,
      ingredient_unit: h.ingredient_unit,
      created_at: h.created_at,
      delta_recomputed: computePriceHistoryDelta(
        h.previous_price == null ? null : Number(h.previous_price),
        Number(h.new_price),
      ),
    })),
    confirmed_purchases: purchases,
  };
}

console.log(
  JSON.stringify(
    {
      queried_at: new Date().toISOString(),
      project: new URL(url).hostname.split(".")[0],
      report,
    },
    null,
    2,
  ),
);
