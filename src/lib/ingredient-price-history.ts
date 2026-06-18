import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import {
  purchaseQuantityDenom,
  resolvedOperationalUnitCostEur,
} from "@/lib/ingredient-unit-cost";
import {
  derivePurchaseContractSnapshot,
  guardOperationalPreviousPrice,
  selectChainCompatiblePriorOperationalPrice,
  shouldBlockHistoryInsert,
  type PriorChainCandidateRow,
} from "@/lib/ingredient-price-chain-guard";
import {
  compareInvoiceChronologyAsc,
  resolveInvoiceChronology,
} from "@/lib/invoice-chronology";

/** Supabase browser client shape used across the app. */
export type AppSupabaseClient = SupabaseClient<Database>;

const HISTORY_SELECT =
  "id,ingredient_id,invoice_id,ingredient_name,supplier_name,ingredient_unit,previous_price,new_price,delta,delta_percent,created_at" as const;

const LOG_PREFIX = "[ingredient_price_history]";

/** Align with recipe-impact-engine effective unit price equality. */
export const INGREDIENT_PRICE_EQ_EPS = 1e-6;

export type InvoiceIngredientPriceHistoryContext = {
  invoiceId: string;
  supplierName?: string | null;
  invoiceDate?: string | null;
  invoiceCreatedAt?: string | null;
};

export type AppendIngredientPriceHistoryParams = {
  ingredientId: string;
  invoiceId: string;
  ingredientName: string;
  ingredientUnit?: string | null;
  supplierName?: string | null;
  /** Pack/catalog price before the line — used for pack-level unchanged detection. */
  previousPrice: number | null;
  /** When set, stored as `previous_price` directly (€/base-unit); skips re-normalization. */
  previousOperationalPrice?: number | null;
  newPrice: number;
  previousPurchaseQuantity?: number | null;
  newPurchaseQuantity?: number | null;
  invoiceDate?: string | null;
  invoiceCreatedAt?: string | null;
};

export type IngredientPriceSnapshot = {
  name: string;
  unit: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
};

export function effectivePackUnitPrice(
  packPrice: number | null | undefined,
  purchaseQuantity: number | null | undefined,
): number | null {
  const pack = packPrice == null ? NaN : Number(packPrice);
  const denom =
    purchaseQuantity == null || Number(purchaseQuantity) <= 0 ? 1 : Number(purchaseQuantity);
  if (!Number.isFinite(pack) || pack < 0) return null;
  return pack / denom;
}

/** True when invoice line pack cost maps to the same €/base-unit as before (within epsilon). */
export function invoiceLinePricesUnchanged(
  previousPack: number | null,
  previousQty: number | null | undefined,
  newPack: number,
  newQty: number | null | undefined,
  eps = INGREDIENT_PRICE_EQ_EPS,
): boolean {
  const prevU = effectivePackUnitPrice(previousPack, previousQty);
  const nextU = effectivePackUnitPrice(newPack, newQty);
  if (prevU != null && nextU != null) {
    return Math.abs(prevU - nextU) <= eps;
  }
  if (previousPack == null) return false;
  return Math.abs(Number(previousPack) - newPack) <= eps;
}

export function computePriceHistoryDelta(
  previousPrice: number | null,
  newPrice: number,
): { delta: number | null; delta_percent: number | null } {
  const prev = previousPrice == null ? null : Number(previousPrice);
  const next = Number(newPrice);
  if (!Number.isFinite(next)) return { delta: null, delta_percent: null };
  if (prev == null || !Number.isFinite(prev)) return { delta: null, delta_percent: null };
  const delta = next - prev;
  const delta_percent =
    Math.abs(prev) > INGREDIENT_PRICE_EQ_EPS ? (delta / prev) * 100 : null;
  return { delta, delta_percent };
}

/** `created_at` for history rows — invoice issue date when known, else upload time, else now. */
export function resolveIngredientPriceHistoryCreatedAt(params: {
  invoiceDate?: string | null;
  invoiceCreatedAt?: string | null;
}): string {
  const { displayDateIso } = resolveInvoiceChronology({
    invoice_date: params.invoiceDate ?? null,
    created_at: params.invoiceCreatedAt ?? null,
  });
  if (displayDateIso) {
    return `${displayDateIso}T12:00:00.000Z`;
  }
  return new Date().toISOString();
}

