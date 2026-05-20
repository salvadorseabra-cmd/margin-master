import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  applyInMemoryIngredientMergeRewrites,
  buildIngredientMergePlan,
  buildIngredientMergePlanFromCluster,
  buildReferenceCountsFromRows,
  executeIngredientMerge,
  findAngusPattyMergeCluster,
  INGREDIENT_FK_REASSIGNMENT_TARGETS,
  rewriteIngredientIdInAliasMap,
  selectCanonicalIngredientId,
  validateIngredientMergePlan,
} from "./ingredient-merge";
import type { IngredientMergeCluster } from "./ingredient-merge-hooks";
import {
  buildCanonicalIngredientPickerOptions,
} from "./ingredient-picker-options";
import {
  clearIngredientMatchOverridesForTests,
  ingredientMatchOverrides,
  rememberIngredientMatchOverride,
} from "./ingredient-match-override";
import {
  clearRejectedIngredientMatchesForTests,
  listRejectedIngredientMatches,
  rememberRejectedIngredientMatch,
} from "./ingredient-rejected-match-memory";

function row(
  id: string,
  name: string,
  extra?: Partial<IngredientCanonicalInput & { created_at?: string }>,
): IngredientCanonicalInput & { created_at?: string } {
  return { id, name, normalized_name: name.toLowerCase(), ...extra };
}

describe("canonical selection", () => {
  it("prefers oldest created_at then reference count", () => {
    const catalog = [
      row("new", "ANGUS PTY", { created_at: "2024-06-01T00:00:00Z" }),
      row("old", "Angus Patty", { created_at: "2023-01-01T00:00:00Z" }),
      row("mid", "ANG PTY", { created_at: "2024-01-01T00:00:00Z" }),
    ];
    const refs = buildReferenceCountsFromRows({
      recipe_ingredients: [
        { ingredient_id: "new" },
        { ingredient_id: "new" },
        { ingredient_id: "mid" },
      ],
    });
    const picked = selectCanonicalIngredientId(["new", "old", "mid"], catalog, refs);
    expect(picked?.canonicalId).toBe("old");
  });
});

describe("ANGUS PTY merge scenario", () => {
  const angusCluster: IngredientMergeCluster = {
    operationalKey: "angus patty",
    ingredientIds: ["a1", "a2", "a3"],
    displayNames: ["ANGUS PTY", "Angus Patty", "ANG PTY"],
    confidence: "exact_operational_key",
  };

  it("detects operational cluster and builds merge plan", () => {
    const catalog = [
      row("a1", "ANGUS PTY", { created_at: "2024-03-01T00:00:00Z" }),
      row("a2", "Angus Patty", { created_at: "2023-06-01T00:00:00Z" }),
      row("a3", "ANG PTY", { created_at: "2024-08-01T00:00:00Z" }),
    ];
    const found = findAngusPattyMergeCluster(catalog);
    expect(found?.ingredientIds).toHaveLength(3);

    const plan = buildIngredientMergePlanFromCluster(angusCluster, catalog);
    expect(plan?.canonicalIngredientId).toBe("a2");
    expect(plan?.sourceIngredientIds.sort()).toEqual(["a1", "a3"]);
  });

  it("validates plan and lists FK reassignment targets", () => {
    const plan = buildIngredientMergePlan("a2", ["a1", "a3"], {
      operationalKey: "angus patty",
    });
    expect(validateIngredientMergePlan(plan, [row("a1", "A"), row("a2", "B"), row("a3", "C")])).toEqual({
      ok: true,
    });
    expect(INGREDIENT_FK_REASSIGNMENT_TARGETS.map((t) => t.table)).toEqual([
      "ingredient_aliases",
      "recipe_ingredients",
      "ingredient_price_history",
      "recipe_margin_impacts",
    ]);
  });
});

