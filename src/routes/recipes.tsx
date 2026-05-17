import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/recipes")({
  head: () => ({
    meta: [
      { title: "Recipes — Marginly" },
      {
        name: "description",
        content: "Track recipe food cost and margin per dish.",
      },
    ],
  }),
  component: RecipesPage,
});

type RecipeIngredient = {
  id: string;
  ingredient_id: string | null;
  quantity: number | null;
  unit: string | null;
  ingredients: {
    id: string;
    name: string | null;
    unit: string | null;
    current_price: number | null;
    purchase_quantity: number | null;
  } | null;
};

type RecipeRow = {
  id: string;
  name: string;
  selling_price: number | null;
  type: string | null;
  recipe_ingredients: RecipeIngredient[] | null;
};

type IngredientOption = {
  id: string;
  name: string;
  unit: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
};

type RecipeLineForm = {
  id: string | null;
  ingredient_id: string;
  quantity: string;
  unit: string;
};

type RecipeForm = {
  name: string;
  type: string;
  selling_price: string;
  lines: RecipeLineForm[];
};

type RecipeFormMode = "create" | "edit";

const emptyRecipeForm: RecipeForm = {
  name: "",
  type: "",
  selling_price: "",
  lines: [],
};

function recipeToForm(recipe: RecipeRow): RecipeForm {
  return {
    name: recipe.name,
    type: recipe.type ?? "dish",
    selling_price: String(Number(recipe.selling_price ?? 0)),
    lines:
      recipe.recipe_ingredients
        ?.filter((line) => line.ingredient_id)
        .map((line) => ({
          id: line.id,
          ingredient_id: line.ingredient_id ?? "",
          quantity: String(Number(line.quantity ?? 0)),
          unit: line.unit ?? line.ingredients?.unit ?? "",
        })) ?? [],
  };
}

