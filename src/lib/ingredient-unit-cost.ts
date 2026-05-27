import type { Tables } from "@/integrations/supabase/types";
import type { BaseUnit } from "@/lib/recipe-unit-normalization";

export type IngredientCostFields = Pick<
  Tables<"ingredients">,
  "current_price" | "purchase_quantity"
> &
  UsablePerUnitFields &
  IngredientDensityMetadata & {
    /** Internal costing base (g, ml, un) — set from invoice normalization, not persisted. */
    cost_base_unit?: BaseUnit | null;
  };

/** Optional in-memory scaffolding for hybrid/countable-to-weighted ingredients. */
export type IngredientUnitMetadata = {
  purchaseUnit: string | null;
  canonicalUnit: BaseUnit | null;
  usableUnit: BaseUnit | null;
  /** Grams of usable product per one countable purchase unit (e.g. 80g per bun). */
  usableWeightGrams?: number | null;
  /** Milliliters of usable product per one countable purchase unit. */
  usableVolumeMl?: number | null;
  referenceWeight?: number | null;
  referenceVolume?: number | null;
  referenceWeightGrams?: number | null;
  referenceVolumeMl?: number | null;
  edibleYieldPercent?: number | null;
};

/** Per-piece usable measure carried on invoice overlay / resolver (not always persisted). */
export type UsablePerUnitFields = {
  usable_weight_grams?: number | null;
  usable_volume_ml?: number | null;
  reference_weight_grams?: number | null;
  reference_volume_ml?: number | null;
};

/** Optional ingredient-specific ml↔g bridge (never a global table). */
export type IngredientDensityMetadata = {
  /** Canonical persisted field: grams per milliliter (g/ml). */
  density_g_per_ml?: number | null;
  /** Legacy aliases — prefer {@link density_g_per_ml}. */
  grams_per_ml?: number | null;
  gramsPerMl?: number | null;
};

/** Resolves explicit ingredient density (g/ml); never guesses or defaults. */
export function resolveIngredientDensityGPerMl(
  ing: IngredientDensityMetadata,
): number | null {
  const n = Number(
    ing.density_g_per_ml ?? ing.grams_per_ml ?? ing.gramsPerMl,
  );
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @deprecated Use {@link resolveIngredientDensityGPerMl}. */
export function resolveIngredientGramsPerMl(
  ing: IngredientDensityMetadata,
): number | null {
  return resolveIngredientDensityGPerMl(ing);
}

/** Denominator for pack price → per–base-unit cost (never below 1). */
export function purchaseQuantityDenom(purchase_quantity: number | null | undefined): number {
  const n = Number(purchase_quantity);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Infer costing base when `cost_base_unit` was not set on overlay fields. */
export function inferIngredientCostBaseUnit(
  ing: IngredientCostFields,
  _context?: { ingredientName?: string | null },
): BaseUnit {
  const explicit = ing.cost_base_unit;
  if (explicit === "g" || explicit === "ml" || explicit === "un") return explicit;
  const pq = purchaseQuantityDenom(ing.purchase_quantity);
  if (pq === 1000) return "g";
  if (pq >= 1000) return "ml";
  return "un";
}

export const MISSING_OPERATIONAL_PRICING_LABEL = "Missing operational pricing";

/** Compact table/PDF cell when operational pricing is missing (not the long label). */
export const UNRESOLVED_COST_CELL = "—";

/** True when pack price and denominator are present for recipe costing. */
export function isOperationalPricingResolved(ing: IngredientCostFields): boolean {
  const pack = Number(ing.current_price);
  const pq = Number(ing.purchase_quantity);
  return Number.isFinite(pack) && pack > 0 && Number.isFinite(pq) && pq > 0;
}

/** € per base unit, or null when invoice/catalog fields are missing (never treat as €0). */
export function resolvedOperationalUnitCostEur(ing: IngredientCostFields): number | null {
  if (!isOperationalPricingResolved(ing)) return null;
  const pack = Number(ing.current_price);
  return pack / purchaseQuantityDenom(ing.purchase_quantity);
}

/** € per internal base unit (g, ml, or un): `current_price / max(purchase_quantity, 1)`. */
export function effectiveIngredientUnitCostEur(ing: IngredientCostFields): number {
  return resolvedOperationalUnitCostEur(ing) ?? 0;
}

export function ingredientDisplayBaseUnit(ing: Pick<Tables<"ingredients">, "base_unit" | "unit" | "purchase_unit">): string {
  const b = ing.base_unit?.trim();
  if (b) return b;
  const u = ing.unit?.trim();
  if (u) return u;
  const p = ing.purchase_unit?.trim();
  if (p) return p;
  return "unit";
}
