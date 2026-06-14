import type { PostgrestError } from "@supabase/supabase-js";
import { clearIngredientMatchedInvoiceProductsCache } from "@/lib/ingredient-operational-intelligence";
import {
  deleteIngredientPriceHistoryForInvoiceIngredient,
  fetchHistoryRowForInvoiceIngredient,
  revertIngredientCurrentPriceFromHistory,
  type AppSupabaseClient,
} from "@/lib/ingredient-price-history";
import { reconcileIngredientPriceHistoryChain } from "@/lib/ingredient-price-history-reconcile";
import { isMatchLifecycleSubtractivePricingEnabled } from "@/lib/match-lifecycle-flags";

const LOG_PREFIX = "[match-lifecycle-unmatch-pricing]";

export type SubtractivePreviousIngredientParams = {
  invoiceId: string;
  ingredientId: string;
  /** Confirmed transitions always clean; suggested only when a legacy row exists. */
  wasConfirmed: boolean;
};

/** @deprecated Use {@link SubtractivePreviousIngredientParams} */
export type SubtractiveUnmatchPricingParams = SubtractivePreviousIngredientParams;

export type SubtractivePricingCleanupResult = {
  cleaned: boolean;
  historyDeleted: boolean;
  error: PostgrestError | null;
};

/** @deprecated Use {@link SubtractivePricingCleanupResult} */
export type SubtractiveUnmatchPricingResult = SubtractivePricingCleanupResult;

/**
 * Shared subtractive cleanup: delete `(invoice_id, ingredient_id)` history, rechain,
 * and revert `ingredients.current_price` from surviving history.
 */
export async function subtractivePricingCleanupForPreviousIngredient(
  client: AppSupabaseClient,
  params: SubtractivePreviousIngredientParams,
): Promise<SubtractivePricingCleanupResult> {
  const invoiceId = params.invoiceId.trim();
  const ingredientId = params.ingredientId.trim();
  if (!invoiceId || !ingredientId) {
    return { cleaned: false, historyDeleted: false, error: null };
  }

  if (!params.wasConfirmed) {
    const existing = await fetchHistoryRowForInvoiceIngredient(client, invoiceId, ingredientId);
    if (!existing) {
      return { cleaned: false, historyDeleted: false, error: null };
    }
  }

  const deleteResult = await deleteIngredientPriceHistoryForInvoiceIngredient(
    client,
    invoiceId,
    ingredientId,
  );
  if (deleteResult.error) {
    return { cleaned: false, historyDeleted: false, error: deleteResult.error };
  }

  const reconcileResult = await reconcileIngredientPriceHistoryChain(client, ingredientId);
  if (reconcileResult.errors.length > 0) {
    console.error(`${LOG_PREFIX} reconcile errors for ${ingredientId}:`, reconcileResult.errors);
  }

  const revertResult = await revertIngredientCurrentPriceFromHistory(client, ingredientId);
  if (revertResult.error) {
    return {
      cleaned: deleteResult.deleted,
      historyDeleted: deleteResult.deleted,
      error: revertResult.error,
    };
  }

  if (deleteResult.deleted || revertResult.updated) {
    clearIngredientMatchedInvoiceProductsCache(ingredientId);
  }

  return {
    cleaned: deleteResult.deleted || revertResult.updated,
    historyDeleted: deleteResult.deleted,
    error: null,
  };
}

/**
 * T4/T5 subtractive cleanup on unmatch.
 */
export async function subtractivePricingCleanupForUnmatch(
  client: AppSupabaseClient,
  params: SubtractiveUnmatchPricingParams,
): Promise<SubtractiveUnmatchPricingResult> {
  if (!isMatchLifecycleSubtractivePricingEnabled()) {
    return { cleaned: false, historyDeleted: false, error: null };
  }

  return subtractivePricingCleanupForPreviousIngredient(client, params);
}
