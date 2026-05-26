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
import {
  buildTechnicalSheetIngredientsFromCostLines,
  downloadRecipeTechnicalSheet,
} from "@/lib/recipe-technical-sheet";
import { formatCurrency, formatPercent } from "@/lib/display-format";
import { formatDisplayUnitCostForContext } from "@/lib/display-unit-cost";
import { formatPackagedLiquidContextFromCostFields } from "@/lib/packaged-liquid-context";
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
  convertRecipeQuantityBetweenUnits,
  repairRecipeQuantityDoubleNormalization,
} from "@/lib/recipe-unit-normalization";
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
  computePrepUnitCost,
  computeRecipeTotalCostEurOrZero,
  formatPrepUnitCostLabel,
  recipeLineDisplayUnitCostEur,
  recipeLineDisplayUnitCostLabel,
  recipeLineContributionPct,
  resolvePrepUsageLineOperationalCost,
  sumResolvedRecipeFoodCostEur,
} from "@/lib/recipe-prep-cost";
import {
  computeRecipePricingSummaryFromRecipe,
  deriveRecipePricingSummary,
  deriveRecipePricingSummaryFromCostLines,
  formatContributionFooterLabel,
  formatPartialMarginDisplay,
  formatRecipeFoodCostDisplay,
  formatRecipeMarginDisplay,
  isRecipeLineCostUnresolved,
  logRecipePricingState,
  logSurfacePriceState,
  logSurfaceRecipePricingMismatch,
  recipeFoodCostForMargin,
  recipeLineCostDisplayCell,
  resolvedContributionSumPct,
} from "@/lib/recipe-pricing-state";
import { computePrepServingsPerBatch, formatPrepServingHint } from "@/lib/recipe-prep-servings";
import {
  rememberPrepServingSize,
  getRememberedPrepServingSize,
  readPrepServingSizeMemory,
} from "@/lib/recipe-prep-serving-memory";
import {
  buildPrepYieldIntelligence,
  deriveCostPerServing,
  formatCostPerServingLabel,
  formatPrepYieldPickerSubtitle,
  inferPrepServingFromMenuUsage,
  type PrepUsageLine,
} from "@/lib/recipe-prep-yield";
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
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  MISSING_OPERATIONAL_PRICING_LABEL,
  UNRESOLVED_COST_CELL,
  type IngredientCostFields,
} from "@/lib/ingredient-unit-cost";
import {
  formatIngredientPriceMetadataHierarchy,
  formatOperationalPriceContext,
  shouldShowPricingSourceDebug,
  type FormattedOperationalPriceContext,
} from "@/lib/pricing-source-presentation";
import { logSurfacePricingMismatch, pricingConfidenceFromResolve } from "@/lib/pricing-trace";
import {
  buildOperationalIngredientCostById,
  enrichRecipeLinesForOperationalCost,
  logCostProp,
  logRecipeHydrate,
  OPERATIONAL_INGREDIENT_COST_CHANGED_EVENT,
  operationalIngredientCostFieldsForLine,
  resolveOperationalIngredientCostFields,
  resolveOperationalIngredientUnitCostEur,
  resolveRecipeLineOperationalCost,
  type OperationalIngredientCostFields,
  type OperationalIngredientCostSource,
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
  /** Prep serving size (local memory until a DB column exists). */
  serving_quantity: string;
  serving_unit: string;
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
  usageUnit: string | null;
  ingredientCostFields: IngredientCostFields | null;
  unitCost: number | null;
  unitCostLabel: string | null;
  packagedLiquidSubtitle: string | null;
  unitCostWarning: string | null;
  prepServingHint: string | null;
  lineCost: number | null;
  pricingUnresolved: boolean;
  contribution: number;
  /** Human pricing provenance (supplier, invoice date, original pack price). */
  pricePresentation: FormattedOperationalPriceContext | null;
};

const emptyRecipeForm: RecipeForm = {
  name: "",
  type: "",
  selling_price: "",
  output_quantity: "",
  output_unit: "",
  serving_quantity: "",
  serving_unit: "",
  lines: [],
};

function flattenMenuPrepUsageLines(
  recipeRows: RecipeRow[],
  activeRecipeId: string | null | undefined,
  activeFormLines: RecipeLineForm[],
): PrepUsageLine[] {
  const lines: PrepUsageLine[] = [];
  for (const recipe of recipeRows) {
    if (recipe.id === activeRecipeId) {
      for (const line of activeFormLines) {
        if (!line.sub_recipe_id) continue;
        lines.push({
          sub_recipe_id: line.sub_recipe_id,
          quantity: parseRecipeQuantityInput(line.quantity),
          unit: line.unit || null,
        });
      }
      continue;
    }
    for (const line of recipe.recipe_ingredients ?? []) {
      if (!line.sub_recipe_id) continue;
      lines.push({
        sub_recipe_id: line.sub_recipe_id,
        quantity: line.quantity,
        unit: line.unit,
      });
    }
  }
  return lines;
}

function resolvePrepServingFormFields(
  recipe: RecipeRow,
  userId: string | undefined,
  menuLines: PrepUsageLine[],
): Pick<RecipeForm, "serving_quantity" | "serving_unit"> {
  const remembered = getRememberedPrepServingSize(userId, recipe.id);
  const inferred = inferPrepServingFromMenuUsage(recipe.id, menuLines);
  const source = remembered ?? inferred;
  if (!source?.quantity || !source.unit) {
    return { serving_quantity: "", serving_unit: "" };
  }
  return {
    serving_quantity: formatRecipeQuantityDisplay(Number(source.quantity)),
    serving_unit: normalizeRecipeUsageUnitOption(source.unit) ?? source.unit,
  };
}

