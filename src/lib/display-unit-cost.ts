import { formatCurrency } from "@/lib/display-format";
import {
  inferIngredientCostBaseUnit,
  type IngredientCostFields,
} from "@/lib/ingredient-unit-cost";
import type { BaseUnit } from "@/lib/recipe-unit-normalization";
import { normalizeRecipeUsageUnitOption } from "@/lib/recipe-usage-unit-memory";

/** Internal costing base plus prep/usage units already expressed per kg or L. */
export type DisplayUnitCostBase = BaseUnit | "kg" | "L";

export type DisplayUnitCostResult = {
  displayValue: number;
  displayUnit: string;
  formattedLabel: string;
};

function normalizeDisplayBaseUnit(
  unit: string | null | undefined,
): DisplayUnitCostBase | null {
  const raw = unit?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "g" || raw === "gram" || raw === "grams" || raw === "gr") return "g";
  if (raw === "ml" || raw === "milliliter" || raw === "milliliters") return "ml";
  if (raw === "un" || raw === "unit" || raw === "units" || raw === "unid") return "un";
  if (raw === "kg" || raw === "kilogram" || raw === "kilograms" || raw === "kgs") {
    return "kg";
  }
  if (raw === "l" || raw === "liter" || raw === "liters" || raw === "litre" || raw === "litres") {
    return "L";
  }
  return null;
}

/** Map internal €/base to human-friendly display unit and scaled value. */
export function scaleUnitCostForDisplay(
  internalUnitCost: number,
  internalBaseUnit: DisplayUnitCostBase,
): { displayValue: number; displayUnit: string } {
  switch (internalBaseUnit) {
    case "g":
      return { displayValue: internalUnitCost * 1000, displayUnit: "kg" };
    case "ml":
      return { displayValue: internalUnitCost * 1000, displayUnit: "L" };
    case "un":
      return { displayValue: internalUnitCost, displayUnit: "un" };
    case "kg":
      return { displayValue: internalUnitCost, displayUnit: "kg" };
    case "L":
      return { displayValue: internalUnitCost, displayUnit: "L" };
    default:
      return { displayValue: internalUnitCost, displayUnit: internalBaseUnit };
  }
}

export function formatDisplayUnitCost(
  internalUnitCost: number,
  internalBaseUnit: DisplayUnitCostBase | string | null | undefined,
): DisplayUnitCostResult {
  const base =
    normalizeDisplayBaseUnit(
      typeof internalBaseUnit === "string" ? internalBaseUnit : String(internalBaseUnit),
    ) ?? "g";
  const { displayValue, displayUnit } = scaleUnitCostForDisplay(internalUnitCost, base);
  const formattedLabel = `${formatCurrency(displayValue)}/${displayUnit}`;
  return { displayValue, displayUnit, formattedLabel };
}

export function inferInternalBaseForUnitCostDisplay(input: {
  contextUnit: string | null | undefined;
  costFields?: IngredientCostFields | null;
  /** Prep / per-usage rows: €/L or €/kg follow usage unit, not catalog g/ml base. */
  preferUsageUnitSemantics?: boolean;
}): DisplayUnitCostBase {
  const opt = normalizeRecipeUsageUnitOption(input.contextUnit);
  if (opt === "un") return "un";

  if (input.costFields && input.preferUsageUnitSemantics !== true) {
    const internal = inferIngredientCostBaseUnit(input.costFields);
    if (opt === "kg" && internal === "g") return "g";
    if (opt === "L" && internal === "ml") return "ml";
    // Recipe/context g|ml wins over catalog "un" (hybrid countable purchase + gram line).
    if (opt === "g" || opt === "ml") return opt;
    if (!opt) return internal;
  }

  if (opt === "kg") return "kg";
  if (opt === "L") return "L";
  if (opt === "g") return "g";
  if (opt === "ml") return "ml";
  if (input.costFields) return inferIngredientCostBaseUnit(input.costFields);
  return "g";
}

export function formatDisplayUnitCostForContext(
  internalUnitCost: number,
  contextUnit: string | null | undefined,
  options?: {
    costFields?: IngredientCostFields | null;
    preferUsageUnitSemantics?: boolean;
    internalBaseUnit?: DisplayUnitCostBase | null;
  },
): string {
  const base =
    options?.internalBaseUnit ??
    inferInternalBaseForUnitCostDisplay({
      contextUnit,
      costFields: options?.costFields,
      preferUsageUnitSemantics: options?.preferUsageUnitSemantics,
    });
  return formatDisplayUnitCost(internalUnitCost, base).formattedLabel;
}
