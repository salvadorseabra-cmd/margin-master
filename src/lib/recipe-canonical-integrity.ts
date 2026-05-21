import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  isAliasIngredientEntry,
  isCanonicalIngredientEntry,
  looksLikeInvoiceShorthandName,
} from "@/lib/ingredient-kind";
import { isSyntheticCatalogIngredientId } from "@/lib/ingredient-canonical-synthesis";
import {
  traceFoodCostRecalculationSource,
  traceLegacyRecipeEmbedDetected,
  traceRecipeAliasLeakDetected,
  traceRecipeCanonicalIntegrity,
  traceRecipeFoodCostLegacySource,
  traceRecipeMissingCanonicalFk,
  type FoodCostRecalculationTrigger,
  type RecipeFoodCostSourceKind,
} from "@/lib/recipe-canonical-graph-trace";

export type RecipeIngredientRef = {
  recipeId: string;
  lineId?: string | null;
  ingredientId: string;
  ingredientName?: string | null;
};

export type RecipeEmbedSnapshot = {
  name?: string | null;
  current_price?: number | null;
  purchase_quantity?: number | null;
};

export type RecipeLineWithEmbed = RecipeIngredientRef & {
  embed?: RecipeEmbedSnapshot | null;
};

export type LegacyEmbedFoodCostFinding = RecipeLineWithEmbed & {
  foodCostSource: "embed_snapshot";
  inCanonicalCatalog: boolean;
  staleEmbedName: boolean;
};

export type RecipeCanonicalDependencyReport = {
  recipeCount: number;
  lineCount: number;
  canonicalCatalogSize: number;
  lines: RecipeCanonicalLineAudit[];
  missingCanonicalFk: RecipeCanonicalLineAudit[];
  orphanIngredientIds: string[];
  legacyEmbedFoodCost: LegacyEmbedFoodCostFinding[];
  staleEmbedNames: Array<{
    recipeId: string;
    lineId?: string | null;
    ingredientId: string;
    embedName: string;
    catalogName: string;
  }>;
};

export type RecipeCanonicalLineAudit = RecipeIngredientRef & {
  inCanonicalCatalog: boolean;
  reason?: "missing_from_catalog" | "shorthand_pollution" | "alias_kind" | "synthetic_or_temp_id";
};

export type PickerAliasLeak = {
  ingredientId: string;
  displayName: string;
  reason: "shorthand_name" | "alias_kind" | "non_catalog_id" | "synthetic_or_temp_id";
};

export function canonicalCatalogIdSet(
  catalog: IngredientCanonicalInput[],
): Set<string> {
  return new Set(catalog.map((row) => row.id).filter(Boolean));
}

function nonCanonicalIdReason(
  ingredientId: string,
  catalogById: Map<string, IngredientCanonicalInput>,
): RecipeCanonicalLineAudit["reason"] | null {
  const id = ingredientId.trim();
  if (!id) return "missing_from_catalog";
  if (id.startsWith("invoice:") || id.startsWith("temp:") || id.startsWith("temporary:")) {
    return "synthetic_or_temp_id";
  }
  if (isSyntheticCatalogIngredientId(id)) return "synthetic_or_temp_id";

  const row = catalogById.get(id);
  if (!row) return "missing_from_catalog";
  if (isAliasIngredientEntry(row)) return "alias_kind";
  if (!isCanonicalIngredientEntry(row)) {
    const label = row.name ?? row.normalized_name ?? "";
    if (looksLikeInvoiceShorthandName(label)) return "shorthand_pollution";
    return "alias_kind";
  }
  return null;
}

/** Audit recipe lines against the canonical catalog loaded for human-facing UI. */
export function auditRecipeLinesAgainstCanonicalCatalog(
  lines: RecipeIngredientRef[],
  catalog: IngredientCanonicalInput[],
): RecipeCanonicalLineAudit[] {
  const catalogById = new Map(catalog.map((row) => [row.id, row]));
  const audits: RecipeCanonicalLineAudit[] = [];

  for (const line of lines) {
    const reason = nonCanonicalIdReason(line.ingredientId, catalogById);
    audits.push({
      ...line,
      inCanonicalCatalog: reason === null,
      ...(reason ? { reason } : {}),
    });
  }

  return audits;
}

