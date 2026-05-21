import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import { diagnoseIngredientCatalogIdentity } from "./ingredient-identity-diagnostics";
import { buildRecipeCanonicalMigrationPreview } from "./recipe-canonical-migration-preview";

function ingredient(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput>,
): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ingredient_kind: "canonical", ...extra };
}

const ANGUS_NAME = "Angus Burger Patty 180g";

describe("buildRecipeCanonicalMigrationPreview", () => {
  it("flags orphan when ingredients embed row is missing", () => {
    const canonicalCatalog = [ingredient("canonical-1", ANGUS_NAME)];
    const fullCatalog = [...canonicalCatalog];

    const report = buildRecipeCanonicalMigrationPreview({
      recipes: [{ id: "recipe-1", name: "Burger" }],
      lines: [
        {
          recipeId: "recipe-1",
          lineId: "line-1",
          ingredientId: "ghost-id",
          embed: null,
        },
      ],
      canonicalCatalog,
      fullCatalog,
    });

    expect(report.orphanLines).toHaveLength(1);
    expect(report.orphanLines[0]?.statuses).toContain("orphan_embed");
    expect(report.orphanLines[0]?.safety.safe).toBe(false);
  });

  it("flags ambiguous when two active canonical rows share operational key", () => {
    const canonicalCatalog = [
      ingredient("olive-a", "Olive oil extra virgin 5L"),
      ingredient("olive-b", "Olive oil extra virgin 5L"),
    ];
    const fullCatalog = [...canonicalCatalog];
    expect(
      diagnoseIngredientCatalogIdentity(canonicalCatalog).operationalDuplicateClusters[0]
        ?.ingredientIds.length,
    ).toBe(2);

    const report = buildRecipeCanonicalMigrationPreview({
      recipes: [{ id: "recipe-1", name: "Burger" }],
      lines: [
        {
          recipeId: "recipe-1",
          lineId: "line-1",
          ingredientId: "missing-legacy",
          ingredientName: "Olive oil extra virgin 5L",
          embed: { name: "Olive oil extra virgin 5L", current_price: 5, purchase_quantity: 1 },
        },
      ],
      canonicalCatalog,
      fullCatalog,
    });

    const line = report.lines[0];
    expect(line?.statuses).toContain("ambiguous_canonical");
    expect(line?.ambiguousCandidateIds.length).toBeGreaterThanOrEqual(2);
    expect(line?.suggestedCandidateId).toBeNull();
    expect(report.ambiguousLines).toHaveLength(1);
  });

  it("blocks safety when suggested merge target is archived", () => {
    const canonicalCatalog = [ingredient("canonical-live", ANGUS_NAME)];

    const report = buildRecipeCanonicalMigrationPreview({
      recipes: [{ id: "recipe-1", name: "Burger" }],
      lines: [
        {
          recipeId: "recipe-1",
          lineId: "line-1",
          ingredientId: "archived-src",
          embed: { name: "OLD ANGUS", current_price: 4, purchase_quantity: 1 },
        },
      ],
      canonicalCatalog,
      fullCatalog: [
        ...canonicalCatalog,
        ingredient("archived-src", "OLD ANGUS", {
          is_archived: true,
          merged_into_ingredient_id: "also-archived",
        }),
        ingredient("also-archived", ANGUS_NAME, {
          is_archived: true,
          merged_into_ingredient_id: null,
        }),
      ],
    });

    const line = report.lines[0];
    expect(line?.suggestedCandidateId).toBe("also-archived");
    expect(line?.safety.candidateNotArchived).toBe(false);
    expect(line?.safety.safe).toBe(false);
    expect(line?.safety.issues).toContain("candidate_archived");
  });

  it("blocks safety on duplicate recipe_ingredient collision when reassigning", () => {
    const canonicalCatalog = [ingredient("canonical-1", ANGUS_NAME)];
    const fullCatalog = [...canonicalCatalog];

    const report = buildRecipeCanonicalMigrationPreview({
      recipes: [{ id: "recipe-1", name: "Burger" }],
      lines: [
        {
          recipeId: "recipe-1",
          lineId: "line-a",
          ingredientId: "canonical-1",
          embed: { name: ANGUS_NAME, current_price: 10, purchase_quantity: 1 },
        },
        {
          recipeId: "recipe-1",
          lineId: "line-b",
          ingredientId: "invoice:temp",
          ingredientName: ANGUS_NAME,
          embed: { name: ANGUS_NAME, current_price: 8, purchase_quantity: 1 },
        },
      ],
      canonicalCatalog,
      fullCatalog,
    });

    const tempLine = report.lines.find((row) => row.lineId === "line-b");
    expect(tempLine?.suggestedCandidateId).toBe("canonical-1");
    expect(tempLine?.safety.noDuplicateRecipeLineCollision).toBe(false);
    expect(tempLine?.safety.issues).toContain("duplicate_recipe_ingredient_collision");
  });
});
