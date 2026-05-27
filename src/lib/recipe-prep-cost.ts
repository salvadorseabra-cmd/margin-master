import { formatDisplayUnitCostForContext } from "@/lib/display-unit-cost";
import {
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  MISSING_OPERATIONAL_PRICING_LABEL,
  resolveIngredientDensityGPerMl,
  resolvedOperationalUnitCostEur,
  type IngredientCostFields,
} from "@/lib/ingredient-unit-cost";
import {
  logDensityConversionTrace,
  logOperationalScaleTrace,
  logPriceResolutionTrace,
  logRecipeLinePricingTrace,
  logUnitFamilyDiagnostic,
  logUsableConversionTrace,
  pricingConfidenceFromResolve,
  warnCountableUnitCostSuspiciouslyLow,
} from "@/lib/pricing-trace";
import {
  directCountableLineCostEur,
  recipeLineCostViaDensityConversion,
  recipeLineCostViaPackagedLiquidConversion,
  recipeLineCostViaUsableConversion,
  resolveUsablePerCountableUnit,
} from "@/lib/usable-unit-conversion";
import type { OperationalIngredientCostSource } from "@/lib/resolve-operational-ingredient-cost";
import {
  areUnitFamiliesCompatible,
  computePrepLineCost,
  inferUnitFamily,
  normalizeToBaseUnit,
  repairRecipeQuantityDoubleNormalization,
  unitFamilyForBaseUnit,
} from "@/lib/recipe-unit-normalization";
import { logKetchupUnitTrace } from "@/lib/pricing-trace";

const PREP_UNIT_COST_PREFIX = "[PREP_UNIT_COST]";
const PREP_PROPAGATION_PREFIX = "[PREP_PROPAGATION]";
const RESOLVED_LINE_COST_PREFIX = "[RESOLVED_LINE_COST]";

function shouldLogPrepCostDiagnostics(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __MARGINLY_RECIPE_CANONICAL_TRACE__?: boolean;
    __MARGINLY_PRICING_TRACE__?: boolean;
  };
  return (
    w.__MARGINLY_RECIPE_CANONICAL_TRACE__ === true || w.__MARGINLY_PRICING_TRACE__ === true
  );
}

/** Temporary DEV/trace diagnostics for prep €/output unit. */
export function logPrepUnitCost(input: {
  prepId: string;
  batchTotalEur: number;
  outputQuantity: number | null | undefined;
  outputUnit?: string | null;
  unitCostEur: number;
  trigger?: string;
}): void {
  if (!shouldLogPrepCostDiagnostics()) return;
  console.info(PREP_UNIT_COST_PREFIX, {
    prepId: input.prepId,
    batchTotalEur: input.batchTotalEur,
    outputQuantity: input.outputQuantity ?? null,
    outputUnit: input.outputUnit ?? null,
    unitCostEur: input.unitCostEur,
    trigger: input.trigger ?? null,
  });
}

/** Temporary DEV/trace diagnostics when a parent recipe uses a prep. */
export function logPrepPropagation(input: {
  parentRecipeId?: string | null;
  prepId: string;
  usageQuantity: number;
  usageUnit?: string | null;
  batchTotalEur: number;
  lineCostEur: number | null;
  outputQuantity: number | null | undefined;
  outputUnit?: string | null;
  trigger?: string;
}): void {
  if (!shouldLogPrepCostDiagnostics()) return;
  console.info(PREP_PROPAGATION_PREFIX, {
    parentRecipeId: input.parentRecipeId ?? null,
    prepId: input.prepId,
    usageQuantity: input.usageQuantity,
    usageUnit: input.usageUnit ?? null,
    batchTotalEur: input.batchTotalEur,
    lineCostEur: input.lineCostEur,
    outputQuantity: input.outputQuantity ?? null,
    outputUnit: input.outputUnit ?? null,
    trigger: input.trigger ?? null,
  });
}

