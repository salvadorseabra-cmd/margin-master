import {
  extractEmbeddedMeasureFromIngredientName,
} from "@/lib/ingredient-unit-integrity-audit";
import {
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  purchaseQuantityDenom,
  resolveIngredientDensityGPerMl,
  resolvedOperationalUnitCostEur,
  type IngredientCostFields,
  type IngredientDensityMetadata,
} from "@/lib/ingredient-unit-cost";
import { resolvePackagedLiquidPackMl } from "@/lib/packaged-liquid-context";
import type { BaseUnit } from "@/lib/recipe-unit-normalization";
import { normalizeToBaseUnit } from "@/lib/recipe-unit-normalization";
import { logCrossDomainConversion } from "@/lib/pricing-trace";

/** Per countable purchase unit (one bun, one head of lettuce). */
export type UsablePerUnitMetadata = {
  usable_weight_grams?: number | null;
  usable_volume_ml?: number | null;
  reference_weight_grams?: number | null;
  reference_volume_ml?: number | null;
};

export type IngredientCostWithUsable = IngredientCostFields &
  UsablePerUnitMetadata &
  IngredientDensityMetadata;

export type UsableConversionSource =
  | "explicit_fields"
  | "reference_fields"
  | "purchase_quantity_per_piece"
  | "embedded_name";

export type ResolvedUsablePerUnit = {
  usableWeightGrams: number | null;
  usableVolumeMl: number | null;
  source: UsableConversionSource | null;
};

/** Resolve grams/ml per one countable purchase unit (not pack totals). */
export function resolveUsablePerCountableUnit(
  ing: IngredientCostWithUsable,
  context?: { ingredientName?: string | null },
): ResolvedUsablePerUnit {
  const explicitG = positiveFinite(ing.usable_weight_grams);
  const explicitMl = positiveFinite(ing.usable_volume_ml);
  if (explicitG != null) {
    return {
      usableWeightGrams: explicitG,
      usableVolumeMl: explicitMl,
      source: "explicit_fields",
    };
  }
  if (explicitMl != null) {
    return { usableWeightGrams: null, usableVolumeMl: explicitMl, source: "explicit_fields" };
  }

  const refG = positiveFinite(ing.reference_weight_grams);
  const refMl = positiveFinite(ing.reference_volume_ml);
  if (refG != null) {
    return {
      usableWeightGrams: refG,
      usableVolumeMl: refMl,
      source: "reference_fields",
    };
  }
  if (refMl != null) {
    return { usableWeightGrams: null, usableVolumeMl: refMl, source: "reference_fields" };
  }

  const costBase = inferIngredientCostBaseUnit(ing);
  const pq = Number(ing.purchase_quantity);
  const embedded = extractEmbeddedMeasureFromIngredientName(context?.ingredientName ?? "");

  if (costBase === "un" && embedded.referenceWeightG != null) {
    if (Number.isFinite(pq) && Math.abs(pq - embedded.referenceWeightG) < 0.01) {
      return {
        usableWeightGrams: embedded.referenceWeightG,
        usableVolumeMl: embedded.referenceVolumeMl,
        source: "purchase_quantity_per_piece",
      };
    }
    if (!Number.isFinite(pq) || pq <= 1 || pq > embedded.referenceWeightG) {
      return {
        usableWeightGrams: embedded.referenceWeightG,
        usableVolumeMl: embedded.referenceVolumeMl,
        source: "embedded_name",
      };
    }
  }

  if (costBase === "un" && embedded.referenceVolumeMl != null) {
    if (Number.isFinite(pq) && Math.abs(pq - embedded.referenceVolumeMl) < 0.01) {
      return {
        usableWeightGrams: null,
        usableVolumeMl: embedded.referenceVolumeMl,
        source: "purchase_quantity_per_piece",
      };
    }
    if (!Number.isFinite(pq) || pq <= 1 || pq > embedded.referenceVolumeMl) {
      return {
        usableWeightGrams: null,
        usableVolumeMl: embedded.referenceVolumeMl,
        source: "embedded_name",
      };
    }
  }

  return { usableWeightGrams: null, usableVolumeMl: null, source: null };
}

export type CountableToWeightLineCostInput = {
  recipeQuantityGrams: number;
  packPriceEur: number;
  purchaseQuantityUnits: number;
  usableGramsPerUnit: number;
};

/**
 * Countable (un) purchase with known usable weight per unit:
 * line € = (recipe_g / usable_g_per_unit) × (pack_price / purchase_units).
 */
export function countableToWeightLineCostEur(input: CountableToWeightLineCostInput): number | null {
  const { recipeQuantityGrams, packPriceEur, purchaseQuantityUnits, usableGramsPerUnit } = input;
  if (
    !Number.isFinite(recipeQuantityGrams) ||
    recipeQuantityGrams < 0 ||
    !Number.isFinite(packPriceEur) ||
    packPriceEur < 0 ||
    !Number.isFinite(purchaseQuantityUnits) ||
    purchaseQuantityUnits <= 0 ||
    !Number.isFinite(usableGramsPerUnit) ||
    usableGramsPerUnit <= 0
  ) {
    return null;
  }
  const pricePerUnit = packPriceEur / purchaseQuantityUnits;
  return (recipeQuantityGrams / usableGramsPerUnit) * pricePerUnit;
}

