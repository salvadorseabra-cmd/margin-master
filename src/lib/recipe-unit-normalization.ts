import {
  normalizeRecipeUsageUnitOption,
  type RecipeUsageUnitOption,
} from "@/lib/recipe-usage-unit-memory";
import { logUnitNormalizationTrace } from "@/lib/pricing-trace";

export type BaseUnit = "ml" | "g" | "un";

/** WEIGHT (kg/g), VOLUME (l/ml), COUNTABLE (un/cx/pack/pcs) — recipe costing families. */
export type UnitFamily = "weight" | "volume" | "countable";

const COUNTABLE_ROW_UNITS = new Set([
  "un",
  "uni",
  "unid",
  "unids",
  "unit",
  "units",
  "unidade",
  "unidades",
  "pc",
  "pcs",
  "cx",
  "caixa",
  "caixas",
  "case",
  "cases",
  "pack",
  "packs",
  "box",
  "boxes",
  "tray",
  "trays",
  "bandeja",
  "bandejas",
  "bundle",
  "bundles",
  "embalagem",
  "embalagens",
  "bottle",
  "bottles",
  "garrafa",
  "garrafas",
  "lata",
  "latas",
  "can",
  "cans",
  "saco",
  "sacos",
  "bag",
  "bags",
]);

export function unitFamilyForBaseUnit(baseUnit: BaseUnit): UnitFamily {
  if (baseUnit === "g") return "weight";
  if (baseUnit === "ml") return "volume";
  return "countable";
}

/**
 * Classify invoice / recipe units without treating embedded product weights (e.g. bun 80g) as
 * weight-priced inventory when the purchase row is counted (un, cx, pack).
 */
export function inferUnitFamily(
  rowUnit: string | null | undefined,
  opts?: {
    usableQuantityUnit?: "g" | "ml" | "un" | null;
    purchaseFormatKind?: string | null;
  },
): UnitFamily {
  const normalized = rowUnit?.trim().toLowerCase() ?? "";

  if (normalized === "kg" || normalized === "g" || normalized === "kgs") return "weight";
  if (normalized === "l" || normalized === "ml" || normalized === "lt" || normalized === "ltr") {
    return "volume";
  }

  if (COUNTABLE_ROW_UNITS.has(normalized)) return "countable";
  if (opts?.usableQuantityUnit === "un") return "countable";

  if (opts?.usableQuantityUnit === "ml") return "volume";

  if (opts?.usableQuantityUnit === "g") {
    if (!normalized || COUNTABLE_ROW_UNITS.has(normalized)) return "countable";
    return "weight";
  }

  if (!normalized) {
    if (opts?.purchaseFormatKind === "weight_or_volume") return "weight";
    if (opts?.purchaseFormatKind === "unit_count") return "countable";
    return "countable";
  }

  const usageOption = normalizeRecipeUsageUnitOption(normalized);
  if (usageOption === "g" || usageOption === "kg") return "weight";
  if (usageOption === "ml" || usageOption === "L") return "volume";
  if (usageOption === "un") return "countable";

  return "countable";
}

export function areUnitFamiliesCompatible(a: UnitFamily, b: UnitFamily): boolean {
  return a === b;
}

function baseUnitFor(option: RecipeUsageUnitOption): BaseUnit {
  if (option === "ml" || option === "L") return "ml";
  if (option === "g" || option === "kg") return "g";
  return "un";
}

function toBaseQuantity(option: RecipeUsageUnitOption, quantity: number): number {
  if (option === "L" || option === "kg") return quantity * 1000;
  return quantity;
}

function fromBaseQuantity(option: RecipeUsageUnitOption, baseQuantity: number): number {
  if (option === "L" || option === "kg") return baseQuantity / 1000;
  return baseQuantity;
}

const RECIPE_QUANTITY_REPAIR_MAX = 100_000;

