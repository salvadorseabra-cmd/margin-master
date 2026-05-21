import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  filterActiveCatalogIngredients,
  isArchivedIngredientEntry,
} from "@/lib/ingredient-canonical";
import { findOperationalDuplicateClusters } from "@/lib/ingredient-identity-diagnostics";
import type { IngredientMergeCluster } from "@/lib/ingredient-merge-hooks";
import { filterCanonicalCatalogIngredients, isCanonicalIngredientEntry } from "@/lib/ingredient-kind";
import { operationalIdentityKeyForCatalogEntry } from "@/lib/ingredient-operational-identity";
import {
  auditRecipeCanonicalDependencies,
  resolveRecipeLineUnitCostEur,
  type RecipeCanonicalLineAudit,
  type RecipeLineWithEmbed,
} from "@/lib/recipe-canonical-integrity";
import {
  isRecipeCanonicalGraphTraceEnabled,
  traceRecipeAmbiguousCanonical,
  traceRecipeMigrationCandidate,
  traceRecipeOrphanEmbed,
} from "@/lib/recipe-canonical-graph-trace";

export type RecipeMigrationCatalogRow = IngredientCanonicalInput & {
  current_price?: number | null;
  purchase_quantity?: number | null;
  is_archived?: boolean | null;
  merged_into_ingredient_id?: string | null;
};

export type RecipeMigrationEmbeddedSource = {
  embedName: string | null;
  embedPrice: number | null;
  embedPurchaseQuantity: number | null;
};

export type RecipeMigrationMergeArchiveDep = {
  isArchived: boolean;
  mergedIntoIngredientId: string | null;
};

export type RecipeMigrationLineStatus =
  | "ok"
  | "missing_canonical_fk"
  | "orphan_embed"
  | "stale_embed_price"
  | "ambiguous_canonical"
  | "legacy_embed";

export type RecipeMigrationSafetyCheck = {
  candidateExistsInCatalog: boolean;
  candidateNotArchived: boolean;
  noDuplicateRecipeLineCollision: boolean;
  safe: boolean;
  issues: string[];
};

export type RecipeMigrationLinePreview = {
  recipeId: string;
  recipeName: string;
  lineId: string | null;
  ingredientId: string;
  ingredientName: string | null;
  inCanonicalCatalog: boolean;
  catalogReason?: RecipeCanonicalLineAudit["reason"];
  embeddedSource: RecipeMigrationEmbeddedSource | null;
  suggestedCandidateId: string | null;
  ambiguousCandidateIds: string[];
  mergeArchiveDep: RecipeMigrationMergeArchiveDep | null;
  statuses: RecipeMigrationLineStatus[];
  safety: RecipeMigrationSafetyCheck;
};

export type RecipeCanonicalMigrationPreviewReport = {
  recipeCount: number;
  lineCount: number;
  canonicalCatalogSize: number;
  lines: RecipeMigrationLinePreview[];
  orphanLines: RecipeMigrationLinePreview[];
  ambiguousLines: RecipeMigrationLinePreview[];
  staleEmbedPriceLines: RecipeMigrationLinePreview[];
  missingCanonicalFkLines: RecipeMigrationLinePreview[];
};

const PRICE_EPSILON = 0.0001;

function unitCostEur(
  price: number | null | undefined,
  purchaseQty: number | null | undefined,
): number | null {
  const p = Number(price ?? 0);
  const q = Number(purchaseQty ?? 1);
  const denominator = Number.isFinite(q) && q > 0 ? q : 1;
  if (!Number.isFinite(p)) return null;
  return p / denominator;
}

function buildActiveCanonicalIndex(catalog: RecipeMigrationCatalogRow[]): {
  activeCanonicalIds: Set<string>;
  operationalKeyToIds: Map<string, string[]>;
  catalogById: Map<string, RecipeMigrationCatalogRow>;
} {
  const activeCanonical = filterCanonicalCatalogIngredients(
    filterActiveCatalogIngredients(catalog),
  );
  const activeCanonicalIds = new Set(activeCanonical.map((row) => row.id));
  const operationalKeyToIds = new Map<string, string[]>();
  const catalogById = new Map(catalog.map((row) => [row.id, row]));

  for (const entry of activeCanonical) {
    const key = operationalIdentityKeyForCatalogEntry(entry);
    if (!key) continue;
    const bucket = operationalKeyToIds.get(key) ?? [];
    bucket.push(entry.id);
    operationalKeyToIds.set(key, bucket);
  }

  return { activeCanonicalIds, operationalKeyToIds, catalogById };
}

