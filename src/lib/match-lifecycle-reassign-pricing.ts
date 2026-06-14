import type { PostgrestError } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/ingredient-price-history";
import {
  isMatchLifecycleReassignSubtractiveEnabled,
  isMatchLifecycleSubtractivePricingEnabled,
} from "@/lib/match-lifecycle-flags";
import {
  subtractivePricingCleanupForPreviousIngredient,
  type SubtractivePricingCleanupResult,
} from "@/lib/match-lifecycle-unmatch-pricing";

export type SubtractiveReassignPricingParams = {
  invoiceId: string;
  previousIngredientId: string;
  /** Confirmed reassign always cleans; suggested correction only when a legacy row exists. */
  wasConfirmed: boolean;
};

/**
 * Phase 5B: subtractive cleanup for ingredient A before forward writes to B on reassign.
 * Gated by `VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE` (default ON) and
 * `VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING` (master subtractive switch).
 */
export async function subtractivePricingCleanupForReassign(
  client: AppSupabaseClient,
  params: SubtractiveReassignPricingParams,
): Promise<SubtractivePricingCleanupResult> {
  if (!isMatchLifecycleReassignSubtractiveEnabled()) {
    return { cleaned: false, historyDeleted: false, error: null };
  }
  if (!isMatchLifecycleSubtractivePricingEnabled()) {
    return { cleaned: false, historyDeleted: false, error: null };
  }

  return subtractivePricingCleanupForPreviousIngredient(client, {
    invoiceId: params.invoiceId,
    ingredientId: params.previousIngredientId,
    wasConfirmed: params.wasConfirmed,
  });
}

export type { PostgrestError, SubtractivePricingCleanupResult };