describe("alias and memory preservation", () => {
  beforeEach(() => {
    clearIngredientMatchOverridesForTests();
    clearRejectedIngredientMatchesForTests();
  });

  it("rewrites alias map to canonical id", () => {
    const next = rewriteIngredientIdInAliasMap(
      { "metro::angus pty": "a1", "angus patty": "a3" },
      "a1",
      "a2",
    );
    expect(next["metro::angus pty"]).toBe("a2");
    expect(next["angus patty"]).toBe("a3");
  });

  it("remaps overrides and rejected pairs to canonical id", () => {
    rememberIngredientMatchOverride("ANGUS PTY", "a1", "ANGUS PTY");
    rememberRejectedIngredientMatch("ANGUS PTY", "a1");

    const applied = applyInMemoryIngredientMergeRewrites("a1", "a2", "Angus Patty", {
      "angus pty": "a1",
    });

    expect(applied.nextConfirmedAliases["angus pty"]).toBe("a2");
    expect(applied.overridesRemapped).toBeGreaterThan(0);
    expect([...ingredientMatchOverrides.values()][0]?.canonicalIngredientId).toBe("a2");
    expect(listRejectedIngredientMatches()[0]?.rejectedIngredientId).toBe("a2");
  });
});

describe("picker filtering archived", () => {
  it("excludes archived and merged-into duplicates from picker options", () => {
    const catalog = [
      row("canonical", "ANGUS PTY"),
      row("dup", "ANGUS PTY", { is_archived: true, merged_into_ingredient_id: "canonical" }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((o) => o.id)).toEqual(["canonical"]);
  });
});

describe("executeIngredientMerge", () => {
  it("reassigns FK tables and archives sources", async () => {
    const plan = buildIngredientMergePlan("canonical", ["dup"]);
    const updates: { table: string; payload: Record<string, unknown>; filter: Record<string, unknown> }[] =
      [];
    const deletes: { table: string; id: string }[] = [];

    const client = {
      from(table: string) {
        const api = {
          select: () => ({
            in: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
              then: undefined,
            }),
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
          update(payload: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                updates.push({ table, payload, filter: { [column]: value } });
                return Promise.resolve({ error: null });
              },
              in(column: string, values: string[]) {
                updates.push({ table, payload, filter: { [column]: values } });
                return Promise.resolve({ error: null });
              },
            };
          },
          delete: () => ({
            eq: (_column: string, id: string) => {
              deletes.push({ table, id });
              return Promise.resolve({ error: null });
            },
          }),
        };
        return api;
      },
    };

    const result = await executeIngredientMerge(client as never, plan);
    expect(result.error).toBeNull();
    expect(updates.some((u) => u.table === "ingredients" && u.payload.is_archived === true)).toBe(
      true,
    );
    expect(
      updates.some(
        (u) =>
          u.table === "ingredient_aliases" &&
          u.payload.ingredient_id === "canonical" &&
          u.filter.ingredient_id === "dup",
      ),
    ).toBe(true);
  });

  it("merges duplicate recipe lines into canonical line", async () => {
    const plan = buildIngredientMergePlan("canonical", ["dup"]);
    let recipeUpdates = 0;

    const client = {
      from(table: string) {
        if (table !== "recipe_ingredients") {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
            update: () => ({
              eq: () => Promise.resolve({ error: null }),
              in: () => Promise.resolve({ error: null }),
            }),
          };
        }

        return {
          select: () => ({
            in: (_col: string, values: string[]) => {
              if (values.includes("dup")) {
                return Promise.resolve({
                  data: [{ id: "line-dup", recipe_id: "r1", ingredient_id: "dup", quantity: 2 }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: null });
            },
            eq: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "line-canonical",
                      recipe_id: "r1",
                      ingredient_id: "canonical",
                      quantity: 1,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
          update: () => {
            recipeUpdates += 1;
            return {
              eq: () => Promise.resolve({ error: null }),
            };
          },
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      },
    };

    const result = await executeIngredientMerge(client as never, plan);
    expect(result.error).toBeNull();
    expect(recipeUpdates).toBeGreaterThanOrEqual(1);
    expect(result.steps.some((s) => s.action === "merge_recipe_line")).toBe(true);
  });
});
