/**
 * Read-only Validation Lab cleanup investigation — all ingredients.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import type { IngredientCanonicalInput } from "../src/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis";
import { defaultIsGenericUnit, operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "../src/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { isEligibleInvoiceIngredientRow } from "../src/lib/invoice-unresolved-ingredient-count";
import { normalizeSupplierDisplayName } from "../src/lib/supplier-identity";
import {
  buildIngredientOperationalSignals,
  formatIngredientOperationalHeadline,
} from "../src/lib/buildIngredientOperationalSignals";
import { buildOperationalInsightCards } from "../src/lib/buildOperationalInsightCards";
import {
  buildOperationalAlertItems,
  getLatestHistoryByIngredient,
  type MarginAlertData,
  type PriceHistoryRecord,
} from "../src/lib/margin-alert-data";
import { buildSupplierWatchlist } from "../src/lib/operational-intelligence-view";
import { linkedIngredientPriceHistoryRows } from "../src/lib/operational-intelligence-synthesis";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const EPS = 0.01;
const EPS_REL = 0.005;

function withinEps(a: number, b: number | null): boolean {
  if (b == null || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= EPS) return true;
  return diff / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= EPS_REL;
}

type Category = "PACK_PRICE_BUG" | "VALID" | "ORPHAN" | "UNKNOWN" | "STALE_HISTORY";

const sb = createClient<Database>(`https://${VL_REF}.supabase.co`, process.env.VL_KEY!, {
  auth: { persistSession: false },
});

const [
  { data: catalog },
  { data: aliases },
  { data: items },
  { data: invoices },
  { data: history },
  { data: recipes },
  { data: recipeIngredients },
] = await Promise.all([
  sb.from("ingredients").select("id,name,normalized_name,unit,current_price,purchase_quantity,base_unit,purchase_unit,user_id,created_at"),
  sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,invoices!inner(id,supplier_name,invoice_date,created_at,user_id)"),
  sb.from("invoices").select("id,supplier_name,invoice_date,created_at,file_url,user_id"),
  sb.from("ingredient_price_history").select("*").order("created_at", { ascending: false }),
  sb.from("recipes").select("id,name,selling_price,type"),
  sb.from("recipe_ingredients").select("id,recipe_id,ingredient_id,quantity,unit"),
]);

const aliasesMap = buildConfirmedAliasMapFromRows(aliases ?? []);
const invoiceSet = new Set((invoices ?? []).map((i) => i.id));
const itemsByInvoice = new Map<string, typeof items>();
for (const row of items ?? []) {
  const list = itemsByInvoice.get(row.invoice_id) ?? [];
  list.push(row);
  itemsByInvoice.set(row.invoice_id, list);
}

function matchItemToIngredient(item: NonNullable<typeof items>[0]) {
  const invoiceItems = itemsByInvoice.get(item.invoice_id) ?? [];
  const matchCatalog = buildInvoiceMatchCatalog(
    catalog as IngredientCanonicalInput[],
    invoiceItems.map((r) => ({ name: r.name })),
  );
  const norm = normalizeInvoiceItemFields(item);
  const supplierScope = normalizeSupplierDisplayName(item.invoices?.supplier_name)?.trim() || null;
  const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
  const fields = operationalCostFieldsFromInvoiceLine(norm, { isGenericUnit: defaultIsGenericUnit });
  const op = fields?.current_price
    ? operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity)
    : null;
  return {
    ingredient_id: match?.ingredient.id ?? null,
    bucket: invoiceRowMatchSummaryBucket(state.displayState),
    operational: op,
    pq: fields?.purchase_quantity ?? null,
    pack: fields?.current_price ?? null,
    normalized_name: norm.name,
  };
}

function classifyHistoryRow(h: PriceHistoryRecord, hits: Array<{ operational: number; unit_price: number }>): Category {
  if (h.invoice_id == null || !invoiceSet.has(h.invoice_id)) return "ORPHAN";
  if (hits.length === 0) return "UNKNOWN";
  const stored = Number(h.new_price);
  const op = hits[0]!.operational;
  const up = hits[0]!.unit_price;
  if (withinEps(stored, op)) return "VALID";
  if (withinEps(stored, up) && !withinEps(stored, op)) return "PACK_PRICE_BUG";
  if (!withinEps(stored, up) && !withinEps(stored, op)) return "STALE_HISTORY";
  return "UNKNOWN";
}

function findHistoryHits(h: PriceHistoryRecord) {
  if (!h.invoice_id) return [];
  const invoiceItems = itemsByInvoice.get(h.invoice_id) ?? [];
  const matchCatalog = buildInvoiceMatchCatalog(
    catalog as IngredientCanonicalInput[],
    invoiceItems.map((r) => ({ name: r.name })),
  );
  const hits: Array<{ item_id: string; unit_price: number; operational: number; line_name: string }> = [];
  for (const item of invoiceItems) {
    const norm = normalizeInvoiceItemFields(item);
    if (!isEligibleInvoiceIngredientRow(norm)) continue;
    const supplierScope = normalizeSupplierDisplayName(item.invoices?.supplier_name)?.trim() || null;
    const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
    if (match?.ingredient.id !== h.ingredient_id) continue;
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
    const fields = operationalCostFieldsFromInvoiceLine(norm, { isGenericUnit: defaultIsGenericUnit });
    if (!fields?.current_price) continue;
    const op = operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity);
    if (op == null) continue;
    hits.push({ item_id: item.id, unit_price: Number(item.unit_price), operational: op, line_name: norm.name });
  }
  return hits;
}

// Simulate ingredients.tsx priceActivity (DESC query, forEach first wins)
const priceActivityByIng = new Map<string, PriceHistoryRecord>();
for (const row of (history ?? []) as PriceHistoryRecord[]) {
  if (!priceActivityByIng.has(row.ingredient_id)) priceActivityByIng.set(row.ingredient_id, row);
}

// getLatestHistoryByIngredient (iteration order, strict > on date)
const latestByIngOpportunities = new Map(
  getLatestHistoryByIngredient((history ?? []) as PriceHistoryRecord[]).map((r) => [r.ingredient_id, r]),
);

const marginData: MarginAlertData = {
  ingredients: (catalog ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    current_price: i.current_price,
    purchase_quantity: i.purchase_quantity,
  })),
  recipes: (recipes ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    selling_price: r.selling_price,
    type: r.type,
    ingredients: (recipeIngredients ?? [])
      .filter((ri) => ri.recipe_id === r.id)
      .map((ri) => ({ ingredient_id: ri.ingredient_id, quantity: ri.quantity, unit: ri.unit })),
  })),
  priceHistory: (history ?? []) as PriceHistoryRecord[],
  invoices: (invoices ?? []).map((i) => ({
    id: i.id,
    supplier_name: i.supplier_name,
    total: null,
    created_at: i.created_at,
  })),
};

const alerts = buildOperationalAlertItems(marginData);
const watch = buildSupplierWatchlist(marginData, alerts, 50);
const oiLinked = new Set(linkedIngredientPriceHistoryRows(marginData.priceHistory).map((r) => r.id));
const alertByIng = new Map(
  alerts.map((a) => {
    const m = a.id.match(/price-(increase|decrease)-(.+)/);
    return [m?.[2] ?? "", a] as const;
  }),
);

// Per-ingredient traces
const ingredientTraces = (catalog ?? []).map((ing) => {
  const ingHistory = ((history ?? []) as PriceHistoryRecord[]).filter((h) => h.ingredient_id === ing.id);
  const matchedItems = (items ?? [])
    .map((item) => ({ item, m: matchItemToIngredient(item) }))
    .filter(({ m }) => m.ingredient_id === ing.id);

  const priceActivity = priceActivityByIng.get(ing.id);
  const oppLatest = latestByIngOpportunities.get(ing.id);
  const signals = buildIngredientOperationalSignals({
    ingredientId: ing.id,
    ingredientName: ing.name,
    priceActivity: priceActivity
      ? {
          created_at: priceActivity.created_at,
          delta: priceActivity.delta,
          delta_percent: priceActivity.delta_percent,
        }
      : undefined,
    recipeCount: 0,
  });
  const headline = formatIngredientOperationalHeadline(signals);
  const cards = buildOperationalInsightCards({
    recentPurchases: matchedItems
      .sort((a, b) => {
        const da = (a.item.invoices as { invoice_date?: string })?.invoice_date ?? "";
        const db = (b.item.invoices as { invoice_date?: string })?.invoice_date ?? "";
        return db.localeCompare(da);
      })
      .map(({ item }) => ({
        supplierLabel: (item.invoices as { supplier_name?: string })?.supplier_name ?? "",
        priceLabel: `€${Number(item.unit_price).toFixed(2)}`,
        dateLabel: (item.invoices as { invoice_date?: string })?.invoice_date ?? "",
      })),
    priceActivity: priceActivity
      ? {
          created_at: priceActivity.created_at,
          delta: priceActivity.delta,
          delta_percent: priceActivity.delta_percent,
        }
      : undefined,
    ingredientName: ing.name,
    recipeCount: 0,
  });

  const historyTraces = ingHistory.map((h) => {
    const hits = findHistoryHits(h);
    const cat = classifyHistoryRow(h, hits.map((x) => ({ operational: x.operational, unit_price: x.unit_price })));
    return {
      history_row_id: h.id,
      invoice_id: h.invoice_id,
      category: cat,
      previous_price: h.previous_price,
      new_price: h.new_price,
      delta_percent: h.delta_percent,
      created_at: h.created_at,
      supplier: h.supplier_name,
      matched_item_id: hits[0]?.item_id ?? null,
      expected_operational: hits[0]?.operational ?? null,
      stored_vs_expected: hits[0] ? withinEps(Number(h.new_price), hits[0].operational) : null,
      in_oi_linked: oiLinked.has(h.id),
    };
  });

  const watchSuppliers = watch
    .filter((w) =>
      ingHistory.some((h) => h.supplier_name?.toLowerCase() === w.supplierName.toLowerCase()),
    )
    .map((w) => w.supplierName);

  return {
    ingredient_id: ing.id,
    ingredient: ing.name,
    catalog_current_price: ing.current_price,
    catalog_purchase_quantity: ing.purchase_quantity,
    invoice_items: matchedItems.map(({ item, m }) => ({
      invoice_item_id: item.id,
      invoice_id: item.invoice_id,
      invoice_date: (item.invoices as { invoice_date?: string })?.invoice_date,
      supplier: (item.invoices as { supplier_name?: string })?.supplier_name,
      unit_price: item.unit_price,
      qty: item.quantity,
      unit: item.unit,
      line_name: item.name,
      operational_normalized: m.operational,
      purchase_quantity: m.pq,
    })),
    history: historyTraces,
    intelligence: {
      price_activity_row_id: priceActivity?.id ?? null,
      opportunities_latest_row_id: oppLatest?.id ?? null,
      price_activity_matches_opportunities_latest:
        priceActivity?.id === oppLatest?.id ||
        (priceActivity?.created_at === oppLatest?.created_at && priceActivity?.id === oppLatest?.id),
      in_opportunities: alertByIng.has(ing.id),
      opportunity_id: alertByIng.get(ing.id)?.id,
      in_supplier_watch: watchSuppliers.length > 0,
      watch_suppliers: watchSuppliers,
      ui_headline: headline,
      ui_signals: signals.map((s) => s.label),
      ui_insight_cards: cards.map((c) => c.text),
      consistency_mismatch:
        priceActivity?.id !== oppLatest?.id
          ? `priceActivity=${priceActivity?.id} vs opportunitiesLatest=${oppLatest?.id}`
          : null,
    },
  };
});

// Anchoas matcher deep dive
const anchoasIng = catalog?.find((i) => /anchoa/i.test(i.name ?? ""));
const anchoasHistory = (history ?? []).find((h) => h.id === "908de185-e61a-4f41-af4c-3b70f69bd08f");
let anchoasMatcher: unknown = null;
if (anchoasHistory?.invoice_id && anchoasIng) {
  const invoiceItems = itemsByInvoice.get(anchoasHistory.invoice_id) ?? [];
  const matchCatalog = buildInvoiceMatchCatalog(
    catalog as IngredientCanonicalInput[],
    invoiceItems.map((r) => ({ name: r.name })),
  );
  const candidates: unknown[] = [];
  for (const item of invoiceItems) {
    const norm = normalizeInvoiceItemFields(item);
    const supplierScope = normalizeSupplierDisplayName(item.invoices?.supplier_name)?.trim() || null;
    const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliasesMap, supplierScope);
    if (/anchoa|anchova/i.test(norm.name) || /anchoa|anchova/i.test(item.name ?? "")) {
      candidates.push({
        item_id: item.id,
        raw_name: item.name,
        normalized: norm.name,
        match_ingredient_id: match?.ingredient.id,
        match_ingredient_name: match?.ingredient.name,
        bucket: invoiceRowMatchSummaryBucket(state.displayState),
        target_ingredient_id: anchoasIng.id,
        matches_target: match?.ingredient.id === anchoasIng.id,
      });
    }
  }
  anchoasMatcher = { history_row: anchoasHistory, candidates, all_lines_on_invoice: invoiceItems.map((i) => i.name) };
}

// Orphan analysis
const orphans = ((history ?? []) as PriceHistoryRecord[]).filter(
  (h) => h.invoice_id == null || !invoiceSet.has(h.invoice_id),
);

// Stale analysis
const staleRows = ingredientTraces.flatMap((t) =>
  t.history.filter((h) => h.category === "STALE_HISTORY").map((h) => ({ ingredient: t.ingredient, ...h })),
);

console.log(
  JSON.stringify(
    {
      summary: {
        ingredient_count: catalog?.length,
        history_count: history?.length,
        invoice_items_count: items?.length,
        categories: ingredientTraces.flatMap((t) => t.history).reduce(
          (m, h) => {
            m[h.category] = (m[h.category] ?? 0) + 1;
            return m;
          },
          {} as Record<string, number>,
        ),
        opportunities_count: alerts.length,
        watch_suppliers: watch.map((w) => w.supplierName),
        oi_linked_count: oiLinked.size,
      },
      ingredient_traces: ingredientTraces,
      stale_analysis: staleRows,
      orphan_analysis: orphans.map((h) => ({
        history_row_id: h.id,
        ingredient_id: h.ingredient_id,
        ingredient_name: h.ingredient_name,
        supplier: h.supplier_name,
        previous_price: h.previous_price,
        new_price: h.new_price,
        delta_percent: h.delta_percent,
        created_at: h.created_at,
        selected_as_price_activity: priceActivityByIng.get(h.ingredient_id)?.id === h.id,
        in_oi_linked: oiLinked.has(h.id),
        in_opportunities_latest: latestByIngOpportunities.get(h.ingredient_id)?.id === h.id,
      })),
      anchoas_unknown: anchoasMatcher,
      consistency_audit: ingredientTraces.map((t) => ({
        ingredient: t.ingredient,
        price_activity_id: t.intelligence.price_activity_row_id,
        opportunities_latest_id: t.intelligence.opportunities_latest_row_id,
        mismatch: t.intelligence.consistency_mismatch,
        ui_headline: t.intelligence.ui_headline,
        in_opportunities: t.intelligence.in_opportunities,
      })),
    },
    null,
    2,
  ),
);
