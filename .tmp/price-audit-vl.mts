/**
 * Read-only VL price representation audit.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { loadEnvFiles } from "../scripts/load-env.mts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePurchaseFormat,
} from "../src/lib/invoice-purchase-price-semantics";
import {
  effectiveIngredientUnitCostEur,
  effectivePackUnitPrice,
  inferIngredientCostBaseUnit,
} from "../src/lib/ingredient-unit-cost";
import { formatDisplayUnitCost } from "../src/lib/display-unit-cost";
import { formatCurrency } from "../src/lib/display-format";
import { buildRecentPurchases } from "../src/lib/ingredient-purchase-memory";
import { buildIngredientPurchaseInsights } from "../src/lib/ingredient-detail-panel";
import {
  buildIngredientOperationalSignals,
  formatIngredientOperationalHeadline,
} from "../src/lib/buildIngredientOperationalSignals";

loadEnvFiles();

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const MAY_INVOICE = "3b4cb21f";

const TARGETS = [
  { key: "atum", pattern: /atum/i, groundMay: 6.55, groundApr: 6.29 },
  { key: "chocolate", pattern: /chocolate/i, groundMay: 29.99, groundApr: 29.19 },
  { key: "gema", pattern: /gema/i, groundMay: 10.49, groundApr: 10.19 },
  { key: "arroz", pattern: /arroz/i, groundMay: 13.95, groundApr: 13.45 },
] as const;

const url =
  process.env.VITE_SUPABASE_URL?.replace(/\/$/, "") ??
  `https://${VL_REF}.supabase.co`;
const key =
  process.env.VL_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!key) {
  console.error(JSON.stringify({ error: "No Supabase key in env" }));
  process.exit(1);
}

const sb = createClient<Database>(url, key, {
  auth: { persistSession: false },
});

const [{ data: mayItems }, { data: ingredients }, { data: allItems }] = await Promise.all([
  sb
    .from("invoice_items")
    .select(
      "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices!inner(id,supplier_name,invoice_date,created_at)",
    )
    .ilike("invoice_id", `${MAY_INVOICE}%`),
  sb
    .from("ingredients")
    .select(
      "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,normalized_name",
    ),
  sb
    .from("invoice_items")
    .select(
      "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices!inner(invoice_date,created_at,supplier_name)",
    )
    .order("created_at", { ascending: false })
    .limit(800),
]);

function findIngredient(target: (typeof TARGETS)[number]) {
  return (ingredients ?? []).find(
    (i) =>
      target.pattern.test(i.name ?? "") || target.pattern.test(i.normalized_name ?? ""),
  );
}

const audit = [];

for (const target of TARGETS) {
  const ing = findIngredient(target);
  if (!ing) {
    audit.push({ target: target.key, error: "ingredient not found" });
    continue;
  }

  const history =
    (
      await sb
        .from("ingredient_price_history")
        .select("*")
        .eq("ingredient_id", ing.id)
        .order("created_at", { ascending: false })
    ).data ?? [];

  const mayLine = (mayItems ?? []).find((m) => target.pattern.test(m.name ?? ""));

  const meta = mayLine
    ? {
        name: mayLine.name,
        quantity: mayLine.quantity,
        unit: mayLine.unit,
        unit_price: mayLine.unit_price,
        line_total: mayLine.total,
        matchedIngredientName: ing.name,
      }
    : null;

  const recipeFields = meta ? recipeOperationalCostFieldsFromInvoiceLine(meta) : null;
  const structured = meta ? resolveInvoiceLinePurchaseFormat(meta) : null;
  const usableCost =
    meta && structured
      ? computeEffectiveUsableCost(Number(meta.unit_price), meta, structured, String(meta.name))
      : null;

  const internalBase = inferIngredientCostBaseUnit(ing);
  const catalogUnitCost = effectiveIngredientUnitCostEur(ing);
  const catalogDisplay = formatDisplayUnitCost(catalogUnitCost, internalBase);

  const relatedItems = (allItems ?? []).filter((i) => target.pattern.test(i.name ?? ""));
  const fakeProducts = relatedItems.map((i) => ({
    matchedIngredientId: ing.id,
    itemId: i.id,
    itemName: i.name ?? "",
    supplierName: (i.invoices as { supplier_name?: string | null })?.supplier_name ?? null,
    invoiceDate: (i.invoices as { invoice_date?: string | null })?.invoice_date ?? null,
    chronologySourceType: "issue_date" as const,
    invoiceId: i.invoice_id,
    invoiceCreatedAt: (i.invoices as { created_at?: string | null })?.created_at ?? null,
    invoiceIssueDateRaw: (i.invoices as { invoice_date?: string | null })?.invoice_date ?? null,
    itemCreatedAt: i.created_at,
    unitPrice: i.unit_price,
    lineTotal: i.total,
    matchBucket: "matched" as const,
    matchDisplayState: "matched_automatically" as const,
    matchKind: "exact" as const,
    confidenceLabel: "",
    matchSourceHeadline: "",
    matchSourceDetail: "",
    purchaseStructureSummary: null,
    normalizedUsableQuantityLabel: null,
  }));

  const purchases = buildRecentPurchases(ing.id, ing.name, fakeProducts);
  const extents = buildIngredientPurchaseInsights(purchases);
  const latestHistory = history[0] ?? null;
  const priceActivity = latestHistory
    ? {
        created_at: latestHistory.created_at,
        delta: latestHistory.delta,
        delta_percent: latestHistory.delta_percent,
        ingredient_id: ing.id,
      }
    : null;

  const signalsUiExact = buildIngredientOperationalSignals({
    ingredientId: ing.id,
    ingredientName: ing.name,
    recentPurchases: purchases,
    priceActivity,
    recipeCount: 0,
  });

  const signalsExtended = buildIngredientOperationalSignals({
    ingredientId: ing.id,
    ingredientName: ing.name,
    recentPurchases: purchases,
    priceActivity,
    priceHistory: history,
    latestHistoryRow: latestHistory,
    recipeCount: 0,
  });

  audit.push({
    target: target.key,
    ground_truth: { may: target.groundMay, april: target.groundApr },
    ingredient: ing,
    may_invoice_line: mayLine
      ? {
          id: mayLine.id,
          name: mayLine.name,
          quantity: mayLine.quantity,
          unit: mayLine.unit,
          unit_price: mayLine.unit_price,
          total: mayLine.total,
        }
      : null,
    step_pipeline: {
      invoice_unit_price: mayLine?.unit_price ?? null,
      stored_ingredients_current_price: ing.current_price,
      stored_ingredients_purchase_quantity: ing.purchase_quantity,
      recipeOperationalCostFieldsFromInvoiceLine: recipeFields,
      effective_usable_cost_computeEffectiveUsableCost: usableCost,
      catalog_effectiveIngredientUnitCostEur: catalogUnitCost,
      catalog_formatDisplayUnitCost: catalogDisplay,
      price_history_rows: history.map((h) => ({
        id: h.id,
        invoice_id: h.invoice_id,
        previous_price: h.previous_price,
        new_price: h.new_price,
        delta_percent: h.delta_percent,
        created_at: h.created_at,
        note: "history stores pack-level new_price/previous_price per appendIngredientPriceHistoryFromInvoiceLine",
      })),
    },
    ui_surfaces: {
      purchase_history_priceLabel: purchases.map((p) => ({
        itemId: p.itemId,
        date: p.dateLabel,
        priceLabel: p.priceLabel,
        source: "formatCurrency(invoice_items.unit_price) via buildRecentPurchases→formatPurchasePrice",
      })),
      best_buy: extents.best,
      highest_paid: extents.worst,
      operational_summary_headline_ui_exact: formatIngredientOperationalHeadline(signalsUiExact),
      operational_summary_pricing_signals_ui_exact: signalsUiExact
        .filter((s) => s.category === "pricing")
        .map((s) => s.label),
      operational_summary_with_history: formatIngredientOperationalHeadline(signalsExtended),
      price_activity_row: priceActivity,
    },
    related_invoice_lines_count: relatedItems.length,
  });
}

console.log(
  JSON.stringify(
    {
      may_invoice_id_prefix: MAY_INVOICE,
      may_invoice_items: (mayItems ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        unit_price: m.unit_price,
        total: m.total,
      })),
      audit,
    },
    null,
    2,
  ),
);
