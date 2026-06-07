import { describe, expect, it } from "vitest";
import {
  buildBulkSubmitValuesFromDefaults,
  collectUnmatchedRowsForBulkCreate,
} from "./bulk-canonical-ingredient-create";
import { buildCanonicalIngredientCreateDefaults } from "./canonical-ingredient-create";

const item = (id: string, name: string) => ({
  id,
  name,
  quantity: 10,
  unit: "un",
  unit_price: 12.5,
  total: 125,
});

describe("collectUnmatchedRowsForBulkCreate", () => {
  it("returns only unmatched eligible rows", () => {
    const candidates = collectUnmatchedRowsForBulkCreate({
      items: [item("a", "ANGUS PTY"), item("b", "Queijo mozzarella")],
      ingredientCatalog: [
        {
          id: "moz",
          name: "Queijo mozzarella",
          normalized_name: "queijo mozzarella",
        },
      ],
      confirmedAliases: {},
      supplierName: "Metro",
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.item.id).toBe("a");
    expect(candidates[0]?.defaults.suggestedCanonicalName).toBe("Angus patty");
  });

  it("skips placeholder and suggested-match rows", () => {
    const candidates = collectUnmatchedRowsForBulkCreate({
      items: [item("a", "unknown"), item("b", "BAC FUM FAT")],
      ingredientCatalog: [
        {
          id: "bacon",
          name: "Bacon fumado fatias",
          normalized_name: "bacon fumado fatias",
        },
      ],
      confirmedAliases: {},
    });
    expect(candidates).toHaveLength(0);
  });
});

describe("buildBulkSubmitValuesFromDefaults", () => {
  it("maps defaults to submit values like the single-row dialog", () => {
    const defaults = buildCanonicalIngredientCreateDefaults(item("a", "ANGUS PTY"), {
      supplierName: "Metro",
    });
    const values = buildBulkSubmitValuesFromDefaults(defaults, "Angus patty");
    expect(values.canonicalName).toBe("Angus patty");
    expect(values.unit).toBe(defaults.unit);
    expect(values.purchase_quantity).toBe(1);
    expect(values.purchase_unit).toBe(defaults.purchase_unit.trim() || null);
    expect(values.base_unit).toBe(defaults.base_unit);
    expect(values.current_price).toBe(12.5);
  });
});
