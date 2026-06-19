import type { PostgrestError } from "@supabase/supabase-js";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { buildConfirmedAliasMapFromRows } from "@/lib/ingredient-alias-memory";
import {
  defaultIsGenericUnit,
  procurementPackFieldsFromInvoiceLine,
  type AutoPersistInvoiceItem,
} from "@/lib/ingredient-auto-persist";
import type { AppSupabaseClient } from "@/lib/ingredient-price-history";
import {
  compareInvoiceChronologyDesc,
  resolveInvoiceChronology,
} from "@/lib/invoice-chronology";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "@/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";
import { isEligibleInvoiceIngredientRow } from "@/lib/invoice-unresolved-ingredient-count";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

const LOG_PREFIX = "[ingredient_procurement_price_sync]";

const LINKED_HISTORY_INVOICE_SELECT =
  "invoice_id,created_at,invoices(invoice_date,created_at)" as const;

const INVOICE_ITEM_SELECT =
  "id,invoice_id,name,quantity,unit,unit_price,total,invoices!inner(invoice_date,created_at,supplier_name)" as const;

type LinkedHistoryInvoiceRow = {
  invoice_id: string | null;
  created_at: string | null;
  invoices?: { invoice_date: string | null; created_at: string | null } | null;
};

type ProcurementInvoiceItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  invoices?: {
    invoice_date: string | null;
    created_at: string | null;
    supplier_name: string | null;
  } | null;
};

export type SyncIngredientProcurementPriceResult = {
  updated: boolean;
  currentPrice: number | null;
  purchaseQuantity: number | null;
  purchaseUnit: string | null;
  sourceInvoiceId: string | null;
  sourceInvoiceItemId: string | null;
  error: PostgrestError | null;
};

export type SyncIngredientProcurementPriceOptions = {
  excludeInvoiceId?: string | null;
  isGenericUnit?: (unit: string | null | undefined) => boolean;
};

