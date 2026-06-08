import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import {
  purchaseQuantityDenom,
  resolvedOperationalUnitCostEur,
} from "@/lib/ingredient-unit-cost";
import { resolveInvoiceChronology } from "@/lib/invoice-chronology";

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

/**
 * Log a Supabase error with a stable, secret-free prefix. Treats the table as
 * optional: callers should fall back to empty results instead of throwing.
 */
function logSupabaseError(label: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${LOG_PREFIX} ${label} failed: ${error.message}${code}`);
}

export async function historyExistsForInvoiceIngredient(
  client: AppSupabaseClient,
  invoiceId: string,
  ingredientId: string,
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("ingredient_id", ingredientId)
      .limit(1)
      .maybeSingle();
    if (error) {
      logSupabaseError("historyExistsForInvoiceIngredient", error);
      return false;
    }
    return Boolean(data?.id);
  } catch (err) {
    console.error(
      `${LOG_PREFIX} historyExistsForInvoiceIngredient threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
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
  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select("new_price")
      .eq("ingredient_id", ingredientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logSupabaseError("fetchLatestHistoryNewPrice", error);
      return null;
    }
    const n = data?.new_price == null ? null : Number(data.new_price);
    return n != null && Number.isFinite(n) ? n : null;
  } catch (err) {
    console.error(
      `${LOG_PREFIX} fetchLatestHistoryNewPrice threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Inserts one `ingredient_price_history` row for an invoice line price change.
 * Skips when duplicate `(invoice_id, ingredient_id)`, or effective unit price unchanged.
 */
export async function appendIngredientPriceHistoryFromInvoiceLine(
  client: AppSupabaseClient,
  params: AppendIngredientPriceHistoryParams,
): Promise<{
  inserted: boolean;
  skippedReason?: "missing_ids" | "duplicate_invoice" | "invalid_new_price" | "unchanged_price";
  error: PostgrestError | null;
}> {
  const ingredientId = params.ingredientId.trim();
  const invoiceId = params.invoiceId.trim();
  if (!ingredientId || !invoiceId) {
    return { inserted: false, skippedReason: "missing_ids", error: null };
  }

  if (await historyExistsForInvoiceIngredient(client, invoiceId, ingredientId)) {
    return { inserted: false, skippedReason: "duplicate_invoice", error: null };
  }

  const newPrice = Number(params.newPrice);
  if (!Number.isFinite(newPrice)) {
    return { inserted: false, skippedReason: "invalid_new_price", error: null };
  }

  const prevPack = params.previousPrice == null ? null : Number(params.previousPrice);
  const storedNew =
    operationalUnitPriceForPriceHistory(newPrice, params.newPurchaseQuantity) ?? newPrice;
  const storedPrev =
    params.previousOperationalPrice != null && Number.isFinite(Number(params.previousOperationalPrice))
      ? Number(params.previousOperationalPrice)
      : operationalUnitPriceForPriceHistory(params.previousPrice, params.previousPurchaseQuantity);

  if (
    invoiceLinePricesUnchanged(
      prevPack,
      params.previousPurchaseQuantity ?? null,
      newPrice,
      params.newPurchaseQuantity ?? null,
    ) ||
    (storedPrev != null && Math.abs(storedPrev - storedNew) <= INGREDIENT_PRICE_EQ_EPS)
  ) {
    return { inserted: false, skippedReason: "unchanged_price", error: null };
  }
  const { delta, delta_percent } = computePriceHistoryDelta(storedPrev, storedNew);
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
