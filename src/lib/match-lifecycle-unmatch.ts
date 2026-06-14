import type { PostgrestError } from "@supabase/supabase-js";
import { rejectIngredientMatchPair } from "@/lib/ingredient-correction-memory";
import type { AppSupabaseClient } from "@/lib/invoice-item-match-repository";
import { markUnmatched } from "@/lib/match-lifecycle-service";
import { subtractivePricingCleanupForUnmatch } from "@/lib/match-lifecycle-unmatch-pricing";

const LOG_PREFIX = "[match-lifecycle-unmatch]";

export type UnmatchInvoiceLineParams = {
  client: AppSupabaseClient;
  invoiceItemId: string;
  invoiceId: string;
  userId: string;
  itemName: string;
  supplierName?: string | null;
  rawItemName?: string | null;
  previousIngredientId?: string | null;
  wasConfirmed?: boolean;
};

export type UnmatchInvoiceLineResult = {
  ok: boolean;
  error?: string;
  lifecycleError: PostgrestError | null;
  pricingCleaned: boolean;
  historyDeleted: boolean;
};

/**
 * T4/T5: Remove match — lifecycle tombstone, optional subtractive pricing, reject pair.
 */
export async function unmatchInvoiceLineMatch(
  params: UnmatchInvoiceLineParams,
): Promise<UnmatchInvoiceLineResult> {
  const previousIngredientId = params.previousIngredientId?.trim() || null;
  const wasConfirmed = params.wasConfirmed === true;

  if (previousIngredientId) {
    rejectIngredientMatchPair({
      itemName: params.itemName,
      rawItemName: params.rawItemName ?? params.itemName,
      rejectedIngredientId: previousIngredientId,
      supplierName: params.supplierName,
      userId: params.userId,
    });
  }

  let pricingCleaned = false;
  let historyDeleted = false;
  if (previousIngredientId) {
    const pricingResult = await subtractivePricingCleanupForUnmatch(params.client, {
      invoiceId: params.invoiceId,
      ingredientId: previousIngredientId,
      wasConfirmed,
    });
    pricingCleaned = pricingResult.cleaned;
    historyDeleted = pricingResult.historyDeleted;
    if (pricingResult.error) {
      console.error(
        `${LOG_PREFIX} pricing cleanup failed for ${params.invoiceItemId}:`,
        pricingResult.error.message,
      );
    }
  }

  const lifecycleResult = await markUnmatched(params.client, {
    invoiceItemId: params.invoiceItemId,
    userId: params.userId,
    invoiceId: params.invoiceId,
    previousIngredientId,
  });

  if (lifecycleResult.error) {
    return {
      ok: false,
      error: lifecycleResult.error.message || "Could not remove match",
      lifecycleError: lifecycleResult.error,
      pricingCleaned,
      historyDeleted,
    };
  }

  return {
    ok: true,
    lifecycleError: null,
    pricingCleaned,
    historyDeleted,
  };
}