export type CountableToVolumeLineCostInput = {
  recipeQuantityMl: number;
  packPriceEur: number;
  purchaseQuantityUnits: number;
  usableMlPerUnit: number;
};

export function countableToVolumeLineCostEur(input: CountableToVolumeLineCostInput): number | null {
  const { recipeQuantityMl, packPriceEur, purchaseQuantityUnits, usableMlPerUnit } = input;
  if (
    !Number.isFinite(recipeQuantityMl) ||
    recipeQuantityMl < 0 ||
    !Number.isFinite(packPriceEur) ||
    packPriceEur < 0 ||
    !Number.isFinite(purchaseQuantityUnits) ||
    purchaseQuantityUnits <= 0 ||
    !Number.isFinite(usableMlPerUnit) ||
    usableMlPerUnit <= 0
  ) {
    return null;
  }
  const pricePerUnit = packPriceEur / purchaseQuantityUnits;
  return (recipeQuantityMl / usableMlPerUnit) * pricePerUnit;
}

export type RecipeLineCostViaUsableConversionResult = {
  lineCostEur: number | null;
  converted: boolean;
  conversionKind: "countable_to_weight" | "countable_to_volume" | null;
  usableSource: UsableConversionSource | null;
};

/**
 * When purchase is priced per countable unit but recipe uses mass/volume,
 * convert via usable grams/ml per purchase unit. Returns null without usable data.
 */
export type RecipeLineCostViaDensityConversionResult = {
  lineCostEur: number | null;
  converted: boolean;
  conversionKind: "volume_to_weight" | "weight_to_volume" | null;
};

export type RecipeLineCostViaPackagedLiquidConversionResult = {
  lineCostEur: number | null;
  converted: boolean;
  packMl: number | null;
};

/**
 * Retail volume packs (e.g. 450 ml jar @ pack price): recipe ml × (pack € / pack ml).
 * Runs before density when pack volume is known from operational fields.
 */
export function recipeLineCostViaPackagedLiquidConversion(
  recipeQty: number,
  recipeUnit: string | null | undefined,
  ing: IngredientCostWithUsable,
): RecipeLineCostViaPackagedLiquidConversionResult {
  const empty: RecipeLineCostViaPackagedLiquidConversionResult = {
    lineCostEur: null,
    converted: false,
    packMl: null,
  };

  if (!isOperationalPricingResolved(ing)) return empty;

  const recipeNorm = normalizeToBaseUnit(recipeQty, recipeUnit);
  if (!recipeNorm || recipeNorm.baseUnit !== "ml") return empty;

  const packMl = resolvePackagedLiquidPackMl(ing);
  if (packMl == null) return empty;

  const packPrice = Number(ing.current_price);
  if (!Number.isFinite(packPrice) || packPrice <= 0) return empty;

  const lineCostEur = recipeNorm.quantity * (packPrice / packMl);
  if (!Number.isFinite(lineCostEur) || lineCostEur < 0) return empty;

  return {
    lineCostEur,
    converted: true,
    packMl,
  };
}

/**
 * Cross weight/volume families only when explicit ingredient density is set (no global defaults).
 */
export function recipeLineCostViaDensityConversion(
  recipeQty: number,
  recipeUnit: string | null | undefined,
  ing: IngredientCostWithUsable,
): RecipeLineCostViaDensityConversionResult {
  const empty: RecipeLineCostViaDensityConversionResult = {
    lineCostEur: null,
    converted: false,
    conversionKind: null,
  };

  const densityGPerMl = resolveIngredientDensityGPerMl(ing);
  if (densityGPerMl == null || !isOperationalPricingResolved(ing)) return empty;

  const recipeNorm = normalizeToBaseUnit(recipeQty, recipeUnit);
  if (!recipeNorm) return empty;

  const costBase = inferIngredientCostBaseUnit(ing);
  const pricePerBase = resolvedOperationalUnitCostEur(ing);
  if (pricePerBase == null) return empty;

  if (recipeNorm.baseUnit === "ml" && costBase === "g") {
    const recipeGrams = recipeNorm.quantity * densityGPerMl;
    if (!Number.isFinite(recipeGrams) || recipeGrams < 0) return empty;
    const lineCostEur = recipeGrams * pricePerBase;
    logCrossDomainConversion({
      sourceUnit: recipeUnit ?? "ml",
      targetUnit: costBase,
      densityGPerMl,
      recipeQuantity: recipeQty,
      recipeNormalizedQuantity: recipeNorm.quantity,
      recipeNormalizedUnit: recipeNorm.baseUnit,
      intermediateGrams: recipeGrams,
      intermediateMl: recipeNorm.quantity,
      operationalQuantity: recipeGrams,
      operationalUnit: "g",
      lineCostEur,
      conversionKind: "volume_to_weight",
    });
    return {
      lineCostEur,
      converted: true,
      conversionKind: "volume_to_weight",
    };
  }

  if (recipeNorm.baseUnit === "g" && costBase === "ml") {
    const recipeMl = recipeNorm.quantity / densityGPerMl;
    if (!Number.isFinite(recipeMl) || recipeMl < 0) return empty;
    const lineCostEur = recipeMl * pricePerBase;
    logCrossDomainConversion({
      sourceUnit: recipeUnit ?? "g",
      targetUnit: costBase,
      densityGPerMl,
      recipeQuantity: recipeQty,
      recipeNormalizedQuantity: recipeNorm.quantity,
      recipeNormalizedUnit: recipeNorm.baseUnit,
      intermediateGrams: recipeNorm.quantity,
      intermediateMl: recipeMl,
      operationalQuantity: recipeMl,
      operationalUnit: "ml",
      lineCostEur,
      conversionKind: "weight_to_volume",
    });
    return {
      lineCostEur,
      converted: true,
      conversionKind: "weight_to_volume",
    };
  }

  return empty;
}

