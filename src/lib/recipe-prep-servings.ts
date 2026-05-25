import { formatQuantityWithUnit } from "@/lib/display-format";
import { normalizeToBaseUnit } from "@/lib/recipe-unit-normalization";

export type PrepServingsInput = {
  prepOutputQty: number | null | undefined;
  prepOutputUnit: string | null | undefined;
  usageQty: number | null | undefined;
  usageUnit: string | null | undefined;
};

/** Servings per prep batch when usage and output share a base unit group (ml, g, un). */
export function computePrepServingsPerBatch({
  prepOutputQty,
  prepOutputUnit,
  usageQty,
  usageUnit,
}: PrepServingsInput): number | null {
  const outputNorm = normalizeToBaseUnit(Number(prepOutputQty), prepOutputUnit);
  if (!outputNorm || outputNorm.quantity <= 0) return null;

  const usageNorm = normalizeToBaseUnit(Number(usageQty), usageUnit);
  if (!usageNorm || usageNorm.quantity <= 0) return null;

  if (outputNorm.baseUnit !== usageNorm.baseUnit) return null;

  const servings = Math.floor(outputNorm.quantity / usageNorm.quantity);
  if (!Number.isFinite(servings) || servings <= 0) return null;

  return servings;
}

export function formatPrepServingHint(
  usageQty: number,
  usageUnit: string | null | undefined,
  servings: number,
): string {
  const servingLabel = `${formatQuantityWithUnit(usageQty, usageUnit)} serving`;
  return `${servingLabel} · ≈${servings} servings per batch`;
}