/** Temporary DEV/trace diagnostics for a resolved recipe line cost. */
export function logResolvedLineCost(input: {
  recipeId?: string | null;
  ingredientId?: string | null;
  prepId?: string | null;
  quantity: number;
  unit?: string | null;
  lineCostEur: number | null;
  trigger?: string;
}): void {
  if (!shouldLogPrepCostDiagnostics()) return;
  console.info(RESOLVED_LINE_COST_PREFIX, {
    recipeId: input.recipeId ?? null,
    ingredientId: input.ingredientId ?? null,
    prepId: input.prepId ?? null,
    quantity: input.quantity,
    unit: input.unit ?? null,
    lineCostEur: input.lineCostEur,
    trigger: input.trigger ?? null,
  });
}

export type PrepOutputFields = {
  output_quantity: number | null | undefined;
  output_unit?: string | null;
};

export type RecipeIngredientLineForCost = {
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  quantity: number | null | undefined;
  unit?: string | null;
  ingredients?: IngredientCostFields | null;
};

export type RecipeForPrepCost = PrepOutputFields & {
  id: string;
};

function safeQuantity(quantity: number | null | undefined): number {
  const qty = Number(quantity);
  return Number.isFinite(qty) ? qty : 0;
}

/** € per recipe usage unit so `lineCost === unitCost × recipe quantity`. */
export function recipeLineOperationalUnitCostEur(
  lineCostEur: number | null,
  quantity: number | null | undefined,
  recipeUnit: string | null | undefined,
): number | null {
  if (lineCostEur == null || !Number.isFinite(lineCostEur)) return null;
  const qtyRaw = Number(quantity);
  if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) return null;
  const recipeNorm = recipeUnit?.trim()
    ? normalizeToBaseUnit(qtyRaw, recipeUnit)
    : null;
  const denom =
    recipeNorm != null && Number.isFinite(recipeNorm.quantity) && recipeNorm.quantity > 0
      ? recipeNorm.quantity
      : qtyRaw;
  return lineCostEur / denom;
}

/** € per output unit (L, kg, ml, …): batch total ÷ output quantity (same rules as {@link computePrepLineCost}). */
export function prepUnitCostEur(
  prepTotalIngredientCost: number,
  outputQuantity: number | null | undefined,
  outputUnit?: string | null,
): number | null {
  const displayUnit = outputUnit?.trim() || null;
  return computePrepLineCost(
    1,
    displayUnit,
    prepTotalIngredientCost,
    outputQuantity,
    outputUnit,
  ).cost;
}

/** Line cost when a parent recipe uses `usageQuantity` of a prep (units normalized when known). */
export function prepLineCostEur(
  usageQuantity: number,
  usageUnit: string | null | undefined,
  prepTotalIngredientCost: number,
  outputQuantity: number | null | undefined,
  outputUnit?: string | null,
): number | null {
  return computePrepLineCost(
    usageQuantity,
    usageUnit,
    prepTotalIngredientCost,
    outputQuantity,
    outputUnit,
  ).cost;
}

export type IngredientLineCostContext = {
  recipeUnit?: string | null;
  source?: OperationalIngredientCostSource;
  invoiceDate?: string | null;
  ingredientName?: string | null;
  purchaseUnit?: string | null;
  trigger?: string;
};

