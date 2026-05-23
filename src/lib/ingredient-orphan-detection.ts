/**
 * Detect canonical ingredients with zero operational dependencies (orphans).
 * Orphans are hidden from the main catalog; archive manually from catalog review.
 */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { archiveIngredient } from "@/lib/ingredient-archive";
import {
  isArchivedIngredientEntry,
  normalizeCanonicalIngredientName,
  type IngredientCanonicalInput,
} from "@/lib/ingredient-canonical";
import { looksLikeInvoiceShorthandName } from "@/lib/ingredient-kind";
import {
  INGREDIENT_FK_REASSIGNMENT_TARGETS,
  type AppSupabaseClient,
} from "@/lib/ingredient-merge";
import type { Database } from "@/integrations/supabase/types";

type OrphanClient = SupabaseClient<Database>;

export const INGREDIENT_ORPHAN_LOG_PREFIX = "[ingredient_orphan]";

/** Dependency dimensions checked before treating a canonical row as operationally orphaned. */
export type OrphanDependencyKey =
  | "invoice_aliases"
  | "supplier_aliases"
  | "recipe_ingredients"
  | "prep_recipe_ingredients"
  | "price_history"
  | "margin_impacts";

export type IngredientOrphanReport = {
  ingredientId: string;
  /** `ingredient_aliases` rows (invoice / operational memory). */
  invoiceAliasCount: number;
  /** Alias rows scoped to a supplier (`supplier_name` set). */
  supplierAliasCount: number;
  /** Recipe BOM lines referencing this ingredient. */
  recipeIngredientCount: number;
  /** Subset of recipe lines on `recipes.type = prep`. */
  prepRecipeIngredientCount: number;
  priceHistoryCount: number;
  marginImpactCount: number;
};

export const ORPHAN_REASON_LABELS: Record<OrphanDependencyKey, string> = {
  invoice_aliases: "Aliases de fatura / memória",
  supplier_aliases: "Mapeamentos por fornecedor",
  recipe_ingredients: "Linhas em receitas",
  prep_recipe_ingredients: "Uso em prep (sub-receitas)",
  price_history: "Histórico de preço / stock",
  margin_impacts: "Impactos de margem",
};

export function emptyOrphanReport(ingredientId: string): IngredientOrphanReport {
  return {
    ingredientId,
    invoiceAliasCount: 0,
    supplierAliasCount: 0,
    recipeIngredientCount: 0,
    prepRecipeIngredientCount: 0,
    priceHistoryCount: 0,
    marginImpactCount: 0,
  };
}

/** Non-zero dependency keys blocking orphan status (for review UI). */
export function orphanBlockingReasons(report: IngredientOrphanReport): OrphanDependencyKey[] {
  const reasons: OrphanDependencyKey[] = [];
  if (report.invoiceAliasCount > 0) reasons.push("invoice_aliases");
  if (report.supplierAliasCount > 0) reasons.push("supplier_aliases");
  if (report.recipeIngredientCount > 0) reasons.push("recipe_ingredients");
  if (report.prepRecipeIngredientCount > 0) reasons.push("prep_recipe_ingredients");
  if (report.priceHistoryCount > 0) reasons.push("price_history");
  if (report.marginImpactCount > 0) reasons.push("margin_impacts");
  return reasons;
}

/** True when every operational dependency count is zero. */
export function isIngredientOperationallyOrphaned(report: IngredientOrphanReport): boolean {
  return orphanBlockingReasons(report).length === 0;
}

/** True when the only operational blockers are alias rows (no recipes, price, margin). */
export function isAliasOnlyOperationalDependency(report: IngredientOrphanReport): boolean {
  if (isIngredientOperationallyOrphaned(report)) return false;
  return (
    report.invoiceAliasCount > 0 &&
    report.recipeIngredientCount === 0 &&
    report.prepRecipeIngredientCount === 0 &&
    report.priceHistoryCount === 0 &&
    report.marginImpactCount === 0
  );
}

export type OrphanDependencyRows = {
  aliases: { ingredient_id: string; supplier_name: string | null }[];
  recipeLinks: {
    ingredient_id: string;
    recipes: { type: string | null } | null;
  }[];
  priceHistory: { ingredient_id: string }[];
  marginImpacts: { ingredient_id: string }[];
};

