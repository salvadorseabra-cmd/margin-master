import {
  computePriceHistoryDelta,
  isLinkedPriceHistoryRow,
  type AppSupabaseClient,
  type IngredientPriceHistoryRow,
} from "@/lib/ingredient-price-history";

const LOG_PREFIX = "[ingredient_price_history_reconcile]";

const CHAIN_SELECT =
  "id,ingredient_id,invoice_id,previous_price,new_price,delta,delta_percent,created_at" as const;

export type ReconcileChainResult = {
  orphansDeleted: number;
  rowsUpdated: number;
  linkedRowCount: number;
  errors: string[];
};

export type ReconcileAfterInvoiceDeleteResult = {
  deletedInvoiceId: string;
  ingredients: Array<{ ingredientId: string } & ReconcileChainResult>;
};

function numericOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function chainFieldsMatch(
  row: Pick<IngredientPriceHistoryRow, "previous_price" | "delta" | "delta_percent">,
  storedPrev: number | null,
  delta: number | null,
  delta_percent: number | null,
): boolean {
  const rowPrev = numericOrNull(row.previous_price);
  const rowDelta = numericOrNull(row.delta);
  const rowPct = numericOrNull(row.delta_percent);

  const prevMatch =
    rowPrev == null && storedPrev == null
      ? true
      : rowPrev != null && storedPrev != null && Math.abs(rowPrev - storedPrev) < 1e-9;
  const deltaMatch =
    rowDelta == null && delta == null
      ? true
      : rowDelta != null && delta != null && Math.abs(rowDelta - delta) < 1e-9;
  const pctMatch =
    rowPct == null && delta_percent == null
      ? true
      : rowPct != null && delta_percent != null && Math.abs(rowPct - delta_percent) < 1e-9;

  return prevMatch && deltaMatch && pctMatch;
}

/** Ingredient ids with history rows tied to an invoice (call before deleting the invoice). */
export async function collectIngredientIdsForInvoiceHistory(
  client: AppSupabaseClient,
  invoiceId: string,
): Promise<string[]> {
  const id = invoiceId.trim();
  if (!id) return [];

  try {
    const { data, error } = await client
      .from("ingredient_price_history")
      .select("ingredient_id")
      .eq("invoice_id", id);
    if (error) {
      console.error(`${LOG_PREFIX} collectIngredientIdsForInvoiceHistory failed: ${error.message}`);
      return [];
    }
    return [
      ...new Set(
        (data ?? [])
          .map((row) => row.ingredient_id?.trim())
          .filter((ingredientId): ingredientId is string => Boolean(ingredientId)),
      ),
    ];
  } catch (err) {
    console.error(
      `${LOG_PREFIX} collectIngredientIdsForInvoiceHistory threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return [];
  }
}

/**
 * Deletes orphan rows (invoice_id IS NULL) and rechains surviving linked rows so each
 * previous_price references only earlier linked new_price values.
 */
export async function reconcileIngredientPriceHistoryChain(
  client: AppSupabaseClient,
  ingredientId: string,
): Promise<ReconcileChainResult> {
  const id = ingredientId.trim();
  const result: ReconcileChainResult = {
    orphansDeleted: 0,
    rowsUpdated: 0,
    linkedRowCount: 0,
    errors: [],
  };
  if (!id) return result;

  try {
    const { data: deleted, error: deleteError } = await client
      .from("ingredient_price_history")
      .delete()
      .eq("ingredient_id", id)
      .is("invoice_id", null)
      .select("id");
    if (deleteError) {
      result.errors.push(`orphan delete: ${deleteError.message}`);
      console.error(`${LOG_PREFIX} orphan delete failed for ${id}: ${deleteError.message}`);
    } else {
      result.orphansDeleted = deleted?.length ?? 0;
    }

    const { data, error: fetchError } = await client
      .from("ingredient_price_history")
      .select(CHAIN_SELECT)
      .eq("ingredient_id", id)
      .not("invoice_id", "is", null)
      .order("created_at", { ascending: true });
    if (fetchError) {
      result.errors.push(`fetch linked: ${fetchError.message}`);
      console.error(`${LOG_PREFIX} fetch linked rows failed for ${id}: ${fetchError.message}`);
      return result;
    }

    const linked = (data ?? []).filter(isLinkedPriceHistoryRow) as IngredientPriceHistoryRow[];
    result.linkedRowCount = linked.length;

    let prevNew: number | null = null;
    for (const row of linked) {
      const newPrice = numericOrNull(row.new_price);
      if (newPrice == null) continue;

      const storedPrev = prevNew;
      const { delta, delta_percent } = computePriceHistoryDelta(storedPrev, newPrice);

      if (!chainFieldsMatch(row, storedPrev, delta, delta_percent)) {
        const { error: updateError } = await client
          .from("ingredient_price_history")
          .update({
            previous_price: storedPrev,
            delta,
            delta_percent,
          })
          .eq("id", row.id);
        if (updateError) {
          result.errors.push(`update ${row.id}: ${updateError.message}`);
          console.error(
            `${LOG_PREFIX} update failed for ${row.id}: ${updateError.message}`,
          );
        } else {
          result.rowsUpdated += 1;
        }
      }

      prevNew = newPrice;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    console.error(`${LOG_PREFIX} reconcileIngredientPriceHistoryChain threw: ${message}`);
  }

  return result;
}

/** Reconcile all ingredients that had history on a deleted invoice. */
export async function reconcileAfterInvoiceDelete(
  client: AppSupabaseClient,
  deletedInvoiceId: string,
  affectedIngredientIds: readonly string[],
): Promise<ReconcileAfterInvoiceDeleteResult> {
  const ingredients: ReconcileAfterInvoiceDeleteResult["ingredients"] = [];
  const seen = new Set<string>();

  for (const rawId of affectedIngredientIds) {
    const ingredientId = rawId.trim();
    if (!ingredientId || seen.has(ingredientId)) continue;
    seen.add(ingredientId);
    const chain = await reconcileIngredientPriceHistoryChain(client, ingredientId);
    ingredients.push({ ingredientId, ...chain });
  }

  return { deletedInvoiceId: deletedInvoiceId.trim(), ingredients };
}