export function ingredientLineCostEur(
  quantity: number | null | undefined,
  ingredient: NonNullable<RecipeIngredientLineForCost["ingredients"]>,
  context: IngredientLineCostContext = {},
): number | null {
  const qtyRaw = safeQuantity(quantity);
  const qty = repairRecipeQuantityDoubleNormalization(qtyRaw, context.recipeUnit);
  const unitCost = resolvedOperationalUnitCostEur(ingredient);
  const costBase = inferIngredientCostBaseUnit(ingredient, {
    ingredientName: context.ingredientName,
  });
  const recipeUnitExplicit = context.recipeUnit?.trim() || null;

  if (unitCost == null || !isOperationalPricingResolved(ingredient)) {
    if (context.source) {
      logRecipeLinePricingTrace({
        ingredientName: context.ingredientName,
        source: context.source,
        invoiceDate: context.invoiceDate,
        purchaseUnit: context.purchaseUnit,
        normalizedUnit: costBase,
        unitFamily: unitFamilyForBaseUnit(costBase),
        resolvedUnitCostEur: 0,
        recipeQuantity: qty,
        recipeUnit: context.recipeUnit,
        lineContributionEur: 0,
        confidence: pricingConfidenceFromResolve({
          source: context.source,
          pricingResolved: false,
        }),
        fallbackReason: "missing_operational_pricing",
        trigger: context.trigger,
      });
    }
    return null;
  }

  const recipeNorm =
    recipeUnitExplicit != null ? normalizeToBaseUnit(qty, recipeUnitExplicit) : null;
  const costFamily = unitFamilyForBaseUnit(costBase);
  const recipeFamily = recipeNorm
    ? unitFamilyForBaseUnit(recipeNorm.baseUnit)
    : recipeUnitExplicit != null
      ? inferUnitFamily(recipeUnitExplicit)
      : null;

  let unitMismatch = false;
  let lineCost: number | null;
  let invoiceConverted = false;
  let unitFamilyDiagnosticCode: import("@/lib/pricing-trace").UnitFamilyDiagnosticCode | null = null;

  const directCountable = directCountableLineCostEur(qty, recipeUnitExplicit, ingredient);
  if (directCountable != null) {
    lineCost = directCountable;
  } else if (recipeNorm && recipeFamily != null && areUnitFamiliesCompatible(recipeFamily, costFamily)) {
    lineCost = recipeNorm.quantity * unitCost;
  } else if (recipeNorm) {
    const packagedLiquidConversion = recipeLineCostViaPackagedLiquidConversion(
      qty,
      recipeUnitExplicit,
      ingredient,
    );
    const usableConversion = recipeLineCostViaUsableConversion(
      qty,
      recipeUnitExplicit,
      ingredient,
      {
        ingredientName: context.ingredientName,
      },
    );
    const densityConversion = recipeLineCostViaDensityConversion(
      qty,
      recipeUnitExplicit,
      ingredient,
    );

    console.log("INGREDIENT DEBUG", {
  ingredient: context.ingredientName,
  recipeUnitExplicit,
  costBase,
  packaged: packagedLiquidConversion,
  usable: usableConversion,
  density: densityConversion,
});

    if (packagedLiquidConversion.converted && packagedLiquidConversion.lineCostEur != null) {
      lineCost = packagedLiquidConversion.lineCostEur;
      invoiceConverted = true;
    } else if (usableConversion.converted && usableConversion.lineCostEur != null) {
      lineCost = usableConversion.lineCostEur;
      invoiceConverted = true;
      const resolvedUsable = resolveUsablePerCountableUnit(ingredient, {
        ingredientName: context.ingredientName,
      });
      logUsableConversionTrace({
        ingredientName: context.ingredientName,
        purchaseUnit: context.purchaseUnit,
        operationalBaseUnit: costBase,
        recipeQuantity: qty,
        recipeUnit: context.recipeUnit,
        usableWeightGrams: resolvedUsable.usableWeightGrams,
        usableVolumeMl: resolvedUsable.usableVolumeMl,
        conversionKind: usableConversion.conversionKind,
        lineCostEur: lineCost,
        trigger: context.trigger,
      });
    } else if (densityConversion.converted && densityConversion.lineCostEur != null) {
      lineCost = densityConversion.lineCostEur;
      invoiceConverted = true;
      const gramsPerMl = resolveIngredientDensityGPerMl(ingredient);
      logDensityConversionTrace({
        ingredientName: context.ingredientName,
        recipeQuantity: qty,
        recipeUnit: recipeUnitExplicit,
        operationalBaseUnit: costBase,
        gramsPerMl,
        recipeMassGrams:
          densityConversion.conversionKind === "volume_to_weight"
            ? recipeNorm.quantity * gramsPerMl
            : recipeNorm.baseUnit === "g"
              ? recipeNorm.quantity
              : null,
        recipeVolumeMl:
          densityConversion.conversionKind === "weight_to_volume"
            ? recipeNorm.quantity / gramsPerMl
            : recipeNorm.baseUnit === "ml"
              ? recipeNorm.quantity
              : null,
        lineCostEur: lineCost,
        trigger: context.trigger,
      });
    } else {
      unitMismatch = true;
      lineCost = null;
      if (recipeNorm.baseUnit === "ml" || recipeNorm.baseUnit === "g") {
        unitFamilyDiagnosticCode =
          costFamily === "countable"
            ? "HYBRID_CONVERSION_MISSING"
            : costFamily === "weight" || costFamily === "volume"
              ? "HYBRID_CONVERSION_MISSING"
              : "UNIT_FAMILY_MISMATCH";
      } else if (costFamily === "countable") {
        unitFamilyDiagnosticCode = "COUNTABLE_TO_WEIGHTED";
      } else {
        unitFamilyDiagnosticCode = "UNIT_FAMILY_MISMATCH";
      }
    }
  } else if (recipeUnitExplicit == null) {
    // Legacy lines with no unit: assume quantity is in the operational base unit (never mass-default on explicit `un`).
    const fallbackNorm = normalizeToBaseUnit(qty, costBase);
    if (fallbackNorm) {
      lineCost = fallbackNorm.quantity * unitCost;
    } else {
      unitMismatch = true;
      lineCost = null;
      unitFamilyDiagnosticCode = "HYBRID_CONVERSION_MISSING";
    }
  } else {
    unitMismatch = true;
    lineCost = null;
    unitFamilyDiagnosticCode = "UNIT_FAMILY_MISMATCH";
  }

  warnCountableUnitCostSuspiciouslyLow({
    ingredientName: context.ingredientName,
    unitFamily: costFamily,
    resolvedUnitCostEur: unitCost,
    normalizedUnit: costBase,
  });

  logKetchupUnitTrace({
    ingredientName: context.ingredientName,
    originalQuantity: qtyRaw,
    recipeUnit: recipeUnitExplicit,
    normalizedQuantity: recipeNorm?.quantity ?? null,
    normalizedUnit: recipeNorm?.baseUnit ?? null,
    displayQuantity: qty,
    lineCostInputs: {
      quantity: recipeNorm?.quantity ?? qty,
      recipeUnit: recipeUnitExplicit,
      unitCostEur: unitCost,
    },
    lineCostEur: lineCost,
    trigger: context.trigger,
  });

  logOperationalScaleTrace({
    ingredientName: context.ingredientName,
    packPriceEur: Number(ingredient.current_price),
    purchaseQuantity: Number(ingredient.purchase_quantity),
    costBaseUnit: costBase,
    resolvedOperationalUnitCostEur: unitCost,
    recipeQuantity: qty,
    recipeUnit: recipeUnitExplicit,
    recipeNormalizedQuantity: recipeNorm?.quantity ?? null,
    recipeNormalizedUnit: recipeNorm?.baseUnit ?? null,
    path:
      directCountable != null
        ? "direct_countable"
        : invoiceConverted
          ? "packaged_usable_or_density_conversion"
          : recipeNorm && recipeFamily != null && areUnitFamiliesCompatible(recipeFamily, costFamily)
            ? "compatible_base_multiply"
            : recipeUnitExplicit == null
              ? "legacy_no_recipe_unit"
              : "unresolved",
    lineCostEur: lineCost,
    trigger: context.trigger,
  });

  if (context.source) {
    if (unitMismatch && unitFamilyDiagnosticCode) {
      logUnitFamilyDiagnostic({
        ingredientName: context.ingredientName,
        purchaseUnitFamily: costFamily,
        recipeUnitFamily: recipeFamily,
        normalizedUnit: costBase,
        recipeUnit: context.recipeUnit,
        code: unitFamilyDiagnosticCode,
        trigger: context.trigger,
      });
    }

    logRecipeLinePricingTrace({
      ingredientName: context.ingredientName,
      source: context.source,
      invoiceDate: context.invoiceDate,
      purchaseUnit: context.purchaseUnit,
      normalizedUnit: costBase,
      unitFamily: costFamily,
      resolvedUnitCostEur: unitCost,
      recipeQuantity: qty,
      recipeUnit: context.recipeUnit,
      lineContributionEur: lineCost ?? 0,
      confidence: pricingConfidenceFromResolve({
        source: context.source,
        unitMismatch,
        pricingResolved: lineCost != null,
        invoiceConverted,
      }),
      fallbackReason: unitMismatch
        ? "recipe_unit_family_mismatch"
        : lineCost == null
          ? "missing_operational_pricing"
          : null,
      trigger: context.trigger,
    });
  }

  return lineCost;
}