function operationalKeyForLine(
  line: RecipeLineWithEmbed,
  catalogById: Map<string, RecipeMigrationCatalogRow>,
): string {
  const row = catalogById.get(line.ingredientId.trim());
  if (row) {
    const fromRow = operationalIdentityKeyForCatalogEntry(row);
    if (fromRow) return fromRow;
  }
  const embedName = line.embed?.name?.trim();
  if (embedName) return operationalIdentityKeyForCatalogEntry({ id: "", name: embedName });
  const label = line.ingredientName?.trim();
  if (label) return operationalIdentityKeyForCatalogEntry({ id: "", name: label });
  return "";
}

function clusterMatchesOperationalKey(
  cluster: IngredientMergeCluster,
  operationalKey: string,
  catalogById: Map<string, RecipeMigrationCatalogRow>,
): boolean {
  if (!operationalKey) return false;
  if (cluster.operationalKey === operationalKey) return true;
  return cluster.ingredientIds.some((id) => {
    const row = catalogById.get(id);
    return row ? operationalIdentityKeyForCatalogEntry(row) === operationalKey : false;
  });
}

function resolveOperationalCandidates(args: {
  operationalKey: string;
  operationalKeyToIds: Map<string, string[]>;
  activeCanonicalIds: Set<string>;
  operationalClusters: IngredientMergeCluster[];
  catalogById: Map<string, RecipeMigrationCatalogRow>;
}): { suggested: string | null; ambiguous: string[] } {
  const { operationalKey, operationalKeyToIds, activeCanonicalIds, operationalClusters, catalogById } =
    args;
  if (!operationalKey) return { suggested: null, ambiguous: [] };

  for (const cluster of operationalClusters) {
    const active = cluster.ingredientIds.filter((id) => activeCanonicalIds.has(id));
    if (active.length < 2) continue;
    if (!clusterMatchesOperationalKey(cluster, operationalKey, catalogById)) continue;
    return { suggested: null, ambiguous: active };
  }

  const raw = operationalKeyToIds.get(operationalKey) ?? [];
  const active = raw.filter((id) => activeCanonicalIds.has(id));
  if (active.length === 1) return { suggested: active[0] ?? null, ambiguous: [] };
  if (active.length > 1) return { suggested: null, ambiguous: active };
  return { suggested: null, ambiguous: [] };
}

function mergeArchiveDepForIngredient(
  ingredientId: string,
  catalogById: Map<string, RecipeMigrationCatalogRow>,
): RecipeMigrationMergeArchiveDep | null {
  const row = catalogById.get(ingredientId.trim());
  if (!row || !isArchivedIngredientEntry(row)) return null;
  return {
    isArchived: true,
    mergedIntoIngredientId: row.merged_into_ingredient_id?.trim() || null,
  };
}

function isMissingIngredientRow(line: RecipeLineWithEmbed): boolean {
  const id = line.ingredientId.trim();
  if (!id) return true;
  return line.embed == null;
}

function evaluateMigrationSafety(args: {
  recipeId: string;
  lineId: string | null;
  currentIngredientId: string;
  candidateId: string | null;
  activeCanonicalIds: Set<string>;
  catalogById: Map<string, RecipeMigrationCatalogRow>;
  allLines: RecipeLineWithEmbed[];
}): RecipeMigrationSafetyCheck {
  const issues: string[] = [];
  const candidateId = args.candidateId?.trim() || null;

  if (!candidateId) {
    return {
      candidateExistsInCatalog: false,
      candidateNotArchived: false,
      noDuplicateRecipeLineCollision: true,
      safe: false,
      issues: ["no_candidate"],
    };
  }

  const candidateExistsInCatalog = args.activeCanonicalIds.has(candidateId);
  if (!candidateExistsInCatalog) issues.push("candidate_not_in_canonical_catalog");

  const candidateRow = args.catalogById.get(candidateId);
  const candidateNotArchived = Boolean(candidateRow && !isArchivedIngredientEntry(candidateRow));
  if (!candidateNotArchived) issues.push("candidate_archived");

  const collision = args.allLines.some(
    (line) =>
      line.recipeId === args.recipeId &&
      line.lineId !== args.lineId &&
      line.ingredientId.trim() === candidateId,
  );
  const noDuplicateRecipeLineCollision = !collision;
  if (collision) issues.push("duplicate_recipe_ingredient_collision");

  const safe =
    candidateExistsInCatalog && candidateNotArchived && noDuplicateRecipeLineCollision;

  return {
    candidateExistsInCatalog,
    candidateNotArchived,
    noDuplicateRecipeLineCollision,
    safe,
    issues,
  };
}

