/**
 * Gated diagnostics for canonical ingredient graph integrity (recipes, picker, food cost).
 *
 * Enable in prod: `window.__MARGINLY_RECIPE_CANONICAL_TRACE__ = true`
 * On by default in Vite DEV.
 */

export const RECIPE_CANONICAL_INTEGRITY_PREFIX = "[recipe_canonical_integrity]";
export const RECIPE_ALIAS_LEAK_PREFIX = "[recipe_alias_leak_detected]";
export const FOOD_COST_RECALCULATION_PREFIX = "[food_cost_recalculation_source]";
export const LEGACY_RECIPE_EMBED_PREFIX = "[legacy_recipe_embed_detected]";
export const RECIPE_MISSING_CANONICAL_FK_PREFIX = "[recipe_missing_canonical_fk]";
export const RECIPE_FOOD_COST_LEGACY_SOURCE_PREFIX = "[recipe_food_cost_legacy_source]";
export const RECIPE_MIGRATION_CANDIDATE_PREFIX = "[recipe_migration_candidate]";
export const RECIPE_ORPHAN_EMBED_PREFIX = "[recipe_orphan_embed]";
export const RECIPE_AMBIGUOUS_CANONICAL_PREFIX = "[recipe_ambiguous_canonical]";

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

export type RecipeFoodCostSourceKind = "canonical_catalog" | "embed_snapshot" | "ingredients_join";

export function traceLegacyRecipeEmbedDetected(details: Record<string, unknown>): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.warn(`${LEGACY_RECIPE_EMBED_PREFIX}`, details);
}

export function traceRecipeMissingCanonicalFk(details: Record<string, unknown>): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.warn(`${RECIPE_MISSING_CANONICAL_FK_PREFIX}`, details);
}

export function traceRecipeFoodCostLegacySource(details: Record<string, unknown> & {
  source: RecipeFoodCostSourceKind;
}): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.info(`${RECIPE_FOOD_COST_LEGACY_SOURCE_PREFIX}`, details);
}

export function traceRecipeMigrationCandidate(details: Record<string, unknown>): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.info(`${RECIPE_MIGRATION_CANDIDATE_PREFIX}`, details);
}

export function traceRecipeOrphanEmbed(details: Record<string, unknown>): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.warn(`${RECIPE_ORPHAN_EMBED_PREFIX}`, details);
}

export function traceRecipeAmbiguousCanonical(details: Record<string, unknown>): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;
  console.warn(`${RECIPE_AMBIGUOUS_CANONICAL_PREFIX}`, details);
}
