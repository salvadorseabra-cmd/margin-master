import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import {
  ClipboardList,
  Download,
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  X,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { downloadRecipeTechnicalSheet } from "@/lib/recipe-technical-sheet";
import {
  formatCurrency,
  formatPercent,
  formatQuantityWithUnit,
  formatUnitCostCurrency,
} from "@/lib/display-format";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  loadOperationalIngredientCostOverlay,
  type OperationalInvoiceCostEntry,
} from "@/lib/ingredient-operational-intelligence";
import {
  canonicalCatalogIdSet,
  logPickerAliasLeaksIfAny,
  logRecipeCanonicalIntegrityOnLoad,
  logRecipeCanonicalIntegrityOnSave,
  recipeLineFoodCostSourceKind,
  resolveRecipeLineIngredientSource,
  traceRecipeLineFoodCostSource,
} from "@/lib/recipe-canonical-integrity";
import { traceFoodCostRecalculationSource } from "@/lib/recipe-canonical-graph-trace";
import { formatRecipeQuantityDisplay, parseRecipeQuantityInput } from "@/lib/recipe-quantity-input";
import {
  normalizeRecipeUsageUnitOption,
  RECIPE_USAGE_UNIT_OPTIONS,
  rememberRecipeUsageUnit,
  resolveRecipeUsageUnitForIngredient,
  type RecipeUsageUnitOption,
} from "@/lib/recipe-usage-unit-memory";
import { RecipeLinePicker } from "@/components/recipe-line-picker";
import { RecipeQuantityInput } from "@/components/recipe-quantity-input";
import { deleteRecipe, loadRecipeDeleteBlockers } from "@/lib/recipe-delete";
import {
  buildRecipeLinePickerOptions,
  parseRecipeLinePickerValue,
  recipeLinePickerValue,
  type RecipeLinePickerOption,
} from "@/lib/recipe-line-picker-options";
import {
  buildLinesByRecipeId,
  buildRecipesById,
  computePrepLineCost,
  computePrepUnitCost,
  computeRecipeLineCostEur,
  logPrepPropagation,
  logPrepUnitCost,
  logResolvedLineCost,
  computeRecipeTotalCostEur,
  formatPrepUnitCostLabel,
  recipeLineContributionPct,
} from "@/lib/recipe-prep-cost";
import {
  computePrepServingsPerBatch,
  formatPrepServingHint,
} from "@/lib/recipe-prep-servings";
import { cn } from "@/lib/utils";
import {
  computeFoodCostPct,
  computeGrossMarginPct,
  formatOptionalMarginPercent,
  getRecipeHealth,
  hasRecipeSellingPrice,
  isPrepRecipe,
  recipeSellingPriceForSave,
  recipeSellingPriceToFormValue,
  validateRecipeSellingPrice,
  type RecipeHealth,
} from "@/lib/recipe-selling-price";
import {
  buildOperationalIngredientCostById,
  enrichRecipeLinesForOperationalCost,
  logCostProp,
  logRecipeHydrate,
  OPERATIONAL_INGREDIENT_COST_CHANGED_EVENT,
  operationalIngredientCostFieldsForLine,
  resolveOperationalIngredientCostFields,
  resolveOperationalIngredientUnitCostEur,
} from "@/lib/resolve-operational-ingredient-cost";

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
  sub_recipe_id: string | null;
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
  sub_recipe: {
    id: string;
    name: string | null;
    type: string | null;
    output_quantity: number | null;
    output_unit: string | null;
  } | null;
};

type RecipeRow = {
  id: string;
  name: string;
  selling_price: number | null;
  type: string | null;
  output_quantity: number | null;
  output_unit: string | null;
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
  sub_recipe_id: string;
  quantity: string;
  unit: string;
  /** When true, ingredient re-picks do not replace the unit. */
  unitManuallySet: boolean;
};

type RecipeForm = {
  name: string;
  type: string;
  selling_price: string;
  output_quantity: string;
  output_unit: string;
  lines: RecipeLineForm[];
};

type RecipeFormMode = "create" | "edit";

type RecipeCostLine = {
  line: RecipeLineForm;
  ingredient: RecipeIngredient["ingredients"] | IngredientOption | null;
  subRecipe: RecipeIngredient["sub_recipe"] | null;
  isPrepLine: boolean;
  displayName: string;
  quantity: number;
  unitCost: number;
  unitCostLabel: string | null;
  unitCostWarning: string | null;
  prepServingHint: string | null;
  lineCost: number;
  contribution: number;
};

const emptyRecipeForm: RecipeForm = {
  name: "",
  type: "",
  selling_price: "",
  output_quantity: "",
  output_unit: "",
  lines: [],
};

function recipeLinePickerValueFromForm(line: RecipeLineForm): string {
  if (line.sub_recipe_id) return recipeLinePickerValue("prep", line.sub_recipe_id);
  if (line.ingredient_id) return recipeLinePickerValue("ingredient", line.ingredient_id);
  return "";
}

function recipeToForm(recipe: RecipeRow): RecipeForm {
  return {
    name: recipe.name,
    type: recipe.type ?? "dish",
    selling_price: recipeSellingPriceToFormValue(recipe.selling_price, recipe.type),
    output_quantity:
      recipe.output_quantity != null ? formatRecipeQuantityDisplay(Number(recipe.output_quantity)) : "",
    output_unit: isPrepRecipe(recipe.type ?? "dish")
      ? prepOutputUnitSelectValue(recipe.output_unit ?? "")
      : normalizeRecipeUsageUnitOption(recipe.output_unit) ?? "",
    lines:
      recipe.recipe_ingredients?.map((line) => ({
        id: line.id,
        ingredient_id: line.ingredient_id ?? "",
        sub_recipe_id: line.sub_recipe_id ?? "",
        quantity: formatRecipeQuantityDisplay(Number(line.quantity ?? 0)),
        unit:
          normalizeRecipeUsageUnitOption(line.unit) ??
          normalizeRecipeUsageUnitOption(line.ingredients?.unit) ??
          normalizeRecipeUsageUnitOption(line.sub_recipe?.output_unit) ??
          line.unit ??
          line.ingredients?.unit ??
          line.sub_recipe?.output_unit ??
          "",
        unitManuallySet: Boolean(line.unit?.trim()),
      })) ?? [],
  };
}

function RecipesPage() {
  const isChildRoute = useRouterState({
    select: (s) => s.location.pathname !== "/recipes",
  });
  if (isChildRoute) return <Outlet />;
  return <RecipesIndexPage />;
}