function embedPriceDiffersFromCatalog(
  line: RecipeLineWithEmbed,
  catalogRow: RecipeMigrationCatalogRow | undefined,
  activeCanonicalIds: Set<string>,
): boolean {
  if (!catalogRow || !activeCanonicalIds.has(line.ingredientId.trim())) return false;
  const embed = line.embed;
  if (!embed || embed.current_price == null) return false;

  const embedUnit = unitCostEur(embed.current_price, embed.purchase_quantity);
  const catalogUnit = resolveRecipeLineUnitCostEur(
    line.ingredientId,
    activeCanonicalIds,
    new Map([
      [
        catalogRow.id,
        {
          current_price: catalogRow.current_price ?? null,
          purchase_quantity: catalogRow.purchase_quantity ?? null,
        },
      ],
    ]),
  );
  if (embedUnit === null || catalogUnit === null) return false;
  return Math.abs(embedUnit - catalogUnit) > PRICE_EPSILON;
}

function suggestCandidateForLine(args: {
  line: RecipeLineWithEmbed;
  inCanonicalCatalog: boolean;
  activeCanonicalIds: Set<string>;
  operationalKeyToIds: Map<string, string[]>;
  operationalClusters: IngredientMergeCluster[];
  catalogById: Map<string, RecipeMigrationCatalogRow>;
}): { suggested: string | null; ambiguous: string[] } {
  const id = args.line.ingredientId.trim();
  if (!id) return { suggested: null, ambiguous: [] };

  if (args.activeCanonicalIds.has(id)) {
    return { suggested: id, ambiguous: [] };
  }

  const archiveDep = mergeArchiveDepForIngredient(id, args.catalogById);
  if (archiveDep?.mergedIntoIngredientId) {
    return { suggested: archiveDep.mergedIntoIngredientId, ambiguous: [] };
  }

  const opKey = operationalKeyForLine(args.line, args.catalogById);
  return resolveOperationalCandidates({
    operationalKey: opKey,
    operationalKeyToIds: args.operationalKeyToIds,
    activeCanonicalIds: args.activeCanonicalIds,
    operationalClusters: args.operationalClusters,
    catalogById: args.catalogById,
  });
}

/**
 * Read-only preview of migrating recipe lines from legacy embeds to canonical FKs.
 * Does not mutate recipes, costing, or matching behavior.
 */
