import {
  normalizeRecipeUsageUnitOption,
  type RecipeUsageUnitOption,
} from "@/lib/recipe-usage-unit-memory";

export type BaseUnit = "ml" | "g" | "un";

function baseUnitFor(option: RecipeUsageUnitOption): BaseUnit {
  if (option === "ml" || option === "L") return "ml";
  if (option === "g" || option === "kg") return "g";
  return "un";
}

function toBaseQuantity(option: RecipeUsageUnitOption, quantity: number): number {
  if (option === "L" || option === "kg") return quantity * 1000;
  return quantity;
}

/** Convert quantity to canonical base units (ml, g, or un). */
export function normalizeToBaseUnit(
  quantity: number,
  unit: string | null | undefined,
): { quantity: number; baseUnit: BaseUnit } | null {
  const option = normalizeRecipeUsageUnitOption(unit);
  if (!option) return null;
  const qty = Number(quantity);
  if (!Number.isFinite(qty)) return null;
  return {
    quantity: toBaseQuantity(option, qty),
    baseUnit: baseUnitFor(option),
  };
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
  const effectiveUsageUnit = usageOption ? usageUnit : outputUnit;

  if (!outputOption) {
    const out = Number(outputQty);
    const usage = Number(usageQty);
    if (!Number.isFinite(out) || out <= 0) return { cost: 0 };
    if (!Number.isFinite(usage)) return { cost: null };
    if (usageOption && !outputOption) {
      return {
        cost: null,
        warning: "Prep output unit required for unit conversion",
      };
    }
    const total = Number(prepTotalCost);
    const safeTotal = Number.isFinite(total) ? total : 0;
    return { cost: usage * (safeTotal / out) };
  }

  const outputNorm = normalizeToBaseUnit(Number(outputQty), outputUnit);
  if (!outputNorm || outputNorm.quantity <= 0) return { cost: 0 };

  const usageNorm = normalizeToBaseUnit(Number(usageQty), effectiveUsageUnit);
  if (!usageNorm) {
    return { cost: null, warning: "Unknown usage unit" };
  }

  if (usageNorm.baseUnit !== outputNorm.baseUnit) {
    return {
      cost: null,
      warning: incompatibleUnitsWarning(usageUnit ?? effectiveUsageUnit, outputUnit),
    };
  }

  const unitCost = Number(prepTotalCost) / outputNorm.quantity;
  if (!Number.isFinite(unitCost)) return { cost: null };
  return { cost: usageNorm.quantity * unitCost };
}