const RECIPE_ORPHAN_LINKS_SELECT =
  "ingredient_id, recipes!recipe_ingredients_recipe_id_fkey(type)";

/** Batch-load FK rows for orphan detection (one query per child table). */
export async function fetchOrphanDependencyRows(
  client: OrphanClient,
  ingredientIds: string[],
): Promise<{ rows: OrphanDependencyRows; error: string | null }> {
  const ids = [...new Set(ingredientIds.map((id) => id?.trim()).filter(Boolean))] as string[];
  if (ids.length === 0) {
    return {
      rows: { aliases: [], recipeLinks: [], priceHistory: [], marginImpacts: [] },
      error: null,
    };
  }

  const [aliasResult, recipeResult, priceResult, marginResult] = await Promise.all([
    client
      .from("ingredient_aliases")
      .select("ingredient_id, supplier_name")
      .in("ingredient_id", ids),
    client.from("recipe_ingredients").select(RECIPE_ORPHAN_LINKS_SELECT).in("ingredient_id", ids),
    client.from("ingredient_price_history").select("ingredient_id").in("ingredient_id", ids),
    client.from("recipe_margin_impacts").select("ingredient_id").in("ingredient_id", ids),
  ]);

  const errors = [aliasResult.error, recipeResult.error, priceResult.error, marginResult.error]
    .filter(Boolean)
    .map((e) => e!.message);
  if (errors.length > 0) {
    return {
      rows: { aliases: [], recipeLinks: [], priceHistory: [], marginImpacts: [] },
      error: errors.join("; "),
    };
  }

  return {
    rows: {
      aliases: (aliasResult.data ?? []) as OrphanDependencyRows["aliases"],
      recipeLinks: (recipeResult.data ?? []) as OrphanDependencyRows["recipeLinks"],
      priceHistory: (priceResult.data ?? []) as OrphanDependencyRows["priceHistory"],
      marginImpacts: (marginResult.data ?? []) as OrphanDependencyRows["marginImpacts"],
    },
    error: null,
  };
}

export function buildOrphanReportsFromDependencyRows(
  ingredientIds: string[],
  dependencyRows: OrphanDependencyRows,
): Map<string, IngredientOrphanReport> {
  const reports = new Map<string, IngredientOrphanReport>();
  for (const id of ingredientIds) {
    reports.set(id, emptyOrphanReport(id));
  }

  for (const row of dependencyRows.aliases) {
    const id = row.ingredient_id?.trim();
    if (!id) continue;
    const report = reports.get(id) ?? emptyOrphanReport(id);
    report.invoiceAliasCount += 1;
    if (row.supplier_name?.trim()) report.supplierAliasCount += 1;
    reports.set(id, report);
  }

  for (const row of dependencyRows.recipeLinks) {
    const id = row.ingredient_id?.trim();
    if (!id) continue;
    const report = reports.get(id) ?? emptyOrphanReport(id);
    report.recipeIngredientCount += 1;
    if (row.recipes?.type === "prep") report.prepRecipeIngredientCount += 1;
    reports.set(id, report);
  }

  for (const table of ["priceHistory", "marginImpacts"] as const) {
    for (const row of dependencyRows[table]) {
      const id = row.ingredient_id?.trim();
      if (!id) continue;
      const report = reports.get(id) ?? emptyOrphanReport(id);
      if (table === "priceHistory") report.priceHistoryCount += 1;
      else report.marginImpactCount += 1;
      reports.set(id, report);
    }
  }

  return reports;
}

/**
 * Batch orphan reports for active canonical catalog rows.
 * Only evaluates non-archived entries in `catalog`.
 */
export async function detectOrphanCanonicalIngredients(
  client: OrphanClient,
  catalog: IngredientCanonicalInput[],
): Promise<{ reports: Map<string, IngredientOrphanReport>; error: string | null }> {
  const activeIds = catalog
    .filter((entry) => entry.id?.trim() && !isArchivedIngredientEntry(entry))
    .map((entry) => entry.id.trim());

  const { rows, error } = await fetchOrphanDependencyRows(client, activeIds);
  if (error) return { reports: new Map(), error };

  return {
    reports: buildOrphanReportsFromDependencyRows(activeIds, rows),
    error: null,
  };
}

