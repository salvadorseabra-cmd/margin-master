/**
 * Gated diagnostics for canonical ingredient graph integrity (recipes, picker, food cost).
 *
 * Enable in prod: `window.__MARGINLY_RECIPE_CANONICAL_TRACE__ = true`
 * On by default in Vite DEV.
 */

export const RECIPE_CANONICAL_INTEGRITY_PREFIX = "[recipe_canonical_integrity]";
export const RECIPE_ALIAS_LEAK_PREFIX = "[recipe_alias_leak_detected]";
export const FOOD_COST_RECALCULATION_PREFIX = "[food_cost_recalculation_source]";

declare global {
  interface Window {
    __MARGINLY_RECIPE_CANONICAL_TRACE__?: boolean;
  }
}

export function isRecipeCanonicalGraphTraceEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  return (
    typeof window !== "undefined" && window.__MARGINLY_RECIPE_CANONICAL_TRACE__ === true
  );
}

export type FoodCostRecalculationTrigger =
  | "catalog_reload"
  | "recipe_save_reload"
  | "canonical_rename"
  | "match_confirm"
  | "recipe_form_recalc"
  | "compute_recipe_cost";

export function traceRecipeCanonicalIntegrity(
  event: "load" | "save",
  details: Record<string, unknown>,
): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.info(`${RECIPE_CANONICAL_INTEGRITY_PREFIX} event=${event}`, details);
}

export function traceRecipeAliasLeakDetected(details: Record<string, unknown>): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.warn(`${RECIPE_ALIAS_LEAK_PREFIX}`, details);
}

export function traceFoodCostRecalculationSource(
  trigger: FoodCostRecalculationTrigger,
  details?: Record<string, unknown>,
): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  const payload = { trigger, ...details };
  console.info(`${FOOD_COST_RECALCULATION_PREFIX}`, payload);
}
