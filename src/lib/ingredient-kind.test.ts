import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  filterCanonicalCatalogIngredients,
  filterMatchingCatalogIngredients,
  findCanonicalNeighborForAlias,
  inferIngredientKindFromName,
  isAliasIngredientEntry,
  looksLikeInvoiceShorthandName,
  resolveIngredientKind,
} from "./ingredient-kind";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

describe("looksLikeInvoiceShorthandName", () => {
  it("flags invoice shorthand examples", () => {
    const shorthand = [
      "BAC FUM FAT",
      "HMB 180",
      "ON RNG",
      "PKL SLC",
      "CHED DISP",
      "BAT SHOE",
      "ONI RING",
    ];
    for (const name of shorthand) {
      expect(looksLikeInvoiceShorthandName(name)).toBe(true);
    }
  });

  it("does not flag human-facing canonical examples", () => {
    const canonical = [
      "BACON FATIADO FUMADO 1KG",
      "HAMBÚRGUER BOVINO 180G",
      "ONION RINGS 1KG",
      "PICKLES FATIADOS",
      "MOLHO CHEDDAR DISPENSADOR",
    ];
    for (const name of canonical) {
      expect(looksLikeInvoiceShorthandName(name)).toBe(false);
    }
  });
});

describe("resolveIngredientKind", () => {
  it("prefers explicit ingredient_kind column", () => {
    expect(
      resolveIngredientKind(ingredient("a1", "BAC FUM FAT", { ingredient_kind: "canonical" })),
    ).toBe("canonical");
    expect(
      resolveIngredientKind(ingredient("a2", "BACON 1KG", { ingredient_kind: "alias" })),
    ).toBe("alias");
  });

  it("infers alias from shorthand when column absent", () => {
    expect(inferIngredientKindFromName("HMB 180")).toBe("alias");
    expect(inferIngredientKindFromName("HAMBÚRGUER BOVINO 180G")).toBe("canonical");
  });
});

describe("filterCanonicalCatalogIngredients", () => {
  it("removes alias rows and archived merged duplicates from UI catalog", () => {
    const catalog = [
      ingredient("canonical", "BACON FATIADO FUMADO 1KG"),
      ingredient("alias", "BAC FUM FAT", { ingredient_kind: "alias" }),
      ingredient("archived", "BAC FUM FAT", {
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    const filtered = filterCanonicalCatalogIngredients(catalog);
    expect(filtered.map((row) => row.id)).toEqual(["canonical"]);
    expect(filterMatchingCatalogIngredients(catalog).map((row) => row.id)).toEqual(["canonical"]);
  });

  it("filters shorthand-named rows without explicit kind", () => {
    const catalog = [
      ingredient("canonical", "ONION RINGS 1KG"),
      ingredient("leak", "ON RNG"),
    ];
    expect(filterCanonicalCatalogIngredients(catalog).map((row) => row.id)).toEqual(["canonical"]);
    expect(isAliasIngredientEntry(catalog[1]!)).toBe(true);
  });
});

describe("findCanonicalNeighborForAlias", () => {
  it("links BAC FUM FAT to bacon canonical neighbor", () => {
    const catalog = [
      ingredient("bacon", "BACON FATIADO FUMADO 1KG", { unit: "kg" }),
      ingredient("alias", "BAC FUM FAT", { unit: "kg", ingredient_kind: "alias" }),
    ];
    const neighbor = findCanonicalNeighborForAlias(catalog[1]!, catalog);
    expect(neighbor?.canonical.id).toBe("bacon");
    expect(neighbor?.score).toBeGreaterThan(0.5);
  });
});
