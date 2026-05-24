import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RECIPE_DELETE_SUB_RECIPE_BLOCKER_MESSAGE,
  deleteRecipe,
  loadRecipeDeleteBlockers,
} from "./recipe-delete";

function mockClient(handlers: {
  dependentLines?: { recipe_id: string }[] | null;
  dependentLinesError?: { message: string } | null;
  parentRecipes?: { id: string; name: string }[] | null;
  parentRecipesError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const deleteEqUser = vi.fn(() =>
    Promise.resolve({ error: handlers.deleteError ?? null }),
  );
  const deleteEqId = vi.fn(() => ({ eq: deleteEqUser }));
  const recipesDelete = vi.fn(() => ({ eq: deleteEqId }));

  const recipesIn = vi.fn(() =>
    Promise.resolve({
      data: handlers.parentRecipes ?? [],
      error: handlers.parentRecipesError ?? null,
    }),
  );
  const recipesSelect = vi.fn(() => ({ in: recipesIn }));

  const ingredientsEqSubRecipe = vi.fn(() =>
    Promise.resolve({
      data: handlers.dependentLines ?? [],
      error: handlers.dependentLinesError ?? null,
    }),
  );
  const ingredientsSelect = vi.fn(() => ({ eq: ingredientsEqSubRecipe }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === "recipe_ingredients") {
        return { select: ingredientsSelect };
      }
      if (table === "recipes") {
        return { select: recipesSelect, delete: recipesDelete };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;

  return {
    client,
    ingredientsEqSubRecipe,
    recipesIn,
    deleteEqId,
    deleteEqUser,
  };
}

describe("loadRecipeDeleteBlockers", () => {
  it("returns no blockers when recipe is not used as a sub-recipe", async () => {
    const { client } = mockClient({ dependentLines: [] });

    const result = await loadRecipeDeleteBlockers(client, "prep-1");

    expect(result.error).toBeNull();
    expect(result.blockers).toEqual({
      blocked: false,
      message: null,
      dependentRecipeNames: [],
    });
  });

  it("blocks delete and returns dependent recipe names", async () => {
    const { client, ingredientsEqSubRecipe, recipesIn } = mockClient({
      dependentLines: [{ recipe_id: "dish-a" }, { recipe_id: "dish-b" }, { recipe_id: "dish-a" }],
      parentRecipes: [
        { id: "dish-b", name: "Burger" },
        { id: "dish-a", name: "Avocado toast" },
      ],
    });

    const result = await loadRecipeDeleteBlockers(client, "prep-1");

    expect(ingredientsEqSubRecipe).toHaveBeenCalledWith("sub_recipe_id", "prep-1");
    expect(recipesIn).toHaveBeenCalledWith("id", ["dish-a", "dish-b"]);
    expect(result.error).toBeNull();
    expect(result.blockers.blocked).toBe(true);
    expect(result.blockers.message).toBe(RECIPE_DELETE_SUB_RECIPE_BLOCKER_MESSAGE);
    expect(result.blockers.dependentRecipeNames).toEqual(["Avocado toast", "Burger"]);
  });

  it("surfaces query errors from recipe_ingredients", async () => {
    const { client } = mockClient({
      dependentLinesError: { message: "permission denied" },
    });

    const result = await loadRecipeDeleteBlockers(client, "prep-1");

    expect(result.error).toBe("permission denied");
    expect(result.blockers.blocked).toBe(false);
  });
});

describe("deleteRecipe", () => {
  it("deletes the recipe when there are no sub-recipe dependents", async () => {
    const { client, deleteEqId, deleteEqUser } = mockClient({ dependentLines: [] });

    const result = await deleteRecipe(client, "prep-1", "user-1");

    expect(result.error).toBeNull();
    expect(deleteEqId).toHaveBeenCalledWith("id", "prep-1");
    expect(deleteEqUser).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("does not delete when sub-recipe dependents exist", async () => {
    const { client, deleteEqId } = mockClient({
      dependentLines: [{ recipe_id: "dish-a" }],
      parentRecipes: [{ id: "dish-a", name: "Risotto" }],
    });

    const result = await deleteRecipe(client, "prep-1", "user-1");

    expect(result.error).toBe(
      `${RECIPE_DELETE_SUB_RECIPE_BLOCKER_MESSAGE} Used in: Risotto.`,
    );
    expect(deleteEqId).not.toHaveBeenCalled();
  });
});
