import type { Tables } from "@/integrations/supabase/types";

type CostFields = Pick<Tables<"ingredients">, "current_price" | "purchase_quantity">;

/** Denominator for pack price → per–base-unit cost (never below 1). */
export function purchaseQuantityDenom(purchase_quantity: number | null | undefined): number {
  const n = Number(purchase_quantity);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** € per recipe `base_unit`: `current_price / max(purchase_quantity, 1)`. */
export function effectiveIngredientUnitCostEur(ing: CostFields): number {
  const pack = Number(ing.current_price);
  const safePack = Number.isFinite(pack) ? pack : 0;
  return safePack / purchaseQuantityDenom(ing.purchase_quantity);
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