/** Direct countable: recipe `un` × purchase priced per `un` (no usable-weight bridge). */
export function directCountableLineCostEur(
  recipeQty: number,
  recipeUnit: string | null | undefined,
  ing: IngredientCostWithUsable,
): number | null {
  if (!isOperationalPricingResolved(ing)) return null;
  if (inferIngredientCostBaseUnit(ing) !== "un") return null;
  const recipeNorm = normalizeToBaseUnit(recipeQty, recipeUnit);
  if (!recipeNorm || recipeNorm.baseUnit !== "un") return null;
  const unitCost = resolvedOperationalUnitCostEur(ing);
  if (unitCost == null) return null;
  return recipeNorm.quantity * unitCost;
}

export function recipeLineCostViaUsableConversion(
  recipeQty: number,
  recipeUnit: string | null | undefined,
  ing: IngredientCostWithUsable,
  context?: { ingredientName?: string | null },
): RecipeLineCostViaUsableConversionResult {
  const empty: RecipeLineCostViaUsableConversionResult = {
    lineCostEur: null,
    converted: false,
    conversionKind: null,
    usableSource: null,
  };

  if (!isOperationalPricingResolved(ing)) return empty;

  const costBase = inferIngredientCostBaseUnit(ing);
  if (costBase !== "un") return empty;

  const recipeNorm = normalizeToBaseUnit(recipeQty, recipeUnit);
  if (!recipeNorm) return empty;

  // Recipe already in countable units — never route through per-piece gram metadata.
  if (recipeNorm.baseUnit === "un") return empty;

  const usable = resolveUsablePerCountableUnit(ing, context);
  const packPrice = Number(ing.current_price);
  const purchaseUnits = purchaseQuantityDenom(ing.purchase_quantity);

  if (recipeNorm.baseUnit === "g" && usable.usableWeightGrams != null) {
    const lineCostEur = countableToWeightLineCostEur({
      recipeQuantityGrams: recipeNorm.quantity,
      packPriceEur: packPrice,
      purchaseQuantityUnits: purchaseUnits,
      usableGramsPerUnit: usable.usableWeightGrams,
    });
    if (lineCostEur == null) return empty;
    return {
      lineCostEur,
      converted: true,
      conversionKind: "countable_to_weight",
      usableSource: usable.source,
    };
  }

  if (recipeNorm.baseUnit === "ml" && usable.usableVolumeMl != null) {
    // Single-pack liquid: purchase_quantity is pack ml, not unit count — avoid ÷pq twice.
    const lineCostEur =
      purchaseUnits === usable.usableVolumeMl
        ? recipeNorm.quantity * (packPrice / purchaseUnits)
        : countableToVolumeLineCostEur({
            recipeQuantityMl: recipeNorm.quantity,
            packPriceEur: packPrice,
            purchaseQuantityUnits: purchaseUnits,
            usableMlPerUnit: usable.usableVolumeMl,
          });
    if (lineCostEur == null) return empty;
    return {
      lineCostEur,
      converted: true,
      conversionKind: "countable_to_volume",
      usableSource: usable.source,
    };
  }

  return empty;
}

function positiveFinite(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function operationalCostPerKgFromCountableUsable(
  ing: IngredientCostWithUsable,
  context?: { ingredientName?: string | null },
): number | null {
  const usable = resolveUsablePerCountableUnit(ing, context);
  if (usable.usableWeightGrams == null) return null;
  const pack = Number(ing.current_price);
  const units = purchaseQuantityDenom(ing.purchase_quantity);
  if (!Number.isFinite(pack) || pack <= 0 || units <= 0) return null;
  const kgPerUnit = usable.usableWeightGrams / 1000;
  if (kgPerUnit <= 0) return null;
  return pack / units / kgPerUnit;
}

/** For diagnostics: recipe base unit after conversion attempt. */
export function resolvedRecipeCostBaseUnit(
  recipeUnit: string | null | undefined,
): BaseUnit | null {
  return normalizeToBaseUnit(1, recipeUnit)?.baseUnit ?? null;
}
