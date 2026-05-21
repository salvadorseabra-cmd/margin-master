import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  applyInMemoryIngredientMergeRewrites,
  buildIngredientMergePlan,
  buildIngredientMergePlanFromCluster,
  buildReferenceCountsFromRows,
  executeIngredientMerge,
  executeManualCanonicalMerge,
  findAngusPattyMergeCluster,
  INGREDIENT_FK_REASSIGNMENT_TARGETS,
  MANUAL_CANONICAL_MERGE_COMPLETE_PREFIX,
  MANUAL_CANONICAL_MERGE_START_PREFIX,
  previewManualCanonicalMergeImpact,
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
      row("canonical", "Angus Patty 180g", { ingredient_kind: "canonical" }),
      row("dup", "ANGUS PTY", {
        ingredient_kind: "alias",
        is_archived: true,
        merged_into_ingredient_id: "canonical",
      }),
    ];
    const options = buildCanonicalIngredientPickerOptions(catalog);
    expect(options.map((o) => o.id)).toEqual(["canonical"]);
  });
});

function mockPreviewClient(rows: {
  recipes?: { id: string; recipes: { name: string } | null }[];
  aliases?: { alias_name?: string; normalized_alias?: string }[];
  prices?: { id: string }[];
  margins?: { id: string }[];
}) {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => {
            if (table === "recipe_ingredients") {
              return Promise.resolve({ data: rows.recipes ?? [], error: null });
            }
            if (table === "ingredient_aliases") {
              return Promise.resolve({ data: rows.aliases ?? [], error: null });
            }
            if (table === "ingredient_price_history") {
              return Promise.resolve({ data: rows.prices ?? [], error: null });
            }
            if (table === "recipe_margin_impacts") {
              return Promise.resolve({ data: rows.margins ?? [], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }),
      };
    },
  };
}

describe("previewManualCanonicalMergeImpact", () => {
  it("returns counts and recipe/alias lists for source ingredient", async () => {
    const catalog = [row("dup", "ANGUS PTY"), row("canonical", "Angus Patty")];
    const client = mockPreviewClient({
      recipes: [{ id: "ri1", recipes: { name: "Burger" } }],
      aliases: [{ alias_name: "ANG PTY" }],
      prices: [{ id: "p1" }, { id: "p2" }],
      margins: [{ id: "m1" }],
    });

    const preview = await previewManualCanonicalMergeImpact(
      client as never,
      "dup",
      "canonical",
      catalog,
    );

    expect(preview.validation).toEqual({ ok: true });
    expect(preview.recipeIngredients).toEqual({ count: 1, recipeNames: ["Burger"] });
    expect(preview.ingredientAliases.count).toBe(1);
    expect(preview.ingredientPriceHistory.count).toBe(2);
    expect(preview.recipeMarginImpacts.count).toBe(1);
    expect(preview.plan.canonicalIngredientId).toBe("canonical");
    expect(preview.plan.sourceIngredientIds).toEqual(["dup"]);
  });

  it("flags source_equals_canonical when ids match", async () => {
    const preview = await previewManualCanonicalMergeImpact(
      mockPreviewClient({}) as never,
      "same",
      "same",
      [row("same", "X")],
    );
    expect(preview.validation.ok).toBe(false);
    if (!preview.validation.ok) {
      expect(preview.validation.issues).toContain("source_equals_canonical");
    }
  });
});

describe("executeManualCanonicalMerge", () => {
  it("executes merge plan, logs lifecycle, archives source via ingredients update", async () => {
    const updates: { table: string; payload: Record<string, unknown>; filter: Record<string, unknown> }[] =
      [];

    const client = {
      from(table: string) {
        const api = {
          select: () => ({
            in: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          update(payload: Record<string, unknown>) {
            const finishUpdate = (filter: Record<string, unknown>) => {
              updates.push({ table, payload, filter });
              const archivedRows =
                table === "ingredients" && payload.is_archived === true
                  ? ((filter.id as string[] | undefined) ?? []).map((id) => ({
                      id,
                      is_archived: true,
                      merged_into_ingredient_id: payload.merged_into_ingredient_id,
                    }))
                  : [];
              return Promise.resolve({ data: archivedRows, error: null });
            };
            return {
              eq(column: string, value: string) {
                return finishUpdate({ [column]: value });
              },
              in(column: string, values: string[]) {
                return {
                  select: () => finishUpdate({ [column]: values }),
                };
              },
            };
          },
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
        return api;
      },
    };

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const catalog = [row("dup", "ANGUS PTY"), row("canonical", "Angus Patty")];
    const result = await executeManualCanonicalMerge({
      client: client as never,
      sourceId: "dup",
      targetId: "canonical",
      catalog,
    });

    expect("error" in result && typeof result.error === "string").toBe(false);
    if (!("error" in result)) {
      expect(result.error).toBeNull();
      expect(result.plan.sourceIngredientIds).toEqual(["dup"]);
    }
    expect(updates.some((u) => u.table === "ingredients" && u.payload.is_archived === true)).toBe(
      true,
    );
    expect(
      infoSpy.mock.calls.some(
        (call) =>
          call[0] === MANUAL_CANONICAL_MERGE_START_PREFIX &&
          (call[1] as { sourceId: string }).sourceId === "dup",
      ),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(
        (call) =>
          call[0] === MANUAL_CANONICAL_MERGE_COMPLETE_PREFIX &&
          (call[1] as { success: boolean; archivedSourceIds: string[] }).success === true &&
          (call[1] as { archivedSourceIds: string[] }).archivedSourceIds.includes("dup"),
      ),
    ).toBe(true);

    infoSpy.mockRestore();
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
            in: () => Promise.resolve({ data: [], error: null }),
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          update(payload: Record<string, unknown>) {
            const finishUpdate = (filter: Record<string, unknown>) => {
              updates.push({ table, payload, filter });
              const archivedRows =
                table === "ingredients" && payload.is_archived === true
                  ? ((filter.id as string[] | undefined) ?? []).map((id) => ({
                      id,
                      is_archived: true,
                      merged_into_ingredient_id: payload.merged_into_ingredient_id,
                    }))
                  : [];
              return Promise.resolve({ data: archivedRows, error: null });
            };
            return {
              eq(column: string, value: string) {
                return finishUpdate({ [column]: value });
              },
              in(column: string, values: string[]) {
                return {
                  select: () => finishUpdate({ [column]: values }),
                };
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
              eq: () => ({
                in: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: () => Promise.resolve({ data: [], error: null }),
              in: (_column: string, values: string[]) => ({
                select: () =>
                  Promise.resolve({
                    data:
                      table === "ingredients" && payload.is_archived === true
                        ? values.map((id) => ({
                            id,
                            is_archived: true,
                            merged_into_ingredient_id: payload.merged_into_ingredient_id,
                          }))
                        : [],
                    error: null,
                  }),
              }),
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
