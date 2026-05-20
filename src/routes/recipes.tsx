import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Download, Loader2, Plus, Trash2, TrendingUp, TrendingDown, X } from "lucide-react";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { downloadRecipeTechnicalSheet } from "@/lib/recipe-technical-sheet";
import {
  formatCurrency,
  formatPercent,
  formatQuantityWithUnit,
  formatUnitCostCurrency,
} from "@/lib/display-format";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { loadActiveIngredientCatalog } from "@/lib/ingredient-catalog-load";

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
  created_at: string | null;
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

type RecipeCostLine = {
  line: RecipeLineForm;
  ingredient: RecipeIngredient["ingredients"] | IngredientOption | null;
  quantity: number;
  unitCost: number;
  lineCost: number;
  contribution: number;
};

type RecipeHealth = {
  label:
    | "Add quantities"
    | "No selling price"
    | "Margin protected"
    | "Cost concentration"
    | "Margin pressure"
    | "Margin below target";
  tone: "success" | "warning" | "destructive";
  helper: string;
};

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
  const [pendingDeleteLineIndex, setPendingDeleteLineIndex] = useState<number | null>(null);

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

      const [{ data: recipesData, error }, ingredientCatalog] = await Promise.all([
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
            created_at,
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
        loadActiveIngredientCatalog(supabase, "current_price, purchase_quantity"),
      ]);

      console.log(error);

      const loadedRecipes = (recipesData ?? []) as RecipeRow[];
      setRecipes(loadedRecipes);
      if (ingredientCatalog.error) {
        console.error("[recipes] ingredients catalog load failed:", ingredientCatalog.error);
      }
      setIngredientOptions((ingredientCatalog.rows ?? []) as IngredientOption[]);

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

  const confirmDeleteRecipeLine = () => {
    if (pendingDeleteLineIndex === null) return;
    const lineIndex = pendingDeleteLineIndex;
    setPendingDeleteLineIndex(null);
    removeRecipeLine(lineIndex);
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

  const recipeCostLines = getRecipeCostLines(recipeForm.lines, selectedRecipe, ingredientOptions);
  const recipeTotalCost = recipeCostLines.reduce((sum, line) => sum + line.lineCost, 0);
  const sellingPrice = Number(recipeForm.selling_price || 0);
  const grossProfit = sellingPrice - recipeTotalCost;
  const grossMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;
  const foodCostPercentage = sellingPrice > 0 ? (recipeTotalCost / sellingPrice) * 100 : 0;
  const activeIngredientCount = recipeCostLines.filter((line) => line.line.ingredient_id).length;
  const topCostDrivers = [...recipeCostLines]
    .filter((line) => line.lineCost > 0)
    .sort((a, b) => b.lineCost - a.lineCost)
    .slice(0, 3);
  const highestCostDriver = topCostDrivers[0] ?? null;
  const recipeHealth = getRecipeHealth(
    sellingPrice,
    recipeTotalCost,
    foodCostPercentage,
    highestCostDriver?.contribution ?? 0,
    activeIngredientCount,
  );
  const recipeActivityNote = getRecipeActivityNote(
    selectedRecipe,
    highestCostDriver?.contribution ?? 0,
    activeIngredientCount,
  );
  const highestCostDriverDetail = getHighestCostDriverDetail(highestCostDriver);
  const concentrationDetail = getConcentrationDetail(
    highestCostDriver?.contribution ?? 0,
    activeIngredientCount,
  );
  const downloadTechnicalSheet = () => {
    void downloadRecipeTechnicalSheet({
      recipeName: recipeForm.name,
      category: recipeForm.type,
      ingredients: recipeCostLines
        .filter((line) => line.line.ingredient_id)
        .map((line) => ({
          name: line.ingredient?.name ?? "Unnamed ingredient",
          quantity: line.quantity,
          unit: line.line.unit || line.ingredient?.unit || "",
          unitCost: line.unitCost,
          lineCost: line.lineCost,
        })),
      totalFoodCost: recipeTotalCost,
      sellingPrice,
      grossMargin,
    });
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
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              className="group h-full min-w-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            >
              <Card className="h-full min-w-0 border-border transition-all group-hover:border-foreground/20 group-hover:shadow-md group-focus-visible:border-foreground/20 group-focus-visible:shadow-md">
                <div className="flex h-full min-w-0 flex-col text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{r.type}</div>

                      <div className="mt-0.5 line-clamp-2 break-words text-base font-semibold leading-snug">
                        {r.name}
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col items-end gap-2 text-right">
                      <div
                        className={`flex max-w-full flex-wrap items-center justify-end gap-1 text-xs font-medium ${
                          healthy ? "text-success" : "text-destructive"
                        }`}
                      >
                        {healthy ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        Gross Margin {formatPercent(margin)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 text-center">
                    <Mini
                      label="Selling Price"
                      value={formatCurrency(Number(r.selling_price ?? 0))}
                    />

                    <Mini label="Food Cost" value={formatCurrency(cost)} />
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Food Cost %</span>

                      <span className="tabular-nums">{formatPercent(fc)}</span>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6"
          onClick={closeRecipeForm}
        >
          <form
            onSubmit={saveRecipe}
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-[960px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          >
            <div className="border-b border-border px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Recipe workspace
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight">
                    {formMode === "create" ? "Build a protected margin recipe" : recipeForm.name}
                  </div>
                  <div className="mt-2 max-w-xl text-sm text-muted-foreground">
                    Review cost, concentration, and margin before service.
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {formMode === "edit" && (
                    <button
                      type="button"
                      onClick={downloadTechnicalSheet}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download technical sheet</span>
                      <span className="sm:hidden">Download sheet</span>
                    </button>
                  )}
                  <div
                    className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-medium ${
                      recipeHealth.tone === "success"
                        ? "border-success/25 bg-success/10 text-success"
                        : recipeHealth.tone === "warning"
                          ? "border-warning/25 bg-warning/10 text-warning"
                          : "border-destructive/25 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {recipeHealth.label}
                  </div>
                  <button
                    type="button"
                    onClick={closeRecipeForm}
                    aria-label="Close recipe workspace"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
                  <div className="mb-4">
                    <div className="text-base font-semibold">Recipe setup</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Essentials stay editable as margin updates.
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm font-medium text-muted-foreground sm:col-span-3">
                      Recipe name
                      <input
                        required
                        value={recipeForm.name}
                        onChange={(event) =>
                          setRecipeForm({ ...recipeForm, name: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                      />
                    </label>

                    <label className="text-sm font-medium text-muted-foreground">
                      Type
                      <select
                        value={recipeForm.type}
                        onChange={(event) =>
                          setRecipeForm({ ...recipeForm, type: event.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                      >
                        <option value="dish">Dish</option>
                        <option value="prep">Prep</option>
                      </select>
                    </label>

                    <label className="text-sm font-medium text-muted-foreground sm:col-span-2">
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
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">Margin intelligence</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {recipeHealth.helper}
                      </div>
                    </div>
                    <div
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        recipeHealth.tone === "success"
                          ? "bg-success/10 text-success"
                          : recipeHealth.tone === "warning"
                            ? "bg-warning/10 text-warning"
                            : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {formatPercent(foodCostPercentage)} food cost
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {recipeActivityNote && <OperationalNote text={recipeActivityNote} />}
                    <InsightRow
                      label="Primary margin exposure"
                      value={
                        highestCostDriver?.ingredient?.name
                          ? highestCostDriver.ingredient.name
                          : "Add ingredients"
                      }
                      detail={highestCostDriverDetail}
                    />
                    <InsightRow
                      label="Cost concentration"
                      value={
                        highestCostDriver
                          ? `${formatPercent(highestCostDriver.contribution)} of recipe cost in one ingredient`
                          : "No concentration yet"
                      }
                      detail={concentrationDetail}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard label="Selling price" value={formatCurrency(sellingPrice)} />
                <KpiCard label="Food cost" value={formatCurrency(recipeTotalCost)} />
                <KpiCard label="Gross profit" value={formatCurrency(grossProfit)} />
                <KpiCard
                  label="Gross margin"
                  value={formatPercent(grossMargin)}
                  tone={
                    grossMargin >= 65 ? "success" : grossMargin >= 55 ? "warning" : "destructive"
                  }
                />
                <KpiCard label="Ingredients" value={String(activeIngredientCount)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
                <div className="rounded-2xl border border-border p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Top cost drivers</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Primary inputs behind recipe margin.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {topCostDrivers.length > 0 ? (
                      topCostDrivers.map((driver, index) => (
                        <div
                          key={`${driver.line.id ?? driver.line.ingredient_id}-${index}`}
                          className="rounded-xl border border-border bg-card/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {driver.ingredient?.name ?? "Unnamed ingredient"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatQuantityWithUnit(driver.quantity, driver.line.unit)}
                              </div>
                              {getCostDriverNote(
                                index,
                                driver.contribution,
                                activeIngredientCount,
                                driver.line.id,
                                selectedRecipe,
                              ) && (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {getCostDriverNote(
                                    index,
                                    driver.contribution,
                                    activeIngredientCount,
                                    driver.line.id,
                                    selectedRecipe,
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums">
                                {formatCurrency(driver.lineCost)}
                              </div>
                              <div className="text-xs text-muted-foreground tabular-nums">
                                {formatPercent(driver.contribution)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Add ingredient quantities to reveal recipe cost drivers.
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border">
                  <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                    <div>
                      <div className="font-semibold">Ingredient contribution</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Edit quantities and scan cost share.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addRecipeLine}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add line
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Ingredient</th>
                          <th className="px-4 py-3 text-right font-medium">Quantity</th>
                          <th className="px-4 py-3 text-right font-medium">Unit cost</th>
                          <th className="px-4 py-3 text-right font-medium">Cost</th>
                          <th className="px-4 py-3 text-right font-medium">Contribution</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-border">
                        {recipeForm.lines.map((line, idx) => {
                          const costLine = recipeCostLines[idx];
                          const unitCost = costLine?.unitCost ?? 0;
                          const lineCost = costLine?.lineCost ?? 0;
                          const contribution = costLine?.contribution ?? 0;

                          return (
                            <tr
                              key={line.id ?? `new-${idx}`}
                              className="align-middle transition-colors hover:bg-muted/25 focus-within:bg-muted/25"
                            >
                              <td className="px-4 py-3.5">
                                <select
                                  value={line.ingredient_id}
                                  onChange={(event) => {
                                    const ingredientId = event.target.value;
                                    updateRecipeLine(idx, {
                                      ingredient_id: ingredientId,
                                      unit: getIngredientUnit(ingredientId, ingredientOptions),
                                    });
                                  }}
                                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                                >
                                  <option value="">Choose ingredient</option>
                                  {ingredientOptions.map((ingredient) => (
                                    <option key={ingredient.id} value={ingredient.id}>
                                      {ingredient.name}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <input
                                    required
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={line.quantity}
                                    onChange={(event) =>
                                      updateRecipeLine(idx, { quantity: event.target.value })
                                    }
                                    className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                                  />
                                  <span className="w-10 text-left text-xs text-muted-foreground">
                                    {line.unit}
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                                {formatUnitCostCurrency(unitCost)}
                              </td>

                              <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                                {formatCurrency(lineCost)}
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                <span className="inline-flex min-w-16 justify-center rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground shadow-sm">
                                  {formatPercent(contribution)}
                                </span>
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteLineIndex(idx)}
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
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-h-5 text-sm">
                {error ? (
                  <span className="text-destructive">{error}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Changes stay local until you save this recipe.
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRecipeForm}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {formMode === "create" ? "Create recipe" : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      <ConfirmDeleteDialog
        open={pendingDeleteLineIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteLineIndex(null);
        }}
        onConfirm={confirmDeleteRecipeLine}
      />
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

function getRecipeCostLines(
  lines: RecipeLineForm[],
  selectedRecipe: RecipeRow | null,
  ingredientOptions: IngredientOption[],
): RecipeCostLine[] {
  const costLines = lines.map((line) => {
    const ingredient = getIngredientForLine(
      line.ingredient_id,
      selectedRecipe?.recipe_ingredients ?? null,
      ingredientOptions,
    );

    const unitCost = getUnitCost(
      Number(ingredient?.current_price ?? 0),
      Number(ingredient?.purchase_quantity ?? 1),
    );
    const quantity = Number(line.quantity) || 0;
    const lineCost = unitCost * quantity;

    return {
      line,
      ingredient,
      quantity,
      unitCost,
      lineCost,
      contribution: 0,
    };
  });

  const totalCost = costLines.reduce((sum, line) => sum + line.lineCost, 0);

  return costLines.map((line) => ({
    ...line,
    contribution: totalCost > 0 ? (line.lineCost / totalCost) * 100 : 0,
  }));
}

function getRecipeHealth(
  sellingPrice: number,
  totalCost: number,
  foodCostPercentage: number,
  highestContribution: number,
  ingredientCount: number,
): RecipeHealth {
  if (ingredientCount === 0 || totalCost <= 0) {
    return {
      label: "Add quantities",
      tone: "warning",
      helper: "Add quantities to see margin exposure.",
    };
  }

  if (sellingPrice <= 0) {
    return {
      label: "No selling price",
      tone: "destructive",
      helper: "Ingredient cost needs selling price cover.",
    };
  }

  const grossMargin = 100 - foodCostPercentage;
  const concentrationNeedsReview = highestContribution > 65 && ingredientCount > 1;

  if (grossMargin >= 65 && !concentrationNeedsReview) {
    return {
      label: "Margin protected",
      tone: "success",
      helper: "Margin protected; cost mix balanced.",
    };
  }

  if (grossMargin >= 65) {
    return {
      label: "Cost concentration",
      tone: "warning",
      helper: "Margin strong; primary ingredient drives exposure.",
    };
  }

  if (grossMargin >= 55 || foodCostPercentage <= 45) {
    return {
      label: "Margin pressure",
      tone: "warning",
      helper: "Margin workable; review price cover and top inputs.",
    };
  }

  return {
    label: "Margin below target",
    tone: "destructive",
    helper: "Food cost is eroding margin cover.",
  };
}

function getRecipeActivityNote(
  recipe: RecipeRow | null,
  highestContribution: number,
  ingredientCount: number,
) {
  const lines = recipe?.recipe_ingredients?.filter((line) => line.ingredient_id) ?? [];
  const recentlyLinked = lines.some((line) => isRecentDate(line.created_at));

  if (recentlyLinked) return "Recently updated ingredient links";
  if (highestContribution >= 65 && ingredientCount > 1) {
    return `${formatPercent(highestContribution)} of cost concentrated in one ingredient`;
  }

  return null;
}

function getHighestCostDriverDetail(driver: RecipeCostLine | null) {
  if (!driver) return "Cost drivers appear once recipe lines are added.";

  return `${formatCurrency(driver.lineCost)} · ${formatPercent(driver.contribution)} of cost · primary exposure if price or portion changes`;
}

function getConcentrationDetail(highestContribution: number, ingredientCount: number) {
  if (ingredientCount === 0) return "Add ingredient quantities to assess concentration.";

  if (ingredientCount === 1) {
    return "Single-ingredient recipe; margin follows this input.";
  }

  if (highestContribution >= 65) {
    return "High concentration; check price cover and portion control.";
  }

  if (highestContribution >= 45) {
    return "Meaningful concentration; keep this input visible during costing.";
  }

  return "Cost is spread across ingredients with no dominant input.";
}

function getCostDriverNote(
  index: number,
  contribution: number,
  ingredientCount: number,
  lineId: string | null,
  recipe: RecipeRow | null,
) {
  const activityNote = getRecipeLineActivityNote(lineId, recipe);
  if (activityNote) return activityNote;

  if (index !== 0 || ingredientCount <= 1) return null;
  if (contribution >= 65) return "Primary margin exposure";
  if (contribution >= 45) return "Main contributor to recipe volatility";

  return "Leading cost contributor";
}

function getRecipeLineActivityNote(lineId: string | null, recipe: RecipeRow | null) {
  if (!lineId) return null;

  const line = recipe?.recipe_ingredients?.find((recipeLine) => recipeLine.id === lineId);

  if (isRecentDate(line?.created_at)) return "Recently linked";

  return null;
}

function isRecentDate(value: string | null | undefined, days = 14) {
  if (!value) return false;

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;

  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
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
    <div className="min-w-0 rounded-lg border border-border bg-muted/50 py-2">
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>

      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: RecipeHealth["tone"];
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card/30 px-3 py-3">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1.5 truncate text-xl font-semibold tabular-nums ${
          tone === "success"
            ? "text-success"
            : tone === "warning"
              ? "text-warning"
              : tone === "destructive"
                ? "text-destructive"
                : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function InsightRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background/70 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function OperationalNote({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
      {text}
    </div>
  );
}