export function computeRecipeLineCostEur(
  line: RecipeIngredientLineForCost,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  const qty = safeQuantity(line.quantity);

  if (line.ingredient_id) {
    if (!line.ingredients) return null;
    return ingredientLineCostEur(qty, line.ingredients, { recipeUnit: line.unit });
  }

  if (line.sub_recipe_id) {
    const prepTotal = computeRecipeTotalCostEur(
      line.sub_recipe_id,
      linesByRecipe,
      recipesById,
      path,
      memo,
    );
    if (prepTotal === null) return null;
    const prep = recipesById.get(line.sub_recipe_id);
    const lineCost = prepLineCostEur(
      qty,
      line.unit,
      prepTotal,
      prep?.output_quantity,
      prep?.output_unit,
    );
    logPrepPropagation({
      prepId: line.sub_recipe_id,
      usageQuantity: qty,
      usageUnit: line.unit,
      batchTotalEur: prepTotal,
      lineCostEur: lineCost,
      outputQuantity: prep?.output_quantity,
      outputUnit: prep?.output_unit,
      trigger: "computeRecipeLineCostEur",
    });
    logResolvedLineCost({
      prepId: line.sub_recipe_id,
      quantity: qty,
      unit: line.unit,
      lineCostEur: lineCost,
      trigger: "computeRecipeLineCostEur",
    });
    return lineCost;
  }

  return null;
}

