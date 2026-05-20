import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  catalogHasOperationalIdentityDuplicate,
  findCatalogIngredientByOperationalKey,
  guardIngredientCreation,
  normalizeOperationalIdentityKey,
} from "./ingredient-operational-identity";

function ingredient(id: string, name: string, normalized_name?: string): IngredientCanonicalInput {
  return { id, name, normalized_name };
}

describe("normalizeOperationalIdentityKey", () => {
  it("converges ANGUS PTY shorthand variants", () => {
    const variants = ["ANGUS PTY", "Angus Patty", "ANG PTY", "ANGUS PATTY"];
    const keys = variants.map((v) => normalizeOperationalIdentityKey(v));
    const unique = new Set(keys);
    expect(unique.size).toBe(1);
    expect(keys[0]).toContain("angus");
    expect(keys[0]).toContain("patty");
  });

  it("preserves product weight tokens for distinct SKUs", () => {
    const a = normalizeOperationalIdentityKey("ANG PTY 180");
    const b = normalizeOperationalIdentityKey("ANG PTY");
    expect(a).not.toBe(b);
    expect(a).toContain("180");
  });
});

describe("guardIngredientCreation", () => {
  it("reuses existing catalog row for ANGUS PTY duplicate create", () => {
    const catalog = [ingredient("angus-1", "ANGUS PTY")];
    const guard = guardIngredientCreation("Angus Patty", catalog);
    expect(guard.action).toBe("reuse");
    if (guard.action === "reuse") {
      expect(guard.existing.id).toBe("angus-1");
    }
  });

  it("allows create when no operational match exists", () => {
    const catalog = [ingredient("oil-1", "OLEO GIRASSOL 1L")];
    const guard = guardIngredientCreation("ANGUS PTY", catalog);
    expect(guard.action).toBe("create");
  });

  it("reuses on duplicate display name", () => {
    const catalog = [ingredient("b1", "BACON FATIAS")];
    const guard = guardIngredientCreation("bacon fatias", catalog);
    expect(guard.action).toBe("reuse");
    if (guard.action === "reuse") {
      expect(guard.reason).toBe("duplicate_display_name");
    }
  });
});

describe("findCatalogIngredientByOperationalKey", () => {
  it("detects operational duplicates in catalog", () => {
    const catalog = [
      ingredient("a1", "ANGUS PTY"),
      ingredient("a2", "Angus Patty"),
    ];
    expect(catalogHasOperationalIdentityDuplicate("ANG PTY", catalog)).toBe(true);
    expect(findCatalogIngredientByOperationalKey(catalog, "ANGUS PATTY")?.id).toBe("a1");
  });
});
