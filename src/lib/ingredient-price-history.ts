import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";

/** Supabase browser client shape used across the app. */
export type AppSupabaseClient = SupabaseClient<Database>;

const HISTORY_SELECT =
  "id,ingredient_id,invoice_id,ingredient_name,supplier_name,ingredient_unit,previous_price,new_price,delta,delta_percent,created_at" as const;

const LOG_PREFIX = "[ingredient_price_history]";

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

/**
 * Log a Supabase error with a stable, secret-free prefix. Treats the table as
 * optional: callers should fall back to empty results instead of throwing.
 */
function logSupabaseError(label: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${LOG_PREFIX} ${label} failed: ${error.message}${code}`);
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