export type ResolvePrepUsageLineOperationalCostResult = {
  lineCostEur: number | null;
  unitCostEur: number | null;
  pricingResolved: boolean;
  unresolvedReason: string | null;
  warning: string | null;
  batchTotalEur: number | null;
};

/** Canonical prep usage on a parent recipe line (batch total → normalized usage). */
export function resolvePrepUsageLineOperationalCost(
  prepRecipeId: string,
  usageQuantity: number,
  usageUnit: string | null | undefined,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
  logContext?: { parentRecipeId?: string | null; prepName?: string | null; trigger?: string },
): ResolvePrepUsageLineOperationalCostResult {
  const prepPath = new Set<string>();
  const prepMemo = new Map<string, number>();
  const batchTotalEur = computeRecipeTotalCostEur(
    prepRecipeId,
    linesByRecipe,
    recipesById,
    prepPath,
    prepMemo,
  );
  const prep = recipesById.get(prepRecipeId);
  const prepLines = linesByRecipe.get(prepRecipeId) ?? [];
  if (batchTotalEur == null) {
    return {
      lineCostEur: null,
      unitCostEur: null,
      pricingResolved: false,
      unresolvedReason: MISSING_OPERATIONAL_PRICING_LABEL,
      warning: null,
      batchTotalEur: null,
    };
  }
  if (batchTotalEur <= 0 && prepLines.length > 0) {
    return {
      lineCostEur: null,
      unitCostEur: null,
      pricingResolved: false,
      unresolvedReason: MISSING_OPERATIONAL_PRICING_LABEL,
      warning: "Prep batch has no resolved ingredient cost",
      batchTotalEur,
    };
  }

  const prepLine = computePrepLineCost(
    usageQuantity,
    usageUnit,
    batchTotalEur,
    prep?.output_quantity,
    prep?.output_unit,
  );
  const lineCostEur = prepLine.cost;
  const safeQty = safeQuantity(usageQuantity);
  logOperationalScaleTrace({
    ingredientName: `prep:${prepRecipeId}`,
    path: "prep_usage_line",
    lineCostEur,
    batchTotalEur,
    outputQuantityRaw: prep?.output_quantity ?? null,
    outputUnitRaw: prep?.output_unit ?? null,
    outputNormalizedMl: prepLine.outputNormalizedMl ?? null,
    usageNormalizedMl: prepLine.usageNormalizedMl ?? null,
    recipeQuantity: safeQty,
    recipeUnit: usageUnit ?? null,
    trigger: logContext?.trigger,
  });
  const unitCostEur =
    lineCostEur != null && safeQty > 0
      ? lineCostEur / safeQty
      : prepUnitCostEur(batchTotalEur, prep?.output_quantity, prep?.output_unit);
  const pricingResolved = lineCostEur != null && batchTotalEur > 0;
  const unresolvedReason = pricingResolved
    ? null
    : prepLine.warning ?? MISSING_OPERATIONAL_PRICING_LABEL;

  logPrepPropagation({
    parentRecipeId: logContext?.parentRecipeId,
    prepId: prepRecipeId,
    usageQuantity: safeQty,
    usageUnit,
    batchTotalEur,
    lineCostEur,
    outputQuantity: prep?.output_quantity,
    outputUnit: prep?.output_unit,
    trigger: logContext?.trigger,
  });
  logPrepUnitCost({
    prepId: prepRecipeId,
    batchTotalEur,
    outputQuantity: prep?.output_quantity,
    outputUnit: prep?.output_unit,
    unitCostEur: unitCostEur ?? 0,
    trigger: logContext?.trigger,
  });
  logResolvedLineCost({
    recipeId: logContext?.parentRecipeId,
    prepId: prepRecipeId,
    quantity: safeQty,
    unit: usageUnit,
    lineCostEur,
    trigger: logContext?.trigger,
  });

  const prepResolutionBranch = (() => {
    if (pricingResolved) return "resolved";
    if (batchTotalEur == null) return "prep_batch_total_unresolved";
    if (batchTotalEur <= 0 && prepLines.length > 0) return "prep_batch_zero_cost";
    if (lineCostEur == null && (prep?.output_quantity == null || prep?.output_unit == null)) {
      return "prep_output_yield_missing";
    }
    if (prepLine.warning?.includes("Incompatible units")) return "prep_incompatible_usage_output_units";
    return "prep_usage_unresolved";
  })();

  logPriceResolutionTrace({
    kind: "prep_usage",
    prepId: prepRecipeId,
    prepName: logContext?.prepName ?? null,
    pricingResolved,
    unresolvedReason,
    resolutionBranch: prepResolutionBranch,
    recipeQuantity: safeQty,
    recipeUnit: usageUnit ?? null,
    batchTotalEur,
    prepOutputQuantity: prep?.output_quantity ?? null,
    prepOutputUnit: prep?.output_unit ?? null,
    unitCostEur,
    lineCostEur,
    trigger: logContext?.trigger ?? null,
  });

  return {
    lineCostEur,
    unitCostEur,
    pricingResolved,
    unresolvedReason,
    warning: prepLine.warning ?? null,
    batchTotalEur,
  };
}

