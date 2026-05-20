import { describe, expect, it, beforeEach } from "vitest";
import {
  applyManualIngredientCorrection,
  buildManualIngredientCorrectionKeys,
  MANUAL_CONFIRMATION_CONFIDENCE,
  rejectIngredientMatchSuggestion,
  resolveIngredientCorrectionUiState,
} from "./ingredient-correction-memory";
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
});

describe("resolveIngredientCorrectionUiState", () => {
  const semanticMatch = {
    kind: "semantic",
    ingredient: { id: "a", name: "Alpha", normalized_name: "alpha", unit: "kg" },
    scoreBreakdown: {},
    reason: "test",
  } as IngredientCanonicalMatch;

  it("shows confirm and wrong for suggestions", () => {
    const state = getInvoiceRowIngredientMatchState(semanticMatch);
    const ui = resolveIngredientCorrectionUiState("row-1", state, new Set());
    expect(ui.showConfirm).toBe(true);
    expect(ui.showWrongMatch).toBe(true);
    expect(ui.showPicker).toBe(false);
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
