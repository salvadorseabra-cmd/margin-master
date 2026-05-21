import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  isAliasIngredientEntry,
  isCanonicalIngredientEntry,
  looksLikeInvoiceShorthandName,
} from "@/lib/ingredient-kind";
import { isSyntheticCatalogIngredientId } from "@/lib/ingredient-canonical-synthesis";
import {
  traceFoodCostRecalculationSource,
  traceRecipeAliasLeakDetected,
  traceRecipeCanonicalIntegrity,
  type FoodCostRecalculationTrigger,
} from "@/lib/recipe-canonical-graph-trace";

export type RecipeIngredientRef = {
  recipeId: string;
  lineId?: string | null;
  ingredientId: string;
  ingredientName?: string | null;
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
  recipeLines: RecipeIngredientRef[];
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
