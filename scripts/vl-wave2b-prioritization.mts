/**
 * Read-only Validation Lab Wave 2B prioritization analysis.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import type { IngredientAliasMap, IngredientCanonicalInput } from "../src/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis";
import { defaultIsGenericUnit, operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history";
import { invoiceRowMatchSummaryBucket, resolveInvoiceTableRowIngredientMatch } from "../src/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { isEligibleInvoiceIngredientRow } from "../src/lib/invoice-unresolved-ingredient-count";
import { normalizeSupplierDisplayName } from "../src/lib/supplier-identity";
import {
  buildOperationalAlertItems,
  getLatestHistoryByIngredient,
  type MarginAlertData,
  type PriceHistoryRecord,
} from "../src/lib/margin-alert-data";
import { buildSupplierWatchlist } from "../src/lib/operational-intelligence-view";
import { linkedIngredientPriceHistoryRows } from "../src/lib/operational-intelligence-synthesis";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const PROD_REF = "lhackrnlnrsiamorzmkb";
const EPS = 0.01;
const EPS_REL = 0.005;
const PACK_RATIO_HIGH = 5;

function withinEps(a: number, b: number | null): boolean {
  if (b == null || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= EPS) return true;
  return diff / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= EPS_REL;
}

type ItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  invoices: { supplier_name: string | null; total?: number | null; created_at?: string | null } | null;
};

type HistoryRow = PriceHistoryRecord & { ingredient_unit?: string | null };

type Category = "PACK_PRICE_BUG" | "VALID" | "ORPHAN" | "UNKNOWN" | "STALE_HISTORY";

async function loadProject(ref: string) {
  const url = `https://${ref}.supabase.co`;
  const key = process.env[`KEY_${ref}`] || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const sb = createClient<Database>(url, key, { auth: { persistSession: false } });

  const [
    { data: history },
    { data: catalog },
    { data: aliases },
    { data: items },
    { data: invoices },
    { data: recipes },
    { data: recipeIngredients },
  ] = await Promise.all([
    sb.from("ingredient_price_history").select("*").order("created_at", { ascending: true }),
    sb.from("ingredients").select("id,name,normalized_name,unit,current_price,purchase_quantity,base_unit,purchase_unit,created_at"),
    sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
    sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,invoices!inner(supplier_name,total,created_at)"),
    sb.from("invoices").select("id,supplier_name,total,created_at"),
    sb.from("recipes").select("id,name,selling_price,type"),
    sb.from("recipe_ingredients").select("id,recipe_id,ingredient_id,quantity,unit"),
  ]);

  return {
    ref,
    history: (history ?? []) as HistoryRow[],
    catalog: (catalog ?? []) as IngredientCanonicalInput[],
    aliases: buildConfirmedAliasMapFromRows(aliases ?? []),
    items: (items ?? []) as ItemRow[],
    invoices: invoices ?? [],
    recipes: recipes ?? [],
    recipeIngredients: recipeIngredients ?? [],
  };
}

function findMatches(
  h: HistoryRow,
  catalog: IngredientCanonicalInput[],
  aliases: IngredientAliasMap,
  itemsByInvoice: Map<string, ItemRow[]>,
) {
  if (!h.invoice_id) return [];
  const invoiceItems = itemsByInvoice.get(h.invoice_id) ?? [];
  const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
  const hits: Array<{ item_id: string; unit_price: number; pq: number | null; operational: number; line_name: string }> = [];
  for (const item of invoiceItems) {
    const norm = normalizeInvoiceItemFields(item);
    if (!isEligibleInvoiceIngredientRow(norm)) continue;
    const supplierScope = normalizeSupplierDisplayName(item.invoices?.supplier_name)?.trim() || null;
    const { match, state } = resolveInvoiceTableRowIngredientMatch(norm.name, matchCatalog, aliases, supplierScope);
    if (match?.ingredient.id !== h.ingredient_id) continue;
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
    const fields = operationalCostFieldsFromInvoiceLine(norm, { isGenericUnit: defaultIsGenericUnit });
    if (!fields?.current_price) continue;
    const op = operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity);
    if (op == null) continue;
    hits.push({
      item_id: item.id,
      unit_price: Number(item.unit_price),
      pq: fields.purchase_quantity ?? null,
      operational: op,
      line_name: norm.name,
    });
  }
  return hits;
}

function classifyHistory(
  data: Awaited<ReturnType<typeof loadProject>>,
) {
  const invoiceSet = new Set(data.invoices.map((i) => i.id));
  const itemsByInvoice = new Map<string, ItemRow[]>();
  for (const row of data.items) {
    const list = itemsByInvoice.get(row.invoice_id) ?? [];
    list.push(row);
    itemsByInvoice.set(row.invoice_id, list);
  }

  const recipeUsage = new Map<string, number>();
  for (const ri of data.recipeIngredients) {
    if (!ri.ingredient_id) continue;
    recipeUsage.set(ri.ingredient_id, (recipeUsage.get(ri.ingredient_id) ?? 0) + 1);
  }

  const marginData: MarginAlertData = {
    ingredients: data.catalog.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      current_price: i.current_price,
      purchase_quantity: i.purchase_quantity,
    })),
    recipes: data.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      selling_price: r.selling_price,
      type: r.type,
      ingredients: data.recipeIngredients
        .filter((ri) => ri.recipe_id === r.id)
        .map((ri) => ({ ingredient_id: ri.ingredient_id, quantity: ri.quantity, unit: ri.unit })),
    })),
    priceHistory: data.history as PriceHistoryRecord[],
    invoices: data.invoices.map((i) => ({
      id: i.id,
      supplier_name: i.supplier_name,
      total: i.total,
      created_at: i.created_at,
    })),
  };

  const alerts = buildOperationalAlertItems(marginData);
  const alertIngredientIds = new Set(
    alerts.map((a) => a.ingredientId).filter(Boolean) as string[],
  );
  const watch = buildSupplierWatchlist(marginData, alerts, 50);
  const watchSuppliers = new Set(watch.map((w) => w.supplierName));
  const linked = new Set(linkedIngredientPriceHistoryRows(data.history).map((r) => r.id));
  const latest = getLatestHistoryByIngredient(data.history);

  const rows = data.history.map((h) => {
    const hits = findMatches(h, data.catalog, data.aliases, itemsByInvoice);
    const invoiceExists = h.invoice_id ? invoiceSet.has(h.invoice_id) : false;
    let category: Category = "UNKNOWN";
    if (h.invoice_id == null || !invoiceExists) category = "ORPHAN";
    else if (hits.length === 0) category = "UNKNOWN";
    else {
      const stored = Number(h.new_price);
      const op = hits[0]!.operational;
      const up = hits[0]!.unit_price;
      if (withinEps(stored, op)) category = "VALID";
      else if (withinEps(stored, up) && !withinEps(stored, op)) category = "PACK_PRICE_BUG";
      else if (!withinEps(stored, up) && !withinEps(stored, op)) category = "STALE_HISTORY";
    }

    const stored = Number(h.new_price);
    const expected = hits[0]?.operational ?? null;
    let confidence: "HIGH" | "MEDIUM" | "LOW" | "N/A" = "N/A";
    let outlier = false;
    if (category === "PACK_PRICE_BUG" && hits.length > 0) {
      if (hits.length > 1) {
        const ops = [...new Set(hits.map((x) => x.operational))];
        if (ops.length > 1) outlier = true;
      }
      if (hits.length !== 1) confidence = "LOW";
      else {
        const ratio = expected! > 0 ? stored / expected! : null;
        if (ratio != null && ratio >= PACK_RATIO_HIGH) confidence = "HIGH";
        else if (ratio != null && ratio >= 1.5) confidence = "MEDIUM";
        else confidence = "LOW";
      }
    }

    const invoice = data.invoices.find((i) => i.id === h.invoice_id);
    const itemStillLinked = hits.length > 0;
    const inOpportunities = alertIngredientIds.has(h.ingredient_id);
    const inSupplierWatch = h.supplier_name ? watchSuppliers.has(h.supplier_name) : false;
    const inOiLinked = linked.has(h.id);
    const isLatest = latest.some((l) => l.id === h.id);
    const recipeLines = recipeUsage.get(h.ingredient_id) ?? 0;
    const invoiceTotal = invoice?.total == null ? 0 : Number(invoice.total);

    let impactScore = 0;
    if (inOpportunities) impactScore += 40;
    if (inSupplierWatch) impactScore += 20;
    if (inOiLinked) impactScore += 15;
    if (isLatest) impactScore += 15;
    if (recipeLines > 0) impactScore += 10 * recipeLines;
    if (category === "PACK_PRICE_BUG" && confidence === "HIGH") impactScore += 25;
    if (itemStillLinked) impactScore += 10;

    return {
      history_row_id: h.id,
      ingredient_id: h.ingredient_id,
      ingredient: h.ingredient_name,
      supplier: h.supplier_name,
      invoice_id: h.invoice_id,
      created_at: h.created_at,
      category,
      confidence,
      outlier,
      stored_value: stored,
      expected_value: expected,
      unit_price: hits[0]?.unit_price ?? null,
      pq: hits[0]?.pq ?? null,
      item_still_linked: itemStillLinked,
      matched_line: hits[0]?.line_name ?? null,
      in_opportunities: inOpportunities,
      in_supplier_watch: inSupplierWatch,
      in_oi_linked: inOiLinked,
      is_latest_for_ingredient: isLatest,
      recipe_line_count: recipeLines,
      invoice_total_eur: invoiceTotal,
      impact_score: impactScore,
    };
  });

  const opportunityDetails = alerts.map((a) => ({
    alert_id: a.id,
    kind: a.kind,
    ingredient_id: a.ingredientId,
    title: a.title,
  }));

  return {
    ref: data.ref,
    counts: rows.reduce(
      (m, r) => {
        m[r.category] = (m[r.category] ?? 0) + 1;
        return m;
      },
      {} as Record<string, number>,
    ),
    high_pack: rows.filter((r) => r.category === "PACK_PRICE_BUG" && r.confidence === "HIGH" && !r.outlier),
    ranked: [...rows].sort((a, b) => b.impact_score - a.impact_score || a.created_at.localeCompare(b.created_at)),
    opportunities_count: alerts.length,
    opportunity_details: opportunityDetails,
    watch_suppliers: watch.map((w) => w.supplierName),
    watch_detail: watch.map((w) => ({
      supplier: w.supplierName,
      increases: w.increaseCount,
      maxPct: w.maxChangePct,
    })),
    ingredient_count: data.catalog.length,
    history_count: data.history.length,
    invoice_items_count: data.items.length,
  };
}

// Load keys
const vlKey = process.env.VL_KEY;
const prodKey = process.env.PROD_KEY;
if (!vlKey || !prodKey) {
  console.error(JSON.stringify({ error: "Set VL_KEY and PROD_KEY env vars" }));
  process.exit(1);
}

process.env.KEY_bjhnlrgodcqoyzddbpbd = vlKey;
process.env.KEY_lhackrnlnrsiamorzmkb = prodKey;

const vl = await loadProject(VL_REF);
const prod = await loadProject(PROD_REF);

const vlAnalysis = classifyHistory(vl);
const prodAnalysis = classifyHistory(prod);

// Check if any production rows reference VL ingredient IDs or names
const vlIngredientIds = new Set(vl.catalog.map((i) => i.id));
const vlNormalizedNames = new Set(
  vl.catalog.map((i) => (i as { normalized_name?: string }).normalized_name?.toLowerCase()).filter(Boolean),
);

const prodVlOverlap = prodAnalysis.ranked.filter(
  (r) =>
    vlIngredientIds.has(r.ingredient_id) ||
    (r.ingredient && vlNormalizedNames.has(r.ingredient.toLowerCase())),
);

console.log(
  JSON.stringify(
    {
      validation_lab: {
        ...vlAnalysis,
        high_pack_ids: vlAnalysis.high_pack.map((r) => r.history_row_id),
      },
      production_vl_overlap: {
        count: prodVlOverlap.length,
        note: "Production ingredient IDs differ from VL; overlap by ID unlikely unless shared seed data",
        rows: prodVlOverlap.slice(0, 5),
      },
      production_remaining_high_pack: {
        count: prodAnalysis.high_pack.length,
        first_10_by_created_at: prodAnalysis.high_pack
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(0, 10)
          .map((r) => ({
            history_row_id: r.history_row_id,
            ingredient: r.ingredient,
            supplier: r.supplier,
            stored_value: r.stored_value,
            expected_value: r.expected_value,
          })),
      },
      wave2b_recommendation: {
        validation_lab_allowlist: vlAnalysis.high_pack
          .sort((a, b) => b.impact_score - a.impact_score)
          .map((r) => r.history_row_id),
        validation_lab_ranked_table: vlAnalysis.ranked,
      },
    },
    null,
    2,
  ),
);
