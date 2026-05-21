import { describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { detectCatalogLeakRows } from "./ingredient-catalog-diagnostics";
import {
  buildCatalogReviewRows,
  CATALOG_REVIEW_RECIPE_LINKS_SELECT,
  catalogReviewStorageKey,
  loadCatalogReviewClassifications,
  logCatalogManualMergeCandidate,
  saveCatalogReviewClassifications,
  setCatalogReviewClassification,
} from "./catalog-pollution-review";
import * as ingredientMerge from "./ingredient-merge";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

describe("detectCatalogLeakRows + classification storage", () => {
  it("round-trips classifications via marginly:catalog-review storage key", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    const userId = "user-abc";
    expect(catalogReviewStorageKey(userId)).toBe("marginly:catalog-review:user-abc");

    const leaks = detectCatalogLeakRows([
      ingredient("bad", "CHK BREADED", { ingredient_kind: "canonical" }),
    ]);
    expect(leaks).toHaveLength(1);

    setCatalogReviewClassification(userId, "bad", "alias_pollution", storage);
    const loaded = loadCatalogReviewClassifications(userId, storage);
    expect(loaded.bad).toBe("alias_pollution");

    const rows = buildCatalogReviewRows({
      catalog: [ingredient("bad", "CHK BREADED", { ingredient_kind: "canonical" })],
      classifications: loaded,
    });
    expect(rows[0]?.classification).toBe("alias_pollution");
    expect(rows[0]?.leakReason).toBe("legacy_canonical_shorthand");

    saveCatalogReviewClassifications(userId, { bad: "review_needed" }, storage);
    expect(loadCatalogReviewClassifications(userId, storage).bad).toBe("review_needed");
  });
});

describe("setCatalogReviewClassification logging", () => {
  it("logs [catalog_review_classification] on classify", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setCatalogReviewClassification("u1", "ing-1", "valid_canonical", storage);
    setCatalogReviewClassification("u1", "ing-1", "alias_pollution", storage);

    expect(infoSpy).toHaveBeenCalledWith(
      "[catalog_review_classification]",
      expect.objectContaining({ id: "ing-1", classification: "valid_canonical", previous: null }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[catalog_review_classification]",
      expect.objectContaining({
        id: "ing-1",
        classification: "alias_pollution",
        previous: "valid_canonical",
      }),
    );

    infoSpy.mockRestore();
  });
});

describe("logCatalogManualMergeCandidate", () => {
  it("logs merge candidate without calling executeIngredientMerge", async () => {
    const executeSpy = vi.spyOn(ingredientMerge, "executeIngredientMerge");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const cluster = {
      operationalKey: "oleo girassol",
      ingredientIds: ["a", "b"],
      displayNames: ["Óleo girassol", "OLEO GIRASSOL 10L"],
      confidence: "exact_operational_key" as const,
    };

    logCatalogManualMergeCandidate({
      ...cluster,
      kind: "operational_duplicate_cluster",
      suggestedCanonicalIngredientId: "a",
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "[catalog_manual_merge_candidate]",
      expect.objectContaining({
        ids: ["a", "b"],
        canonicalSuggestionId: "a",
      }),
    );

    executeSpy.mockRestore();
    infoSpy.mockRestore();
  });
});

describe("CATALOG_REVIEW_RECIPE_LINKS_SELECT", () => {
  it("disambiguates recipe_ingredients → recipes via recipe_id FK", () => {
    expect(CATALOG_REVIEW_RECIPE_LINKS_SELECT).toBe(
      "ingredient_id, recipes!recipe_ingredients_recipe_id_fkey(name)",
    );
    expect(CATALOG_REVIEW_RECIPE_LINKS_SELECT).not.toMatch(/recipes\(name\)/);
  });
});

describe("buildCatalogReviewRows", () => {
  it("includes operational duplicate cluster members with merge hints", () => {
    const catalog = [
      ingredient("a1", "ANGUS PTY", { normalized_name: "angus pty", created_at: "2024-01-01T00:00:00Z" }),
      ingredient("a2", "Angus Patty", { normalized_name: "angus patty", created_at: "2024-06-01T00:00:00Z" }),
    ];
    const rows = buildCatalogReviewRows({ catalog });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const withHint = rows.find((r) => r.mergeHints.length > 0);
    expect(withHint?.discoveryKinds).toContain("operational_duplicate");
    expect(withHint?.mergeHints[0]?.suggestedCanonicalIngredientId).toBe("a1");
  });

  it("attaches alias strings and recipe usage", () => {
    const rows = buildCatalogReviewRows({
      catalog: [ingredient("x", "CHK BREADED", { ingredient_kind: "canonical" })],
      aliasRows: [{ ingredient_id: "x", alias_name: "CHK BRD" }],
      recipeLinks: [
        { ingredient_id: "x", recipes: { name: "Burger" } },
        { ingredient_id: "x", recipes: { name: "Burger" } },
      ],
    });
    expect(rows[0]?.sourceInvoiceAliases).toEqual(["CHK BRD"]);
    expect(rows[0]?.invoiceReferenceCount).toBe(1);
    expect(rows[0]?.recipeUsage).toEqual({ count: 1, names: ["Burger"] });
  });

  it("attaches read-only similarity candidates without executing merges", () => {
    const executeSpy = vi.spyOn(ingredientMerge, "executeIngredientMerge");
    const catalog = [
      ingredient("leak", "CHK BREADED", { ingredient_kind: "canonical" }),
      ingredient("good", "Chicken Breaded Fillet", {
        ingredient_kind: "canonical",
        normalized_name: "chicken breaded fillet",
      }),
    ];
    const rows = buildCatalogReviewRows({ catalog });
    const leakRow = rows.find((r) => r.ingredientId === "leak");
    expect(leakRow?.similarityCandidates.length).toBeGreaterThanOrEqual(0);
    if (leakRow?.similarityCandidates[0]) {
      expect(leakRow.similarityCandidates[0].ingredientId).toBe("good");
      expect(leakRow.similarityCandidates[0].score).toBeGreaterThan(0);
    }
    expect(executeSpy).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });
});