/**
 * Recover recipe-native quantity when a kg/L-scale value was stored with a g/ml unit label
 * (e.g. 15 g mis-persisted as 0.015 with unit `g`).
 */
export function repairRecipeQuantityDoubleNormalization(
  quantity: number,
  unit: string | null | undefined,
): number {
  const option = normalizeRecipeUsageUnitOption(unit);
  if (option !== "g" && option !== "ml") return quantity;
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0 || q >= 1) return quantity;
  const repaired = q * 1000;
  if (repaired < 0.5 || repaired > RECIPE_QUANTITY_REPAIR_MAX) return quantity;
  return repaired;
}

/** Convert a quantity between recipe usage units (g↔kg, ml↔L); count units unchanged. */
export function convertRecipeQuantityBetweenUnits(
  quantity: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
): number {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return quantity;
  const from = normalizeRecipeUsageUnitOption(fromUnit);
  const to = normalizeRecipeUsageUnitOption(toUnit);
  if (!from || !to || from === to) return q;

  const fromNorm = normalizeToBaseUnit(q, from);
  if (!fromNorm) return q;
  const toNorm = normalizeToBaseUnit(1, to);
  if (!toNorm || fromNorm.baseUnit !== toNorm.baseUnit) return q;

  return fromBaseQuantity(to, fromNorm.quantity);
}

/** Convert quantity to canonical base units (ml, g, or un). */
export function normalizeToBaseUnit(
  quantity: number,
  unit: string | null | undefined,
): { quantity: number; baseUnit: BaseUnit } | null {
  const raw = unit?.trim().toLowerCase() ?? "";
  const qty = Number(quantity);
  if (!Number.isFinite(qty)) return null;

  if (raw === "cl") {
    const result = { quantity: qty * 10, baseUnit: "ml" as const };
    logUnitNormalizationTrace({
      inputQuantity: qty,
      inputUnit: unit,
      baseQuantity: result.quantity,
      baseUnit: result.baseUnit,
      reason: "centiliters_to_milliliters",
    });
    return result;
  }

  const option = normalizeRecipeUsageUnitOption(unit);
  if (!option) return null;
  const result = {
    quantity: toBaseQuantity(option, qty),
    baseUnit: baseUnitFor(option),
  };
  if (raw === "l" || option === "L") {
    logUnitNormalizationTrace({
      inputQuantity: qty,
      inputUnit: unit,
      baseQuantity: result.quantity,
      baseUnit: result.baseUnit,
      reason: "liters_to_milliliters",
    });
  }
  return result;
}

export function areUnitsCompatible(
  unitA: string | null | undefined,
  unitB: string | null | undefined,
): boolean {
  const a = normalizeRecipeUsageUnitOption(unitA);
  const b = normalizeRecipeUsageUnitOption(unitB);
  if (!a || !b) return false;
  return baseUnitFor(a) === baseUnitFor(b);
}

/** € per base unit (ml, g, or un) for a prep batch. */
export function computeNormalizedUnitCost(
  totalCost: number,
  outputQty: number | null | undefined,
  outputUnit: string | null | undefined,
): number | null {
  const normalized = normalizeToBaseUnit(Number(outputQty), outputUnit);
  if (!normalized || normalized.quantity <= 0) return null;
  const total = Number(totalCost);
  if (!Number.isFinite(total)) return null;
  return total / normalized.quantity;
}

/** Convert €/base unit to € per display unit (L, kg, etc.). */
export function unitCostPerDisplayUnit(
  costPerBaseUnit: number,
  displayUnit: string | null | undefined,
): number | null {
  const option = normalizeRecipeUsageUnitOption(displayUnit);
  if (!option) return null;
  if (option === "L" || option === "kg") return costPerBaseUnit * 1000;
  return costPerBaseUnit;
}

function formatUnitLabel(unit: string | null | undefined): string {
  const normalized = normalizeRecipeUsageUnitOption(unit);
  return normalized ?? unit?.trim() ?? "?";
}

