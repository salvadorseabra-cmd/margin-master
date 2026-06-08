/**
 * Read-only: classify remaining HIGH PACK_PRICE_BUG rows by dataset origin.
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
import { resolveInvoiceChronology } from "../src/lib/invoice-chronology";

const PROD_REF = "lhackrnlnrsiamorzmkb";
const VL_REF = "bjhnlrgodcqoyzddbpbd";
const PROD_USER = "6b9fc0cf-6b28-4154-becf-99aadb7584b9";
const VL_USER = "acfb54e5-785f-4bc8-b47b-3914452e18a5";

const WAVE2A_REPAIRED = new Set([
  "45c891bb-06b0-4268-a785-71bb7e40a0d7",
  "8651aa39-fe42-49cc-9a40-283defb9042b",
  "2aa734f1-91fc-4ca3-b97a-8e01b3bf7916",
  "92162d54-9d0c-4f96-8798-85f232e69f9b",
  "22db9eb8-24f3-443e-9b04-da3ecda170e7",
  "22c8efba-8464-487e-a69e-3457c7b857e4",
  "19225c9b-fa2f-42de-9ac9-cf660c8536b8",
  "f5a55cf8-4116-4b0a-8ebc-0ef2967e7037",
  "fe28be38-eb32-4b72-93d2-6289111d0b71",
  "38651eea-7bf1-4911-92cf-fd0eef36d6fc",
]);

const EXCLUDED_OUTLIERS = new Set([
  "f6594a4e-8c5b-4ab1-be48-ae153c89f70e",
  "a2cde747-592f-4e4d-a894-de0965f1f454",
]);

const EPS = 0.01;
const EPS_REL = 0.005;
const PACK_RATIO_HIGH = 5;

const VL_SUPPLIERS = new Set(["aviludo", "avijudo"]);

function withinEps(a: number, b: number | null): boolean {
  if (b == null || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= EPS) return true;
  return diff / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= EPS_REL;
}

type Origin = "OLD_RESTAURANT" | "VALIDATION_LAB" | "UNKNOWN_ORIGIN";

type ItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  invoices: { supplier_name: string | null; user_id?: string | null } | null;
};

async function loadProject(ref: string, key: string) {
  const sb = createClient<Database>(`https://${ref}.supabase.co`, key, { auth: { persistSession: false } });
  const [
    { data: history },
    { data: catalog },
    { data: aliases },
    { data: items },
    { data: invoices },
  ] = await Promise.all([
    sb.from("ingredient_price_history").select("*"),
    sb.from("ingredients").select("id,name,normalized_name,user_id,created_at"),
    sb.from("ingredient_aliases").select("ingredient_id, alias_name, normalized_alias, supplier_name").eq("confirmed_by_user", true),
    sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,invoices!inner(supplier_name,user_id)"),
    sb.from("invoices").select("id,supplier_name,user_id,created_at,invoice_date,file_url"),
  ]);
  return {
    ref,
    history: history ?? [],
    catalog: (catalog ?? []) as IngredientCanonicalInput[],
    aliases: buildConfirmedAliasMapFromRows(aliases ?? []),
    items: (items ?? []) as ItemRow[],
    invoices: invoices ?? [],
  };
}

function findMatches(
  h: { ingredient_id: string; invoice_id: string | null },
  catalog: IngredientCanonicalInput[],
  aliases: IngredientAliasMap,
  itemsByInvoice: Map<string, ItemRow[]>,
) {
  if (!h.invoice_id) return [];
  const invoiceItems = itemsByInvoice.get(h.invoice_id) ?? [];
  const matchCatalog = buildInvoiceMatchCatalog(catalog, invoiceItems.map((r) => ({ name: r.name })));
  const hits: Array<{ unit_price: number; operational: number }> = [];
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
    hits.push({ unit_price: Number(item.unit_price), operational: op });
  }
  return hits;
}

function isHighPack(stored: number, hits: ReturnType<typeof findMatches>): boolean {
  if (hits.length !== 1) return false;
  const op = hits[0]!.operational;
  const up = hits[0]!.unit_price;
  if (!withinEps(stored, up) || withinEps(stored, op)) return false;
  const ratio = op > 0 ? stored / op : 0;
  return ratio >= PACK_RATIO_HIGH;
}

const prodKey = process.env.PROD_KEY!;
const vlKey = process.env.VL_KEY!;
if (!prodKey || !vlKey) {
  console.error(JSON.stringify({ error: "Set PROD_KEY and VL_KEY" }));
  process.exit(1);
}

const [prod, vl] = await Promise.all([loadProject(PROD_REF, prodKey), loadProject(VL_REF, vlKey)]);

const vlIngredientIds = new Set(vl.catalog.map((i) => i.id));
const vlInvoiceIds = new Set(vl.invoices.map((i) => i.id));
const vlHistoryIds = new Set(vl.history.map((h) => h.id));
const vlIngredientNames = new Set(vl.catalog.map((i) => i.name?.toLowerCase()).filter(Boolean));

const invoiceById = new Map(prod.invoices.map((i) => [i.id, i]));
const ingredientById = new Map(prod.catalog.map((i) => [i.id, i]));
const itemsByInvoice = new Map<string, ItemRow[]>();
for (const row of prod.items) {
  const list = itemsByInvoice.get(row.invoice_id) ?? [];
  list.push(row);
  itemsByInvoice.set(row.invoice_id, list);
}
const invoiceSet = new Set(prod.invoices.map((i) => i.id));

function resolveOrigin(h: {
  id: string;
  ingredient_id: string;
  invoice_id: string | null;
  ingredient_name: string | null;
  supplier_name: string | null;
}): { origin: Origin; evidence: string[] } {
  const evidence: string[] = [];
  const inv = h.invoice_id ? invoiceById.get(h.invoice_id) : null;
  const ing = ingredientById.get(h.ingredient_id);
  const supplierNorm = h.supplier_name?.trim().toLowerCase() ?? "";

  if (vlHistoryIds.has(h.id)) {
    evidence.push("history_row_id exists in VL project");
    return { origin: "VALIDATION_LAB", evidence };
  }
  if (vlIngredientIds.has(h.ingredient_id)) {
    evidence.push("ingredient_id matches VL catalog");
    return { origin: "VALIDATION_LAB", evidence };
  }
  if (h.invoice_id && vlInvoiceIds.has(h.invoice_id)) {
    evidence.push("invoice_id matches VL invoices");
    return { origin: "VALIDATION_LAB", evidence };
  }

  if (VL_SUPPLIERS.has(supplierNorm)) {
    evidence.push(`supplier ${h.supplier_name} is VL-only supplier name`);
    return { origin: "VALIDATION_LAB", evidence };
  }

  const ingUser = (ing as { user_id?: string })?.user_id;
  const invUser = inv?.user_id;
  if (invUser === VL_USER || ingUser === VL_USER) {
    evidence.push(`user_id=${invUser ?? ingUser} matches VL user`);
    return { origin: "VALIDATION_LAB", evidence };
  }

  if (invUser === PROD_USER) evidence.push(`invoice.user_id=${PROD_USER} (production restaurant)`);
  if (ingUser === PROD_USER) evidence.push(`ingredient.user_id=${PROD_USER}`);
  if (!invUser && !ingUser) evidence.push("user_id not on row; inferred from production DB host");
  evidence.push(`row stored in production project ${PROD_REF}`);
  if (h.ingredient_name && vlIngredientNames.has(h.ingredient_name.toLowerCase())) {
    evidence.push("ingredient name matches VL catalog name (different UUID)");
  }

  if (invUser === PROD_USER || ingUser === PROD_USER || (!invUser && !ingUser)) {
    return { origin: "OLD_RESTAURANT", evidence };
  }

  if (invUser && invUser !== PROD_USER && invUser !== VL_USER) {
    evidence.push(`unexpected invoice.user_id=${invUser}`);
    return { origin: "UNKNOWN_ORIGIN", evidence };
  }
  if (ingUser && ingUser !== PROD_USER && ingUser !== VL_USER) {
    evidence.push(`unexpected ingredient.user_id=${ingUser}`);
    return { origin: "UNKNOWN_ORIGIN", evidence };
  }

  return { origin: "OLD_RESTAURANT", evidence };
}

const remainingHigh: Array<{
  history_row_id: string;
  ingredient: string;
  supplier: string | null;
  invoice_id: string | null;
  origin: Origin;
  evidence: string[];
  first_seen: string;
  first_seen_source: string;
  stored_new_price: number;
  expected_operational: number;
  ingredient_user_id: string | null;
  invoice_user_id: string | null;
}> = [];

for (const h of prod.history) {
  if (WAVE2A_REPAIRED.has(h.id)) continue;
  if (EXCLUDED_OUTLIERS.has(h.id)) continue;
  if (!h.invoice_id || !invoiceSet.has(h.invoice_id)) continue;

  const hits = findMatches(h, prod.catalog, prod.aliases, itemsByInvoice);
  const stored = Number(h.new_price);
  if (!isHighPack(stored, hits)) continue;

  const inv = invoiceById.get(h.invoice_id)!;
  const ing = ingredientById.get(h.ingredient_id);
  const chrono = resolveInvoiceChronology({
    invoice_date: (inv as { invoice_date?: string }).invoice_date ?? null,
    created_at: inv.created_at,
  });
  const firstSeen = chrono.displayDateIso ?? h.created_at.slice(0, 10);
  const firstSeenSource = chrono.displayDateIso ? "invoice_date" : "history.created_at";

  const { origin, evidence } = resolveOrigin(h);

  remainingHigh.push({
    history_row_id: h.id,
    ingredient: h.ingredient_name ?? (ing as { name?: string })?.name ?? "",
    supplier: h.supplier_name,
    invoice_id: h.invoice_id,
    origin,
    evidence,
    first_seen: firstSeen,
    first_seen_source: firstSeenSource,
    stored_new_price: stored,
    expected_operational: hits[0]!.operational,
    ingredient_user_id: (ing as { user_id?: string })?.user_id ?? null,
    invoice_user_id: inv.user_id ?? null,
  });
}

remainingHigh.sort((a, b) => a.first_seen.localeCompare(b.first_seen) || a.history_row_id.localeCompare(b.history_row_id));

const byOrigin = {
  OLD_RESTAURANT: remainingHigh.filter((r) => r.origin === "OLD_RESTAURANT"),
  VALIDATION_LAB: remainingHigh.filter((r) => r.origin === "VALIDATION_LAB"),
  UNKNOWN_ORIGIN: remainingHigh.filter((r) => r.origin === "UNKNOWN_ORIGIN"),
};

function groupBySupplier(rows: typeof remainingHigh) {
  return Object.fromEntries(
    Object.entries(
      rows.reduce(
        (m, r) => {
          const k = r.supplier ?? "(blank)";
          m[k] = m[k] ?? [];
          m[k].push(r);
          return m;
        },
        {} as Record<string, typeof remainingHigh>,
      ),
    ).sort((a, b) => b[1].length - a[1].length),
  );
}

console.log(
  JSON.stringify(
    {
      summary: {
        remaining_high_pack_count: remainingHigh.length,
        wave2a_excluded: WAVE2A_REPAIRED.size,
        outlier_excluded: EXCLUDED_OUTLIERS.size,
        old_restaurant: byOrigin.OLD_RESTAURANT.length,
        validation_lab: byOrigin.VALIDATION_LAB.length,
        unknown_origin: byOrigin.UNKNOWN_ORIGIN.length,
        vl_crossref: {
          vl_ingredient_id_overlap: remainingHigh.filter((r) => vlIngredientIds.has(r.history_row_id)).length,
          prod_ingredient_ids_in_vl: [...remainingHigh].filter((r) => vlIngredientIds.has(r.history_row_id)).length,
          vl_invoice_overlap: remainingHigh.filter((r) => r.invoice_id && vlInvoiceIds.has(r.invoice_id)).length,
          vl_history_id_overlap: remainingHigh.filter((r) => vlHistoryIds.has(r.history_row_id)).length,
        },
        prod_user_id_on_invoices: [...new Set(remainingHigh.map((r) => r.invoice_user_id))],
        prod_user_id_on_ingredients: [...new Set(remainingHigh.map((r) => r.ingredient_user_id))],
        date_range: {
          earliest: remainingHigh[0]?.first_seen,
          latest: remainingHigh[remainingHigh.length - 1]?.first_seen,
        },
        wave2b_scope_exclusively_old_restaurant: byOrigin.VALIDATION_LAB.length === 0 && byOrigin.UNKNOWN_ORIGIN.length === 0,
      },
      old_restaurant: {
        count: byOrigin.OLD_RESTAURANT.length,
        by_supplier: groupBySupplier(byOrigin.OLD_RESTAURANT),
        rows: byOrigin.OLD_RESTAURANT,
      },
      validation_lab: {
        count: byOrigin.VALIDATION_LAB.length,
        rows: byOrigin.VALIDATION_LAB,
      },
      unknown_origin: {
        count: byOrigin.UNKNOWN_ORIGIN.length,
        rows: byOrigin.UNKNOWN_ORIGIN,
      },
      full_list_with_origin: remainingHigh,
    },
    null,
    2,
  ),
);
