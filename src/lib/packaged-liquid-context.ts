import { formatCurrency } from "@/lib/display-format";
import { formatDisplayUnitCost } from "@/lib/display-unit-cost";
import {
  inferIngredientCostBaseUnit,
  purchaseQuantityDenom,
  type IngredientCostFields,
} from "@/lib/ingredient-unit-cost";

const PACK_ML_MIN = 50;
const PACK_ML_MAX = 999;

export type PackagedLiquidContextInput = {
  current_price?: number | null;
  purchase_quantity?: number | null;
  cost_base_unit?: IngredientCostFields["cost_base_unit"];
  usable_volume_ml?: number | null;
};

export type PackagedLiquidContext = {
  packMl: number;
  packSizeLabel: string;
  packPriceLabel: string;
  operationalPerLLabel: string;
  /** Optional tertiary metadata line: `450ml pack · €4.59` */
  subtitle: string;
  /** Same as subtitle — single-line pack context for tables and pickers. */
  compactLabel: string;
};

export type PackagedLiquidContextBuildOptions = {
  purchaseDate?: string | null;
};

function finitePackMl(value: number | null | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < PACK_ML_MIN || n > PACK_ML_MAX) return null;
  return n;
}

/** Retail bottle volume (ml) for display — does not affect costing. */
export function resolvePackagedLiquidPackMl(
  fields: PackagedLiquidContextInput,
): number | null {
  const usable = finitePackMl(fields.usable_volume_ml);
  if (usable != null) return usable;

  const pq = purchaseQuantityDenom(fields.purchase_quantity);
  const base =
    fields.cost_base_unit ?? inferIngredientCostBaseUnit(fields as IngredientCostFields);

  if (base === "ml" && pq >= PACK_ML_MIN && pq <= PACK_ML_MAX) return pq;

  return null;
}

/**
 * Volume-packaged retail liquids (e.g. Hellmann's 450ml @ €4.59).
 * Uses operational overlay fields only — no resolver or conversion changes.
 */
export function shouldShowPackagedLiquidContext(
  fields: PackagedLiquidContextInput,
): boolean {
  const packMl = resolvePackagedLiquidPackMl(fields);
  if (packMl == null) return false;

  const packPrice = Number(fields.current_price);
  if (!Number.isFinite(packPrice) || packPrice <= 0) return false;

  const pq = purchaseQuantityDenom(fields.purchase_quantity);
  const base =
    fields.cost_base_unit ?? inferIngredientCostBaseUnit(fields as IngredientCostFields);
  const usable = finitePackMl(fields.usable_volume_ml);

  if (base === "ml") {
    if (pq === 1 && usable != null) return true;
    if (usable != null && usable === packMl) return true;
    if (pq >= PACK_ML_MIN && pq <= PACK_ML_MAX) return true;
  }

  if (usable != null && usable === packMl) return true;

  return false;
}

export function buildPackagedLiquidContext(
  fields: PackagedLiquidContextInput,
  _options?: PackagedLiquidContextBuildOptions,
): PackagedLiquidContext | null {
  if (!shouldShowPackagedLiquidContext(fields)) return null;

  const packMl = resolvePackagedLiquidPackMl(fields)!;
  const packPrice = Number(fields.current_price);
  const unitCostPerMl = packPrice / packMl;
  const operationalPerL = formatDisplayUnitCost(unitCostPerMl, "ml").formattedLabel;

  const packSizeLabel = `${packMl}ml pack`;
  const packPriceLabel = `Pack ${formatCurrency(packPrice)}`;
  const operationalPerLLabel = operationalPerL;

  const compactLabel = `${packMl}ml pack · ${formatCurrency(packPrice)}`;

  return {
    packMl,
    packSizeLabel,
    packPriceLabel,
    operationalPerLLabel,
    subtitle: compactLabel,
    compactLabel,
  };
}

/** Convenience for tests and direct pack price + volume input. */
export function formatPackagedLiquidContext(input: {
  price: number;
  ml: number;
  purchaseDate?: string | null;
}): string {
  return (
    buildPackagedLiquidContext(
      {
        current_price: input.price,
        purchase_quantity: input.ml,
        cost_base_unit: "ml",
      },
      { purchaseDate: input.purchaseDate },
    )?.compactLabel ?? ""
  );
}

export function formatPackagedLiquidContextFromCostFields(
  fields: IngredientCostFields | null | undefined,
  options?: PackagedLiquidContextBuildOptions,
): string | null {
  if (!fields) return null;
  return buildPackagedLiquidContext(fields, options)?.compactLabel ?? null;
}