function canonicalNameIsSubsetOf(
  entry: IngredientCanonicalInput,
  other: IngredientCanonicalInput,
): boolean {
  const entryNorm = normalizeCanonicalIngredientName(entry.name ?? "");
  const otherNorm = normalizeCanonicalIngredientName(other.name ?? "");
  if (!entryNorm || !otherNorm) return false;
  if (otherNorm.includes(entryNorm)) return true;
  const entryTokens = entryNorm.split(/\s+/).filter(Boolean);
  if (entryTokens.length > 0 && entryTokens.every((token) => otherNorm.includes(token))) {
    return true;
  }
  return false;
}

/** True when another active canonical with real usage is a name superset (e.g. Batata palha ⊃ PALHA). */
export function hasNonOrphanSupersetCanonical(
  entry: IngredientCanonicalInput,
  catalog: IngredientCanonicalInput[],
  orphanReports: Map<string, IngredientOrphanReport>,
): boolean {
  const id = entry.id?.trim();
  if (!id) return false;
  for (const other of catalog) {
    const otherId = other.id?.trim();
    if (!otherId || otherId === id || isArchivedIngredientEntry(other)) continue;
    const otherReport = orphanReports.get(otherId);
    if (!otherReport || isIngredientOperationallyOrphaned(otherReport)) continue;
    if (canonicalNameIsSubsetOf(entry, other)) return true;
  }
  return false;
}

/**
 * Whether a canonical should be hidden from the main Ingredients list.
 * Hides zero-ref orphans/shorthand and alias-only legacy roots superseded by a fuller canonical.
 * Review page may still list all {@link isIngredientOperationallyOrphaned} rows.
 */
export function shouldHideOrphanFromMainCatalog(
  entry: IngredientCanonicalInput,
  catalog: IngredientCanonicalInput[],
  orphanReports: Map<string, IngredientOrphanReport>,
): boolean {
  const id = entry.id?.trim();
  if (!id) return false;
  const report = orphanReports.get(id);
  if (!report) return false;

  if (isIngredientOperationallyOrphaned(report)) {
    if (looksLikeInvoiceShorthandName(entry.name)) return true;
    if (hasNonOrphanSupersetCanonical(entry, catalog, orphanReports)) return true;
    return false;
  }

  if (isAliasOnlyOperationalDependency(report)) {
    return hasNonOrphanSupersetCanonical(entry, catalog, orphanReports);
  }

  return false;
}

/** Human-facing catalog: drop legacy orphaned roots (still in DB until archived). */
export function filterOperationallyActiveCatalog<T extends IngredientCanonicalInput>(
  catalog: T[],
  orphanReports: Map<string, IngredientOrphanReport>,
): T[] {
  return catalog.filter(
    (entry) => !shouldHideOrphanFromMainCatalog(entry, catalog, orphanReports),
  );
}

export type ArchiveOrphanIngredientParams = {
  client: AppSupabaseClient;
  ingredientId: string;
  userId: string;
};

export type ArchiveOrphanIngredientResult = {
  error: PostgrestError | null;
};

/**
 * Soft-archive an operationally orphaned canonical (no merge target).
 * Sets `is_archived` only — does not set `merged_into_ingredient_id`.
 */
export async function archiveOrphanIngredient(
  params: ArchiveOrphanIngredientParams,
): Promise<ArchiveOrphanIngredientResult> {
  const ingredientId = params.ingredientId?.trim();
  const userId = params.userId?.trim();
  if (!ingredientId || !userId) {
    return { error: null };
  }

  const { error } = await archiveIngredient({
    client: params.client,
    ingredientId,
    userId,
  });

  console.info(INGREDIENT_ORPHAN_LOG_PREFIX, "archive_orphan_ingredient", {
    ingredientId,
    userId,
    ok: !error,
    error: error?.message ?? null,
    fkTables: INGREDIENT_FK_REASSIGNMENT_TARGETS.map((t) => t.table),
  });

  return { error };
}