export function buildRecipeCanonicalMigrationPreview(args: {
  recipes: Array<{ id: string; name: string }>;
  lines: RecipeLineWithEmbed[];
  /** Active canonical catalog (human-facing picker set). */
  canonicalCatalog: IngredientCanonicalInput[];
  /** Full ingredient rows including archived (for merge/archive resolution). */
  fullCatalog: RecipeMigrationCatalogRow[];
}): RecipeCanonicalMigrationPreviewReport {
  const recipeNameById = new Map(args.recipes.map((r) => [r.id, r.name]));
  const dependencyReport = auditRecipeCanonicalDependencies(
    args.recipes,
    args.lines,
    args.canonicalCatalog,
  );
  const auditByLineKey = new Map(
    dependencyReport.lines.map((row) => [
      `${row.recipeId}::${row.lineId ?? ""}::${row.ingredientId}`,
      row,
    ]),
  );

  const { activeCanonicalIds, operationalKeyToIds, catalogById } =
    buildActiveCanonicalIndex(args.fullCatalog);

  const activeCanonicalRows = filterCanonicalCatalogIngredients(
    filterActiveCatalogIngredients(args.fullCatalog),
  );
  const operationalClusters = findOperationalDuplicateClusters([
    ...activeCanonicalRows,
    ...args.fullCatalog.filter((row) => isArchivedIngredientEntry(row)),
  ]);
  for (const cluster of operationalClusters) {
    const active = cluster.ingredientIds.filter((id) => activeCanonicalIds.has(id));
    if (active.length >= 2) {
      operationalKeyToIds.set(cluster.operationalKey, active);
    }
  }

  const previews: RecipeMigrationLinePreview[] = [];

  for (const line of args.lines) {
    const lineKey = `${line.recipeId}::${line.lineId ?? ""}::${line.ingredientId}`;
    const audit = auditByLineKey.get(lineKey);
    const inCanonicalCatalog = audit?.inCanonicalCatalog ?? false;
    const catalogReason = audit?.reason;

    const embeddedSource: RecipeMigrationEmbeddedSource | null = line.embed
      ? {
          embedName: line.embed.name ?? null,
          embedPrice: line.embed.current_price ?? null,
          embedPurchaseQuantity: line.embed.purchase_quantity ?? null,
        }
      : null;

    const mergeArchiveDep = mergeArchiveDepForIngredient(line.ingredientId, catalogById);
    const { suggested: suggestedCandidateId, ambiguous: ambiguousCandidateIds } =
      suggestCandidateForLine({
        line,
        inCanonicalCatalog,
        activeCanonicalIds,
        operationalKeyToIds,
        operationalClusters,
        catalogById,
      });

    const statuses: RecipeMigrationLineStatus[] = [];
    const missingRow = isMissingIngredientRow(line);
    if (missingRow || !inCanonicalCatalog) {
      statuses.push(missingRow ? "orphan_embed" : "missing_canonical_fk");
    }
    if (ambiguousCandidateIds.length > 1) statuses.push("ambiguous_canonical");
    if (embeddedSource && (embeddedSource.embedPrice != null || embeddedSource.embedName)) {
      statuses.push("legacy_embed");
    }
    const catalogRow = catalogById.get(line.ingredientId.trim());
    if (embedPriceDiffersFromCatalog(line, catalogRow, activeCanonicalIds)) {
      statuses.push("stale_embed_price");
    }
    if (statuses.length === 0) statuses.push("ok");

    const safety = evaluateMigrationSafety({
      recipeId: line.recipeId,
      lineId: line.lineId ?? null,
      currentIngredientId: line.ingredientId,
      candidateId: suggestedCandidateId,
      activeCanonicalIds,
      catalogById,
      allLines: args.lines,
    });

    previews.push({
      recipeId: line.recipeId,
      recipeName: recipeNameById.get(line.recipeId) ?? line.recipeId,
      lineId: line.lineId ?? null,
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName ?? line.embed?.name ?? catalogRow?.name ?? null,
      inCanonicalCatalog,
      catalogReason,
      embeddedSource,
      suggestedCandidateId,
      ambiguousCandidateIds,
      mergeArchiveDep,
      statuses,
      safety,
    });
  }

  const orphanLines = previews.filter((row) => row.statuses.includes("orphan_embed"));
  const ambiguousLines = previews.filter((row) => row.statuses.includes("ambiguous_canonical"));
  const staleEmbedPriceLines = previews.filter((row) =>
    row.statuses.includes("stale_embed_price"),
  );
  const missingCanonicalFkLines = previews.filter(
    (row) =>
      row.statuses.includes("missing_canonical_fk") ||
      (!row.inCanonicalCatalog && !row.statuses.includes("orphan_embed")),
  );

  return {
    recipeCount: args.recipes.length,
    lineCount: args.lines.length,
    canonicalCatalogSize: args.canonicalCatalog.length,
    lines: previews,
    orphanLines,
    ambiguousLines,
    staleEmbedPriceLines,
    missingCanonicalFkLines,
  };
}

export function logRecipeCanonicalMigrationPreview(args: {
  surface: string;
  report: RecipeCanonicalMigrationPreviewReport;
}): void {
  if (!isRecipeCanonicalGraphTraceEnabled()) return;

  const { report, surface } = args;

  for (const row of report.lines) {
    if (row.suggestedCandidateId != null || row.ambiguousCandidateIds.length > 0) {
      traceRecipeMigrationCandidate({
        surface,
        recipeId: row.recipeId,
        lineId: row.lineId,
        currentIngredientId: row.ingredientId,
        suggestedIngredientId: row.suggestedCandidateId,
        ambiguousCandidateIds: row.ambiguousCandidateIds,
        safe: row.safety.safe,
        issues: row.safety.issues,
      });
    }
  }

  for (const row of report.orphanLines) {
    traceRecipeOrphanEmbed({
      surface,
      recipeId: row.recipeId,
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      embedName: row.embeddedSource?.embedName ?? null,
      inCanonicalCatalog: row.inCanonicalCatalog,
      catalogReason: row.catalogReason,
    });
  }

  for (const row of report.ambiguousLines) {
    traceRecipeAmbiguousCanonical({
      surface,
      recipeId: row.recipeId,
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      candidateIds: row.ambiguousCandidateIds,
    });
  }
}

export const RECIPE_MIGRATION_STATUS_LABELS: Record<RecipeMigrationLineStatus, string> = {
  ok: "OK",
  missing_canonical_fk: "FK canónica em falta",
  orphan_embed: "Embed órfão",
  stale_embed_price: "Preço embed desatualizado",
  ambiguous_canonical: "Candidato ambíguo",
  legacy_embed: "Embed legado",
};

export const RECIPE_MIGRATION_SAFETY_ISSUE_LABELS: Record<string, string> = {
  no_candidate: "Sem candidato",
  candidate_not_in_canonical_catalog: "Candidato fora do catálogo canónico",
  candidate_archived: "Candidato arquivado",
  duplicate_recipe_ingredient_collision: "Colisão recipe_ingredients",
};