function RecipesPage() {
  const { user } = useAuth();

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [recipeCosts, setRecipeCosts] = useState<Record<string, number>>({});
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRow | null>(null);
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(emptyRecipeForm);
  const [formMode, setFormMode] = useState<RecipeFormMode>("edit");
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);

  const openRecipe = (recipe: RecipeRow) => {
    setFormMode("edit");
    setSelectedRecipe(recipe);
    setRecipeForm(recipeToForm(recipe));
    setDeletedLineIds([]);
    setError(null);
    setDetailOpen(true);
  };

  const openNewRecipe = () => {
    setFormMode("create");
    setSelectedRecipe(null);
    setRecipeForm({
      ...emptyRecipeForm,
      type: "dish",
      lines: [{ id: null, ingredient_id: "", quantity: "0", unit: "" }],
    });
    setDeletedLineIds([]);
    setError(null);
    setDetailOpen(true);
  };

  const closeRecipeForm = useCallback(() => {
    setDetailOpen(false);
    setSelectedRecipe(null);
    setRecipeForm(emptyRecipeForm);
    setFormMode("edit");
    setDeletedLineIds([]);
    setSaving(false);
    setError(null);
  }, []);

  const load = useCallback(
    async (activeRecipeId?: string) => {
      if (!user) return;

      const [{ data: recipesData, error }, { data: ingredientsData }] = await Promise.all([
        supabase
          .from("recipes")
          .select(
            `
          id,
          name,
          selling_price,
          type,
          recipe_ingredients!recipe_ingredients_recipe_id_fkey (
            id,
            ingredient_id,
            quantity,
            unit,
            ingredients (
            id,
            name,
            unit,
            current_price,
            purchase_quantity
           )
            )
          )
        `,
          )
          .order("name", { ascending: true }),
        supabase
          .from("ingredients")
          .select("id, name, unit, current_price, purchase_quantity")
          .order("name", { ascending: true }),
      ]);

      console.log(error);

      const loadedRecipes = (recipesData ?? []) as RecipeRow[];
      setRecipes(loadedRecipes);
      setIngredientOptions((ingredientsData ?? []) as IngredientOption[]);

      if (activeRecipeId) {
        const activeRecipe =
          loadedRecipes.find((recipe: RecipeRow) => recipe.id === activeRecipeId) ?? null;

        setSelectedRecipe(activeRecipe);
        if (activeRecipe) setRecipeForm(recipeToForm(activeRecipe));
      }

      const costs: Record<string, number> = {};

      loadedRecipes.forEach((recipe) => {
        const total =
          recipe.recipe_ingredients?.reduce((sum, ri) => {
            const ingredientPrice = Number(ri.ingredients?.current_price ?? 0);

            const purchaseQty = Number(ri.ingredients?.purchase_quantity ?? 1);

            const qty = Number(ri.quantity ?? 0);

            const unitCost = getUnitCost(ingredientPrice, purchaseQty);

            return sum + unitCost * qty;
          }, 0) ?? 0;

        costs[recipe.id] = total;
      });

      setRecipeCosts(costs);
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;

    load();
  }, [load, user]);

  useEffect(() => {
    if (!detailOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRecipeForm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeRecipeForm, detailOpen]);

  const updateRecipeLine = (index: number, nextLine: Partial<RecipeLineForm>) => {
    setRecipeForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...nextLine } : line,
      ),
    }));
  };

  const addRecipeLine = () => {
    setRecipeForm((current) => ({
      ...current,
      lines: [...current.lines, { id: null, ingredient_id: "", quantity: "0", unit: "" }],
    }));
  };

  const removeRecipeLine = (index: number) => {
    setRecipeForm((current) => {
      const line = current.lines[index];
      if (line?.id) {
        setDeletedLineIds((ids) => [...ids, line.id as string]);
      }

      return {
        ...current,
        lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
      };
    });
  };

  const saveRecipe = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const name = recipeForm.name.trim();
    if (!name) {
      setError("Recipe name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const recipePayload = {
      name,
      type: recipeForm.type.trim() || "dish",
      selling_price: Number(recipeForm.selling_price) || 0,
    };

    let recipeId = selectedRecipe?.id ?? null;

    if (formMode === "create") {
      const { data: createdRecipe, error: recipeError } = await supabase
        .from("recipes")
        .insert({
          ...recipePayload,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (recipeError) {
        setSaving(false);
        setError(recipeError.message);
        return;
      }

      recipeId = createdRecipe?.id ?? null;
    } else if (recipeId) {
      const { error: recipeError } = await supabase
        .from("recipes")
        .update(recipePayload)
        .eq("id", recipeId);

      if (recipeError) {
        setSaving(false);
        setError(recipeError.message);
        return;
      }
    }

    if (!recipeId) {
      setSaving(false);
      setError("Unable to save recipe.");
      return;
    }

    const deleteRequests = deletedLineIds.map((lineId) =>
      supabase.from("recipe_ingredients").delete().eq("id", lineId),
    );

    const editableLines = recipeForm.lines.filter((line) => line.ingredient_id);

    const updateRequests = editableLines
      .filter((line) => line.id)
      .map((line) =>
        supabase
          .from("recipe_ingredients")
          .update({
            ingredient_id: line.ingredient_id,
            quantity: Number(line.quantity) || 0,
            unit: line.unit || getIngredientUnit(line.ingredient_id, ingredientOptions),
          })
          .eq("id", line.id),
      );

    const newLines = editableLines
      .filter((line) => !line.id)
      .map((line) => ({
        user_id: user.id,
        recipe_id: recipeId,
        ingredient_id: line.ingredient_id,
        quantity: Number(line.quantity) || 0,
        unit: line.unit || getIngredientUnit(line.ingredient_id, ingredientOptions),
      }));

    const lineResults = await Promise.all([...deleteRequests, ...updateRequests]);
    const lineError = lineResults.find((result) => result.error)?.error;

    if (lineError) {
      setSaving(false);
      setError(lineError.message);
      return;
    }

    if (newLines.length > 0) {
      const { error: insertError } = await supabase.from("recipe_ingredients").insert(newLines);

      if (insertError) {
        setSaving(false);
        setError(insertError.message);
        return;
      }
    }

    setDeletedLineIds([]);
    await load(recipeId);
    setFormMode("edit");
    setSaving(false);
  };

  return (
    <AppShell
      title="Recipes"
      subtitle="Per-dish food cost, margin and contribution."
      action={
        <button
          type="button"
          onClick={openNewRecipe}
          className="inline-flex items-center gap-2 cursor-pointer bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New recipe
        </button>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(recipes ?? []).map((r) => {
          const price = r.selling_price ?? 0;

          const cost = Number(recipeCosts?.[r.id] ?? 0);

          const margin = price > 0 ? ((price - cost) / price) * 100 : 0;

          const fc = price > 0 ? (cost / price) * 100 : 0;

          const healthy = margin >= 65;

          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => openRecipe(r)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openRecipe(r);
                }
              }}
              aria-label={`Open ${r.name} recipe details`}
              className="group h-full cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            >
              <Card className="h-full border-border transition-all group-hover:border-foreground/20 group-hover:shadow-md group-focus-visible:border-foreground/20 group-focus-visible:shadow-md">
                <div className="flex h-full flex-col text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{r.type}</div>

                      <div className="text-base font-semibold mt-0.5 truncate">{r.name}</div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          healthy ? "text-success" : "text-destructive"
                        }`}
                      >
                        {healthy ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        Gross Margin {margin.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                    <Mini label="Selling Price" value={`€${r.selling_price ?? 0}`} />

                    <Mini label="Food Cost" value={`€${cost.toFixed(2)}`} />
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Food Cost %</span>

                      <span className="tabular-nums">{fc.toFixed(1)}%</span>
                    </div>

                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          fc > 35 ? "bg-destructive" : fc > 30 ? "bg-warning" : "bg-success"
                        }`}
                        style={{
                          width: `${Math.min(fc * 2, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={closeRecipeForm}
        >
          <form
            onSubmit={saveRecipe}
            onClick={(event) => event.stopPropagation()}
            className="bg-background border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-3xl font-bold">
                  {formMode === "create" ? "New recipe" : "Edit recipe"}
                </div>

                <div className="mt-2 text-muted-foreground">
                  {formMode === "create"
                    ? "Create a recipe and add ingredient quantities."
                    : "Update recipe details and ingredient quantities."}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeRecipeForm}
                  className="text-sm border border-border rounded-lg px-3 py-2"
                >
                  Close
                </button>
                <button
                  disabled={saving}
                  type="submit"
                  className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {formMode === "create" ? "Create recipe" : "Save changes"}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 mb-6">
              <label className="text-sm font-medium text-muted-foreground">
                Name
                <input
                  required
                  value={recipeForm.name}
                  onChange={(event) => setRecipeForm({ ...recipeForm, name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                />
              </label>

              <label className="text-sm font-medium text-muted-foreground">
                Type
                <select
                  value={recipeForm.type}
                  onChange={(event) => setRecipeForm({ ...recipeForm, type: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                >
                  <option value="dish">Dish</option>
                  <option value="prep">Prep</option>
                </select>
              </label>

              <label className="text-sm font-medium text-muted-foreground">
                Selling price (€)
                <input
                  required
                  type="number"
                  step="0.01"
                  value={recipeForm.selling_price}
                  onChange={(event) =>
                    setRecipeForm({
                      ...recipeForm,
                      selling_price: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl border border-border p-4">
                <div className="text-sm text-muted-foreground">Selling price</div>

                <div className="text-3xl font-bold mt-1">
                  €{Number(recipeForm.selling_price || 0).toFixed(2)}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="text-sm text-muted-foreground">Total cost</div>

                <div className="text-3xl font-bold mt-1">
                  €
                  {Number(
                    getFormRecipeCost(recipeForm.lines, selectedRecipe, ingredientOptions),
                  ).toFixed(2)}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="text-sm text-muted-foreground">Gross Margin %</div>

                <div className="text-3xl font-bold mt-1 text-success">
                  {(
                    ((Number(recipeForm.selling_price || 0) -
                      Number(
                        getFormRecipeCost(recipeForm.lines, selectedRecipe, ingredientOptions),
                      )) /
                      (Number(recipeForm.selling_price || 0) || 1)) *
                    100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                <div className="font-semibold">Recipe lines</div>
                <button
                  type="button"
                  onClick={addRecipeLine}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add line
                </button>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-5 py-3">Ingredient</th>

                    <th className="text-right px-5 py-3">Qty</th>

                    <th className="text-right px-5 py-3">Unit cost</th>

                    <th className="text-right px-5 py-3">Line cost</th>

                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>

                <tbody>
                  {recipeForm.lines.map((line, idx) => {
                    const ingredient = getIngredientForLine(
                      line.ingredient_id,
                      selectedRecipe?.recipe_ingredients ?? null,
                      ingredientOptions,
                    );
                    const ingredientPrice = Number(ingredient?.current_price ?? 0);

                    const purchaseQty = Number(ingredient?.purchase_quantity ?? 1);

                    const qty = Number(line.quantity ?? 0);

                    const unitCost = getUnitCost(ingredientPrice, purchaseQty);

                    const lineCost = unitCost * qty;

                    return (
                      <tr key={line.id ?? `new-${idx}`} className="border-t border-border">
                        <td className="px-5 py-3">
                          <select
                            value={line.ingredient_id}
                            onChange={(event) => {
                              const ingredientId = event.target.value;
                              updateRecipeLine(idx, {
                                ingredient_id: ingredientId,
                                unit: getIngredientUnit(ingredientId, ingredientOptions),
                              });
                            }}
                            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                          >
                            <option value="">Choose ingredient</option>
                            {ingredientOptions.map((ingredient) => (
                              <option key={ingredient.id} value={ingredient.id}>
                                {ingredient.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <input
                            required
                            type="number"
                            step="0.001"
                            min="0"
                            value={line.quantity}
                            onChange={(event) =>
                              updateRecipeLine(idx, { quantity: event.target.value })
                            }
                            className="ml-auto w-24 rounded-lg border border-input bg-card px-3 py-2 text-right text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                          />
                        </td>

                        <td className="px-5 py-3 text-right">€{unitCost.toFixed(4)}</td>

                        <td className="px-5 py-3 text-right font-medium">€{lineCost.toFixed(2)}</td>

                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeRecipeLine(idx)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                            aria-label="Remove recipe line"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
          </form>
        </div>
      )}
    </AppShell>
  );
}

function getIngredientUnit(ingredientId: string, ingredientOptions: IngredientOption[]) {
  return ingredientOptions.find((ingredient) => ingredient.id === ingredientId)?.unit ?? "kg";
}

function getUnitCost(price: number, purchaseQuantity: number) {
  const denominator =
    Number.isFinite(purchaseQuantity) && purchaseQuantity > 0 ? purchaseQuantity : 1;

  return price / denominator;
}

function getFormRecipeCost(
  lines: RecipeLineForm[],
  selectedRecipe: RecipeRow | null,
  ingredientOptions: IngredientOption[],
) {
  return lines.reduce((sum, line) => {
    const ingredient = getIngredientForLine(
      line.ingredient_id,
      selectedRecipe?.recipe_ingredients ?? null,
      ingredientOptions,
    );

    const unitCost = getUnitCost(
      Number(ingredient?.current_price ?? 0),
      Number(ingredient?.purchase_quantity ?? 1),
    );

    return sum + unitCost * (Number(line.quantity) || 0);
  }, 0);
}

function getIngredientForLine(
  ingredientId: string,
  recipeIngredients: RecipeIngredient[] | null,
  ingredientOptions: IngredientOption[],
) {
  return (
    recipeIngredients?.find((line) => line.ingredient_id === ingredientId)?.ingredients ??
    ingredientOptions.find((ingredient) => ingredient.id === ingredientId) ??
    null
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 border border-border py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>

      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