function RecipesIndexPage() {
  const { user } = useAuth();

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [invoiceOperationalCostByIngredientId, setInvoiceOperationalCostByIngredientId] =
    useState<Map<string, OperationalInvoiceCostEntry>>(() => new Map());
  /** Bumped on operational cost events so list cards recompute even if recipe rows are unchanged. */
  const [operationalCostEpoch, setOperationalCostEpoch] = useState(0);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRow | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(emptyRecipeForm);
  const [formMode, setFormMode] = useState<RecipeFormMode>("edit");
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const linePickerOpenCountRef = useRef(0);
  const [pendingRecipeDelete, setPendingRecipeDelete] = useState(false);
  const [checkingRecipeDelete, setCheckingRecipeDelete] = useState(false);

  const openRecipe = (recipe: RecipeRow) => {
    setFormMode("edit");
    setEditingRecipeId(recipe.id);
    setSelectedRecipe(recipe);
    setRecipeForm(recipeToForm(recipe));
    setDeletedLineIds([]);
    setError(null);
    setDetailOpen(true);
  };

  const openNewRecipe = () => {
    setFormMode("create");
    setEditingRecipeId(null);
    setSelectedRecipe(null);
    setRecipeForm({
      ...emptyRecipeForm,
      type: "dish",
      lines: [
        {
          id: null,
          ingredient_id: "",
          sub_recipe_id: "",
          quantity: "0",
          unit: "",
          unitManuallySet: false,
        },
      ],
    });
    setDeletedLineIds([]);
    setError(null);
    setDetailOpen(true);
  };

  const handleLinePickerOpenChange = useCallback((open: boolean) => {
    linePickerOpenCountRef.current = Math.max(0, linePickerOpenCountRef.current + (open ? 1 : -1));
  }, []);

  const closeRecipeForm = useCallback(() => {
    linePickerOpenCountRef.current = 0;
    setDetailOpen(false);
    setEditingRecipeId(null);
    setSelectedRecipe(null);
    setRecipeForm(emptyRecipeForm);
    setFormMode("edit");
    setDeletedLineIds([]);
    setPendingRecipeDelete(false);
    setCheckingRecipeDelete(false);
    setSaving(false);
    setError(null);
  }, []);

  const load = useCallback(
    async (activeRecipeId?: string) => {
      if (!user) return;

      const [{ data: recipesData, error }, ingredientCatalog, confirmedAliases] = await Promise.all([
        supabase
          .from("recipes")
          .select(
            `
          id,
          name,
          selling_price,
          type,
          output_quantity,
          output_unit,
          recipe_ingredients!recipe_ingredients_recipe_id_fkey (
            id,
            ingredient_id,
            sub_recipe_id,
            quantity,
            unit,
            created_at,
            ingredients (
            id,
            name,
            unit,
            current_price,
            purchase_quantity
           ),
            sub_recipe:recipes!recipe_ingredients_sub_recipe_id_fkey (
              id,
              name,
              type,
              output_quantity,
              output_unit
            )
            )
          )
        `,
          )
          .order("name", { ascending: true }),
        loadCanonicalIngredientCatalog(supabase, "current_price, purchase_quantity"),
        loadConfirmedIngredientAliasMap(supabase),
      ]);

      console.log(error);

      const loadedRecipes = (recipesData ?? []) as RecipeRow[];
      if (ingredientCatalog.error) {
        console.error("[recipes] ingredients catalog load failed:", ingredientCatalog.error);
      }
      const catalogRows = ingredientCatalog.rows ?? [];
      const pickerRows = catalogRows as IngredientOption[];
      const invoiceOverlay = await loadOperationalIngredientCostOverlay(
        supabase,
        catalogRows,
        confirmedAliases,
      );
      logRecipeHydrate({
        recipeCount: loadedRecipes.length,
        catalogRowCount: catalogRows.length,
        overlayEntryCount: invoiceOverlay.size,
        trigger: activeRecipeId ? "recipe_save_reload" : "catalog_reload",
      });
      setIngredientOptions(pickerRows);
      setInvoiceOperationalCostByIngredientId(invoiceOverlay);
      setRecipes(loadedRecipes);
      logCostProp({
        trigger: "catalog_reload",
        source: "catalog",
      });
      traceFoodCostRecalculationSource("recipes_catalog_loaded", {
        surface: "recipes",
        catalogRowCount: pickerRows.length,
        recalcTrigger: "catalog_reload",
      });
      logPickerAliasLeaksIfAny(
        pickerRows.map((row) => ({ id: row.id, name: row.name })),
        catalogRows,
        "recipes.ingredientOptions",
      );

      if (activeRecipeId) {
        const activeRecipe =
          loadedRecipes.find((recipe: RecipeRow) => recipe.id === activeRecipeId) ?? null;

        setSelectedRecipe(activeRecipe);
        if (activeRecipe) setRecipeForm(recipeToForm(activeRecipe));
      }

      const canonicalIds = canonicalCatalogIdSet(catalogRows);
      const recipeLines = loadedRecipes.flatMap((recipe) =>
        (recipe.recipe_ingredients ?? [])
          .filter((line) => line.ingredient_id)
          .map((line) => ({
            recipeId: recipe.id,
            lineId: line.id,
            ingredientId: line.ingredient_id as string,
            ingredientName: line.ingredients?.name ?? null,
            embed: line.ingredients
              ? {
                  name: line.ingredients.name,
                  current_price: line.ingredients.current_price,
                  purchase_quantity: line.ingredients.purchase_quantity,
                }
              : null,
          })),
      );

      loadedRecipes.forEach((recipe) => {
        (recipe.recipe_ingredients ?? []).forEach((line) => {
          if (!line.ingredient_id) return;
          const resolution = resolveRecipeLineIngredientSource(
            line.ingredient_id,
            recipe.recipe_ingredients,
            pickerRows,
          );
          traceRecipeLineFoodCostSource({
            surface: "recipes.load.listCost",
            recipeId: recipe.id,
            lineId: line.id,
            ingredientId: line.ingredient_id,
            source: recipeLineFoodCostSourceKind(line.ingredient_id, canonicalIds, resolution),
            inCanonicalCatalog: canonicalIds.has(line.ingredient_id),
          });
        });
      });

      logRecipeCanonicalIntegrityOnLoad({
        recipes: loadedRecipes.map((r) => ({ id: r.id, name: r.name })),
        recipeLines,
        catalog: catalogRows,
        recalcTrigger: "catalog_reload",
      });
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;

    load();
  }, [load, user]);

  useEffect(() => {
    const onOperationalCostChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ trigger?: string; ingredientId?: string }>).detail;
      logCostProp({
        trigger: detail?.trigger ?? "operational_ingredient_cost_changed",
        ingredientId: detail?.ingredientId ?? null,
      });
      traceFoodCostRecalculationSource("catalog_reload", {
        surface: "recipes",
        note: "operational_ingredient_cost_changed_event",
        ingredientId: detail?.ingredientId,
        trigger: detail?.trigger,
      });
      void load();
    };
    window.addEventListener(OPERATIONAL_INGREDIENT_COST_CHANGED_EVENT, onOperationalCostChanged);
    return () =>
      window.removeEventListener(
        OPERATIONAL_INGREDIENT_COST_CHANGED_EVENT,
        onOperationalCostChanged,
      );
  }, [load]);

  useEffect(() => {
    if (!detailOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (linePickerOpenCountRef.current > 0) return;
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
      lines: [
        ...current.lines,
        {
          id: null,
          ingredient_id: "",
          sub_recipe_id: "",
          quantity: "0",
          unit: "",
          unitManuallySet: false,
        },
      ],
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

  const requestDeleteRecipe = async () => {
    if (!user || !editingRecipeId || formMode !== "edit") return;

    setCheckingRecipeDelete(true);
    setError(null);

    const { blockers, error: blockerError } = await loadRecipeDeleteBlockers(
      supabase,
      editingRecipeId,
    );

    setCheckingRecipeDelete(false);

    if (blockerError) {
      setError(blockerError);
      return;
    }

    if (blockers.blocked) {
      const names = blockers.dependentRecipeNames;
      setError(
        names.length
          ? `${blockers.message} Used in: ${names.join(", ")}.`
          : (blockers.message ?? "This recipe cannot be deleted."),
      );
      return;
    }

    setPendingRecipeDelete(true);
  };

  const confirmDeleteRecipe = async () => {
    if (!user || !editingRecipeId) return;

    setPendingRecipeDelete(false);
    setSaving(true);
    setError(null);

    const { error: deleteError } = await deleteRecipe(supabase, editingRecipeId, user.id);

    setSaving(false);

    if (deleteError) {
      setError(deleteError);
      return;
    }

    closeRecipeForm();
    await load();
  };

  const saveRecipe = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const name = recipeForm.name.trim();
    if (!name) {
      setError("Recipe name is required.");
      return;
    }

    const sellingPriceError = validateRecipeSellingPrice(recipeForm.selling_price, recipeForm.type);
    if (sellingPriceError) {
      setError(sellingPriceError);
      return;
    }

    const recipeType = recipeForm.type.trim() || "dish";
    if (isPrepRecipe(recipeType)) {
      const outputQty = parseRecipeQuantityInput(recipeForm.output_quantity);
      if (outputQty == null || outputQty <= 0) {
        setError("Batch output quantity must be greater than 0 for prep recipes.");
        return;
      }
    }

    const prepLinesMissingYield = recipeForm.lines.filter((line) => {
      if (!line.sub_recipe_id) return false;
      const prep = recipes.find((recipe) => recipe.id === line.sub_recipe_id);
      const qty = Number(prep?.output_quantity);
      return !Number.isFinite(qty) || qty <= 0;
    });
    if (prepLinesMissingYield.length > 0) {
      const names = prepLinesMissingYield
        .map((line) => recipes.find((recipe) => recipe.id === line.sub_recipe_id)?.name)
        .filter(Boolean);
      setError(
        names.length
          ? `Prep "${names.join('", "')}" has no batch output — set output quantity on the prep recipe for costing.`
          : "A linked prep recipe has no batch output quantity.",
      );
      return;
    }

    setSaving(true);
    setError(null);

    const recipePayload = {
      name,
      type: recipeType,
      selling_price: recipeSellingPriceForSave(recipeForm.selling_price, recipeForm.type),
      output_quantity: isPrepRecipe(recipeType)
        ? parseRecipeQuantityInput(recipeForm.output_quantity)
        : null,
      output_unit: isPrepRecipe(recipeType)
        ? prepOutputUnitSelectValue(recipeForm.output_unit)
        : null,
    };

    let recipeId = editingRecipeId ?? selectedRecipe?.id ?? null;
    const isEditing = recipeId != null;
    const mode = isEditing ? "update" : "create";
    const wasCreate = !isEditing;

    console.log("[RECIPE_SAVE_MODE]", { recipeId, mode, isEditing });

    if (isEditing) {
      const { error: recipeError } = await supabase
        .from("recipes")
        .update(recipePayload)
        .eq("id", recipeId);

      if (recipeError) {
        setSaving(false);
        setError(recipeError.message);
        return;
      }
    } else {
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
    }

    if (!recipeId) {
      setSaving(false);
      setError("Unable to save recipe.");
      return;
    }

    const deleteRequests = deletedLineIds.map((lineId) =>
      supabase.from("recipe_ingredients").delete().eq("id", lineId),
    );

    const editableLines = recipeForm.lines.filter(
      (line) => line.ingredient_id || line.sub_recipe_id,
    );

    logRecipeCanonicalIntegrityOnSave({
      recipeId,
      lines: editableLines.map((line) => ({
        lineId: line.id,
        ingredientId: line.ingredient_id,
      })),
      catalog: ingredientOptions.map((row) => ({
        id: row.id,
        name: row.name,
        normalized_name: row.name.toLowerCase(),
      })),
    });

    const updateRequests = editableLines
      .filter((line) => line.id)
      .map((line) =>
        supabase
          .from("recipe_ingredients")
          .update({
            ingredient_id: line.sub_recipe_id ? null : line.ingredient_id,
            sub_recipe_id: line.sub_recipe_id || null,
            quantity: parseRecipeQuantityInput(line.quantity) ?? 0,
            unit:
              line.unit ||
              getLineDefaultUnit(line, ingredientOptions, recipes, user.id),
          })
          .eq("id", line.id),
      );

    const newLines = editableLines
      .filter((line) => !line.id)
      .map((line) => ({
        recipe_id: recipeId,
        ingredient_id: line.sub_recipe_id ? null : line.ingredient_id,
        sub_recipe_id: line.sub_recipe_id || null,
        quantity: parseRecipeQuantityInput(line.quantity) ?? 0,
        unit:
          line.unit ||
          getLineDefaultUnit(line, ingredientOptions, recipes, user.id),
      }));

    const lineResults = await Promise.all([...deleteRequests, ...updateRequests]);
    const lineError = lineResults.find((result) => result.error)?.error;

    if (lineError) {
      setSaving(false);
      setError(lineError.message);
      return;
    }

    if (newLines.length > 0) {
      console.log("[RECIPE_INGREDIENT_INSERT]", newLines);
      const { error: insertError } = await supabase.from("recipe_ingredients").insert(newLines);

      if (insertError) {
        setSaving(false);
        setError(insertError.message);
        return;
      }
    }

    setDeletedLineIds([]);
    await load(recipeId);
    closeRecipeForm();
    toast(wasCreate ? "Recipe created" : "Recipe updated");

    traceFoodCostRecalculationSource("recipe_save_reload", {
      recipeId,
      surface: "recipes",
    });
  };

  const canonicalCatalogIds = useMemo(
    () => canonicalCatalogIdSet(ingredientOptions),
    [ingredientOptions],
  );

  const operationalCostByIngredientId = useMemo(
    () => buildOperationalIngredientCostById(ingredientOptions),
    [ingredientOptions],
  );

  const liveRecipeCosts = useMemo(() => {
    if (recipes.length === 0) return {} as Record<string, number>;

    const linesByRecipe = buildLinesByRecipeId(
      recipes.map((recipe) => ({
        id: recipe.id,
        recipe_ingredients: enrichRecipeLinesForOperationalCost(
          (recipe.recipe_ingredients ?? []).map((row) => ({
            ingredient_id: row.ingredient_id,
            sub_recipe_id: row.sub_recipe_id,
            quantity: row.quantity,
            unit: row.unit,
            ingredients: row.ingredients,
          })),
          operationalCostByIngredientId,
          invoiceOperationalCostByIngredientId,
          { trigger: "list_recalc" },
        ),
      })),
    );
    const recipesById = buildRecipesById(
      recipes.map((recipe) => ({
        id: recipe.id,
        output_quantity: recipe.output_quantity,
        output_unit: recipe.output_unit,
      })),
    );
    const costs: Record<string, number> = {};
    for (const recipe of recipes) {
      const path = new Set<string>();
      const memo = new Map<string, number>();
      costs[recipe.id] =
        computeRecipeTotalCostEur(recipe.id, linesByRecipe, recipesById, path, memo) ?? 0;
      const topIngredientLine = (recipe.recipe_ingredients ?? []).find((line) => line.ingredient_id);
      if (topIngredientLine?.ingredient_id) {
        const { fields, source, chosenDate, latestInvoiceUnitCost } =
          resolveOperationalIngredientCostFields(
            topIngredientLine.ingredient_id,
            operationalCostByIngredientId,
            topIngredientLine.ingredients,
            invoiceOperationalCostByIngredientId,
            { trigger: "list_recalc" },
          );
        logCostProp({
          trigger: "list_recalc",
          recipeId: recipe.id,
          ingredientId: topIngredientLine.ingredient_id,
          totalFoodCost: costs[recipe.id],
          unitCostEur: resolveOperationalIngredientUnitCostEur(
            topIngredientLine.ingredient_id,
            operationalCostByIngredientId,
            topIngredientLine.ingredients,
            invoiceOperationalCostByIngredientId,
          ),
          resolvedPrice: fields.current_price,
          purchaseQuantity: fields.purchase_quantity,
          source,
          chosenDate,
          latestInvoiceUnitCost,
        });
      } else {
        logCostProp({
          trigger: "list_recalc",
          recipeId: recipe.id,
          totalFoodCost: costs[recipe.id],
        });
      }
    }
    traceFoodCostRecalculationSource("compute_recipe_cost", {
      surface: "recipes.list_cards",
      recipeCount: recipes.length,
      operationalCostEpoch,
    });
    return costs;
  }, [
    operationalCostByIngredientId,
    invoiceOperationalCostByIngredientId,
    operationalCostEpoch,
    recipes,
  ]);

  const linePickerOptions = useMemo(
    () =>
      buildRecipeLinePickerOptions({
        ingredients: ingredientOptions.map((row) => ({
          id: row.id,
          name: row.name,
          unit: row.unit,
        })),
        prepRecipes: recipes
          .filter((recipe) => isPrepRecipe(recipe.type))
          .map((recipe) => ({
            id: recipe.id,
            name: recipe.name,
            output_unit: recipe.output_unit,
          })),
        excludeRecipeId: editingRecipeId,
      }),
    [editingRecipeId, ingredientOptions, recipes],
  );

  const prepOutputOverride = useMemo(
    () =>
      isPrepRecipe(recipeForm.type)
        ? {
            output_quantity: parseRecipeQuantityInput(recipeForm.output_quantity),
            output_unit: prepOutputUnitSelectValue(recipeForm.output_unit),
          }
        : null,
    [recipeForm.output_quantity, recipeForm.output_unit, recipeForm.type],
  );

  const prepUnitCostById = useMemo(() => {
    const linesByRecipe = buildLinesByRecipeId(
      recipes.map((recipe) => ({
        id: recipe.id,
        recipe_ingredients:
          selectedRecipe?.id === recipe.id
            ? enrichRecipeLinesForOperationalCost(
                recipeForm.lines
                  .filter((line) => line.ingredient_id || line.sub_recipe_id)
                  .map((line) => {
                    return {
                      ingredient_id: line.sub_recipe_id ? null : line.ingredient_id || null,
                      sub_recipe_id: line.sub_recipe_id || null,
                      quantity: parseRecipeQuantityInput(line.quantity) ?? 0,
                      unit: line.unit || null,
                      ingredients: line.ingredient_id
                        ? operationalIngredientCostFieldsForLine(
                            line.ingredient_id,
                            operationalCostByIngredientId,
                            recipeLineEmbedCostSnapshot(
                              line.ingredient_id,
                              selectedRecipe?.recipe_ingredients ?? null,
                            ),
                            invoiceOperationalCostByIngredientId,
                          )
                        : null,
                    };
                  }),
                operationalCostByIngredientId,
                invoiceOperationalCostByIngredientId,
              )
            : enrichRecipeLinesForOperationalCost(
                (recipe.recipe_ingredients ?? []).map((row) => ({
                  ingredient_id: row.ingredient_id,
                  sub_recipe_id: row.sub_recipe_id,
                  quantity: row.quantity,
                  unit: row.unit,
                  ingredients: row.ingredients,
                })),
                operationalCostByIngredientId,
                invoiceOperationalCostByIngredientId,
              ),
      })),
    );
    const recipesById = buildRecipesById(
      recipes.map((recipe) => ({
        id: recipe.id,
        output_quantity:
          selectedRecipe?.id === recipe.id && prepOutputOverride
            ? prepOutputOverride.output_quantity
            : recipe.output_quantity,
        output_unit:
          selectedRecipe?.id === recipe.id && prepOutputOverride
            ? prepOutputOverride.output_unit
            : recipe.output_unit,
      })),
    );
    const map = new Map<string, number>();
    for (const recipe of recipes) {
      if (!isPrepRecipe(recipe.type)) continue;
      map.set(
        recipe.id,
        computePrepUnitCost(recipe.id, linesByRecipe, recipesById, { trigger: "prepUnitCostById" }),
      );
    }
    return map;
  }, [
    ingredientOptions,
    invoiceOperationalCostByIngredientId,
    operationalCostByIngredientId,
    prepOutputOverride,
    recipeForm.lines,
    recipes,
    selectedRecipe,
  ]);

  const recipeCostLines = useMemo(
    () =>
      getRecipeCostLines({
        lines: recipeForm.lines,
        selectedRecipe,
        allRecipes: recipes,
        ingredientOptions,
        operationalCostByIngredientId,
        invoiceOperationalCostByIngredientId,
        pickerOptions: linePickerOptions,
        canonicalCatalogIds,
        prepOutputOverride,
        userId: user?.id,
      }),
    [
      canonicalCatalogIds,
      ingredientOptions,
      invoiceOperationalCostByIngredientId,
      linePickerOptions,
      operationalCostByIngredientId,
      prepOutputOverride,
      recipeForm.lines,
      recipes,
      selectedRecipe,
      user?.id,
    ],
  );
  const recipeTotalCost = recipeCostLines.reduce((sum, line) => sum + line.lineCost, 0);

  useEffect(() => {
    if (!detailOpen || !selectedRecipe) return;
    logCostProp({
      trigger: "form_recalc",
      recipeId: selectedRecipe.id,
      totalFoodCost: recipeTotalCost,
    });
    traceFoodCostRecalculationSource("recipe_form_recalc", {
      recipeId: selectedRecipe.id,
      surface: "recipes.modal",
      totalFoodCost: recipeTotalCost,
    });
  }, [detailOpen, recipeTotalCost, selectedRecipe]);
  const sellingPriceOrNull = recipeSellingPriceForSave(recipeForm.selling_price, recipeForm.type);
  const sellingPrice = sellingPriceOrNull ?? 0;
  const grossProfit = hasRecipeSellingPrice(sellingPriceOrNull)
    ? sellingPriceOrNull - recipeTotalCost
    : null;
  const grossMargin = computeGrossMarginPct(sellingPriceOrNull, recipeTotalCost);
  const foodCostPercentage = computeFoodCostPct(sellingPriceOrNull, recipeTotalCost);
  const isPrepWithoutPrice =
    isPrepRecipe(recipeForm.type) && !hasRecipeSellingPrice(sellingPriceOrNull);
  const activeIngredientCount = recipeCostLines.filter(
    (line) => line.line.ingredient_id || line.line.sub_recipe_id,
  ).length;
  const topCostDrivers = [...recipeCostLines]
    .filter((line) => line.lineCost > 0)
    .sort((a, b) => b.lineCost - a.lineCost)
    .slice(0, 3);
  const highestCostDriver = topCostDrivers[0] ?? null;
  const recipeHealth = getRecipeHealth(
    sellingPriceOrNull,
    recipeTotalCost,
    foodCostPercentage,
    highestCostDriver?.contribution ?? 0,
    activeIngredientCount,
    recipeForm.type,
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
        .filter((line) => line.line.ingredient_id || line.line.sub_recipe_id)
        .map((line) => ({
          name: line.displayName || "Unnamed line",
          quantity: line.quantity,
          unit: line.line.unit || line.ingredient?.unit || "",
          unitCost: line.unitCost,
          lineCost: line.lineCost,
        })),
      totalFoodCost: recipeTotalCost,
      sellingPrice: sellingPriceOrNull,
      grossMargin,
    });
  };

  return (
    <AppShell
      title="Recipes"
      subtitle="Per-dish food cost, margin and contribution."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/recipes/migration-preview"
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted"
            title="Preview only — sem migração automática"
          >
            <ClipboardList className="h-4 w-4" />
            Pré-visualização migração
          </Link>
          <button
            type="button"
            onClick={openNewRecipe}
            className="inline-flex items-center gap-2 cursor-pointer bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New recipe
          </button>
        </div>
      }
    >
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(recipes ?? []).map((r) => {
          const priceOrNull = hasRecipeSellingPrice(r.selling_price) ? r.selling_price : null;
          const cost = Number(liveRecipeCosts[r.id] ?? 0);
          const margin = computeGrossMarginPct(priceOrNull, cost);
          const fc = computeFoodCostPct(priceOrNull, cost);
          const prepWithoutPrice = isPrepRecipe(r.type) && priceOrNull == null;
          const healthy = margin != null && margin >= 65;

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
                          prepWithoutPrice
                            ? "text-muted-foreground"
                            : healthy
                              ? "text-success"
                              : "text-destructive"
                        }`}
                      >
                        {prepWithoutPrice ? (
                          "No selling price"
                        ) : (
                          <>
                            {healthy ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            Gross Margin {formatOptionalMarginPercent(margin)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 text-center">
                    <Mini
                      label="Selling Price"
                      value={prepWithoutPrice ? "—" : formatCurrency(Number(priceOrNull ?? 0))}
                    />

                    <Mini label="Food Cost" value={formatCurrency(cost)} />
                  </div>

                  {fc != null ? (
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
                  ) : (
                    <div className="mt-4 text-xs text-muted-foreground">
                      Food cost % unavailable without selling price
                    </div>
                  )}
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
                        onChange={(event) => {
                          const type = event.target.value;
                          setRecipeForm({
                            ...recipeForm,
                            type,
                            output_unit:
                              isPrepRecipe(type) && !normalizeRecipeUsageUnitOption(recipeForm.output_unit)
                                ? "g"
                                : recipeForm.output_unit,
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                      >
                        <option value="dish">Dish</option>
                        <option value="prep">Prep</option>
                      </select>
                    </label>

                    <label className="text-sm font-medium text-muted-foreground sm:col-span-2">
                      Selling price (€)
                      {isPrepRecipe(recipeForm.type) ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          Optional
                        </span>
                      ) : null}
                      <input
                        required={!isPrepRecipe(recipeForm.type)}
                        type="number"
                        step="0.01"
                        min={isPrepRecipe(recipeForm.type) ? undefined : "0.01"}
                        placeholder={
                          isPrepRecipe(recipeForm.type) ? "Leave empty if not sold" : undefined
                        }
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

                    {isPrepRecipe(recipeForm.type) ? (
                      <>
                        <label className="text-sm font-medium text-muted-foreground sm:col-span-2">
                          Batch output quantity
                          <div className="mt-1 flex items-center gap-2">
                            <RecipeQuantityInput
                              value={recipeForm.output_quantity}
                              onChange={(output_quantity) =>
                                setRecipeForm({ ...recipeForm, output_quantity })
                              }
                              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                            />
                            <select
                              value={prepOutputUnitSelectValue(recipeForm.output_unit)}
                              onChange={(event) =>
                                setRecipeForm({ ...recipeForm, output_unit: event.target.value })
                              }
                              aria-label="Output unit"
                              className="w-[3.25rem] shrink-0 rounded-lg border border-input bg-background px-1 py-2 text-left text-xs text-foreground outline-none transition-colors focus:border-foreground/30"
                            >
                              {RECIPE_USAGE_UNIT_OPTIONS.map((unitOption) => (
                                <option key={unitOption} value={unitOption}>
                                  {unitOption}
                                </option>
                              ))}
                            </select>
                          </div>
                        </label>
                      </>
                    ) : null}
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
                        isPrepWithoutPrice
                          ? "bg-muted text-muted-foreground"
                          : recipeHealth.tone === "success"
                            ? "bg-success/10 text-success"
                            : recipeHealth.tone === "warning"
                              ? "bg-warning/10 text-warning"
                              : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {isPrepWithoutPrice
                        ? "Operational prep"
                        : `${formatPercent(foodCostPercentage ?? 0)} food cost`}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {recipeActivityNote && <OperationalNote text={recipeActivityNote} />}
                    <InsightRow
                      label="Primary margin exposure"
                      value={
                        highestCostDriver?.displayName
                          ? highestCostDriver.displayName
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
                <KpiCard
                  label="Selling price"
                  value={isPrepWithoutPrice ? "—" : formatCurrency(sellingPrice)}
                />
                <KpiCard label="Food cost" value={formatCurrency(recipeTotalCost)} />
                <KpiCard
                  label="Gross profit"
                  value={grossProfit == null ? "—" : formatCurrency(grossProfit)}
                />
                <KpiCard
                  label="Gross margin"
                  value={formatOptionalMarginPercent(grossMargin)}
                  tone={
                    grossMargin == null
                      ? undefined
                      : grossMargin >= 65
                        ? "success"
                        : grossMargin >= 55
                          ? "warning"
                          : "destructive"
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
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="truncate text-sm font-medium">
                                  {driver.displayName || "Unnamed line"}
                                </div>
                                {driver.isPrepLine ? (
                                  <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Prep
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatQuantityWithUnit(driver.quantity, driver.line.unit)}
                                {driver.unitCostLabel ? (
                                  <span className="ml-1 tabular-nums">· {driver.unitCostLabel}</span>
                                ) : null}
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

                          const isPrepRow = Boolean(line.sub_recipe_id);

                          return (
                            <tr
                              key={line.id ?? `new-${idx}`}
                              className={cn(
                                "align-middle transition-colors",
                                isPrepRow
                                  ? "border-l-2 border-l-border/70 bg-muted/20 hover:bg-muted/30 focus-within:bg-muted/30"
                                  : "hover:bg-muted/25 focus-within:bg-muted/25",
                              )}
                            >
                              <td className="px-4 py-3.5">
                                <div className="min-w-0 space-y-1">
                                  <RecipeLinePicker
                                    options={linePickerOptions}
                                    value={recipeLinePickerValueFromForm(line)}
                                    prepUnitCostById={prepUnitCostById}
                                    onOpenChange={handleLinePickerOpenChange}
                                    onChange={(pickerValue) => {
                                      const parsed = parseRecipeLinePickerValue(pickerValue);
                                      if (!parsed) {
                                        updateRecipeLine(idx, {
                                          ingredient_id: "",
                                          sub_recipe_id: "",
                                          unit: "",
                                          unitManuallySet: false,
                                        });
                                        return;
                                      }
                                      if (parsed.kind === "prep") {
                                        const prep = linePickerOptions.find(
                                          (option) =>
                                            option.kind === "prep" && option.id === parsed.id,
                                        );
                                        updateRecipeLine(idx, {
                                          ingredient_id: "",
                                          sub_recipe_id: parsed.id,
                                          ...(line.unitManuallySet
                                            ? {}
                                            : { unit: prep?.unit ?? "" }),
                                        });
                                        return;
                                      }
                                      const ingredient = ingredientOptions.find(
                                        (row) => row.id === parsed.id,
                                      );
                                      updateRecipeLine(idx, {
                                        ingredient_id: parsed.id,
                                        sub_recipe_id: "",
                                        ...(line.unitManuallySet || !ingredient
                                          ? {}
                                          : {
                                              unit: resolveRecipeUsageUnitForIngredient(
                                                user?.id,
                                                parsed.id,
                                                ingredient.name,
                                                ingredient.unit,
                                              ),
                                            }),
                                      });
                                    }}
                                  />
                                  {isPrepRow ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      Uses prep recipe
                                    </p>
                                  ) : null}
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="flex items-center justify-end gap-2">
                                    <RecipeQuantityInput
                                      required
                                      value={line.quantity}
                                      onChange={(quantity) => updateRecipeLine(idx, { quantity })}
                                      className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                                    />
                                    {line.ingredient_id || line.sub_recipe_id ? (
                                      <select
                                        value={recipeLineUsageUnitValue(
                                          line,
                                          ingredientOptions,
                                          recipes,
                                          user?.id,
                                        )}
                                        onChange={(event) => {
                                          const unit = event.target.value;
                                          updateRecipeLine(idx, {
                                            unit,
                                            unitManuallySet: true,
                                          });
                                          if (user?.id && line.ingredient_id) {
                                            rememberRecipeUsageUnit(
                                              user.id,
                                              line.ingredient_id,
                                              unit,
                                            );
                                          }
                                        }}
                                        aria-label="Usage unit"
                                        className="w-[3.25rem] shrink-0 rounded-lg border border-input bg-background px-1 py-2 text-left text-xs text-foreground outline-none transition-colors focus:border-foreground/30"
                                      >
                                        {RECIPE_USAGE_UNIT_OPTIONS.map((unitOption) => (
                                          <option key={unitOption} value={unitOption}>
                                            {unitOption}
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                  </div>
                                  {costLine?.prepServingHint ? (
                                    <p className="max-w-[12rem] text-[11px] leading-tight text-muted-foreground">
                                      {costLine.prepServingHint}
                                    </p>
                                  ) : null}
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                                <div className="flex flex-col items-end gap-0.5">
                                  <span>
                                    {costLine?.unitCostLabel ?? formatUnitCostCurrency(unitCost)}
                                  </span>
                                  {costLine?.unitCostWarning ? (
                                    <span className="max-w-[10rem] text-[10px] font-normal leading-tight text-muted-foreground/80">
                                      {costLine.unitCostWarning}
                                    </span>
                                  ) : null}
                                </div>
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeRecipeLine(idx)}
                                  aria-label="Remove recipe line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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

              <div className="flex flex-wrap items-center justify-end gap-2">
                {formMode === "edit" && (
                  <button
                    type="button"
                    disabled={saving || checkingRecipeDelete}
                    onClick={() => void requestDeleteRecipe()}
                    className="mr-auto inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/20 hover:bg-destructive/5 hover:text-destructive disabled:opacity-60"
                  >
                    {checkingRecipeDelete && <Loader2 className="h-4 w-4 animate-spin" />}
                    Delete recipe
                  </button>
                )}
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
        open={pendingRecipeDelete}
        onOpenChange={(open) => {
          if (!open) setPendingRecipeDelete(false);
        }}
        onConfirm={() => void confirmDeleteRecipe()}
        title="Delete recipe?"
        description="This action cannot be undone."
      />
    </AppShell>
  );
}

function getInferredIngredientUsageUnit(
  ingredientId: string,
  ingredientOptions: IngredientOption[],
  userId: string | undefined,
): string {
  const ingredient = ingredientOptions.find((row) => row.id === ingredientId);
  if (!ingredient) return "g";
  return resolveRecipeUsageUnitForIngredient(
    userId,
    ingredientId,
    ingredient.name,
    ingredient.unit,
  );
}

function getLineDefaultUnit(
  line: RecipeLineForm,
  ingredientOptions: IngredientOption[],
  allRecipes: RecipeRow[],
  userId?: string,
): string {
  if (line.sub_recipe_id) {
    const prep = allRecipes.find((recipe) => recipe.id === line.sub_recipe_id);
    return (
      normalizeRecipeUsageUnitOption(prep?.output_unit) ??
      normalizeRecipeUsageUnitOption(line.unit) ??
      prep?.output_unit ??
      line.unit ??
      "g"
    );
  }
  if (line.unitManuallySet && line.unit.trim()) {
    return normalizeRecipeUsageUnitOption(line.unit) ?? line.unit.trim();
  }
  return getInferredIngredientUsageUnit(line.ingredient_id, ingredientOptions, userId);
}

function prepOutputUnitSelectValue(unit: string): RecipeUsageUnitOption {
  return normalizeRecipeUsageUnitOption(unit) ?? "g";
}

function recipeLineUsageUnitValue(
  line: RecipeLineForm,
  ingredientOptions: IngredientOption[],
  allRecipes: RecipeRow[],
  userId: string | undefined,
): string {
  const normalized = normalizeRecipeUsageUnitOption(line.unit);
  if (normalized) return normalized;
  return getLineDefaultUnit(line, ingredientOptions, allRecipes, userId);
}

function getRecipeCostLines(input: {
  lines: RecipeLineForm[];
  selectedRecipe: RecipeRow | null;
  allRecipes: RecipeRow[];
  ingredientOptions: IngredientOption[];
  operationalCostByIngredientId: Map<
    string,
    { current_price: number | null; purchase_quantity: number | null }
  >;
  invoiceOperationalCostByIngredientId: Map<string, OperationalInvoiceCostEntry>;
  pickerOptions: RecipeLinePickerOption[];
  canonicalCatalogIds: Set<string>;
  prepOutputOverride?: { output_quantity: number | null; output_unit: string } | null;
  userId?: string;
}): RecipeCostLine[] {
  const {
    lines,
    selectedRecipe,
    allRecipes,
    ingredientOptions,
    operationalCostByIngredientId,
    invoiceOperationalCostByIngredientId,
    pickerOptions,
    canonicalCatalogIds,
    prepOutputOverride,
    userId,
  } = input;
  const formLinesForCost = lines
    .filter((line) => line.ingredient_id || line.sub_recipe_id)
    .map((line) => ({
      ingredient_id: line.sub_recipe_id ? null : line.ingredient_id || null,
      sub_recipe_id: line.sub_recipe_id || null,
      quantity: parseRecipeQuantityInput(line.quantity) ?? 0,
      unit: line.unit || null,
      ingredients: line.ingredient_id
        ? operationalIngredientCostFieldsForLine(
            line.ingredient_id,
            operationalCostByIngredientId,
            recipeLineEmbedCostSnapshot(
              line.ingredient_id,
              selectedRecipe?.recipe_ingredients ?? null,
            ),
            invoiceOperationalCostByIngredientId,
          )
        : null,
    }));

  const linesByRecipe = buildLinesByRecipeId(
    allRecipes.map((recipe) => ({
      id: recipe.id,
      recipe_ingredients: enrichRecipeLinesForOperationalCost(
        selectedRecipe?.id === recipe.id
          ? formLinesForCost
          : (recipe.recipe_ingredients ?? []).map((row) => ({
              ingredient_id: row.ingredient_id,
              sub_recipe_id: row.sub_recipe_id,
              quantity: row.quantity,
              unit: row.unit,
              ingredients: row.ingredients,
            })),
        operationalCostByIngredientId,
        invoiceOperationalCostByIngredientId,
      ),
    })),
  );
  const recipesById = buildRecipesById(
    allRecipes.map((recipe) => ({
      id: recipe.id,
      output_quantity:
        selectedRecipe?.id === recipe.id && prepOutputOverride
          ? prepOutputOverride.output_quantity
          : recipe.output_quantity,
      output_unit:
        selectedRecipe?.id === recipe.id && prepOutputOverride
          ? prepOutputOverride.output_unit
          : recipe.output_unit,
    })),
  );
  const path = new Set<string>();
  const memo = new Map<string, number>();

  const costLines = lines.map((line) => {
    const ingredient = line.ingredient_id
      ? getIngredientForLine(
          line.ingredient_id,
          selectedRecipe?.recipe_ingredients ?? null,
          ingredientOptions,
        )
      : null;
    const subRecipe =
      line.sub_recipe_id != null && line.sub_recipe_id !== ""
        ? (selectedRecipe?.recipe_ingredients?.find((row) => row.sub_recipe_id === line.sub_recipe_id)
            ?.sub_recipe ??
          allRecipes.find((recipe) => recipe.id === line.sub_recipe_id) ??
          null)
        : null;
    const pickerOption = pickerOptions.find(
      (option) =>
        (option.kind === "prep" && option.id === line.sub_recipe_id) ||
        (option.kind === "ingredient" && option.id === line.ingredient_id),
    );
    const displayName = line.sub_recipe_id
      ? subRecipe?.name ?? pickerOption?.name ?? "Prep"
      : formatCanonicalIngredientDisplayName(ingredient?.name) ||
        pickerOption?.name ||
        "Unnamed ingredient";

    if (line.ingredient_id) {
      const resolution = resolveRecipeLineIngredientSource(
        line.ingredient_id,
        selectedRecipe?.recipe_ingredients ?? null,
        ingredientOptions,
      );
      traceRecipeLineFoodCostSource({
        surface: "recipes.getRecipeCostLines",
        recipeId: selectedRecipe?.id,
        ingredientId: line.ingredient_id,
        source: recipeLineFoodCostSourceKind(line.ingredient_id, canonicalCatalogIds, resolution),
        inCanonicalCatalog: canonicalCatalogIds.has(line.ingredient_id),
      });
    }

    const quantity = parseRecipeQuantityInput(line.quantity) ?? 0;
    const usageUnit = recipeLineUsageUnitValue(
      line,
      ingredientOptions,
      allRecipes,
      userId,
    );
    const costLine = {
      ingredient_id: line.ingredient_id || null,
      sub_recipe_id: line.sub_recipe_id || null,
      quantity,
      unit: usageUnit || null,
      ingredients: line.ingredient_id
        ? operationalIngredientCostFieldsForLine(
            line.ingredient_id,
            operationalCostByIngredientId,
            recipeLineEmbedCostSnapshot(
              line.ingredient_id,
              selectedRecipe?.recipe_ingredients ?? null,
            ),
            invoiceOperationalCostByIngredientId,
          )
        : null,
    };
    const isPrepUsageLine = line.sub_recipe_id != null && line.sub_recipe_id !== "";
    const prep = isPrepUsageLine ? recipesById.get(line.sub_recipe_id) : undefined;
    let lineCost =
      computeRecipeLineCostEur(costLine, linesByRecipe, recipesById, path, memo) ?? 0;
    let unitCostWarning: string | null = null;
    logResolvedLineCost({
      recipeId: selectedRecipe?.id,
      ingredientId: line.ingredient_id || null,
      prepId: line.sub_recipe_id || null,
      quantity,
      unit: usageUnit || null,
      lineCostEur: lineCost,
      trigger: "getRecipeCostLines_initial",
    });
    if (line.ingredient_id) {
      const embed = recipeLineEmbedCostSnapshot(
        line.ingredient_id,
        selectedRecipe?.recipe_ingredients ?? null,
      );
      const { fields, source, chosenDate, latestInvoiceUnitCost } =
        resolveOperationalIngredientCostFields(
          line.ingredient_id,
          operationalCostByIngredientId,
          embed,
          invoiceOperationalCostByIngredientId,
          { trigger: "line_cost" },
        );
      logCostProp({
        trigger: "line_cost",
        recipeId: selectedRecipe?.id,
        ingredientId: line.ingredient_id,
        lineCost,
        unitCostEur: resolveOperationalIngredientUnitCostEur(
          line.ingredient_id,
          operationalCostByIngredientId,
          embed,
          invoiceOperationalCostByIngredientId,
        ),
        resolvedPrice: fields.current_price,
        purchaseQuantity: fields.purchase_quantity,
        source,
        chosenDate,
        latestInvoiceUnitCost,
      });
    }
    if (isPrepUsageLine) {
      const prepPath = new Set<string>();
      const prepMemo = new Map<string, number>();
      const prepTotal = computeRecipeTotalCostEur(
        line.sub_recipe_id,
        linesByRecipe,
        recipesById,
        prepPath,
        prepMemo,
      );
      if (prepTotal != null) {
        const prepLine = computePrepLineCost(
          quantity,
          usageUnit,
          prepTotal,
          prep?.output_quantity,
          prep?.output_unit,
        );
        unitCostWarning = prepLine.warning ?? null;
        lineCost = prepLine.cost ?? 0;
        logPrepPropagation({
          parentRecipeId: selectedRecipe?.id,
          prepId: line.sub_recipe_id,
          usageQuantity: quantity,
          usageUnit,
          batchTotalEur: prepTotal,
          lineCostEur: lineCost,
          outputQuantity: prep?.output_quantity,
          outputUnit: prep?.output_unit,
          trigger: "getRecipeCostLines",
        });
        logPrepUnitCost({
          prepId: line.sub_recipe_id,
          batchTotalEur: prepTotal,
          outputQuantity: prep?.output_quantity,
          outputUnit: prep?.output_unit,
          unitCostEur:
            quantity > 0 && lineCost != null ? lineCost / quantity : 0,
          trigger: "getRecipeCostLines_usage_unit",
        });
      }
      logResolvedLineCost({
        recipeId: selectedRecipe?.id,
        prepId: line.sub_recipe_id,
        quantity,
        unit: usageUnit || null,
        lineCostEur: lineCost,
        trigger: "getRecipeCostLines_prep",
      });
      logCostProp({
        trigger: "prep_line_cost",
        recipeId: selectedRecipe?.id,
        prepId: line.sub_recipe_id,
        lineCost,
      });
    }
    const unitCost = quantity > 0 ? lineCost / quantity : 0;
    const unitCostLabel =
      isPrepUsageLine && quantity > 0 && usageUnit
        ? formatPrepUnitCostLabel(unitCost, usageUnit)
        : null;
    const prepServings =
      isPrepUsageLine && quantity > 0 && usageUnit
        ? computePrepServingsPerBatch({
            prepOutputQty: prep?.output_quantity,
            prepOutputUnit: prep?.output_unit,
            usageQty: quantity,
            usageUnit,
          })
        : null;
    const prepServingHint =
      prepServings != null ? formatPrepServingHint(quantity, usageUnit, prepServings) : null;

    return {
      line,
      ingredient,
      subRecipe: subRecipe as RecipeIngredient["sub_recipe"] | null,
      isPrepLine: Boolean(line.sub_recipe_id),
      displayName,
      quantity,
      unitCost,
      unitCostLabel,
      unitCostWarning,
      prepServingHint,
      lineCost,
      contribution: 0,
    };
  });

  const totalCost = costLines.reduce((sum, line) => sum + line.lineCost, 0);

  return costLines.map((line) => ({
    ...line,
    contribution: recipeLineContributionPct(line.lineCost, totalCost),
  }));
}

function getRecipeActivityNote(
  recipe: RecipeRow | null,
  highestContribution: number,
  ingredientCount: number,
) {
  const lines =
    recipe?.recipe_ingredients?.filter((line) => line.ingredient_id || line.sub_recipe_id) ?? [];
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

function recipeLineEmbedCostSnapshot(
  ingredientId: string,
  recipeIngredients: RecipeIngredient[] | null,
) {
  const embed = recipeIngredients?.find((line) => line.ingredient_id === ingredientId)?.ingredients;
  if (!embed) return null;
  return {
    current_price: embed.current_price,
    purchase_quantity: embed.purchase_quantity,
  };
}

function getIngredientForLine(
  ingredientId: string,
  recipeIngredients: RecipeIngredient[] | null,
  ingredientOptions: IngredientOption[],
) {
  const catalog = ingredientOptions.find((ingredient) => ingredient.id === ingredientId);
  if (catalog) return catalog;
  return (
    recipeIngredients?.find((line) => line.ingredient_id === ingredientId)?.ingredients ?? null
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
