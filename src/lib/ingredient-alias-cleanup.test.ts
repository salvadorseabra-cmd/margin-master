import { describe, expect, it } from "vitest";
import type { IngredientCanonicalInput } from "./ingredient-canonical";
import {
  buildMergeAliasIntoCanonicalPlan,
  mergeAliasIngredientIntoCanonical,
} from "./ingredient-alias-cleanup";
import { validateIngredientMergePlan } from "./ingredient-merge";

function ingredient(id: string, name: string): IngredientCanonicalInput {
  return { id, name, normalized_name: name.toLowerCase(), ingredient_kind: id.startsWith("a") ? "alias" : "canonical" };
}

describe("buildMergeAliasIntoCanonicalPlan", () => {
  it("builds a valid merge plan for alias → canonical", () => {
    const plan = buildMergeAliasIntoCanonicalPlan("alias-1", "canonical-1");
    const validation = validateIngredientMergePlan(plan, [
      ingredient("canonical-1", "BACON FATIADO FUMADO 1KG"),
      ingredient("alias-1", "BAC FUM FAT"),
    ]);
    expect(validation.ok).toBe(true);
    expect(plan.sourceIngredientIds).toEqual(["alias-1"]);
    expect(plan.canonicalIngredientId).toBe("canonical-1");
  });
});

describe("mergeAliasIngredientIntoCanonical", () => {
  it("reassigns FKs and archives alias row", async () => {
    const updates: { table: string; id: string }[] = [];
    const client = {
      from: (table: string) => ({
        select: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
          eq: () => ({
            in: () =>
              Promise.resolve({
                data: [{ id: "alias-1", is_archived: true, merged_into_ingredient_id: "canonical-1" }],
                error: null,
              }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: (column: string, value: string) => {
            if (column === "user_id") {
              return {
                in: (_idCol: string, ids: string[]) => ({
                  select: () => {
                    for (const id of ids) updates.push({ table, id });
                    return Promise.resolve({
                      data:
                        table === "ingredients" && payload.is_archived === true
                          ? ids.map((id) => ({
                              id,
                              is_archived: true,
                              merged_into_ingredient_id: payload.merged_into_ingredient_id,
                            }))
                          : [],
                      error: null,
                    });
                  },
                }),
              };
            }
            updates.push({ table, id: value });
            return Promise.resolve({ error: null });
          },
          in: (_col: string, ids: string[]) => {
            for (const id of ids) updates.push({ table, id });
            return Promise.resolve({ error: null });
          },
        }),
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    } as never;

    const result = await mergeAliasIngredientIntoCanonical({
      client,
      userId: "user-1",
      aliasEntry: ingredient("alias-1", "BAC FUM FAT"),
      canonicalEntry: ingredient("canonical-1", "BACON FATIADO FUMADO 1KG"),
      confirmedAliases: { "bac fum fat": "alias-1" },
    });

    expect(result.error).toBeNull();
    expect(result.nextConfirmedAliases?.["bac fum fat"]).toBe("canonical-1");
    expect(updates.some((u) => u.table === "ingredients" && u.id === "alias-1")).toBe(true);
  });
});
