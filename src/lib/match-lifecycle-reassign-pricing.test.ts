import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as priceHistory from "@/lib/ingredient-price-history";
import * as reconcile from "@/lib/ingredient-price-history-reconcile";
import * as matchLifecycleFlags from "@/lib/match-lifecycle-flags";
import * as unmatchPricing from "@/lib/match-lifecycle-unmatch-pricing";
import { subtractivePricingCleanupForReassign } from "@/lib/match-lifecycle-reassign-pricing";

describe("subtractivePricingCleanupForReassign", () => {
  const client = {} as priceHistory.AppSupabaseClient;

  beforeEach(() => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleReassignSubtractiveEnabled").mockReturnValue(true);
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleSubtractivePricingEnabled").mockReturnValue(true);
    vi.spyOn(unmatchPricing, "subtractivePricingCleanupForPreviousIngredient").mockResolvedValue({
      cleaned: true,
      historyDeleted: true,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to shared previous-ingredient cleanup for confirmed reassign", async () => {
    const result = await subtractivePricingCleanupForReassign(client, {
      invoiceId: "inv-1",
      previousIngredientId: "ing-a",
      wasConfirmed: true,
    });

    expect(result.cleaned).toBe(true);
    expect(unmatchPricing.subtractivePricingCleanupForPreviousIngredient).toHaveBeenCalledWith(
      client,
      {
        invoiceId: "inv-1",
        ingredientId: "ing-a",
        wasConfirmed: true,
      },
    );
  });

  it("skips when reassign subtractive flag is disabled", async () => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleReassignSubtractiveEnabled").mockReturnValue(false);

    const result = await subtractivePricingCleanupForReassign(client, {
      invoiceId: "inv-1",
      previousIngredientId: "ing-a",
      wasConfirmed: true,
    });

    expect(result.cleaned).toBe(false);
    expect(unmatchPricing.subtractivePricingCleanupForPreviousIngredient).not.toHaveBeenCalled();
  });

  it("skips when master subtractive pricing flag is disabled", async () => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleSubtractivePricingEnabled").mockReturnValue(false);

    const result = await subtractivePricingCleanupForReassign(client, {
      invoiceId: "inv-1",
      previousIngredientId: "ing-a",
      wasConfirmed: true,
    });

    expect(result.cleaned).toBe(false);
    expect(unmatchPricing.subtractivePricingCleanupForPreviousIngredient).not.toHaveBeenCalled();
  });
});