export function collectNonCanonicalRecipeLineAudits(
  audits: RecipeCanonicalLineAudit[],
): RecipeCanonicalLineAudit[] {
  return audits.filter((row) => !row.inCanonicalCatalog);
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Whether a recipe line resolves ingredient price/name from the Supabase embed vs catalog options. */
export function resolveRecipeLineIngredientSource(
  ingredientId: string,
  recipeLines: Array<{ ingredient_id: string | null; ingredients: RecipeEmbedSnapshot | null }> | null,
  catalogOptions: Array<{ id: string }>,
): "embed" | "catalog" | "missing" {
  const id = ingredientId.trim();
  if (!id) return "missing";
  const embed = recipeLines?.find((line) => line.ingredient_id === id)?.ingredients;
  if (embed) return "embed";
  if (catalogOptions.some((row) => row.id === id)) return "catalog";
  return "missing";
}

export function recipeLineFoodCostSourceKind(
  ingredientId: string,
  canonicalCatalogIds: Set<string>,
  ingredientResolution: "embed" | "catalog" | "missing",
): RecipeFoodCostSourceKind {
  const inCatalog = canonicalCatalogIds.has(ingredientId.trim());
  if (inCatalog && ingredientResolution === "catalog") return "canonical_catalog";
  if (ingredientResolution === "embed") return "embed_snapshot";
  return "ingredients_join";
}

/**
 * Audit recipe lines vs the canonical catalog: FK validity, embed-based costing, stale embed names.
 * Investigation-only — does not mutate data or change costing behavior.
 */
export function auditRecipeCanonicalDependencies(
  recipes: Array<{ id: string; name: string }>,
  lines: RecipeLineWithEmbed[],
  catalog: IngredientCanonicalInput[],
): RecipeCanonicalDependencyReport {
  const audits = auditRecipeLinesAgainstCanonicalCatalog(lines, catalog);
  const missingCanonicalFk = collectNonCanonicalRecipeLineAudits(audits);
  const canonicalIds = canonicalCatalogIdSet(catalog);
  const catalogById = new Map(catalog.map((row) => [row.id, row]));

  const legacyEmbedFoodCost: LegacyEmbedFoodCostFinding[] = [];
  const staleEmbedNames: RecipeCanonicalDependencyReport["staleEmbedNames"] = [];
  const orphanIngredientIds = new Set<string>();

  for (const line of lines) {
    const id = line.ingredientId.trim();
    if (!id) continue;

    const audit = audits.find(
      (row) => row.recipeId === line.recipeId && row.lineId === line.lineId && row.ingredientId === line.ingredientId,
    );
    const inCanonicalCatalog = audit?.inCanonicalCatalog ?? false;

    if (!inCanonicalCatalog) orphanIngredientIds.add(id);

    const embed = line.embed;
    const usesEmbedForCost = Boolean(embed && (embed.current_price != null || embed.purchase_quantity != null));
    if (usesEmbedForCost || embed?.name) {
      legacyEmbedFoodCost.push({
        ...line,
        foodCostSource: "embed_snapshot",
        inCanonicalCatalog,
        staleEmbedName: false,
      });
    }

    const catalogRow = catalogById.get(id);
    const embedName = embed?.name;
    if (
      catalogRow &&
      embedName &&
      normalizeLabel(embedName) !== normalizeLabel(catalogRow.name ?? catalogRow.normalized_name)
    ) {
      staleEmbedNames.push({
        recipeId: line.recipeId,
        lineId: line.lineId,
        ingredientId: id,
        embedName,
        catalogName: catalogRow.name ?? catalogRow.normalized_name ?? "",
      });
      const last = legacyEmbedFoodCost[legacyEmbedFoodCost.length - 1];
      if (last && last.ingredientId === id && last.recipeId === line.recipeId) {
        last.staleEmbedName = true;
      }
    }
  }

  return {
    recipeCount: recipes.length,
    lineCount: lines.length,
    canonicalCatalogSize: catalog.length,
    lines: audits,
    missingCanonicalFk,
    orphanIngredientIds: [...orphanIngredientIds],
    legacyEmbedFoodCost,
    staleEmbedNames,
  };
}

export function logRecipeCanonicalDependencyAudit(args: {
  surface: string;
  report: RecipeCanonicalDependencyReport;
}): void {
  const { report, surface } = args;

  for (const row of report.missingCanonicalFk) {
    traceRecipeMissingCanonicalFk({
      surface,
      recipeId: row.recipeId,
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      reason: row.reason,
    });
  }

  for (const row of report.legacyEmbedFoodCost) {
    traceLegacyRecipeEmbedDetected({
      surface,
      recipeId: row.recipeId,
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      inCanonicalCatalog: row.inCanonicalCatalog,
      staleEmbedName: row.staleEmbedName,
      embedName: row.embed?.name ?? null,
      embedPrice: row.embed?.current_price ?? null,
    });
  }

  for (const row of report.staleEmbedNames) {
    traceLegacyRecipeEmbedDetected({
      surface,
      kind: "stale_embed_name",
      recipeId: row.recipeId,
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      embedName: row.embedName,
      catalogName: row.catalogName,
    });
  }

  traceRecipeCanonicalIntegrity("load", {
    surface,
    audit: "recipe_canonical_dependencies",
    recipeCount: report.recipeCount,
    lineCount: report.lineCount,
    canonicalCatalogSize: report.canonicalCatalogSize,
    missingCanonicalFkCount: report.missingCanonicalFk.length,
    legacyEmbedLineCount: report.legacyEmbedFoodCost.length,
    staleEmbedNameCount: report.staleEmbedNames.length,
    orphanIngredientIdCount: report.orphanIngredientIds.length,
    orphanIngredientIds: report.orphanIngredientIds,
  });
}

export function traceRecipeLineFoodCostSource(args: {
  surface: string;
  recipeId?: string;
  lineId?: string | null;
  ingredientId: string;
  source: RecipeFoodCostSourceKind;
  inCanonicalCatalog?: boolean;
}): void {
  traceRecipeFoodCostLegacySource({
    surface: args.surface,
    recipeId: args.recipeId,
    lineId: args.lineId,
    ingredientId: args.ingredientId,
    source: args.source,
    inCanonicalCatalog: args.inCanonicalCatalog,
  });
}

/** Detect shorthand / alias-kind rows that leaked into picker options. */
export function detectPickerAliasLeaks(
  options: Array<{ id: string; name: string }>,
  catalog: IngredientCanonicalInput[],
): PickerAliasLeak[] {
  const catalogById = new Map(catalog.map((row) => [row.id, row]));
  const leaks: PickerAliasLeak[] = [];

  for (const option of options) {
    const id = option.id?.trim();
    if (!id) continue;

    if (
      id.startsWith("invoice:") ||
      id.startsWith("temp:") ||
      id.startsWith("temporary:") ||
      isSyntheticCatalogIngredientId(id)
    ) {
      leaks.push({ ingredientId: id, displayName: option.name, reason: "synthetic_or_temp_id" });
      continue;
    }

    const catalogRow = catalogById.get(id);
    if (!catalogRow) {
      leaks.push({ ingredientId: id, displayName: option.name, reason: "non_catalog_id" });
      continue;
    }

    if (isAliasIngredientEntry(catalogRow)) {
      leaks.push({ ingredientId: id, displayName: option.name, reason: "alias_kind" });
      continue;
    }

    if (looksLikeInvoiceShorthandName(option.name) || looksLikeInvoiceShorthandName(catalogRow.name)) {
      leaks.push({ ingredientId: id, displayName: option.name, reason: "shorthand_name" });
    }
  }

  return leaks;
}

export function logRecipeCanonicalIntegrityOnLoad(args: {
  recipes: Array<{ id: string; name: string }>;
  recipeLines: RecipeLineWithEmbed[];
  catalog: IngredientCanonicalInput[];
  recalcTrigger?: FoodCostRecalculationTrigger;
}): void {
  const audits = auditRecipeLinesAgainstCanonicalCatalog(args.recipeLines, args.catalog);
  const violations = collectNonCanonicalRecipeLineAudits(audits);

  traceRecipeCanonicalIntegrity("load", {
    recipeCount: args.recipes.length,
    lineCount: args.recipeLines.length,
    canonicalCatalogSize: args.catalog.length,
    lines: audits.map((row) => ({
      recipeId: row.recipeId,
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      inCanonicalCatalog: row.inCanonicalCatalog,
      reason: row.reason,
    })),
    violationCount: violations.length,
  });

  for (const violation of violations) {
    traceRecipeAliasLeakDetected({
      surface: "recipe_line",
      recipeId: violation.recipeId,
      lineId: violation.lineId,
      ingredientId: violation.ingredientId,
      ingredientName: violation.ingredientName,
      reason: violation.reason,
    });
  }

  const dependencyReport = auditRecipeCanonicalDependencies(args.recipes, args.recipeLines, args.catalog);
  logRecipeCanonicalDependencyAudit({ surface: "recipes.load", report: dependencyReport });

  if (args.recalcTrigger) {
    traceFoodCostRecalculationSource(args.recalcTrigger, {
      recipeCount: args.recipes.length,
      surface: "recipes",
    });
  }
}

export function logRecipeCanonicalIntegrityOnSave(args: {
  recipeId: string;
  lines: Array<{ lineId: string | null; ingredientId: string }>;
  catalog: IngredientCanonicalInput[];
}): void {
  const recipeLines: RecipeIngredientRef[] = args.lines.map((line) => ({
    recipeId: args.recipeId,
    lineId: line.lineId,
    ingredientId: line.ingredientId,
  }));
  const audits = auditRecipeLinesAgainstCanonicalCatalog(recipeLines, args.catalog);
  const violations = collectNonCanonicalRecipeLineAudits(audits);

  traceRecipeCanonicalIntegrity("save", {
    recipeId: args.recipeId,
    lineCount: args.lines.length,
    lines: audits.map((row) => ({
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      inCanonicalCatalog: row.inCanonicalCatalog,
      reason: row.reason,
    })),
    violationCount: violations.length,
  });

  for (const violation of violations) {
    traceRecipeAliasLeakDetected({
      surface: "recipe_save",
      recipeId: args.recipeId,
      lineId: violation.lineId,
      ingredientId: violation.ingredientId,
      reason: violation.reason,
    });
  }
}

export function logPickerAliasLeaksIfAny(
  options: Array<{ id: string; name: string }>,
  catalog: IngredientCanonicalInput[],
  surface: string,
): void {
  const leaks = detectPickerAliasLeaks(options, catalog);
  for (const leak of leaks) {
    traceRecipeAliasLeakDetected({ surface, ...leak });
  }
}

/** Unit cost for a recipe line — only when ingredient id is in the canonical catalog set. */
export function resolveRecipeLineUnitCostEur(
  ingredientId: string,
  canonicalCatalogIds: Set<string>,
  priceByCanonicalId: Map<string, { current_price: number | null; purchase_quantity: number | null }>,
): number | null {
  const id = ingredientId.trim();
  if (!id || !canonicalCatalogIds.has(id)) return null;
  const row = priceByCanonicalId.get(id);
  if (!row) return null;
  const price = Number(row.current_price ?? 0);
  const purchaseQty = Number(row.purchase_quantity ?? 1);
  const denominator = Number.isFinite(purchaseQty) && purchaseQty > 0 ? purchaseQty : 1;
  return price / denominator;
}

export function recipeLineFoodCostEur(
  ingredientId: string,
  quantity: number,
  canonicalCatalogIds: Set<string>,
  priceByCanonicalId: Map<string, { current_price: number | null; purchase_quantity: number | null }>,
): number | null {
  const unit = resolveRecipeLineUnitCostEur(ingredientId, canonicalCatalogIds, priceByCanonicalId);
  if (unit === null) return null;
  const safeQty = Number.isFinite(quantity) ? quantity : 0;
  return unit * safeQty;
}
