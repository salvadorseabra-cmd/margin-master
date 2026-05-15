import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";

export type IngredientEmbed = Pick<
  Tables<"ingredients">,
  "id" | "name" | "current_price" | "unit" | "purchase_quantity" | "purchase_unit" | "base_unit"
>;

export type SubRecipeMinimal = Pick<
  Tables<"recipes">,
  "id" | "name" | "selling_price" | "type"
>;

export type RecipeIngredientLine = Pick<
  Tables<"recipe_ingredients">,
  "id" | "quantity" | "recipe_id" | "ingredient_id" | "sub_recipe_id"
> & {
  ingredients: IngredientEmbed | null;
  subRecipe: SubRecipeMinimal | null;
};

export type RecipeWithIngredients = Pick<
  Tables<"recipes">,
  "id" | "name" | "selling_price" | "type"
> & {
  recipe_ingredients: RecipeIngredientLine[] | null;
};

export type RecipeIngredientRow = Pick<
  Tables<"recipe_ingredients">,
  "id" | "recipe_id" | "ingredient_id" | "sub_recipe_id" | "quantity"
>;

export function mergeRecipesWithLines(
  recipeList: Pick<
    Tables<"recipes">,
    "id" | "name" | "selling_price" | "type"
  >[],
  riRows: RecipeIngredientRow[],
  ingredientRows: IngredientEmbed[],
  subRecipeRows: SubRecipeMinimal[],
): RecipeWithIngredients[] {
  const byIngredient = new Map<string, IngredientEmbed>();

  for (const ing of ingredientRows) {
    byIngredient.set(ing.id, ing);
  }

  const bySubRecipe = new Map<string, SubRecipeMinimal>();

  for (const r of recipeList) {
    bySubRecipe.set(r.id, {
      id: r.id,
      name: r.name,
      selling_price: r.selling_price,
      type: r.type,
    });
  }

  for (const sr of subRecipeRows) {
    bySubRecipe.set(sr.id, sr);
  }

  const linesByRecipe = new Map<
    string,
    RecipeIngredientLine[]
  >();

  for (const row of riRows) {
    const line: RecipeIngredientLine = {
      id: row.id,
      recipe_id: row.recipe_id,
      ingredient_id: row.ingredient_id,
      sub_recipe_id: row.sub_recipe_id,
      quantity: row.quantity,

      ingredients: row.ingredient_id
        ? byIngredient.get(row.ingredient_id) ?? null
        : null,

      subRecipe: row.sub_recipe_id
        ? bySubRecipe.get(row.sub_recipe_id) ?? null
        : null,
    };

    const list =
      linesByRecipe.get(row.recipe_id) ?? [];

    list.push(line);

    linesByRecipe.set(row.recipe_id, list);
  }

  for (const list of linesByRecipe.values()) {
    list.sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  return recipeList.map((r) => ({
    ...r,
    recipe_ingredients:
      linesByRecipe.get(r.id) ?? [],
  }));
}

export function buildRecipeLinesByRecipeId(
  merged: RecipeWithIngredients[],
): Map<string, RecipeIngredientLine[]> {
  const m = new Map<
    string,
    RecipeIngredientLine[]
  >();

  for (const r of merged) {
    m.set(r.id, r.recipe_ingredients ?? []);
  }

  return m;
}

export function computeRecipeTotalCostCached(
  recipeId: string,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  if (path.has(recipeId)) return null;

  if (memo.has(recipeId)) {
    return memo.get(recipeId)!;
  }

  path.add(recipeId);

  const lines =
    linesByRecipe.get(recipeId) ?? [];

  let sum = 0;

  for (const line of lines) {
    const part = lineIngredientCost(
      line,
      linesByRecipe,
      path,
      memo,
    );

    if (part === null) {
      path.delete(recipeId);
      return null;
    }

    sum += part;
  }

  path.delete(recipeId);

  memo.set(recipeId, sum);

  return sum;
}

export function lineIngredientCost(
  line: RecipeIngredientLine,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  const qty = Number(line.quantity);

  const safeQty = Number.isFinite(qty)
    ? qty
    : 0;

  if (line.ingredient_id) {
    const ing = line.ingredients;

    if (!ing) return 0;

    const effective =
      effectiveIngredientUnitCostEur(ing);

    return safeQty * effective;
  }

  if (line.sub_recipe_id) {
    const unitTotal =
      computeRecipeTotalCostCached(
        line.sub_recipe_id,
        linesByRecipe,
        path,
        memo,
      );

    if (unitTotal === null) {
      return null;
    }

    return safeQty * unitTotal;
  }

  return 0;
}

export function recipeCostFromLines(
  lines:
    | RecipeIngredientLine[]
    | null
    | undefined,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  let sum = 0;

  for (const line of lines ?? []) {
    const c = lineIngredientCost(
      line,
      linesByRecipe,
      path,
      memo,
    );

    if (c === null) {
      return null;
    }

    sum += c;
  }

  return sum;
}

export function recipeCostFromLinesOrZero(
  lines:
    | RecipeIngredientLine[]
    | null
    | undefined,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
): number {
  return (
    recipeCostFromLines(
      lines,
      linesByRecipe,
    ) ?? 0
  );
}

export function recipeTotalCostUsingEffectiveUnitForIngredient(
  recipeId: string,
  linesByRecipe: Map<
    string,
    RecipeIngredientLine[]
  >,
  ingredientId: string,
  effectiveUnitEur: number,
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  function walk(rid: string): number | null {
    if (path.has(rid)) return null;

    if (memo.has(rid)) {
      return memo.get(rid)!;
    }

    path.add(rid);

    let sum = 0;

    for (const line of linesByRecipe.get(rid) ?? []) {
      const qty = Number(line.quantity);

      const safeQty = Number.isFinite(qty)
        ? qty
        : 0;

      if (line.ingredient_id) {
        let unit: number;

        if (line.ingredient_id === ingredientId) {
          unit = effectiveUnitEur;
        } else {
          unit = line.ingredients
            ? effectiveIngredientUnitCostEur(
                line.ingredients,
              )
            : 0;
        }

        sum += safeQty * unit;
      } else if (line.sub_recipe_id) {
        const sub = walk(line.sub_recipe_id);

        if (sub === null) {
          path.delete(rid);
          return null;
        }

        sum += safeQty * sub;
      }
    }

    path.delete(rid);

    memo.set(rid, sum);

    return sum;
  }

  return walk(recipeId);
}

export async function fetchMergedRecipes(
  client: SupabaseClient<Database>,
): Promise<{
  merged: RecipeWithIngredients[];
  ingredients: Tables<"ingredients">[];
  error: string | null;
}> {
  const {
    data: recipesPayload,
    error: recipeError,
  } = await client
    .from("recipes")
    .select(
      "id,name,selling_price,type",
    )
    .order("id", {
      ascending: true,
    });

  if (recipeError) {
    return {
      merged: [],
      ingredients: [],
      error: recipeError.message,
    };
  }

  const recipeList =
    (recipesPayload ??
      []) as Pick<
      Tables<"recipes">,
      "id" | "name" | "selling_price" | "type"
    >[];

  const recipeIds = recipeList.map(
    (r) => r.id,
  );

  const [
    {
      data: riData,
      error: riError,
    },
    {
      data: ingData,
      error: ingError,
    },
  ] = await Promise.all([
    recipeIds.length === 0
      ? Promise.resolve({
          data:
            [] as RecipeIngredientRow[],
          error: null,
        })
      : client
          .from(
            "recipe_ingredients",
          )
          .select(
            "id,recipe_id,ingredient_id,sub_recipe_id,quantity",
          )
          .in(
            "recipe_id",
            recipeIds,
          ),

    client
      .from("ingredients")
      .select(
        "id,name,unit,current_price,purchase_quantity,purchase_unit,base_unit",
      )
      .order("id", {
        ascending: true,
      }),
  ]);

  if (riError) {
    return {
      merged: [],
      ingredients: [],
      error: riError.message,
    };
  }

  if (ingError) {
    return {
      merged: [],
      ingredients: [],
      error: ingError.message,
    };
  }

  const riRows =
    (riData ??
      []) as RecipeIngredientRow[];

  const subIds = [
    ...new Set(
      riRows
        .map((r) => r.sub_recipe_id)
        .filter(
          (
            id,
          ): id is string =>
            Boolean(id),
        ),
    ),
  ].filter(
    (id) => !recipeIds.includes(id),
  );

  let subRecipeRows: SubRecipeMinimal[] =
    [];

  if (subIds.length > 0) {
    const {
      data: subData,
      error: subErr,
    } = await client
      .from("recipes")
      .select(
        "id,name,selling_price,type",
      )
      .in("id", subIds);

    if (subErr) {
      return {
        merged: [],
        ingredients: [],
        error: subErr.message,
      };
    }

    subRecipeRows =
      (subData ??
        []) as SubRecipeMinimal[];
  }

  const ingredientRows =
    (ingData ??
      []) as IngredientEmbed[];

  return {
    merged: mergeRecipesWithLines(
      recipeList,
      riRows,
      ingredientRows,
      subRecipeRows,
    ),

    ingredients:
      (ingData ??
        []) as Tables<"ingredients">[],

    error: null,
  };
}

export function averageRecipeMarginPct(
  merged: RecipeWithIngredients[],
): number {
  const linesByRecipe =
    buildRecipeLinesByRecipeId(
      merged,
    );

  const margins: number[] = [];

  for (const r of merged) {
    const sale =
      Number(r.selling_price) || 0;

    if (sale <= 0) continue;

    const cost =
      recipeCostFromLinesOrZero(
        r.recipe_ingredients,
        linesByRecipe,
      );

    margins.push(
      ((sale - cost) / sale) * 100,
    );
  }

  if (!margins.length) return 0;

  return (
    margins.reduce((a, b) => a + b, 0) /
    margins.length
  );
}

export function recipeTotalCostWithIngredientUnitOverrides(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLine[]>,
  unitEurByIngredientId: Map<string, number>,
): number | null {
  const path = new Set<string>();

  const memo = new Map<string, number>();

  function walk(rid: string): number | null {
    if (path.has(rid)) return null;

    if (memo.has(rid)) {
      return memo.get(rid)!;
    }

    path.add(rid);
