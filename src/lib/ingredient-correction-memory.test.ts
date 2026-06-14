import { describe, expect, it, beforeEach } from "vitest";
import {
  applyManualIngredientCorrection,
  buildManualIngredientCorrectionKeys,
  MANUAL_CONFIRMATION_CONFIDENCE,
  persistManualIngredientCorrection,
  rejectIngredientMatchSuggestion,
  resolveIngredientCorrectionUiState,
} from "./ingredient-correction-memory";
import type { AppSupabaseClient } from "./ingredient-alias-memory";
import {
  clearOperationalAliasMemoryForTests,
  lookupOperationalAlias,
} from "./ingredient-operational-alias-memory";
import { getInvoiceRowIngredientMatchState } from "./ingredient-match-explanation";
import type { IngredientCanonicalMatch } from "./ingredient-canonical";

describe("buildManualIngredientCorrectionKeys", () => {
  it("normalizes invoice wording and builds scoped lookup keys", () => {
    const keys = buildManualIngredientCorrectionKeys("HMB 180", "Metro Cash");
    expect(keys).not.toBeNull();
    expect(keys!.aliasName).toBe("HMB 180");
    expect(keys!.normalizedAlias).toBe("hamburguer 180");
    expect(keys!.operationalAliasKey).toBe("hamburguer 180");
    expect(keys!.aliasLookupKey).toMatch(/^metro cash::hamburguer 180$/i);
  });

  it("returns null for empty names", () => {
    expect(buildManualIngredientCorrectionKeys("   ")).toBeNull();
  });

  it("expands CHK BREADED to chicken breaded operational alias", () => {
    const keys = buildManualIngredientCorrectionKeys("CHK BREADED");
    expect(keys).not.toBeNull();
    expect(keys!.aliasName).toBe("CHK BREADED");
    expect(keys!.normalizedAlias).toBe("chicken breaded");
  });
});

describe("applyManualIngredientCorrection", () => {
  beforeEach(() => {
    clearOperationalAliasMemoryForTests();
  });

  it("updates alias map and operational memory with manual_confirmation source", () => {
    const result = applyManualIngredientCorrection(
      {
        itemName: "BAC STRK",
        ingredientId: "bac-1",
        ingredientName: "Bacon Streaky 1KG",
        supplierName: "Supplier A",
      },
      {},
    );

    expect(result).not.toBeNull();
    expect(result!.nextConfirmedAliases[result!.aliasLookupKey]).toBe("bac-1");
    const entry = lookupOperationalAlias("BAC STRK");
    expect(entry?.ingredientId).toBe("bac-1");
    expect(entry?.source).toBe("manual_confirmation");
    expect(entry?.confidence).toBe(MANUAL_CONFIRMATION_CONFIDENCE);
  });

  it("stores supplier-scoped and global keys for CHK BREADED", () => {
    const result = applyManualIngredientCorrection(
      {
        itemName: "CHK BREADED",
        ingredientId: "chk-1",
        ingredientName: "Chicken Breaded / Frango Panado",
        supplierName: "Metro",
      },
      {},
    );
    expect(result).not.toBeNull();
    expect(result!.nextConfirmedAliases["Metro::chicken breaded"]).toBe("chk-1");
    expect(result!.nextConfirmedAliases["chicken breaded"]).toBe("chk-1");
  });
});

describe("persistManualIngredientCorrection", () => {
  it("upserts CHK BREADED alias after canonical create", async () => {
    const insertCalls: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table !== "ingredient_aliases") throw new Error(`unexpected table ${table}`);
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      is() {
                        return { maybeSingle: async () => ({ data: null, error: null }) };
                      },
                      eq() {
                        return { maybeSingle: async () => ({ data: null, error: null }) };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            insertCalls.push(payload);
            return Promise.resolve({ error: null });
          },
          update() {
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as unknown as AppSupabaseClient;

    const { applied, error } = await persistManualIngredientCorrection({
      itemName: "CHK BREADED",
      ingredientId: "chk-new",
      ingredientName: "Chicken Breaded / Frango Panado",
      supplierName: "Metro",
      confirmedAliases: {},
      supabase,
    });

    expect(error).toBeNull();
    expect(applied).not.toBeNull();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      ingredient_id: "chk-new",
      alias_name: "CHK BREADED",
      normalized_alias: "chicken breaded",
      confirmed_by_user: true,
    });
    expect(applied!.nextConfirmedAliases["Metro::chicken breaded"]).toBe("chk-new");
    expect(applied!.nextConfirmedAliases["chicken breaded"]).toBe("chk-new");
  });
});

describe("resolveIngredientCorrectionUiState", () => {
  const semanticMatch = {
    kind: "semantic",
    ingredient: { id: "a", name: "Alpha", normalized_name: "alpha", unit: "kg" },
    scoreBreakdown: {},
    reason: "test",
  } as IngredientCanonicalMatch;

  const confirmedMatch = {
    kind: "confirmed-alias",
    ingredient: { id: "b", name: "Beta", normalized_name: "beta", unit: "kg" },
    scoreBreakdown: {},
    reason: "test",
    normalizedItemName: "beta",
    normalizedIngredientName: "beta",
  } as IngredientCanonicalMatch;

  it("shows confirm only for suggestions (no correct-match trigger)", () => {
    const state = getInvoiceRowIngredientMatchState(semanticMatch);
    const ui = resolveIngredientCorrectionUiState("row-1", state, new Set());
    expect(ui.showConfirm).toBe(true);
    expect(ui.showPicker).toBe(false);
    expect(ui.suppressMatchPresentation).toBe(false);
    expect("showWrongMatch" in ui).toBe(false);
  });

  it("shows picker chip only for confirmed rows", () => {
    const state = getInvoiceRowIngredientMatchState(confirmedMatch);
    const ui = resolveIngredientCorrectionUiState("row-2", state, new Set());
    expect(ui.showConfirm).toBe(false);
    expect(ui.showPicker).toBe(false);
    expect(ui.suppressMatchPresentation).toBe(false);
    expect("showWrongMatch" in ui).toBe(false);
  });

  it("shows picker for unmatched rows", () => {
    const state = getInvoiceRowIngredientMatchState(null);
    const ui = resolveIngredientCorrectionUiState("row-3", state, new Set());
    expect(ui.showConfirm).toBe(false);
    expect(ui.showPicker).toBe(true);
    expect(ui.suppressMatchPresentation).toBe(false);
  });

  it("shows picker after session rejection", () => {
    const state = getInvoiceRowIngredientMatchState(semanticMatch);
    const rejected = rejectIngredientMatchSuggestion(new Set(), "row-1");
    const ui = resolveIngredientCorrectionUiState("row-1", state, rejected);
    expect(ui.showPicker).toBe(true);
    expect(ui.suppressMatchPresentation).toBe(true);
    expect(ui.showConfirm).toBe(false);
  });
});
