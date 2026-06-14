import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as priceHistory from "@/lib/ingredient-price-history";
import * as reconcile from "@/lib/ingredient-price-history-reconcile";
import * as matchLifecycleFlags from "@/lib/match-lifecycle-flags";
import { subtractivePricingCleanupForUnmatch } from "@/lib/match-lifecycle-unmatch-pricing";

describe("subtractivePricingCleanupForUnmatch", () => {
  const client = {} as priceHistory.AppSupabaseClient;

  beforeEach(() => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleSubtractivePricingEnabled").mockReturnValue(true);
    vi.spyOn(priceHistory, "fetchHistoryRowForInvoiceIngredient").mockResolvedValue(null);
    vi.spyOn(priceHistory, "deleteIngredientPriceHistoryForInvoiceIngredient").mockResolvedValue({
      deleted: true,
      error: null,
    });
    vi.spyOn(reconcile, "reconcileIngredientPriceHistoryChain").mockResolvedValue({
      orphansDeleted: 0,
      rowsUpdated: 0,
      linkedRowCount: 1,
      errors: [],
    });
    vi.spyOn(priceHistory, "revertIngredientCurrentPriceFromHistory").mockResolvedValue({
      updated: true,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes history and reconciles for confirmed unmatch", async () => {
    const result = await subtractivePricingCleanupForUnmatch(client, {
      invoiceId: "inv-1",
      ingredientId: "ing-pepino",
      wasConfirmed: true,
    });

    expect(result.cleaned).toBe(true);
    expect(result.historyDeleted).toBe(true);
    expect(priceHistory.deleteIngredientPriceHistoryForInvoiceIngredient).toHaveBeenCalledWith(
      client,
      "inv-1",
      "ing-pepino",
    );
    expect(reconcile.reconcileIngredientPriceHistoryChain).toHaveBeenCalledWith(
      client,
      "ing-pepino",
    );
    expect(priceHistory.revertIngredientCurrentPriceFromHistory).toHaveBeenCalledWith(
      client,
      "ing-pepino",
    );
  });

  it("skips when subtractive pricing flag is disabled", async () => {
    vi.spyOn(matchLifecycleFlags, "isMatchLifecycleSubtractivePricingEnabled").mockReturnValue(false);

    const result = await subtractivePricingCleanupForUnmatch(client, {
      invoiceId: "inv-1",
      ingredientId: "ing-pepino",
      wasConfirmed: true,
    });

    expect(result.cleaned).toBe(false);
    expect(priceHistory.deleteIngredientPriceHistoryForInvoiceIngredient).not.toHaveBeenCalled();
  });

  it("skips suggested unmatch when no legacy history row exists", async () => {
    const result = await subtractivePricingCleanupForUnmatch(client, {
      invoiceId: "inv-1",
      ingredientId: "ing-pepino",
      wasConfirmed: false,
    });

    expect(result.cleaned).toBe(false);
    expect(priceHistory.deleteIngredientPriceHistoryForInvoiceIngredient).not.toHaveBeenCalled();
  });
});