/** Pack/catalog price on the ingredient row before an invoice persist (skip detection only). */
export function resolvePreviousPackPriceForHistory(
  snapshot: IngredientPriceSnapshot,
): number | null {
  const current = snapshot.current_price == null ? null : Number(snapshot.current_price);
  if (current != null && Number.isFinite(current)) return current;
  return null;
}

/**
 * €/base-unit before an invoice persist — catalog pack normalized when present, else latest
 * history `new_price` (already operational; do not divide again on insert).
 */
export function resolvePreviousOperationalPriceForHistory(
  snapshot: IngredientPriceSnapshot,
  latestHistoryNewPrice: number | null,
): number | null {
  const pack = resolvePreviousPackPriceForHistory(snapshot);
  if (pack != null) {
    return operationalUnitPriceForPriceHistory(pack, snapshot.purchase_quantity);
  }
  if (latestHistoryNewPrice != null && Number.isFinite(latestHistoryNewPrice)) {
    return latestHistoryNewPrice;
  }
  return null;
}

/**
 * €/base-unit for history rows — same as recipe costing and {@link resolvedOperationalUnitCostEur}.
 * Callers pass invoice/catalog pack price + purchase_quantity; stored values are normalized only.
 */
export function operationalUnitPriceForPriceHistory(
  packPrice: number | null | undefined,
  purchaseQuantity: number | null | undefined,
): number | null {
  if (packPrice == null) return null;
  const pack = Number(packPrice);
  if (!Number.isFinite(pack)) return null;
  return resolvedOperationalUnitCostEur({
    current_price: pack,
    purchase_quantity: purchaseQuantityDenom(purchaseQuantity),
  });
}

export type IngredientPriceHistoryRow = Pick<
  Tables<"ingredient_price_history">,
  | "id"
  | "ingredient_id"
  | "invoice_id"
  | "ingredient_name"
  | "supplier_name"
  | "ingredient_unit"
  | "previous_price"
  | "new_price"
  | "delta"
  | "delta_percent"
  | "created_at"
>;

type LinkedHistoryChronologyRow = IngredientPriceHistoryRow & {
  invoices?: { invoice_date: string | null; created_at: string | null } | null;
};

/** Oldest → newest linked rows by invoice issue date (matches reconcile chain ordering). */
export function sortLinkedHistoryByInvoiceChronology<T extends LinkedHistoryChronologyRow>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const dateCmp = compareInvoiceChronologyAsc(
      resolveInvoiceChronology(a.invoices ?? null).displayDateIso,
      resolveInvoiceChronology(b.invoices ?? null).displayDateIso,
    );
    if (dateCmp !== 0) return dateCmp;
    const createdCmp = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    if (createdCmp !== 0) return createdCmp;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

const LINKED_HISTORY_CHRONOLOGY_SELECT =
  "id,new_price,invoice_id,created_at,invoices(invoice_date, created_at)" as const;

function latestLinkedOperationalPriceFromRows(
  rows: readonly LinkedHistoryChronologyRow[],
): { operationalPrice: number | null; sourceHistoryRowId: string | null } {
  const linked = sortLinkedHistoryByInvoiceChronology(rows.filter(isLinkedPriceHistoryRow));
  for (let i = linked.length - 1; i >= 0; i -= 1) {
    const row = linked[i];
    const n = row.new_price == null ? null : Number(row.new_price);
    if (n != null && Number.isFinite(n)) {
      return { operationalPrice: n, sourceHistoryRowId: row.id };
    }
  }
  return { operationalPrice: null, sourceHistoryRowId: null };
}

export type SyncIngredientCurrentPriceResult = {
  updated: boolean;
  currentPrice: number | null;
  latestOperationalPrice: number | null;
  sourceHistoryRowId: string | null;
  error: PostgrestError | null;
};