function logSupabaseError(label: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${LOG_PREFIX} ${label} failed: ${error.message}${code}`);
}

function invoiceChronologyKey(row: {
  invoices?: { invoice_date: string | null; created_at: string | null } | null;
}): string | null {
  return resolveInvoiceChronology(row.invoices ?? null).displayDateIso;
}

function sortInvoiceItemsByChronologyDesc(
  rows: readonly ProcurementInvoiceItemRow[],
): ProcurementInvoiceItemRow[] {
  return [...rows].sort((a, b) => {
    const dateCmp = compareInvoiceChronologyDesc(
      invoiceChronologyKey(a),
      invoiceChronologyKey(b),
    );
    if (dateCmp !== 0) return dateCmp;
    return String(b.id).localeCompare(String(a.id));
  });
}

async function fetchLinkedHistoryInvoiceIds(
  client: AppSupabaseClient,
  ingredientId: string,
  excludeInvoiceId?: string | null,
): Promise<string[]> {
  const { data, error } = await client
    .from("ingredient_price_history")
    .select(LINKED_HISTORY_INVOICE_SELECT)
    .eq("ingredient_id", ingredientId)
    .not("invoice_id", "is", null);
  if (error) {
    logSupabaseError("fetchLinkedHistoryInvoiceIds", error);
    return [];
  }

  const exclude = excludeInvoiceId?.trim() ?? "";
  const rows = ((data ?? []) as LinkedHistoryInvoiceRow[]).filter((row) => {
    const invoiceId = row.invoice_id?.trim();
    if (!invoiceId) return false;
    if (exclude && invoiceId === exclude) return false;
    return true;
  });

  rows.sort((a, b) => {
    const dateCmp = compareInvoiceChronologyDesc(
      invoiceChronologyKey(a),
      invoiceChronologyKey(b),
    );
    if (dateCmp !== 0) return dateCmp;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of rows) {
    const invoiceId = row.invoice_id?.trim();
    if (!invoiceId || seen.has(invoiceId)) continue;
    seen.add(invoiceId);
    ordered.push(invoiceId);
  }
  return ordered;
}

async function fetchConfirmedAliasesForIngredient(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<IngredientAliasMap> {
  const { data, error } = await client
    .from("ingredient_aliases")
    .select("ingredient_id, alias_name, normalized_alias, supplier_name")
    .eq("confirmed_by_user", true)
    .eq("ingredient_id", ingredientId);
  if (error) {
    logSupabaseError("fetchConfirmedAliasesForIngredient", error);
    return {};
  }
  return buildConfirmedAliasMapFromRows(data ?? []);
}

async function fetchInvoiceItemsForInvoices(
  client: AppSupabaseClient,
  invoiceIds: readonly string[],
): Promise<ProcurementInvoiceItemRow[]> {
  if (invoiceIds.length === 0) return [];
  const { data, error } = await client
    .from("invoice_items")
    .select(INVOICE_ITEM_SELECT)
    .in("invoice_id", [...invoiceIds]);
  if (error) {
    logSupabaseError("fetchInvoiceItemsForInvoices", error);
    return [];
  }
  return (data ?? []) as ProcurementInvoiceItemRow[];
}

function resolveLatestMatchedInvoiceLine(
  ingredient: IngredientCanonicalInput,
  confirmedAliases: IngredientAliasMap,
  items: readonly ProcurementInvoiceItemRow[],
): ProcurementInvoiceItemRow | null {
  const ingredientId = ingredient.id?.trim();
  if (!ingredientId) return null;

  const catalog = [ingredient];
  for (const source of sortInvoiceItemsByChronologyDesc(items)) {
    const normalized = normalizeInvoiceItemFields({
      id: source.id,
      name: source.name,
      quantity: source.quantity,
      unit: source.unit,
      unit_price: source.unit_price,
      total: source.total,
    });
    if (!isEligibleInvoiceIngredientRow(normalized)) continue;

    const supplierName = normalizeSupplierDisplayName(source.invoices?.supplier_name ?? null);
    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      normalized.name,
      catalog,
      confirmedAliases,
      supplierName,
    );
    if (match?.ingredient.id?.trim() !== ingredientId) continue;
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") continue;
    return source;
  }
  return null;
}

/**
 * Projects `ingredients.current_price` from the latest linked invoice line (procurement pack
 * contract). Never reconstructs pack price from `ingredient_price_history.new_price`.
 */
export async function syncIngredientProcurementPrice(
  client: AppSupabaseClient,
  ingredientId: string,
  options: SyncIngredientProcurementPriceOptions = {},
): Promise<SyncIngredientProcurementPriceResult> {
  const id = ingredientId.trim();
  const empty: SyncIngredientProcurementPriceResult = {
    updated: false,
    currentPrice: null,
    purchaseQuantity: null,
    purchaseUnit: null,
    sourceInvoiceId: null,
    sourceInvoiceItemId: null,
    error: null,
  };
  if (!id) return empty;

  const isGenericUnit = options.isGenericUnit ?? defaultIsGenericUnit;

  try {
    const { data: ingredientRow, error: ingredientError } = await client
      .from("ingredients")
      .select("id,name,normalized_name,unit,current_price,purchase_quantity,purchase_unit,base_unit")
      .eq("id", id)
      .maybeSingle();
    if (ingredientError) {
      logSupabaseError("syncIngredientProcurementPrice ingredient fetch", ingredientError);
      return { ...empty, error: ingredientError };
    }
    if (!ingredientRow?.id) return empty;

    const ingredient = ingredientRow as IngredientCanonicalInput;
    const [linkedInvoiceIds, confirmedAliases] = await Promise.all([
      fetchLinkedHistoryInvoiceIds(client, id, options.excludeInvoiceId),
      fetchConfirmedAliasesForIngredient(client, id),
    ]);

    const invoiceItems = await fetchInvoiceItemsForInvoices(client, linkedInvoiceIds);
    const latestLine = resolveLatestMatchedInvoiceLine(ingredient, confirmedAliases, invoiceItems);
    if (!latestLine) return empty;

    const normalized = normalizeInvoiceItemFields({
      id: latestLine.id,
      name: latestLine.name,
      quantity: latestLine.quantity,
      unit: latestLine.unit,
      unit_price: latestLine.unit_price,
      total: latestLine.total,
    });
    const pack = procurementPackFieldsFromInvoiceLine(
      normalized as Pick<
        AutoPersistInvoiceItem,
        "name" | "quantity" | "unit" | "unit_price" | "total"
      >,
      { isGenericUnit },
    );
    if (!pack) return empty;

    const { error: updateError } = await client
      .from("ingredients")
      .update({
        current_price: pack.current_price,
        purchase_quantity: pack.purchase_quantity,
        ...(pack.includeCatalogUnitFields
          ? {
              purchase_unit: pack.purchase_unit,
              base_unit: pack.base_unit,
              unit: pack.unit,
            }
          : {}),
      })
      .eq("id", id);
    if (updateError) {
      logSupabaseError("syncIngredientProcurementPrice update", updateError);
      return {
        ...empty,
        currentPrice: pack.current_price,
        purchaseQuantity: pack.purchase_quantity,
        purchaseUnit: pack.purchase_unit,
        sourceInvoiceId: latestLine.invoice_id,
        sourceInvoiceItemId: latestLine.id,
        error: updateError,
      };
    }

    return {
      updated: true,
      currentPrice: pack.current_price,
      purchaseQuantity: pack.purchase_quantity,
      purchaseUnit: pack.purchase_unit,
      sourceInvoiceId: latestLine.invoice_id,
      sourceInvoiceItemId: latestLine.id,
      error: null,
    };
  } catch (err) {
    console.error(
      `${LOG_PREFIX} syncIngredientProcurementPrice threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return empty;
  }
}