/**
 * Recipe food-cost totals: only resolved line costs contribute to `resolvedTotal`.
 * Unresolved lines keep `lineCost: null` and must not be coerced to €0 (avoids inflated margins).
 */
export function sumResolvedRecipeFoodCostEur(
  lines: readonly { lineCost: number | null }[],
): { resolvedTotal: number; hasUnresolvedLines: boolean } {
  let resolvedTotal = 0;
  let hasUnresolvedLines = false;
  for (const line of lines) {
    if (line.lineCost == null || !Number.isFinite(line.lineCost)) {
      hasUnresolvedLines = true;
      continue;
    }
    resolvedTotal += line.lineCost;
  }
  return { resolvedTotal, hasUnresolvedLines };
}

export function computeRecipeTotalCostEur(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
  path: Set<string>,
  memo: Map<string, number>,
): number | null {
  if (path.has(recipeId)) return null;

  if (memo.has(recipeId)) {
    return memo.get(recipeId)!;
  }

  path.add(recipeId);

  const recipeLines = linesByRecipe.get(recipeId) ?? [];
  if (recipeLines.length === 0) {
    path.delete(recipeId);
    return null;
  }

  let sum = 0;
  let resolvedLineCount = 0;
  for (const line of recipeLines) {
    const part = computeRecipeLineCostEur(line, linesByRecipe, recipesById, path, memo);
    if (part === null) continue;
    sum += part;
    resolvedLineCount += 1;
  }

  path.delete(recipeId);
  if (resolvedLineCount === 0) return null;
  memo.set(recipeId, sum);
  return sum;
}

export function computeRecipeTotalCostEurOrZero(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
): number {
  const path = new Set<string>();
  const memo = new Map<string, number>();
  return computeRecipeTotalCostEur(recipeId, linesByRecipe, recipesById, path, memo) ?? 0;
}

