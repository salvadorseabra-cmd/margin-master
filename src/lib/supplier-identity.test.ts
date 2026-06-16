import { describe, expect, it } from "vitest";
import {
  normalizeSupplierDisplayName,
  normalizeSupplierKey,
} from "@/lib/supplier-identity";
import {
  buildIngredientAliasLookupKey,
  lookupIngredientIdFromAliasMap,
  rememberAliasInMap,
} from "@/lib/ingredient-alias-lookup";
import { buildSupplierWatchlist } from "@/lib/operational-intelligence-view";

describe("normalizeSupplierDisplayName", () => {
  it("title-cases ALL-CAPS supplier names", () => {
    expect(normalizeSupplierDisplayName("AVILUDO")).toBe("Aviludo");
  });

  it("title-cases legal-name ALL-CAPS with accents", () => {
    expect(normalizeSupplierDisplayName("IL BOCCONCINO DISTRIBUIÇÃO ALIMENTAR")).toBe(
      "Il Bocconcino Distribuição Alimentar",
    );
  });

  it("strips legal SA suffix for display", () => {
    expect(normalizeSupplierDisplayName("Bidfood Portugal, SA")).toBe("Bidfood Portugal");
  });

  it("preserves already-mixed-case names", () => {
    expect(normalizeSupplierDisplayName("Bidfood Portugal")).toBe("Bidfood Portugal");
  });
});

describe("normalizeSupplierKey", () => {
  it("folds casing and whitespace to a stable lowercase key", () => {
    expect(normalizeSupplierKey("AVILUDO")).toBe("aviludo");
    expect(normalizeSupplierKey("  Aviludo  ")).toBe("aviludo");
  });

  it("maps proven VL typo Avijudo to aviludo", () => {
    expect(normalizeSupplierKey("Avijudo")).toBe("aviludo");
  });

  it("strips legal suffixes before keying", () => {
    expect(normalizeSupplierKey("Bidfood Portugal, SA")).toBe("bidfood portugal");
    expect(normalizeSupplierKey("IL BOCCONCINO DISTRIBUIÇÃO ALIMENTAR UNIPESSOAL LDA")).toBe(
      "il bocconcino distribuição alimentar",
    );
  });
});

describe("supplier identity integration", () => {
  it("unifies Aviludo spellings in alias lookup keys", () => {
    const aliases = rememberAliasInMap({}, "pepino conserva", "pepino-id", "Avijudo");
    expect(
      lookupIngredientIdFromAliasMap(aliases, "pepino conserva", "AVILUDO"),
    ).toBe("pepino-id");
    expect(buildIngredientAliasLookupKey("pepino conserva", "Aviludo")).toBe(
      "aviludo::pepino conserva",
    );
  });

  it("merges Aviludo variants in supplier watchlist", () => {
    const watch = buildSupplierWatchlist(
      {
        ingredients: [],
        recipes: [],
        invoices: [
          { id: "inv-1", supplier_name: "AVILUDO", total: 100, created_at: "2026-05-01T00:00:00.000Z" },
          { id: "inv-2", supplier_name: "Aviludo", total: 80, created_at: "2026-05-10T00:00:00.000Z" },
        ],
        priceHistory: [],
      },
      [],
      10,
    );
    expect(watch).toHaveLength(1);
    expect(watch[0]?.supplierName).toBe("Aviludo");
  });
});
