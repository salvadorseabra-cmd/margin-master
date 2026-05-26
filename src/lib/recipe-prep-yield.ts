import { formatCurrency, formatQuantityWithUnit, formatUnitCostCurrency } from "@/lib/display-format";
import { computePrepServingsPerBatch } from "@/lib/recipe-prep-servings";

export type PrepMeasuredQuantity = {
  quantity: number | null | undefined;
  unit: string | null | undefined;
};

export type PrepYieldIntelligence = {
  batchYieldLabel: string | null;
  servingSizeLabel: string | null;
  estimatedServingsLabel: string | null;
  costPerServingLabel: string | null;
  servingsCount: number | null;
  costPerServingEur: number | null;
};

/** Servings per batch (display / metadata only — same normalization as costing helpers). */
export function derivePrepServings(
  batchOutput: PrepMeasuredQuantity,
  servingSize: PrepMeasuredQuantity,
): number | null {
  return computePrepServingsPerBatch({
    prepOutputQty: batchOutput.quantity,
    prepOutputUnit: batchOutput.unit,
    usageQty: servingSize.quantity,
    usageUnit: servingSize.unit,
  });
}

/** € per serving from an existing batch total (no costing changes). */
export function deriveCostPerServing(
  batchCostEur: number | null | undefined,
  servings: number | null | undefined,
): number | null {
  const total = Number(batchCostEur);
  const count = Number(servings);
  if (!Number.isFinite(total) || total < 0) return null;
  if (!Number.isFinite(count) || count <= 0) return null;
  return total / count;
}

export function formatPrepBatchYieldLabel(
  quantity: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unitLabel = unit?.trim();
  if (!unitLabel) return null;
  return formatQuantityWithUnit(qty, unitLabel);
}

export function formatPrepServingSizeLabel(
  quantity: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  return formatPrepBatchYieldLabel(quantity, unit);
}

export function formatEstimatedServingsLabel(servings: number | null | undefined): string | null {
  const count = Number(servings);
  if (!Number.isFinite(count) || count <= 0) return null;
  return `~${count.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatCostPerServingLabel(costPerServingEur: number | null | undefined): string | null {
  const value = Number(costPerServingEur);
  if (!Number.isFinite(value) || value < 0) return null;
  return `~${formatUnitCostCurrency(value)}`;
}

export function buildPrepYieldIntelligence(input: {
  batchOutputQty: number | null | undefined;
  batchOutputUnit: string | null | undefined;
  servingQty: number | null | undefined;
  servingUnit: string | null | undefined;
  batchCostEur: number | null | undefined;
}): PrepYieldIntelligence {
  const batchYieldLabel = formatPrepBatchYieldLabel(input.batchOutputQty, input.batchOutputUnit);
  const servingSizeLabel = formatPrepServingSizeLabel(input.servingQty, input.servingUnit);
  const servingsCount = derivePrepServings(
    { quantity: input.batchOutputQty, unit: input.batchOutputUnit },
    { quantity: input.servingQty, unit: input.servingUnit },
  );
  const costPerServingEur = deriveCostPerServing(input.batchCostEur, servingsCount);

  return {
    batchYieldLabel,
    servingSizeLabel,
    estimatedServingsLabel: formatEstimatedServingsLabel(servingsCount),
    costPerServingLabel: formatCostPerServingLabel(costPerServingEur),
    servingsCount,
    costPerServingEur,
  };
}

/** Short subtitle for prep picker rows (display only). */
export function formatPrepYieldPickerSubtitle(intelligence: PrepYieldIntelligence): string | null {
  const parts: string[] = [];
  if (intelligence.estimatedServingsLabel && intelligence.costPerServingLabel) {
    parts.push(
      `${intelligence.estimatedServingsLabel} servings · ${intelligence.costPerServingLabel}/serving`,
    );
  } else if (intelligence.estimatedServingsLabel) {
    parts.push(`${intelligence.estimatedServingsLabel} servings per batch`);
  } else if (intelligence.batchYieldLabel) {
    parts.push(`Batch ${intelligence.batchYieldLabel}`);
  }
  return parts.length > 0 ? parts.join("") : null;
}

export type PrepUsageLine = {
  sub_recipe_id: string | null | undefined;
  quantity: number | null | undefined;
  unit: string | null | undefined;
};

/** Default serving size from the first parent dish line that uses this prep. */
export function inferPrepServingFromMenuUsage(
  prepId: string,
  recipeLines: readonly PrepUsageLine[],
): PrepMeasuredQuantity | null {
  if (!prepId?.trim()) return null;
  for (const line of recipeLines) {
    if (line.sub_recipe_id !== prepId) continue;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unit = line.unit?.trim();
    if (!unit) continue;
    return { quantity: qty, unit };
  }
  return null;
}

/** Batch food cost label when batch total is known (prep modal header). */
export function formatPrepBatchCostLabel(batchCostEur: number | null | undefined): string | null {
  const total = Number(batchCostEur);
  if (!Number.isFinite(total) || total < 0) return null;
  return formatCurrency(total);
}