export function buildLinesByRecipeId(
  recipes: Array<{ id: string; recipe_ingredients?: RecipeIngredientLineForCost[] | null }>,
): Map<string, RecipeIngredientLineForCost[]> {
  const map = new Map<string, RecipeIngredientLineForCost[]>();
  for (const recipe of recipes) {
    map.set(recipe.id, recipe.recipe_ingredients ?? []);
  }
  return map;
}

export function buildRecipesById(recipes: RecipeForPrepCost[]): Map<string, RecipeForPrepCost> {
  return new Map(recipes.map((recipe) => [recipe.id, recipe]));
}

/** € per output unit for a prep recipe, or null when batch cost is unresolved. */
export function computePrepUnitCost(
  prepRecipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
  logContext?: { trigger?: string },
): number | null {
  const prep = recipesById.get(prepRecipeId);
  const path = new Set<string>();
  const memo = new Map<string, number>();
  const total = computeRecipeTotalCostEur(
    prepRecipeId,
    linesByRecipe,
    recipesById,
    path,
    memo,
  );
  if (total == null || total <= 0) {
    logPrepUnitCost({
      prepId: prepRecipeId,
      batchTotalEur: total ?? 0,
      outputQuantity: prep?.output_quantity,
      outputUnit: prep?.output_unit,
      unitCostEur: 0,
      trigger: logContext?.trigger,
    });
    return null;
  }
  const unitCost = prepUnitCostEur(total, prep?.output_quantity, prep?.output_unit);
  logPrepUnitCost({
    prepId: prepRecipeId,
    batchTotalEur: total,
    outputQuantity: prep?.output_quantity,
    outputUnit: prep?.output_unit,
    unitCostEur: unitCost ?? 0,
    trigger: logContext?.trigger,
  });
  return unitCost;
}

export function formatPrepUnitCostLabel(
  unitCostEur: number,
  outputUnit: string | null | undefined,
): string {
  return formatDisplayUnitCostForContext(unitCostEur, outputUnit, {
    preferUsageUnitSemantics: true,
  });
}

/**
 * Recipe-row unit cost for UI/PDF: align €/unit with recipe usage, not internal g/ml base.
 * Countable `un` lines use line cost ÷ quantity so hybrid ingredients do not show €/g.
 */
export function recipeLineDisplayUnitCostEur(input: {
  lineCostEur: number | null;
  quantity: number;
  recipeUsageUnit: string | null | undefined;
  resolvedUnitCostEur: number | null;
  costFields?: IngredientCostFields | null;
}): number | null {
  const { lineCostEur, quantity, recipeUsageUnit, resolvedUnitCostEur, costFields } = input;
  const perUsageUnit =
    lineCostEur != null && Number.isFinite(lineCostEur) && quantity > 0
      ? lineCostEur / quantity
      : null;

  const recipeNorm =
    recipeUsageUnit != null ? normalizeToBaseUnit(1, recipeUsageUnit) : null;
  if (recipeNorm?.baseUnit === "un") {
    if (perUsageUnit != null) return perUsageUnit;
    if (
      costFields &&
      inferIngredientCostBaseUnit(costFields) === "un" &&
      resolvedUnitCostEur != null &&
      Number.isFinite(resolvedUnitCostEur)
    ) {
      return resolvedUnitCostEur;
    }
    return resolvedUnitCostEur;
  }

  return resolvedUnitCostEur ?? perUsageUnit;
}

export function recipeLineDisplayUnitCostLabel(
  unitCostEur: number | null,
  recipeUsageUnit: string | null | undefined,
  options?: {
    costFields?: IngredientCostFields | null;
    isPrepLine?: boolean;
  },
): string | null {
  if (unitCostEur == null || !Number.isFinite(unitCostEur)) return null;
  return formatDisplayUnitCostForContext(unitCostEur, recipeUsageUnit, {
    costFields: options?.costFields,
    preferUsageUnitSemantics: options?.isPrepLine,
  });
}

/** Share of recipe food cost for one line (same basis as total food cost). */
export function recipeLineContributionPct(lineCost: number, totalFoodCost: number): number {
  const total = Number(totalFoodCost);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const line = Number(lineCost);
  if (!Number.isFinite(line) || line <= 0) return 0;
  return (line / total) * 100;
}

export { computePrepLineCost } from "@/lib/recipe-unit-normalization";