export function incompatibleUnitsWarning(
  usageUnit: string | null | undefined,
  outputUnit: string | null | undefined,
): string {
  return `Incompatible units (${formatUnitLabel(usageUnit)} vs ${formatUnitLabel(outputUnit)})`;
}

export type PrepLineCostResult = {
  cost: number | null;
  warning?: string;
  outputNormalizedMl?: number | null;
  usageNormalizedMl?: number | null;
};

/**
 * Cost of using `usageQty` of a prep, converting usage and batch output into the same base group.
 * When usage unit is omitted, prep `outputUnit` is assumed.
 */
export function computePrepLineCost(
  usageQty: number,
  usageUnit: string | null | undefined,
  prepTotalCost: number,
  outputQty: number | null | undefined,
  outputUnit: string | null | undefined,
): PrepLineCostResult {
  const outputOption = normalizeRecipeUsageUnitOption(outputUnit);
  const usageOption = normalizeRecipeUsageUnitOption(usageUnit);
  /** When batch output unit is missing, infer from parent usage (e.g. 3000 + null → 3000 ml). */
  const effectiveOutputUnit =
    outputOption != null ? outputUnit : usageOption != null ? usageUnit : outputUnit;
  const effectiveOutputOption = normalizeRecipeUsageUnitOption(effectiveOutputUnit);
  const effectiveUsageUnit = usageOption ? usageUnit : effectiveOutputUnit;

  if (!effectiveOutputOption) {
    const out = Number(outputQty);
    const usage = Number(usageQty);
    if (!Number.isFinite(out) || out <= 0) return { cost: null };
    if (!Number.isFinite(usage)) return { cost: null };
    const total = Number(prepTotalCost);
    if (!Number.isFinite(total)) return { cost: null };
    return { cost: usage * (total / out) };
  }

  let outputNorm = normalizeToBaseUnit(Number(outputQty), effectiveOutputUnit);
  const outputQtyNum = Number(outputQty);
  if (
    effectiveOutputOption === "L" &&
    Number.isFinite(outputQtyNum) &&
    outputQtyNum >= 100 &&
    outputNorm &&
    outputNorm.quantity > 100_000
  ) {
    // Yield already in ml (e.g. 3000) mis-tagged as L — avoid 1000× double conversion.
    outputNorm = normalizeToBaseUnit(outputQtyNum, "ml");
  }
  if (
    !outputOption &&
    usageOption === "ml" &&
    Number.isFinite(outputQtyNum) &&
    outputQtyNum > 0 &&
    outputQtyNum <= 10 &&
    Number.isInteger(outputQtyNum) &&
    outputNorm?.baseUnit === "ml"
  ) {
    // Batch yield saved without unit (e.g. 3 meaning 3 L) while usage is ml.
    outputNorm = { quantity: outputQtyNum * 1000, baseUnit: "ml" };
  }
  if (!outputNorm || outputNorm.quantity <= 0) return { cost: null };

  const usageNorm = normalizeToBaseUnit(Number(usageQty), effectiveUsageUnit);
  if (!usageNorm) {
    return { cost: null, warning: "Unknown usage unit" };
  }

  if (usageNorm.baseUnit !== outputNorm.baseUnit) {
    return {
      cost: null,
      warning: incompatibleUnitsWarning(
        usageUnit ?? effectiveUsageUnit,
        outputUnit ?? effectiveOutputUnit,
      ),
    };
  }

  const unitCost = Number(prepTotalCost) / outputNorm.quantity;
  if (!Number.isFinite(unitCost)) return { cost: null };
  return {
    cost: usageNorm.quantity * unitCost,
    outputNormalizedMl: outputNorm.baseUnit === "ml" ? outputNorm.quantity : null,
    usageNormalizedMl: usageNorm.baseUnit === "ml" ? usageNorm.quantity : null,
  };
}