/** Projects `ingredients.current_price` from chronology-correct linked price history. */
export async function syncIngredientCurrentPrice(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<SyncIngredientCurrentPriceResult> {
  const id = ingredientId.trim();
  const empty: SyncIngredientCurrentPriceResult = {
    updated: false,
    currentPrice: null,
    latestOperationalPrice: null,
    sourceHistoryRowId: null,
    error: null,
  };
  if (!id) return empty;

  const snapshot = await fetchIngredientPriceSnapshot(client, id);
  if (!snapshot) return empty;

  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select(LINKED_HISTORY_CHRONOLOGY_SELECT)
      .eq("ingredient_id", id)
      .not("invoice_id", "is", null);
    if (error) {
      logSupabaseError("syncIngredientCurrentPrice fetch", error);
      return { ...empty, error };
    }

    const { operationalPrice, sourceHistoryRowId } = latestLinkedOperationalPriceFromRows(
      (data ?? []) as LinkedHistoryChronologyRow[],
    );
    let currentPrice: number | null = null;
    if (operationalPrice != null && Number.isFinite(operationalPrice)) {
      currentPrice = operationalPrice * purchaseQuantityDenom(snapshot.purchase_quantity);
    }

    const { error: updateError } = await client
      .from("ingredients")
      .update({ current_price: currentPrice })
      .eq("id", id);
    if (updateError) {
      logSupabaseError("syncIngredientCurrentPrice update", updateError);
      return {
        updated: false,
        currentPrice,
        latestOperationalPrice: operationalPrice,
        sourceHistoryRowId,
        error: updateError,
      };
    }

    return {
      updated: true,
      currentPrice,
      latestOperationalPrice: operationalPrice,
      sourceHistoryRowId,
      error: null,
    };
  } catch (err) {
    console.error(
      `${LOG_PREFIX} syncIngredientCurrentPrice threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return empty;
  }
}

/** Minimal shape for invoice-link checks on price history rows. */
export type PriceHistoryInvoiceLink = Pick<IngredientPriceHistoryRow, "invoice_id">;

/** True when a history row is still tied to an invoice (not orphan SET NULL). */
export function isLinkedPriceHistoryRow(row: PriceHistoryInvoiceLink): boolean {
  const invoiceId = row.invoice_id;
  return invoiceId != null && String(invoiceId).trim() !== "";
}

/** Rows still linked to an invoice; orphans are excluded from intelligence surfaces. */
export function linkedIngredientPriceHistoryRows<T extends PriceHistoryInvoiceLink>(
  rows: readonly T[],
): T[] {
  return rows.filter(isLinkedPriceHistoryRow);
}

export {
  filterHistoryRowsByContractAnchor,
  filterTrustedPriceHistoryRows,
  isTrustedPriceMovementRow,
  trustedPriceHistoryDeltaPercent,
} from "@/lib/ingredient-price-chain-guard";

/**
 * Log a Supabase error with a stable, secret-free prefix. Treats the table as
 * optional: callers should fall back to empty results instead of throwing.
 */
function logSupabaseError(label: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${LOG_PREFIX} ${label} failed: ${error.message}${code}`);
}

export type InvoiceIngredientHistoryRow = Pick<
  IngredientPriceHistoryRow,
  "id" | "created_at" | "previous_price" | "new_price"
>;

export async function fetchHistoryRowForInvoiceIngredient(
  client: AppSupabaseClient,
  invoiceId: string,
  ingredientId: string,
): Promise<InvoiceIngredientHistoryRow | null> {
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select("id,created_at,previous_price,new_price")
      .eq("invoice_id", invoiceId)
      .eq("ingredient_id", ingredientId)
      .limit(1)
      .maybeSingle();
    if (error) {
      logSupabaseError("fetchHistoryRowForInvoiceIngredient", error);
      return null;
    }
    if (!data?.id) return null;
    return data as InvoiceIngredientHistoryRow;
  } catch (err) {
    console.error(
      `${LOG_PREFIX} fetchHistoryRowForInvoiceIngredient threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function sortPriorChainRowsNewestFirst<
  T extends {
    invoice_id: string | null;
    created_at: string | null;
    id: string;
    invoices?: { invoice_date: string | null; created_at: string | null } | null;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const dateCmp = compareInvoiceChronologyAsc(
      resolveInvoiceChronology(a.invoices ?? null).displayDateIso,
      resolveInvoiceChronology(b.invoices ?? null).displayDateIso,
    );
    if (dateCmp !== 0) return -dateCmp;
    const createdCmp = String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    if (createdCmp !== 0) return createdCmp;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
}

/** Latest linked history `new_price` before a re-extract refresh (excludes the invoice being refreshed). */
export async function fetchPriorLinkedHistoryNewPrice(
  client: AppSupabaseClient,
  ingredientId: string,
  excludeInvoiceId: string,
  candidate?: {
    ingredientName: string;
    ingredientUnit?: string | null;
    newPurchaseQuantity?: number | null;
    storedNew: number;
  },
): Promise<number | null> {
  const id = ingredientId.trim();
  const exclude = excludeInvoiceId.trim();
  if (!id || !exclude) return null;
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select(
        "new_price, ingredient_name, ingredient_unit, invoice_id, created_at, id, invoices(invoice_date, created_at)",
      )
      .eq("ingredient_id", id)
      .not("invoice_id", "is", null)
      .neq("invoice_id", exclude);
    if (error) {
      logSupabaseError("fetchPriorLinkedHistoryNewPrice", error);
      return null;
    }
    const rows = sortPriorChainRowsNewestFirst(data ?? []);
    if (!candidate) {
      const n = rows[0]?.new_price == null ? null : Number(rows[0].new_price);
      return n != null && Number.isFinite(n) ? n : null;
    }

    const nextSnap = derivePurchaseContractSnapshot({
      name: candidate.ingredientName,
      operationalUnitPrice: candidate.storedNew,
      purchaseQuantity: candidate.newPurchaseQuantity ?? null,
      ingredientUnit: candidate.ingredientUnit ?? null,
    });
    return selectChainCompatiblePriorOperationalPrice(
      rows as PriorChainCandidateRow[],
      nextSnap,
    );
  } catch (err) {
    console.error(
      `${LOG_PREFIX} fetchPriorLinkedHistoryNewPrice threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function applyChainGuardToStoredPrices(
  params: AppendIngredientPriceHistoryParams,
  storedPrev: number | null,
  storedNew: number,
): number | null {
  const nextSnap = derivePurchaseContractSnapshot({
    name: params.ingredientName,
    operationalUnitPrice: storedNew,
    purchaseQuantity: params.newPurchaseQuantity ?? null,
    ingredientUnit: params.ingredientUnit ?? null,
  });

  if (shouldBlockHistoryInsert(nextSnap)) return null;

  if (storedPrev == null || !Number.isFinite(storedPrev)) return null;

  const priorSnap = derivePurchaseContractSnapshot({
    name: params.ingredientName,
    operationalUnitPrice: storedPrev,
    purchaseQuantity: params.previousPurchaseQuantity ?? null,
    ingredientUnit: params.ingredientUnit ?? null,
  });

  return guardOperationalPreviousPrice(priorSnap, nextSnap) == null ? null : storedPrev;
}

function storedPriceHistoryFieldsFromParams(
  params: AppendIngredientPriceHistoryParams,
  opts?: { priorLinkedNewPrice?: number | null; refreshExisting?: boolean },
): {
  storedPrev: number | null;
  storedNew: number;
  prevPack: number | null;
} | null {
  const newPrice = Number(params.newPrice);
  if (!Number.isFinite(newPrice)) return null;

  const prevPack = params.previousPrice == null ? null : Number(params.previousPrice);
  const storedNew = operationalUnitPriceForPriceHistory(newPrice, params.newPurchaseQuantity);
  if (storedNew == null) return null;

  let storedPrev: number | null;
  if (opts?.refreshExisting) {
    if (opts.priorLinkedNewPrice != null && Number.isFinite(Number(opts.priorLinkedNewPrice))) {
      storedPrev = Number(opts.priorLinkedNewPrice);
    } else {
      storedPrev = null;
    }
  } else if (
    params.previousOperationalPrice != null &&
    Number.isFinite(Number(params.previousOperationalPrice))
  ) {
    storedPrev = Number(params.previousOperationalPrice);
  } else {
    storedPrev = operationalUnitPriceForPriceHistory(
      params.previousPrice,
      params.previousPurchaseQuantity,
    );
  }

  const guardedPrev = opts?.refreshExisting
    ? storedPrev
    : applyChainGuardToStoredPrices(params, storedPrev, storedNew);
  return { storedPrev: guardedPrev, storedNew, prevPack };
}

function priceHistoryRowValuesMatch(
  existing: InvoiceIngredientHistoryRow,
  storedPrev: number | null,
  storedNew: number,
): boolean {
  const rowPrev =
    existing.previous_price == null ? null : Number(existing.previous_price);
  const rowNew = Number(existing.new_price);
  const prevMatch =
    rowPrev == null && storedPrev == null
      ? true
      : rowPrev != null &&
        storedPrev != null &&
        Math.abs(rowPrev - storedPrev) <= INGREDIENT_PRICE_EQ_EPS;
  return prevMatch && Math.abs(rowNew - storedNew) <= INGREDIENT_PRICE_EQ_EPS;
}

export async function fetchIngredientPriceSnapshot(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<IngredientPriceSnapshot | null> {
  try {
    const { data, error } = await client
      .from("ingredients")
      .select("name,unit,current_price,purchase_quantity")
      .eq("id", ingredientId)
      .maybeSingle();
    if (error) {
      logSupabaseError("fetchIngredientPriceSnapshot", error);
      return null;
    }
    if (!data) return null;
    return {
      name: data.name ?? "",
      unit: data.unit ?? null,
      current_price: data.current_price ?? null,
      purchase_quantity: data.purchase_quantity ?? null,
    };
  } catch (err) {
    console.error(
      `${LOG_PREFIX} fetchIngredientPriceSnapshot threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function fetchLatestHistoryNewPrice(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<number | null> {
  const id = ingredientId.trim();
  if (!id) return null;
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select(LINKED_HISTORY_CHRONOLOGY_SELECT)
      .eq("ingredient_id", id)
      .not("invoice_id", "is", null);
    if (error) {
      logSupabaseError("fetchLatestHistoryNewPrice", error);
      return null;
    }
    return latestLinkedOperationalPriceFromRows(
      (data ?? []) as LinkedHistoryChronologyRow[],
    ).operationalPrice;
  } catch (err) {
    console.error(
      `${LOG_PREFIX} fetchLatestHistoryNewPrice threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Inserts or refreshes one `ingredient_price_history` row for an invoice line price change.
 * When `(invoice_id, ingredient_id)` already exists (re-extract), recomputes stored prices
 * and updates the row while preserving `created_at`. Skips when effective unit price unchanged.
 */
export async function appendIngredientPriceHistoryFromInvoiceLine(
  client: AppSupabaseClient,
  params: AppendIngredientPriceHistoryParams,
): Promise<{
  inserted: boolean;
  updated?: boolean;
  skippedReason?:
    | "missing_ids"
    | "invalid_new_price"
    | "normalization_failed"
    | "unchanged_price";
  error: PostgrestError | null;
}> {
  const ingredientId = params.ingredientId.trim();
  const invoiceId = params.invoiceId.trim();
  if (!ingredientId || !invoiceId) {
    return { inserted: false, skippedReason: "missing_ids", error: null };
  }

  const existingRow = await fetchHistoryRowForInvoiceIngredient(client, invoiceId, ingredientId);
  const refreshExisting = existingRow != null;

  const newPrice = Number(params.newPrice);
  const storedNewPreview = operationalUnitPriceForPriceHistory(
    newPrice,
    params.newPurchaseQuantity,
  );
  if (storedNewPreview == null || !Number.isFinite(storedNewPreview)) {
    return { inserted: false, skippedReason: "normalization_failed", error: null };
  }

  const nextInsertSnap = derivePurchaseContractSnapshot({
    name: params.ingredientName,
    operationalUnitPrice: storedNewPreview,
    purchaseQuantity: params.newPurchaseQuantity ?? null,
    ingredientUnit: params.ingredientUnit ?? null,
  });
  if (shouldBlockHistoryInsert(nextInsertSnap)) {
    return { inserted: false, skippedReason: "invalid_new_price", error: null };
  }

  const priorLinkedNewPrice = refreshExisting
    ? await fetchPriorLinkedHistoryNewPrice(client, ingredientId, invoiceId, {
        ingredientName: params.ingredientName,
        ingredientUnit: params.ingredientUnit ?? null,
        newPurchaseQuantity: params.newPurchaseQuantity ?? null,
        storedNew: storedNewPreview,
      })
    : null;

  const computed = storedPriceHistoryFieldsFromParams(params, {
    refreshExisting,
    priorLinkedNewPrice,
  });
  if (!computed) {
    return { inserted: false, skippedReason: "invalid_new_price", error: null };
  }

  const { storedPrev, storedNew, prevPack } = computed;

  if (
    !refreshExisting &&
    (invoiceLinePricesUnchanged(
      prevPack,
      params.previousPurchaseQuantity ?? null,
      newPrice,
      params.newPurchaseQuantity ?? null,
    ) ||
      (storedPrev != null && Math.abs(storedPrev - storedNew) <= INGREDIENT_PRICE_EQ_EPS))
  ) {
    return { inserted: false, skippedReason: "unchanged_price", error: null };
  }

  if (refreshExisting && priceHistoryRowValuesMatch(existingRow, storedPrev, storedNew)) {
    return { inserted: false, skippedReason: "unchanged_price", error: null };
  }

  const { delta, delta_percent } = computePriceHistoryDelta(storedPrev, storedNew);

  if (refreshExisting) {
    const { error } = await client
      .from("ingredient_price_history")
      .update({
        ingredient_name: params.ingredientName,
        supplier_name: params.supplierName ?? null,
        ingredient_unit: params.ingredientUnit ?? null,
        previous_price: storedPrev,
        new_price: storedNew,
        delta,
        delta_percent,
      })
      .eq("id", existingRow.id);

    if (error) {
      logSupabaseError("appendIngredientPriceHistoryFromInvoiceLine refresh", error);
      return { inserted: false, error };
    }

    const { reconcileIngredientPriceHistoryChain } = await import(
      "@/lib/ingredient-price-history-reconcile"
    );
    await reconcileIngredientPriceHistoryChain(client, ingredientId);

    return { inserted: false, updated: true, error: null };
  }

  const created_at = resolveIngredientPriceHistoryCreatedAt({
    invoiceDate: params.invoiceDate,
    invoiceCreatedAt: params.invoiceCreatedAt,
  });

  const { error } = await client.from("ingredient_price_history").insert({
    ingredient_id: ingredientId,
    invoice_id: invoiceId,
    ingredient_name: params.ingredientName,
    supplier_name: params.supplierName ?? null,
    ingredient_unit: params.ingredientUnit ?? null,
    previous_price: storedPrev,
    new_price: storedNew,
    delta,
    delta_percent,
    created_at,
  });

  if (error) {
    logSupabaseError("appendIngredientPriceHistoryFromInvoiceLine", error);
    return { inserted: false, error };
  }
  return { inserted: true, error: null };
}

/** Deletes the attributable history row for `(invoice_id, ingredient_id)`. */
export async function deleteIngredientPriceHistoryForInvoiceIngredient(
  client: AppSupabaseClient,
  invoiceId: string,
  ingredientId: string,
): Promise<{ deleted: boolean; error: PostgrestError | null }> {
  const inv = invoiceId.trim();
  const ing = ingredientId.trim();
  if (!inv || !ing) return { deleted: false, error: null };

  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .delete()
      .eq("invoice_id", inv)
      .eq("ingredient_id", ing)
      .select("id");
    if (error) {
      logSupabaseError("deleteIngredientPriceHistoryForInvoiceIngredient", error);
      return { deleted: false, error };
    }
    return { deleted: (data?.length ?? 0) > 0, error: null };
  } catch (err) {
    console.error(
      `${LOG_PREFIX} deleteIngredientPriceHistoryForInvoiceIngredient threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { deleted: false, error: null };
  }
}

/** @deprecated Prefer {@link syncIngredientCurrentPrice}. */
export async function revertIngredientCurrentPriceFromHistory(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<{ updated: boolean; error: PostgrestError | null }> {
  const result = await syncIngredientCurrentPrice(client, ingredientId);
  return { updated: result.updated, error: result.error };
}

/**
 * Chronological series (oldest → newest) for charting. Fetches the latest `limit`
 * rows by time, then reverses so X-axis time increases left-to-right.
 *
 * Returns `[]` if the query errors (e.g. table missing, RLS denial, transient
 * 400). Errors are logged with a stable `[ingredient_price_history]` prefix.
 */
export async function getIngredientPriceTrend(
  client: AppSupabaseClient,
  ingredientId: string,
  opts?: { limit?: number },
): Promise<IngredientPriceHistoryRow[]> {
  const limit = opts?.limit ?? 100;
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select(HISTORY_SELECT)
      .eq("ingredient_id", ingredientId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      logSupabaseError("getIngredientPriceTrend", error);
      return [];
    }
    const rows = (data ?? []) as IngredientPriceHistoryRow[];
    return rows.slice().reverse();
  } catch (err) {
    console.error(`${LOG_PREFIX} getIngredientPriceTrend threw: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Price history rows for the current user (RLS on `ingredient_price_history`
 * already restricts rows to ingredients you own). Returns `[]` on error.
 */
export async function getRecentPriceChanges(
  client: AppSupabaseClient,
  days: number,
): Promise<IngredientPriceHistoryRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select(HISTORY_SELECT)
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) {
      logSupabaseError("getRecentPriceChanges", error);
      return [];
    }
    return (data ?? []) as IngredientPriceHistoryRow[];
  } catch (err) {
    console.error(`${LOG_PREFIX} getRecentPriceChanges threw: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Largest absolute increases (`delta > 0`) within a recent window (default 90 days).
 * Returns `[]` on error.
 */
export async function getLargestPriceIncreases(
  client: AppSupabaseClient,
  limit: number,
  opts?: { windowDays?: number },
): Promise<IngredientPriceHistoryRow[]> {
  const windowDays = opts?.windowDays ?? 90;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select(HISTORY_SELECT)
      .gte("created_at", since)
      .gt("delta", 0)
      .order("delta", { ascending: false })
      .limit(limit);
    if (error) {
      logSupabaseError("getLargestPriceIncreases", error);
      return [];
    }
    return (data ?? []) as IngredientPriceHistoryRow[];
  } catch (err) {
    console.error(`${LOG_PREFIX} getLargestPriceIncreases threw: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export type VolatileIngredientSummary = {
  ingredient_id: string;
  change_count: number;
};

/**
 * Heuristic volatility: ingredients with **at least 4** price-history rows in the
 * last **90** days, ranked by row count (tie-breaker: arbitrary stable order by id).
 * High row count ≈ frequent repricing without pulling full statistical variance.
 *
 * Returns `[]` on error.
 */
export async function getVolatileIngredients(
  client: AppSupabaseClient,
  opts?: { windowDays?: number; minChanges?: number; limit?: number },
): Promise<VolatileIngredientSummary[]> {
  const windowDays = opts?.windowDays ?? 90;
  const minChanges = opts?.minChanges ?? 4;
  const limit = opts?.limit ?? 25;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select("ingredient_id")
      .gte("created_at", since);
    if (error) {
      logSupabaseError("getVolatileIngredients", error);
      return [];
    }
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const id = row.ingredient_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= minChanges)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([ingredient_id, change_count]) => ({ ingredient_id, change_count }));
  } catch (err) {
    console.error(`${LOG_PREFIX} getVolatileIngredients threw: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
