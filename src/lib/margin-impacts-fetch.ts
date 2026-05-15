import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";

/**
 * True when `recipe_margin_impacts` is not available to PostgREST (migration not applied or table not exposed).
 * Apply: `supabase/migrations/20260514150000_recipe_margin_impacts.sql`
 */
export function isRecipeMarginImpactsUnavailableError(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  const { code, message, details, hint } = error;
  const m = [message, details, hint].filter(Boolean).join(" ").toLowerCase();
  if (code === "PGRST205" || code === "42P01") return true;
  if (m.includes("recipe_margin_impacts") && (m.includes("schema cache") || m.includes("404") || m.includes("not found") || m.includes("does not exist"))) {
    return true;
  }
  if (m.includes("could not find") && m.includes("recipe_margin_impacts")) return true;
  return false;
}

/** After first "table missing" response, skip further PostgREST calls until full page reload (avoids 404 loops). */
let recipeMarginImpactsTableMissing = false;

let loggedRecipeMarginImpactsUnavailable = false;

/** One console.error per session for missing `recipe_margin_impacts`; avoids tight-loop spam. */
export function logRecipeMarginImpactsUnavailableOnce(context: string, error?: unknown): void {
  if (loggedRecipeMarginImpactsUnavailable) return;
  loggedRecipeMarginImpactsUnavailable = true;
  console.error(
    "[recipe_margin_impacts]",
    context,
    "Table may be missing; run migration supabase/migrations/20260514150000_recipe_margin_impacts.sql.",
    error,
  );
}

export type AppSupabase = SupabaseClient<Database>;

export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";

export const IMPACT_LEVEL_ORDER: readonly ImpactLevel[] = ["HIGH", "MEDIUM", "LOW"];

export function normalizeImpactLevel(level: string | null): ImpactLevel {
  const u = (level ?? "").toUpperCase();
  if (u === "HIGH" || u === "MEDIUM" || u === "LOW") return u;
  return "LOW";
}

export type MergedMarginImpactRow = {
  impact: Tables<"recipe_margin_impacts">;
  recipeName: string;
  ingredientName: string;
};

/**
 * Loads `recipe_margin_impacts` then resolves recipe and ingredient names via flat `.in("id", …)` queries (RLS: session user).
 * If the table is missing from PostgREST, returns `{ rows: [], err: null }` after a single `[recipe_margin_impacts]` log — apply
 * `supabase/migrations/20260514150000_recipe_margin_impacts.sql`.
 */
export async function fetchRecipeMarginImpactsMerged(
  client: AppSupabase,
  options: { limit?: number } = {},
): Promise<{ rows: MergedMarginImpactRow[]; err: string | null }> {
  const limit = options.limit ?? 100;

  if (recipeMarginImpactsTableMissing) {
    return { rows: [], err: null };
  }

  const { data: impacts, error: impErr } = await client
    .from("recipe_margin_impacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (impErr) {
    if (isRecipeMarginImpactsUnavailableError(impErr)) {
      recipeMarginImpactsTableMissing = true;
      logRecipeMarginImpactsUnavailableOnce("fetchRecipeMarginImpactsMerged", impErr);
      return { rows: [], err: null };
    }
    return { rows: [], err: impErr.message };
  }

  recipeMarginImpactsTableMissing = false;

  const list = (impacts ?? []) as Tables<"recipe_margin_impacts">[];
  if (list.length === 0) {
    return { rows: [], err: null };
  }

  const recipeIds = [...new Set(list.map((r) => r.recipe_id))];
  const ingredientIds = [...new Set(list.map((r) => r.ingredient_id))];

  const [recRes, ingRes] = await Promise.all([
    recipeIds.length > 0
      ? client.from("recipes").select("id, name").in("id", recipeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    ingredientIds.length > 0
      ? client.from("ingredients").select("id, name").in("id", ingredientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);

  if (recRes.error) {
    return { rows: [], err: recRes.error.message };
  }
  if (ingRes.error) {
    return { rows: [], err: ingRes.error.message };
  }

  const recipeById = new Map((recRes.data ?? []).map((r) => [r.id, r.name]));
  const ingById = new Map((ingRes.data ?? []).map((i) => [i.id, i.name]));

  const rows: MergedMarginImpactRow[] = list.map((impact) => ({
    impact,
    recipeName: recipeById.get(impact.recipe_id) ?? "Recipe",
    ingredientName: ingById.get(impact.ingredient_id) ?? "Ingredient",
  }));

  return { rows, err: null };
}

/** Single impact row by id (e.g. deep links). Skips network when the table is already known missing. */
export async function fetchRecipeMarginImpactById(
  client: AppSupabase,
  id: string,
): Promise<{ row: Tables<"recipe_margin_impacts"> | null; err: string | null }> {
  if (recipeMarginImpactsTableMissing) {
    return { row: null, err: null };
  }

  const { data, error } = await client.from("recipe_margin_impacts").select("*").eq("id", id).maybeSingle();

  if (error) {
    if (isRecipeMarginImpactsUnavailableError(error)) {
      recipeMarginImpactsTableMissing = true;
      logRecipeMarginImpactsUnavailableOnce("fetchRecipeMarginImpactById", error);
      return { row: null, err: null };
    }
    return { row: null, err: error.message };
  }

  recipeMarginImpactsTableMissing = false;
  return { row: (data ?? null) as Tables<"recipe_margin_impacts"> | null, err: null };
}

/**
 * Recent `recipe_margin_impacts` for one recipe (detail panel). Respects missing-table short-circuit.
 */
export async function fetchRecipeMarginImpactsForRecipe(
  client: AppSupabase,
  recipeId: string,
  options: { limit?: number } = {},
): Promise<{ rows: Tables<"recipe_margin_impacts">[]; err: string | null }> {
  if (recipeMarginImpactsTableMissing) {
    return { rows: [], err: null };
  }

  const lim = options.limit ?? 5;
  const { data, error } = await client
    .from("recipe_margin_impacts")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .limit(lim);

  if (error) {
    if (isRecipeMarginImpactsUnavailableError(error)) {
      recipeMarginImpactsTableMissing = true;
      logRecipeMarginImpactsUnavailableOnce("fetchRecipeMarginImpactsForRecipe", error);
      return { rows: [], err: null };
    }
    return { rows: [], err: error.message };
  }

  recipeMarginImpactsTableMissing = false;
  return { rows: (data ?? []) as Tables<"recipe_margin_impacts">[], err: null };
}
