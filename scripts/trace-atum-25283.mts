/**
 * Read-only: trace Atum em óleo 25283% calculation on VL.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  buildIngredientOperationalSignals,
  formatIngredientOperationalHeadline,
  pickOperationalSummarySignals,
} from "../src/lib/buildIngredientOperationalSignals";
import { buildOperationalInsightCards } from "../src/lib/buildOperationalInsightCards";
import { computePriceHistoryDelta } from "../src/lib/ingredient-price-history";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const INGREDIENT_ID = "0f30ccb3-bb47-40bb-83cc-ae2a4018066d";

const sb = createClient<Database>(
  `https://${VL_REF}.supabase.co`,
  process.env.VL_KEY!,
  { auth: { persistSession: false } },
);

const [
  { data: ingredient },
  { data: history },
  { data: items },
  { data: invoices },
] = await Promise.all([
  sb.from("ingredients").select("*").eq("id", INGREDIENT_ID).maybeSingle(),
  sb.from("ingredient_price_history").select("*").eq("ingredient_id", INGREDIENT_ID).order("created_at", { ascending: false }),
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,created_at,invoices!inner(id,supplier_name,invoice_date,created_at,file_url)"),
  sb.from("invoices").select("id,supplier_name,invoice_date,created_at,file_url,user_id"),
]);

// Filter items that might match atum
const atumItems = (items ?? []).filter((i) => /atum/i.test(i.name ?? ""));

const historySorted = (history ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
// Simulate routes/ingredients.tsx: first row per ingredient when ordered created_at DESC
const latestActivityMap: Record<string, (typeof historySorted)[0]> = {};
for (const row of historySorted) {
  if (!latestActivityMap[row.ingredient_id]) latestActivityMap[row.ingredient_id] = row;
}
const latestActivity = latestActivityMap[INGREDIENT_ID] ?? null;

// Simulate routes/ingredients.tsx priceActivity loader
const priceActivity = latestActivity
  ? {
      ingredient_id: latestActivity.ingredient_id,
      created_at: latestActivity.created_at,
      delta: latestActivity.delta,
      delta_percent: latestActivity.delta_percent,
    }
  : null;

// Exact UI path (ingredient-detail-operational-layout.tsx) — priceActivity only
const signalsUiExact = buildIngredientOperationalSignals({
  ingredientId: INGREDIENT_ID,
  ingredientName: ingredient?.name,
  priceActivity,
  recipeCount: 0,
});

// Extended path with latestHistoryRow (NOT passed in current UI)
const signals = buildIngredientOperationalSignals({
  ingredientId: INGREDIENT_ID,
  ingredientName: ingredient?.name,
  priceActivity,
  priceHistory: history ?? [],
  latestHistoryRow: latestActivity,
});

const headline = formatIngredientOperationalHeadline(signals);
const summarySignals = pickOperationalSummarySignals(signals, 3);
const catalogTrend = signals.find((s) => s.id === "catalog-price-trend");
const priceVsPrev = signals.find((s) => s.id === "price-vs-previous");

// Manual arithmetic on eff7e459 values from prior audit
const eff7 = history?.find((h) => h.id === "eff7e459-749a-4eda-b506-39e7bcb1c49d");
const manualDelta = eff7
  ? computePriceHistoryDelta(
      eff7.previous_price == null ? null : Number(eff7.previous_price),
      Number(eff7.new_price),
    )
  : null;

console.log(
  JSON.stringify(
    {
      ingredient: {
        id: ingredient?.id,
        name: ingredient?.name,
        current_price: ingredient?.current_price,
        purchase_quantity: ingredient?.purchase_quantity,
      },
      history_rows: (history ?? []).map((h) => ({
        id: h.id,
        invoice_id: h.invoice_id,
        supplier_name: h.supplier_name,
        previous_price: h.previous_price,
        new_price: h.new_price,
        delta: h.delta,
        delta_percent: h.delta_percent,
        created_at: h.created_at,
        manual_recompute: computePriceHistoryDelta(
          h.previous_price == null ? null : Number(h.previous_price),
          Number(h.new_price),
        ),
      })),
      latest_activity_used_by_ui: priceActivity,
      atum_invoice_items: atumItems.map((i) => ({
        id: i.id,
        invoice_id: i.invoice_id,
        name: i.name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        unit: i.unit,
        invoice_date: (i.invoices as { invoice_date?: string })?.invoice_date,
        supplier: (i.invoices as { supplier_name?: string })?.supplier_name,
      })),
      ui_exact_path: {
        price_activity_row_id: latestActivity?.id ?? (eff7 ? "eff7e459 (first in desc query when tied)" : null),
        signals: signalsUiExact.map((s) => ({ id: s.id, label: s.label, priority: s.priority })),
        headline: formatIngredientOperationalHeadline(signalsUiExact),
        summary: pickOperationalSummarySignals(signalsUiExact, 3).map((s) => s.label),
      },
      signals_with_latest_history: signals.map((s) => ({ id: s.id, label: s.label, priority: s.priority })),
      headline_with_latest_history: headline,
      summary_signals: summarySignals.map((s) => s.label),
      catalog_price_trend_signal: catalogTrend,
      price_vs_previous_signal: priceVsPrev,
      eff7e459_manual_check: {
        row: eff7,
        manualDelta,
        arithmetic: eff7
          ? `(( ${eff7.new_price} - ${eff7.previous_price} ) / ${eff7.previous_price} ) * 100 = ${manualDelta?.delta_percent}`
          : null,
      },
    },
    null,
    2,
  ),
);
