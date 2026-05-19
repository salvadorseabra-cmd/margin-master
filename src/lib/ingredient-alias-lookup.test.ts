import { describe, expect, it } from "vitest";
import {
  buildIngredientAliasLookupKey,
  lookupIngredientIdFromAliasMap,
  rememberAliasInMap,
} from "./ingredient-alias-lookup";

describe("ingredient alias lookup", () => {
  it("builds supplier-scoped and global keys", () => {
    expect(buildIngredientAliasLookupKey("oleo girassol", "Continente")).toMatch(
      /^continente::oleo girassol$/i,
    );
    expect(buildIngredientAliasLookupKey("oleo girassol", null)).toBe("oleo girassol");
  });

  it("prefers supplier-scoped alias over global", () => {
    const supplierKey = buildIngredientAliasLookupKey("tomate cherry", "Supplier A");
    const aliases = {
      [supplierKey]: "tom-supplier",
      "tomate cherry": "tom-global",
    };
    expect(
      lookupIngredientIdFromAliasMap(aliases, "tomate cherry", "Supplier A"),
    ).toBe("tom-supplier");
    expect(lookupIngredientIdFromAliasMap(aliases, "tomate cherry", null)).toBe("tom-global");
  });

  it("remembers aliases with the same key scheme used for lookup", () => {
    const next = rememberAliasInMap({}, "ketchup heinz", "ketchup-1", "Metro");
    const key = buildIngredientAliasLookupKey("ketchup heinz", "Metro");
    expect(next[key]).toBe("ketchup-1");
  });
});