function prepYieldDisplayValue(label: string | null | undefined): string {
  return label?.trim() ? label : "—";
}

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
      recipe.output_quantity != null
        ? formatRecipeQuantityDisplay(Number(recipe.output_quantity))
        : "",
    output_unit: isPrepRecipe(recipe.type ?? "dish")
      ? prepOutputUnitSelectValue(recipe.output_unit ?? "")
      : (normalizeRecipeUsageUnitOption(recipe.output_unit) ?? ""),
    lines:
      recipe.recipe_ingredients?.map((line) => ({
        id: line.id,
        ingredient_id: line.ingredient_id ?? "",
        sub_recipe_id: line.sub_recipe_id ?? "",
        quantity: formatRecipeQuantityDisplay(
          repairRecipeQuantityDoubleNormalization(
            Number(line.quantity ?? 0),
            normalizeRecipeUsageUnitOption(line.unit) ?? line.unit,
          ),
        ),
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
  const [invoiceOperationalCostByIngredientId, setInvoiceOperationalCostByIngredientId] = useState<
    Map<string, OperationalInvoiceCostEntry>
  >(() => new Map());
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
    const menuLines = flattenMenuPrepUsageLines(recipes, recipe.id, recipeToForm(recipe).lines);
    setRecipeForm({
      ...recipeToForm(recipe),
      ...resolvePrepServingFormFields(recipe, user?.id, menuLines),
    });
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

      const [{ data: recipesData, error }, ingredientCatalog, confirmedAliases] = await Promise.all(
        [
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
        ],
      );

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

    if (isPrepRecipe(recipeType)) {
      const servingQty = parseRecipeQuantityInput(recipeForm.serving_quantity);
      const servingUnit = normalizeRecipeUsageUnitOption(recipeForm.serving_unit);
      if (servingQty != null && servingQty > 0 && servingUnit) {
        rememberPrepServingSize(user.id, recipeId, servingQty, servingUnit);
      }
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
      .map((line) => {
        const lineUnit = line.unit || getLineDefaultUnit(line, ingredientOptions, recipes, user.id);
        const rawQty = parseRecipeQuantityInput(line.quantity) ?? 0;
        return supabase
          .from("recipe_ingredients")
          .update({
            ingredient_id: line.sub_recipe_id ? null : line.ingredient_id,
            sub_recipe_id: line.sub_recipe_id || null,
            quantity: repairRecipeQuantityDoubleNormalization(rawQty, lineUnit),
            unit: lineUnit,
          })
          .eq("id", line.id);
      });

    const newLines = editableLines
      .filter((line) => !line.id)
      .map((line) => {
        const lineUnit = line.unit || getLineDefaultUnit(line, ingredientOptions, recipes, user.id);
        const rawQty = parseRecipeQuantityInput(line.quantity) ?? 0;
        return {
          recipe_id: recipeId,
          ingredient_id: line.sub_recipe_id ? null : line.ingredient_id,
          sub_recipe_id: line.sub_recipe_id || null,
          quantity: repairRecipeQuantityDoubleNormalization(rawQty, lineUnit),
          unit: lineUnit,
        };
      });

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

  const liveRecipePricingById = useMemo(() => {
    if (recipes.length === 0)
      return {} as Record<string, ReturnType<typeof deriveRecipePricingSummary>>;

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
    const pricingById: Record<string, ReturnType<typeof deriveRecipePricingSummary>> = {};
    for (const recipe of recipes) {
      const summary = computeRecipePricingSummaryFromRecipe(recipe.id, linesByRecipe, recipesById);
      pricingById[recipe.id] = summary;
      logRecipePricingState({
        surface: "recipes.list_cards",
        recipeId: recipe.id,
        summary,
        trigger: "list_recalc",
      });
      const topIngredientLine = (recipe.recipe_ingredients ?? []).find(
        (line) => line.ingredient_id,
      );
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
          totalFoodCost: summary.resolvedFoodCostEur,
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
          totalFoodCost: summary.resolvedFoodCostEur,
        });
      }
    }
    traceFoodCostRecalculationSource("compute_recipe_cost", {
      surface: "recipes.list_cards",
      recipeCount: recipes.length,
      operationalCostEpoch,
    });
    return pricingById;
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

  const { prepUnitCostById, prepBatchCostById } = useMemo(() => {
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
    const unitCostMap = new Map<string, number | null>();
    const batchCostMap = new Map<string, number | null>();
    for (const recipe of recipes) {
      if (!isPrepRecipe(recipe.type)) continue;
      const batchTotal = computeRecipeTotalCostEurOrZero(recipe.id, linesByRecipe, recipesById);
      batchCostMap.set(recipe.id, batchTotal > 0 ? batchTotal : null);
      unitCostMap.set(
        recipe.id,
        computePrepUnitCost(recipe.id, linesByRecipe, recipesById, { trigger: "prepUnitCostById" }),
      );
    }
    return { prepUnitCostById: unitCostMap, prepBatchCostById: batchCostMap };
  }, [
    ingredientOptions,
    invoiceOperationalCostByIngredientId,
    operationalCostByIngredientId,
    prepOutputOverride,
    recipeForm.lines,
    recipes,
    selectedRecipe,
  ]);

  const menuPrepUsageLines = useMemo(
    () => flattenMenuPrepUsageLines(recipes, selectedRecipe?.id ?? null, recipeForm.lines),
    [recipeForm.lines, recipes, selectedRecipe?.id],
  );

  const prepYieldSubtitleById = useMemo(() => {
    const memory = readPrepServingSizeMemory(user?.id);
    const map = new Map<string, string>();
    for (const recipe of recipes) {
      if (!isPrepRecipe(recipe.type)) continue;
      const outputQty =
        recipe.id === selectedRecipe?.id && prepOutputOverride
          ? prepOutputOverride.output_quantity
          : recipe.output_quantity;
      const outputUnit =
        recipe.id === selectedRecipe?.id && prepOutputOverride
          ? prepOutputOverride.output_unit
          : recipe.output_unit;
      const serving =
        recipe.id === selectedRecipe?.id
          ? {
              quantity: parseRecipeQuantityInput(recipeForm.serving_quantity),
              unit:
                normalizeRecipeUsageUnitOption(recipeForm.serving_unit) ?? recipeForm.serving_unit,
            }
          : (memory[recipe.id] ?? inferPrepServingFromMenuUsage(recipe.id, menuPrepUsageLines));
      const intel = buildPrepYieldIntelligence({
        batchOutputQty: outputQty,
        batchOutputUnit: outputUnit,
        servingQty: serving?.quantity,
        servingUnit: serving?.unit,
        batchCostEur: prepBatchCostById.get(recipe.id),
      });
      const subtitle = formatPrepYieldPickerSubtitle(intel);
      if (subtitle) map.set(recipe.id, subtitle);
    }
    return map;
  }, [
    menuPrepUsageLines,
    prepBatchCostById,
    prepOutputOverride,
    recipeForm.serving_quantity,
    recipeForm.serving_unit,
    recipes,
    selectedRecipe?.id,
    user?.id,
  ]);

  const packagedLiquidSubtitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ing of ingredientOptions) {
      const resolved = resolveOperationalIngredientCostFields(
        ing.id,
        operationalCostByIngredientId,
        null,
        invoiceOperationalCostByIngredientId,
      );
      const invoiceEntry = invoiceOperationalCostByIngredientId.get(ing.id);
      const subtitle = formatPackagedLiquidContextFromCostFields(resolved.fields, {
        purchaseDate: resolved.chosenDate ?? invoiceEntry?.invoiceDate ?? null,
      });
      if (subtitle) map.set(ing.id, subtitle);
    }
    return map;
  }, [
    ingredientOptions,
    invoiceOperationalCostByIngredientId,
    operationalCostByIngredientId,
    operationalCostEpoch,
  ]);

  const operationalPriceSubtitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ing of ingredientOptions) {
      const resolved = resolveOperationalIngredientCostFields(
        ing.id,
        operationalCostByIngredientId,
        null,
        invoiceOperationalCostByIngredientId,
      );
      const invoiceEntry = invoiceOperationalCostByIngredientId.get(ing.id);
      const unitCostEur = recipeLineDisplayUnitCostEur({
        lineCostEur: null,
        quantity: 1,
        recipeUsageUnit: ing.unit,
        resolvedUnitCostEur: null,
        costFields: resolved.fields,
      });
      const presentation = formatOperationalPriceContext({
        source: pricingConfidenceFromResolve({
          source: resolved.source,
          pricingResolved: isOperationalPricingResolved(resolved.fields),
        }),
        costSource: resolved.source,
        supplier: invoiceEntry?.supplierLabel ?? null,
        date: resolved.chosenDate ?? invoiceEntry?.invoiceDate ?? null,
        unitCostEur,
        costFields: resolved.fields,
        costBaseUnit: inferIngredientCostBaseUnit(resolved.fields),
      });
      if (presentation.compactLine) map.set(ing.id, presentation.compactLine);
    }
    return map;
  }, [
    ingredientOptions,
    invoiceOperationalCostByIngredientId,
    operationalCostByIngredientId,
    operationalCostEpoch,
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
  const recipePricingSummary = useMemo(
    () => deriveRecipePricingSummaryFromCostLines(recipeCostLines),
    [recipeCostLines],
  );
  const recipeTotalCost = recipePricingSummary.resolvedFoodCostEur ?? 0;
  const recipeCostIncomplete = recipePricingSummary.costIncomplete;

  useEffect(() => {
    if (!detailOpen || !selectedRecipe) return;
    logCostProp({
      trigger: "form_recalc",
      recipeId: selectedRecipe.id,
      totalFoodCost: recipePricingSummary.resolvedFoodCostEur,
    });
    traceFoodCostRecalculationSource("recipe_form_recalc", {
      recipeId: selectedRecipe.id,
      surface: "recipes.modal",
      totalFoodCost: recipePricingSummary.resolvedFoodCostEur,
    });
    logRecipePricingState({
      surface: "recipes.modal",
      recipeId: selectedRecipe.id,
      summary: recipePricingSummary,
      trigger: "form_recalc",
    });
    const cardSummary = liveRecipePricingById[selectedRecipe.id];
    if (cardSummary) {
      logSurfaceRecipePricingMismatch({
        recipeId: selectedRecipe.id,
        surfaceA: "recipes.list_cards",
        summaryA: cardSummary,
        surfaceB: "recipes.modal",
        summaryB: recipePricingSummary,
        trigger: "form_recalc",
      });
    }
  }, [detailOpen, liveRecipePricingById, recipePricingSummary, selectedRecipe]);
  const sellingPriceOrNull = recipeSellingPriceForSave(recipeForm.selling_price, recipeForm.type);
  const sellingPrice = sellingPriceOrNull ?? 0;
  const grossProfit = hasRecipeSellingPrice(sellingPriceOrNull)
    ? sellingPriceOrNull - recipeTotalCost
    : null;
  const grossMargin = computeGrossMarginPct(sellingPriceOrNull, recipeTotalCost);
  const foodCostPercentage = computeFoodCostPct(sellingPriceOrNull, recipeTotalCost);
  const isPrepWithoutPrice =
    isPrepRecipe(recipeForm.type) && !hasRecipeSellingPrice(sellingPriceOrNull);
  const isPrepWorkspace = isPrepRecipe(recipeForm.type);
  const prepYieldIntelligence = useMemo(() => {
    if (!isPrepRecipe(recipeForm.type)) return null;
    return buildPrepYieldIntelligence({
      batchOutputQty: parseRecipeQuantityInput(recipeForm.output_quantity),
      batchOutputUnit: prepOutputOverride?.output_unit ?? recipeForm.output_unit,
      servingQty: parseRecipeQuantityInput(recipeForm.serving_quantity),
      servingUnit:
        normalizeRecipeUsageUnitOption(recipeForm.serving_unit) ?? recipeForm.serving_unit,
      batchCostEur: recipeTotalCost,
    });
  }, [
    prepOutputOverride?.output_unit,
    recipeForm.output_quantity,
    recipeForm.output_unit,
    recipeForm.serving_quantity,
    recipeForm.serving_unit,
    recipeForm.type,
    recipeTotalCost,
  ]);
  const activeIngredientCount = recipeCostLines.filter(
    (line) => line.line.ingredient_id || line.line.sub_recipe_id,
  ).length;
  const topCostDrivers = useMemo(
    () =>
      [...recipeCostLines]
        .filter(
          (line) =>
            (line.line.ingredient_id || line.line.sub_recipe_id) &&
            line.lineCost != null &&
            line.lineCost > 0 &&
            !isRecipeLineCostUnresolved(line.lineCost),
        )
        .sort((a, b) => (b.lineCost ?? 0) - (a.lineCost ?? 0))
        .slice(0, 5),
    [recipeCostLines],
  );
  const recipeHealth = getRecipeHealth(
    sellingPriceOrNull,
    recipeTotalCost,
    foodCostPercentage,
    topCostDrivers[0]?.contribution ?? 0,
    activeIngredientCount,
    recipeForm.type,
  );
  const downloadTechnicalSheet = () => {
    const sheetIngredients = buildTechnicalSheetIngredientsFromCostLines(recipeCostLines);

    for (const line of recipeCostLines.filter(
      (row) => row.line.ingredient_id || row.line.sub_recipe_id,
    )) {
      const lineKey =
        line.line.sub_recipe_id || line.line.ingredient_id || line.displayName || "line";
      logSurfacePricingMismatch({
        recipeId: selectedRecipe?.id,
        lineKey,
        surfaceA: "recipes.modal",
        surfaceB: "technical_sheet_pdf",
        modalLineCost: line.lineCost,
        pdfLineCost: line.lineCost,
        modalUnitCost: line.unitCost,
        pdfUnitCost: line.unitCost,
        resolver: line.isPrepLine
          ? "resolvePrepUsageLineOperationalCost"
          : "resolveRecipeLineOperationalCost",
        trigger: "downloadTechnicalSheet",
      });
      if (import.meta.env.DEV) {
        logSurfacePriceState({
          recipeId: selectedRecipe?.id,
          lineId: lineKey,
          lineCost: line.lineCost,
          pricingResolved: !line.pricingUnresolved,
          displayCell: recipeLineCostDisplayCell(line.lineCost),
          source: line.pricePresentation?.debugResolutionCode ?? null,
          unresolvedReason: line.unitCostWarning,
          path: "pdf",
          trigger: "downloadTechnicalSheet",
        });
      }
    }

    const prepYieldSheet =
      prepYieldIntelligence?.batchYieldLabel &&
      prepYieldIntelligence.servingSizeLabel &&
      prepYieldIntelligence.estimatedServingsLabel &&
      prepYieldIntelligence.costPerServingLabel
        ? {
            batchYield: prepYieldIntelligence.batchYieldLabel,
            servingSize: prepYieldIntelligence.servingSizeLabel,
            estimatedServings: prepYieldIntelligence.estimatedServingsLabel,
            costPerServing: prepYieldIntelligence.costPerServingLabel,
          }
        : null;

    void downloadRecipeTechnicalSheet({
      recipeName: recipeForm.name,
      category: recipeForm.type,
      yield: prepYieldSheet ? null : prepYieldIntelligence?.batchYieldLabel,
      portionSize: prepYieldSheet ? null : prepYieldIntelligence?.servingSizeLabel,
      prepYield: prepYieldSheet,
      ingredients: sheetIngredients,
      totalFoodCost: recipeTotalCost,
      sellingPrice: sellingPriceOrNull,
      grossMargin,
      costIncomplete: recipeCostIncomplete,
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
          const pricing = liveRecipePricingById[r.id] ?? deriveRecipePricingSummary([]);
          const marginFoodCost = recipeFoodCostForMargin(pricing);
          const margin =
            marginFoodCost != null ? computeGrossMarginPct(priceOrNull, marginFoodCost) : null;
          const fc =
            marginFoodCost != null ? computeFoodCostPct(priceOrNull, marginFoodCost) : null;
          const marginDisplay = formatPartialMarginDisplay(margin, pricing.status === "partial");
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
                            Gross Margin {marginDisplay}
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

                    <Mini label="Food Cost" value={formatRecipeFoodCostDisplay(pricing)} />
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
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          >
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Recipe workspace
                  </div>
                  <div className="mt-1 text-xl font-semibold tracking-tight">
                    {formMode === "create" ? "Build a protected margin recipe" : recipeForm.name}
                  </div>
                  <div className="mt-1 max-w-xl text-sm text-muted-foreground">
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

            <div className={cn("flex-1 overflow-y-auto space-y-4 px-5 py-4 sm:px-6")}>
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,17rem)]">
                <div className="min-w-0 rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
                  <div className="grid gap-3">
                    <label className="text-sm font-medium text-muted-foreground">
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

                    <div className="grid gap-3 sm:grid-cols-2">
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
                                isPrepRecipe(type) &&
                                !normalizeRecipeUsageUnitOption(recipeForm.output_unit)
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

                      <label className="text-sm font-medium text-muted-foreground">
                        Selling price (€)
                        {isPrepWorkspace ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            Optional
                          </span>
                        ) : null}
                        <input
                          required={!isPrepWorkspace}
                          type="number"
                          step="0.01"
                          min={isPrepWorkspace ? undefined : "0.01"}
                          placeholder={isPrepWorkspace ? "Leave empty if not sold" : undefined}
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

                    {isPrepWorkspace ? (
                      <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-muted-foreground">
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
                        <label className="text-sm font-medium text-muted-foreground">
                          Serving size (per use)
                          <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                            Typical portion when used in a dish.
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <RecipeQuantityInput
                              value={recipeForm.serving_quantity}
                              onChange={(serving_quantity) =>
                                setRecipeForm({ ...recipeForm, serving_quantity })
                              }
                              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                            />
                            <select
                              value={prepOutputUnitSelectValue(recipeForm.serving_unit)}
                              onChange={(event) =>
                                setRecipeForm({ ...recipeForm, serving_unit: event.target.value })
                              }
                              aria-label="Serving unit"
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
                      </div>
                    ) : null}
                  </div>
                </div>

                <RecipeTopCostDrivers drivers={topCostDrivers} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard
                  label="Selling price"
                  value={isPrepWithoutPrice ? "—" : formatCurrency(sellingPrice)}
                />
                <KpiCard
                  label="Food cost"
                  value={formatRecipeFoodCostDisplay(recipePricingSummary)}
                />
                <KpiCard
                  label="Gross profit"
                  value={grossProfit == null ? "—" : formatCurrency(grossProfit)}
                />
                <KpiCard
                  label="Gross margin"
                  value={formatRecipeMarginDisplay(recipePricingSummary, sellingPriceOrNull)}
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
              {isPrepWorkspace ? (
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetadataChip
                      label="Batch output"
                      value={prepYieldDisplayValue(prepYieldIntelligence?.batchYieldLabel)}
                    />
                    <MetadataChip
                      label="Serving size"
                      value={prepYieldDisplayValue(prepYieldIntelligence?.servingSizeLabel)}
                    />
                    <MetadataChip
                      label="Estimated servings"
                      value={prepYieldDisplayValue(prepYieldIntelligence?.estimatedServingsLabel)}
                    />
                    <MetadataChip
                      label="Cost/serving"
                      value={prepYieldDisplayValue(prepYieldIntelligence?.costPerServingLabel)}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetadataChip label="Category" value={recipeForm.type || "dish"} />
                    <MetadataChip label="Prep time" value="Not set" />
                  </div>
                </div>
              )}

              <div className="overflow-x-hidden rounded-2xl border border-border">
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
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

                <table className="w-full table-fixed text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Ingredient</th>
                        <th className="w-[7.5rem] px-3 py-2 text-right font-medium">Quantity</th>
                        <th className="w-[11rem] px-3 py-2 text-right font-medium">Unit cost</th>
                        <th className="w-[4.5rem] px-3 py-2 text-right font-medium">Cost</th>
                        <th className="w-[5.5rem] px-3 py-2 text-right font-medium">Contribution</th>
                        <th className="w-10 px-3 py-2"></th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border">
                      {recipeForm.lines.map((line, idx) => {
                        const costLine = recipeCostLines[idx];
                        const lineCost = costLine?.lineCost ?? null;
                        const lineCostUnresolved = isRecipeLineCostUnresolved(lineCost);
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
                            <td className="px-3 py-1.5">
                              <div className="min-w-0">
                                <RecipeLinePicker
                                  options={linePickerOptions}
                                  value={recipeLinePickerValueFromForm(line)}
                                  prepUnitCostById={prepUnitCostById}
                                  prepYieldSubtitleById={prepYieldSubtitleById}
                                  packagedLiquidSubtitleById={packagedLiquidSubtitleById}
                                  operationalPriceSubtitleById={operationalPriceSubtitleById}
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
                                        ...(line.unitManuallySet ? {} : { unit: prep?.unit ?? "" }),
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

                            <td className="px-3 py-1.5 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center justify-end gap-1.5">
                                  <RecipeQuantityInput
                                    required
                                    value={line.quantity}
                                    onChange={(quantity) => updateRecipeLine(idx, { quantity })}
                                    className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-right text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
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
                                        const prevUnit = recipeLineUsageUnitValue(
                                          line,
                                          ingredientOptions,
                                          recipes,
                                          user?.id,
                                        );
                                        const parsedQty = parseRecipeQuantityInput(line.quantity);
                                        const convertedQty =
                                          parsedQty != null
                                            ? convertRecipeQuantityBetweenUnits(
                                                parsedQty,
                                                prevUnit,
                                                unit,
                                              )
                                            : null;
                                        updateRecipeLine(idx, {
                                          unit,
                                          unitManuallySet: true,
                                          ...(convertedQty != null
                                            ? {
                                                quantity: formatRecipeQuantityDisplay(convertedQty),
                                              }
                                            : {}),
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
                                      className="w-[3.25rem] shrink-0 rounded-lg border border-input bg-background px-1 py-1.5 text-left text-xs text-foreground outline-none transition-colors focus:border-foreground/30"
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
                                  <p className="max-w-[12rem] truncate text-xs text-muted-foreground">
                                    {costLine.prepServingHint}
                                  </p>
                                ) : null}
                              </div>
                            </td>

                            <td className="px-3 py-1.5 text-right align-top">
                              <RecipeLineUnitCostCell costLine={costLine} />
                            </td>

                            <td className="px-3 py-1.5 text-right text-base font-semibold tabular-nums align-top">
                              {recipeLineCostDisplayCell(lineCost)}
                            </td>

                            <td className="px-3 py-1.5 text-right align-top">
                              <span className="inline-flex min-w-12 justify-end text-xs font-semibold tabular-nums text-foreground">
                                {lineCostUnresolved
                                  ? UNRESOLVED_COST_CELL
                                  : formatPercent(contribution)}
                              </span>
                            </td>

                            <td className="px-3 py-1.5 text-right align-top">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
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
                    {recipePricingSummary.status === "partial" ? (
                      <tfoot className="border-t border-border bg-muted/20 text-xs text-muted-foreground">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-left">
                            {formatContributionFooterLabel(recipePricingSummary)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                            {formatPercent(resolvedContributionSumPct(recipeCostLines))} resolved
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
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
        ? (selectedRecipe?.recipe_ingredients?.find(
            (row) => row.sub_recipe_id === line.sub_recipe_id,
          )?.sub_recipe ??
          allRecipes.find((recipe) => recipe.id === line.sub_recipe_id) ??
          null)
        : null;
    const pickerOption = pickerOptions.find(
      (option) =>
        (option.kind === "prep" && option.id === line.sub_recipe_id) ||
        (option.kind === "ingredient" && option.id === line.ingredient_id),
    );
    const displayName = line.sub_recipe_id
      ? (subRecipe?.name ?? pickerOption?.name ?? "Prep")
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

    const usageUnit = recipeLineUsageUnitValue(line, ingredientOptions, allRecipes, userId);
    const quantity = repairRecipeQuantityDoubleNormalization(
      parseRecipeQuantityInput(line.quantity) ?? 0,
      usageUnit,
    );
    const isPrepUsageLine = line.sub_recipe_id != null && line.sub_recipe_id !== "";
    const prep = isPrepUsageLine ? recipesById.get(line.sub_recipe_id) : undefined;
    let lineCost: number | null = null;
    let resolvedUnitCost: number | null = null;
    let ingredientCostFields: IngredientCostFields | null = null;
    let unitCostWarning: string | null = null;
    let pricePresentation: RecipeCostLine["pricePresentation"] = null;
    let pricingUnresolved = false;
    let resolvedCostSource: OperationalIngredientCostSource | null = null;
    let resolvedChosenDate: string | null = null;
    if (line.ingredient_id) {
      const embedForResolve = recipeLineEmbedCostSnapshot(
        line.ingredient_id,
        selectedRecipe?.recipe_ingredients ?? null,
      );
      const resolved = resolveRecipeLineOperationalCost(
        line.ingredient_id,
        quantity,
        operationalCostByIngredientId,
        embedForResolve,
        invoiceOperationalCostByIngredientId,
        {
          recipeUnit: usageUnit,
          ingredientName: displayName,
          trigger: "getRecipeCostLines",
        },
      );
      lineCost = resolved.lineCostEur;
      resolvedUnitCost = resolved.unitCostEur;
      ingredientCostFields = resolved.fields;
      const lineCostResolved = !isRecipeLineCostUnresolved(lineCost);
      if (!lineCostResolved) {
        unitCostWarning = resolved.unresolvedReason ?? MISSING_OPERATIONAL_PRICING_LABEL;
      }
      resolvedCostSource = resolved.source;
      resolvedChosenDate = resolved.chosenDate;
      logCostProp({
        trigger: "line_cost",
        recipeId: selectedRecipe?.id,
        ingredientId: line.ingredient_id,
        lineCost: lineCost ?? null,
        unitCostEur: resolveOperationalIngredientUnitCostEur(
          line.ingredient_id,
          operationalCostByIngredientId,
          embedForResolve,
          invoiceOperationalCostByIngredientId,
          { trigger: "line_cost" },
        ),
        resolvedPrice: resolved.fields.current_price,
        purchaseQuantity: resolved.fields.purchase_quantity,
        source: resolved.source,
        chosenDate: resolved.chosenDate,
        latestInvoiceUnitCost: resolved.latestInvoiceUnitCost,
      });
    }
    let prepUnitCost: number | null = null;
    if (isPrepUsageLine) {
      const prepResolved = resolvePrepUsageLineOperationalCost(
        line.sub_recipe_id,
        quantity,
        usageUnit,
        linesByRecipe,
        recipesById,
        {
          parentRecipeId: selectedRecipe?.id,
          prepName: subRecipe?.name ?? null,
          trigger: "getRecipeCostLines",
        },
      );
      lineCost = prepResolved.lineCostEur;
      prepUnitCost = prepResolved.unitCostEur;
      if (isRecipeLineCostUnresolved(lineCost)) {
        unitCostWarning =
          prepResolved.warning ??
          prepResolved.unresolvedReason ??
          MISSING_OPERATIONAL_PRICING_LABEL;
      }
      logCostProp({
        trigger: "prep_line_cost",
        recipeId: selectedRecipe?.id,
        prepId: line.sub_recipe_id,
        lineCost: lineCost ?? null,
      });
    }
    const unitCost = isPrepUsageLine
      ? (prepUnitCost ?? (lineCost != null && quantity > 0 ? lineCost / quantity : null))
      : recipeLineDisplayUnitCostEur({
          lineCostEur: lineCost,
          quantity,
          recipeUsageUnit: usageUnit,
          resolvedUnitCostEur: resolvedUnitCost,
          costFields: ingredientCostFields,
        });
    const unitCostLabel =
      isRecipeLineCostUnresolved(lineCost) || unitCost == null
        ? null
        : isPrepUsageLine && quantity > 0 && usageUnit
          ? formatPrepUnitCostLabel(unitCost, usageUnit)
          : line.ingredient_id && quantity > 0 && usageUnit
            ? recipeLineDisplayUnitCostLabel(unitCost, usageUnit, {
                costFields: ingredientCostFields,
                isPrepLine: false,
              })
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
    const prepBatchTotalForHint =
      isPrepUsageLine && line.sub_recipe_id
        ? computeRecipeTotalCostEurOrZero(line.sub_recipe_id, linesByRecipe, recipesById)
        : null;
    const prepCostPerServingHint = deriveCostPerServing(prepBatchTotalForHint, prepServings);
    const prepServingHint =
      prepServings != null
        ? [
            formatPrepServingHint(quantity, usageUnit, prepServings),
            prepCostPerServingHint != null
              ? formatCostPerServingLabel(prepCostPerServingHint)
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;
    const packagedLiquidSubtitle =
      !isPrepUsageLine && ingredientCostFields
        ? formatPackagedLiquidContextFromCostFields(ingredientCostFields, {
            purchaseDate:
              line.ingredient_id != null
                ? (resolvedChosenDate ??
                  invoiceOperationalCostByIngredientId.get(line.ingredient_id)?.invoiceDate ??
                  null)
                : null,
          })
        : null;

    if (!isPrepUsageLine && line.ingredient_id) {
      const invoiceEntry = invoiceOperationalCostByIngredientId.get(line.ingredient_id);
      pricePresentation = formatOperationalPriceContext({
        source: pricingConfidenceFromResolve({
          source: resolvedCostSource ?? "missing",
          pricingResolved: !isRecipeLineCostUnresolved(lineCost),
        }),
        costSource: resolvedCostSource ?? "missing",
        supplier: invoiceEntry?.supplierLabel ?? null,
        date: resolvedChosenDate ?? invoiceEntry?.invoiceDate ?? null,
        unitCostEur: unitCost,
        costFields: ingredientCostFields ?? { current_price: null, purchase_quantity: null },
        costBaseUnit: inferIngredientCostBaseUnit(
          ingredientCostFields ?? { current_price: null, purchase_quantity: null },
        ),
      });
    }

    pricingUnresolved = isRecipeLineCostUnresolved(lineCost);
    if (import.meta.env.DEV && (line.ingredient_id || line.sub_recipe_id)) {
      logSurfacePriceState({
        recipeId: selectedRecipe?.id,
        lineId: line.id ?? line.ingredient_id ?? line.sub_recipe_id,
        lineCost,
        pricingResolved: !pricingUnresolved,
        displayCell: recipeLineCostDisplayCell(lineCost),
        source: pricePresentation?.debugResolutionCode ?? null,
        unresolvedReason: unitCostWarning,
        path: "modal",
        trigger: "getRecipeCostLines",
      });
    }

    return {
      line,
      ingredient,
      subRecipe: subRecipe as RecipeIngredient["sub_recipe"] | null,
      isPrepLine: Boolean(line.sub_recipe_id),
      displayName,
      quantity,
      usageUnit,
      ingredientCostFields,
      unitCost,
      unitCostLabel,
      packagedLiquidSubtitle,
      unitCostWarning,
      prepServingHint,
      lineCost,
      pricingUnresolved,
      contribution: 0,
      pricePresentation,
    };
  });

  const { resolvedTotal: totalCost } = sumResolvedRecipeFoodCostEur(costLines);

  return costLines.map((line) => ({
    ...line,
    contribution: recipeLineContributionPct(line.lineCost ?? 0, totalCost),
  }));
}

function recipeLineEmbedCostSnapshot(
  ingredientId: string,
  recipeIngredients: RecipeIngredient[] | null,
): OperationalIngredientCostFields | null {
  const embed = recipeIngredients?.find((line) => line.ingredient_id === ingredientId)?.ingredients;
  if (!embed) return null;
  return {
    current_price: embed.current_price,
    purchase_quantity: embed.purchase_quantity,
    ...(embed.cost_base_unit ? { cost_base_unit: embed.cost_base_unit } : {}),
    ...(embed.usable_weight_grams != null
      ? { usable_weight_grams: embed.usable_weight_grams }
      : {}),
    ...(embed.usable_volume_ml != null ? { usable_volume_ml: embed.usable_volume_ml } : {}),
    ...(embed.reference_weight_grams != null
      ? { reference_weight_grams: embed.reference_weight_grams }
      : {}),
    ...(embed.reference_volume_ml != null
      ? { reference_volume_ml: embed.reference_volume_ml }
      : {}),
    ...(embed.grams_per_ml != null ? { grams_per_ml: embed.grams_per_ml } : {}),
    ...(embed.gramsPerMl != null ? { gramsPerMl: embed.gramsPerMl } : {}),
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

function RecipeTopCostDrivers({ drivers }: { drivers: RecipeCostLine[] }) {
  const maxContribution = drivers.reduce(
    (peak, driver) => Math.max(peak, driver.contribution),
    0,
  );

  return (
    <div className="min-w-0 rounded-xl border border-border/80 bg-muted/15 px-3 py-2.5 lg:sticky lg:top-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Top cost drivers
      </div>
      {drivers.length > 0 ? (
        <ul className="mt-2 space-y-2.5" aria-label="Top recipe cost drivers">
          {drivers.map((driver, index) => {
            const barWidth =
              maxContribution > 0 ? (driver.contribution / maxContribution) * 100 : 0;
            return (
              <li
                key={`${driver.line.id ?? driver.line.ingredient_id ?? driver.line.sub_recipe_id}-${index}`}
                className="min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-xs font-medium text-foreground">
                        {driver.displayName || "Unnamed line"}
                      </span>
                      {driver.isPrepLine ? (
                        <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          Prep
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right leading-tight">
                    <div className="text-xs font-semibold tabular-nums text-foreground">
                      {recipeLineCostDisplayCell(driver.lineCost)}
                    </div>
                    <div className="text-[10px] tabular-nums text-muted-foreground">
                      {formatPercent(driver.contribution)}
                    </div>
                  </div>
                </div>
                <div
                  className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
                  role="presentation"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-foreground/55 transition-[width] duration-300"
                    style={{ width: `${Math.max(barWidth, driver.contribution > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Add ingredient quantities to reveal recipe cost drivers.
        </p>
      )}
    </div>
  );
}

function RecipeLineUnitCostCell({ costLine }: { costLine: RecipeCostLine | undefined }) {
  const lineCostUnresolved = isRecipeLineCostUnresolved(costLine?.lineCost ?? null);
  const unitCost = costLine?.unitCost ?? null;
  const primaryLabel =
    costLine?.unitCostLabel ??
    (lineCostUnresolved || unitCost == null
      ? UNRESOLVED_COST_CELL
      : formatDisplayUnitCostForContext(
          unitCost,
          costLine?.usageUnit ?? costLine?.line.unit ?? costLine?.ingredient?.unit,
          {
            costFields: costLine?.ingredientCostFields,
            preferUsageUnitSemantics: costLine?.isPrepLine,
          },
        ));

  const metadata = formatIngredientPriceMetadataHierarchy({
    provenanceLine: costLine?.pricePresentation?.compactLine ?? null,
    packagedPackLine: costLine?.packagedLiquidSubtitle ?? null,
  });

  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className="text-sm font-medium tabular-nums text-foreground">{primaryLabel}</span>
      {metadata.secondaryLine ? (
        <span className="text-[11px] leading-snug text-muted-foreground">{metadata.secondaryLine}</span>
      ) : null}
      {metadata.tertiaryLine ? (
        <span className="text-[10px] leading-snug text-muted-foreground/75">
          {metadata.tertiaryLine}
        </span>
      ) : null}
      {costLine?.unitCostWarning ? (
        <span className="text-[10px] leading-snug text-destructive">
          ⚠ {costLine.unitCostWarning}
        </span>
      ) : null}
      {shouldShowPricingSourceDebug() &&
        costLine?.pricePresentation?.technicalDetailLines.map((detailLine) => (
          <span
            key={detailLine}
            className="max-w-full text-[10px] leading-snug text-muted-foreground/70"
          >
            {detailLine}
          </span>
        ))}
    </div>
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

function MetadataChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-background/40 px-2 py-1">
      <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-xs font-semibold tabular-nums text-foreground">{value}</span>
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
    <div className="min-w-0 rounded-xl border border-border bg-card/30 px-3 py-2">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 truncate text-lg font-semibold tabular-nums ${
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
