import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput, IngredientCanonicalMatch } from "./ingredient-canonical";
import { recordInvoiceLineAliasMemory } from "./ingredient-match-alias-memory";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name };
}

describe("recordInvoiceLineAliasMemory", () => {
  it("stores alias mapping when invoice shorthand matches canonical", () => {
    const match: IngredientCanonicalMatch = {
      ingredient: ingredient("bacon", "BACON FATIADO FUMADO 1KG"),
      normalizedItemName: "bacon fumado fatiado",
      normalizedIngredientName: "bacon fumado fatiado",
      kind: "exact",
      reason: "same core product identity",
    };
    const applied = recordInvoiceLineAliasMemory({
      itemName: "BAC FUM FAT",
      match,
      confirmedAliases: {},
    });
    expect(applied.recorded).toBe(true);
    expect(Object.values(applied.nextConfirmedAliases).length).toBeGreaterThan(0);
  });

  it("does not record when wording equals catalog display name", () => {
    const match: IngredientCanonicalMatch = {
      ingredient: ingredient("bacon", "BACON FATIADO FUMADO 1KG"),
      normalizedItemName: "bacon",
      normalizedIngredientName: "bacon",
      kind: "exact",
      reason: "exact",
    };
    const applied = recordInvoiceLineAliasMemory({
      itemName: "BACON FATIADO FUMADO 1KG",
      match,
      confirmedAliases: {},
    });
    expect(applied.recorded).toBe(false);
  });
});
