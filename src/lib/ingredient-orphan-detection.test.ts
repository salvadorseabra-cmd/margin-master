import { describe, expect, it, vi } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  archiveOrphanIngredient,
  buildOrphanReportsFromDependencyRows,
  detectOrphanCanonicalIngredients,
  emptyOrphanReport,
  isIngredientOperationallyOrphaned,
  orphanBlockingReasons,
  shouldHideOrphanFromMainCatalog,
} from "./ingredient-orphan-detection";

function row(id: string, name: string): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase() };
}

function createOrphanMockClient(
  tables: Partial<{
    ingredient_aliases: { ingredient_id: string; supplier_name?: string | null }[];
    recipe_ingredients: {
      ingredient_id: string;
      recipes?: { type: string | null } | null;
    }[];
    ingredient_price_history: { ingredient_id: string }[];
    recipe_margin_impacts: { ingredient_id: string }[];
  }>,
) {
  return {
    from: (table: string) => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: tables[table as keyof typeof tables] ?? [],
            error: null,
          }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          eq: () => ({
            is: () => Promise.resolve({ error: null, data: [{ id: "x", ...payload }] }),
          }),
        }),
      }),
    }),
  };
}

describe("isIngredientOperationallyOrphaned", () => {
  it("returns false when ingredient has aliases", () => {
    const report = {
      ...emptyOrphanReport("a"),
      invoiceAliasCount: 1,
    };
    expect(isIngredientOperationallyOrphaned(report)).toBe(false);
    expect(orphanBlockingReasons(report)).toContain("invoice_aliases");
  });

  it("returns false when ingredient has recipe line", () => {
    const report = {
      ...emptyOrphanReport("a"),
      recipeIngredientCount: 1,
    };
    expect(isIngredientOperationallyOrphaned(report)).toBe(false);
    expect(orphanBlockingReasons(report)).toContain("recipe_ingredients");
  });

  it("PALHA mock zero refs is orphan", () => {
    const palha = emptyOrphanReport("palha-id");
    expect(isIngredientOperationallyOrphaned(palha)).toBe(true);
    expect(orphanBlockingReasons(palha)).toEqual([]);
  });

  it("hides PALHA from main catalog when Batata palha has usage", () => {
    const catalog = [row("palha-id", "PALHA"), row("batata-id", "Batata palha")];
    const reports = new Map([
      ["palha-id", emptyOrphanReport("palha-id")],
      [
        "batata-id",
        { ...emptyOrphanReport("batata-id"), invoiceAliasCount: 2 },
      ],
    ]);
    expect(shouldHideOrphanFromMainCatalog(catalog[0]!, catalog, reports)).toBe(true);
    expect(shouldHideOrphanFromMainCatalog(catalog[1]!, catalog, reports)).toBe(false);
  });
});

describe("detectOrphanCanonicalIngredients", () => {
  it("marks PALHA orphan and flags ingredient with alias", async () => {
    const catalog = [row("palha-id", "PALHA"), row("batata-id", "Batata palha")];
    const client = createOrphanMockClient({
      ingredient_aliases: [{ ingredient_id: "batata-id", supplier_name: "Metro" }],
      recipe_ingredients: [],
      ingredient_price_history: [],
      recipe_margin_impacts: [],
    });

    const { reports, error } = await detectOrphanCanonicalIngredients(
      client as never,
      catalog,
    );
    expect(error).toBeNull();
    expect(isIngredientOperationallyOrphaned(reports.get("palha-id")!)).toBe(true);
    expect(isIngredientOperationallyOrphaned(reports.get("batata-id")!)).toBe(false);
    expect(reports.get("batata-id")?.supplierAliasCount).toBe(1);
  });

  it("counts prep recipe lines separately", () => {
    const reports = buildOrphanReportsFromDependencyRows(["ing-1"], {
      aliases: [],
      recipeLinks: [
        { ingredient_id: "ing-1", recipes: { type: "prep" } },
        { ingredient_id: "ing-1", recipes: { type: "dish" } },
      ],
      priceHistory: [],
      marginImpacts: [],
    });
    const report = reports.get("ing-1")!;
    expect(report.recipeIngredientCount).toBe(2);
    expect(report.prepRecipeIngredientCount).toBe(1);
    expect(isIngredientOperationallyOrphaned(report)).toBe(false);
  });
});

describe("archiveOrphanIngredient", () => {
  it("sets is_archived without merged_into", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: () => ({
              eq: () => ({
                is: () => Promise.resolve({ error: null }),
              }),
            }),
          };
        },
      }),
    };
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const { error } = await archiveOrphanIngredient({
      client: client as never,
      ingredientId: "palha-id",
      userId: "user-1",
    });

    expect(error).toBeNull();
    expect(updates[0]).toEqual({ is_archived: true });
    expect(updates[0]).not.toHaveProperty("merged_into_ingredient_id");
    infoSpy.mockRestore();
  });
});
