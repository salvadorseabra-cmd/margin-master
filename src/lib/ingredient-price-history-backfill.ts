import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import { buildConfirmedAliasMapFromRows } from "@/lib/ingredient-alias-memory";
import {
  defaultIsGenericUnit,
  operationalCostFieldsFromInvoiceLine,
} from "@/lib/ingredient-auto-persist";
import {
  appendIngredientPriceHistoryFromInvoiceLine,
  type AppSupabaseClient,
} from "@/lib/ingredient-price-history";
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

const LOG_PREFIX = "[ingredient_price_history_backfill]";

type BackfillInvoiceItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  invoices: {
    invoice_date: string | null;
    created_at: string | null;
    supplier_name: string | null;
  } | null;
};

export type BackfillIngredientPriceHistoryResult = {
  invoiceItemsAnalyzed: number;
  matchedLines: number;
  historyRowsCreated: number;
  skippedDuplicate: number;
  skippedUnchanged: number;
  skippedUnmatched: number;
  errors: string[];
};

function compareInvoiceChronologyAsc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return -compareInvoiceChronologyDesc(a, b);
}

/**
 * Idempotent backfill: walks invoice lines oldest → newest and inserts missing
 * `ingredient_price_history` rows using the same dedupe and unchanged-price rules
 * as live invoice import.
 */
export async function backfillIngredientPriceHistoryFromInvoices(
  client: AppSupabaseClient,
): Promise<BackfillIngredientPriceHistoryResult> {
  const result: BackfillIngredientPriceHistoryResult = {
    invoiceItemsAnalyzed: 0,
    matchedLines: 0,
    historyRowsCreated: 0,
    skippedDuplicate: 0,
    skippedUnchanged: 0,
    skippedUnmatched: 0,
    errors: [],
  };

  const [{ data: ingredients, error: ingErr }, { data: aliasRows, error: aliasErr }, itemsResult] =
    await Promise.all([
      client.from("ingredients").select("id,name,normalized_name,unit,current_price,purchase_quantity"),
      client.from("ingredient_aliases").select("alias_lookup_key,ingredient_id,supplier_name"),
      client
        .from("invoice_items")
        .select(
          "id,invoice_id,name,quantity,unit,unit_price,invoices!inner(invoice_date,created_at,supplier_name)",
        ),
    ]);

  if (ingErr) {
    result.errors.push(ingErr.message);
    return result;
  }
  if (aliasErr) {
    result.errors.push(aliasErr.message);
    return result;
  }
  if (itemsResult.error) {
    result.errors.push(itemsResult.error.message);
    return result;
  }

  const catalog = (ingredients ?? []) as IngredientCanonicalInput[];
  const confirmedAliases: IngredientAliasMap = buildConfirmedAliasMapFromRows(aliasRows ?? []);
  const rawItems = (itemsResult.data ?? []) as BackfillInvoiceItemRow[];

  const eligible = rawItems
    .map((row) => {
      const normalized = normalizeInvoiceItemFields({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
      });
      if (!isEligibleInvoiceIngredientRow(normalized)) return null;
      const chrono = resolveInvoiceChronology(row.invoices);
      return {
        normalized,
        invoiceId: row.invoice_id,
        supplierName: normalizeSupplierDisplayName(row.invoices?.supplier_name),
        invoiceDate: chrono.displayDateIso,
        invoiceCreatedAt: row.invoices?.created_at ?? null,
        sortDate: chrono.displayDateIso,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  eligible.sort((a, b) => compareInvoiceChronologyAsc(a.sortDate, b.sortDate));

  const matchCatalog = buildInvoiceMatchCatalog(
    catalog,
    eligible.map((row) => ({ name: row.normalized.name })),
  );

  const lastPackByIngredient = new Map<string, number | null>();
  const lastQtyByIngredient = new Map<string, number | null>();
  for (const ing of ingredients ?? []) {
    const id = ing.id?.trim();
    if (!id) continue;
    const pack = ing.current_price == null ? null : Number(ing.current_price);
    lastPackByIngredient.set(id, pack != null && Number.isFinite(pack) ? pack : null);
    const qty = ing.purchase_quantity == null ? null : Number(ing.purchase_quantity);
    lastQtyByIngredient.set(id, qty != null && Number.isFinite(qty) ? qty : null);
  }

  const ingredientMeta = new Map(
    (ingredients ?? []).map((ing) => [
      ing.id,
      { name: ing.name ?? "", unit: ing.unit ?? null },
    ]),
  );

  result.invoiceItemsAnalyzed = eligible.length;

  for (const row of eligible) {
    const supplierScope = row.supplierName?.trim() || null;
    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      row.normalized.name,
      matchCatalog,
      confirmedAliases,
      supplierScope,
    );
    const ingredientId = match?.ingredient.id?.trim();
    if (!match || !ingredientId) {
      result.skippedUnmatched += 1;
      continue;
    }
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") {
      result.skippedUnmatched += 1;
      continue;
    }

    result.matchedLines += 1;

    const fields = operationalCostFieldsFromInvoiceLine(row.normalized, {
      isGenericUnit: defaultIsGenericUnit,
    });
    if (!fields || fields.current_price == null) continue;
    const newPrice = fields.current_price;
    const meta = ingredientMeta.get(ingredientId);
    const previousPrice = lastPackByIngredient.get(ingredientId) ?? null;
    const previousQty = lastQtyByIngredient.get(ingredientId) ?? null;

    const append = await appendIngredientPriceHistoryFromInvoiceLine(client, {
      ingredientId,
      invoiceId: row.invoiceId,
      ingredientName: meta?.name?.trim() || row.normalized.name,
      ingredientUnit: meta?.unit ?? null,
      supplierName: row.supplierName,
      previousPrice,
      newPrice,
      previousPurchaseQuantity: previousQty,
      newPurchaseQuantity: fields.purchase_quantity,
      invoiceDate: row.invoiceDate,
      invoiceCreatedAt: row.invoiceCreatedAt,
    });

    if (append.error) {
      result.errors.push(append.error.message);
      continue;
    }
    if (append.skippedReason === "duplicate_invoice") {
      result.skippedDuplicate += 1;
      continue;
    }
    if (append.skippedReason === "unchanged_price") {
      result.skippedUnchanged += 1;
      continue;
    }
    if (append.inserted) {
      result.historyRowsCreated += 1;
      lastPackByIngredient.set(ingredientId, newPrice);
      lastQtyByIngredient.set(ingredientId, fields.purchase_quantity ?? null);
    }
  }

  if (result.historyRowsCreated > 0) {
    console.info(`${LOG_PREFIX} complete`, result);
  }

  return result;
}
