import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  buildCatalogReviewLeakRowDetail,
  detectCatalogLeakRows,
  type CatalogLeakReason,
  type CatalogReviewLeakRowDetail,
} from "@/lib/ingredient-catalog-diagnostics";
import { diagnoseIngredientCatalogIdentity } from "@/lib/ingredient-identity-diagnostics";
import { findCanonicalNeighborForAlias } from "@/lib/ingredient-kind";
import {
  buildReadOnlyMergeHint,
  type IngredientMergeCluster,
  type IngredientMergeReadOnlyHint,
} from "@/lib/ingredient-merge-hooks";
import { selectCanonicalIngredientId } from "@/lib/ingredient-merge";

export const CATALOG_REVIEW_CLASSIFICATION_PREFIX = "[catalog_review_classification]";
export const CATALOG_MANUAL_MERGE_CANDIDATE_PREFIX = "[catalog_manual_merge_candidate]";

export const CATALOG_REVIEW_STORAGE_PREFIX = "marginly:catalog-review:";

export type CatalogReviewClassification =
  | "valid_canonical"
  | "alias_pollution"
  | "packaging_pollution"
  | "review_needed";

export type CatalogReviewDiscoveryKind = "catalog_leak" | "operational_duplicate";

export type CatalogReviewRecipeUsage = {
  count: number;
  names: string[];
};

/** Read-only canonical neighbor for manual review (no merge execution). */
export type CatalogReviewSimilarityCandidate = {
  ingredientId: string;
  displayName: string;
  score: number;
};

export type CatalogReviewRow = {
  ingredientId: string;
  canonicalDisplayName: string;
  rawName: string;
  sourceInvoiceAliases: string[];
  createdAt: string | null;
  recipeUsage: CatalogReviewRecipeUsage;
  invoiceReferenceCount: number;
  leakReason: CatalogLeakReason | null;
  discoveryKinds: CatalogReviewDiscoveryKind[];
  leakDetail: CatalogReviewLeakRowDetail | null;
  mergeHints: IngredientMergeReadOnlyHint[];
  similarityCandidates: CatalogReviewSimilarityCandidate[];
  classification: CatalogReviewClassification | null;
};

export type IngredientAliasRow = {
  ingredient_id: string;
  alias_name?: string | null;
  normalized_alias?: string | null;
};

export type RecipeIngredientLink = {
  ingredient_id: string;
  recipes: { name: string | null } | null;
};

/** PostgREST select for recipe usage on catalog review (parent recipe via recipe_id). */
export const CATALOG_REVIEW_RECIPE_LINKS_SELECT =
  "ingredient_id, recipes!recipe_ingredients_recipe_id_fkey(name)";

export type BuildCatalogReviewRowsInput = {
  catalog: IngredientCanonicalInput[];
  aliasRows?: IngredientAliasRow[];
  recipeLinks?: RecipeIngredientLink[];
  classifications?: Record<string, CatalogReviewClassification>;
};

export function catalogReviewStorageKey(userId: string): string {
  return `${CATALOG_REVIEW_STORAGE_PREFIX}${userId}`;
}

export function loadCatalogReviewClassifications(
  userId: string,
  storage: Pick<Storage, "getItem"> = typeof window !== "undefined" ? window.localStorage : (null as never),
): Record<string, CatalogReviewClassification> {
  if (!userId?.trim() || !storage) return {};
  try {
    const raw = storage.getItem(catalogReviewStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, CatalogReviewClassification> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isCatalogReviewClassification(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCatalogReviewClassifications(
  userId: string,
  map: Record<string, CatalogReviewClassification>,
  storage: Pick<Storage, "setItem"> = typeof window !== "undefined" ? window.localStorage : (null as never),
): void {
  if (!userId?.trim() || !storage) return;
  storage.setItem(catalogReviewStorageKey(userId), JSON.stringify(map));
}

function isCatalogReviewClassification(value: unknown): value is CatalogReviewClassification {
  return (
    value === "valid_canonical" ||
    value === "alias_pollution" ||
    value === "packaging_pollution" ||
    value === "review_needed"
  );
}

function aliasesByIngredientId(rows: IngredientAliasRow[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = row.ingredient_id?.trim();
    if (!id) continue;
    const label =
      row.alias_name?.trim() ||
      row.normalized_alias?.trim() ||
      null;
    if (!label) continue;
    const bucket = map.get(id) ?? new Set<string>();
    bucket.add(label);
    map.set(id, bucket);
  }
  return new Map([...map.entries()].map(([id, labels]) => [id, [...labels].sort()]));
}

function aliasCountByIngredientId(rows: IngredientAliasRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row.ingredient_id?.trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function recipeUsageByIngredientId(links: RecipeIngredientLink[]): Map<string, CatalogReviewRecipeUsage> {
  const namesById = new Map<string, Set<string>>();
  for (const link of links) {
    const id = link.ingredient_id?.trim();
    if (!id) continue;
    const recipeName = link.recipes?.name?.trim();
    const bucket = namesById.get(id) ?? new Set<string>();
    if (recipeName) bucket.add(recipeName);
    namesById.set(id, bucket);
  }
  return new Map(
    [...namesById.entries()].map(([id, names]) => [
      id,
      { count: names.size, names: [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })) },
    ]),
  );
}

function entryById(catalog: IngredientCanonicalInput[]): Map<string, IngredientCanonicalInput> {
  return new Map(
    catalog
      .map((entry) => [entry.id?.trim(), entry] as const)
      .filter(([id]) => Boolean(id)),
  );
}

function mergeHintsForIngredient(
  ingredientId: string,
  clusters: IngredientMergeCluster[],
  catalog: IngredientCanonicalInput[],
): IngredientMergeReadOnlyHint[] {
  const hints: IngredientMergeReadOnlyHint[] = [];
  for (const cluster of clusters) {
    if (!cluster.ingredientIds.includes(ingredientId)) continue;
    const suggestion = selectCanonicalIngredientId(cluster.ingredientIds, catalog);
    hints.push(buildReadOnlyMergeHint(cluster, suggestion?.canonicalId ?? null));
  }
  return hints;
}

function displayNameForEntry(entry: IngredientCanonicalInput | undefined, fallbackId: string): string {
  const raw = entry?.name?.trim() || entry?.normalized_name?.trim() || fallbackId;
  return formatCanonicalIngredientDisplayName(raw) || raw;
}

function similarityCandidatesForEntry(
  entry: IngredientCanonicalInput | undefined,
  catalog: IngredientCanonicalInput[],
): CatalogReviewSimilarityCandidate[] {
  if (!entry?.id?.trim()) return [];
  const neighbor = findCanonicalNeighborForAlias(entry, catalog);
  if (!neighbor?.canonical.id?.trim()) return [];
  const id = neighbor.canonical.id.trim();
  return [
    {
      ingredientId: id,
      displayName: displayNameForEntry(neighbor.canonical, id),
      score: neighbor.score,
    },
  ];
}

/**
 * Build read-only catalog pollution review rows (leaks + operational duplicate discovery).
 */
export function buildCatalogReviewRows(input: BuildCatalogReviewRowsInput): CatalogReviewRow[] {
  const { catalog, aliasRows = [], recipeLinks = [], classifications = {} } = input;
  const byId = entryById(catalog);
  const leaks = detectCatalogLeakRows(catalog);
  const leakById = new Map(leaks.map((leak) => [leak.id, leak]));
  const identity = diagnoseIngredientCatalogIdentity(catalog);
  const aliasLabels = aliasesByIngredientId(aliasRows);
  const aliasCounts = aliasCountByIngredientId(aliasRows);
  const recipeUsage = recipeUsageByIngredientId(recipeLinks);

  const reviewIds = new Set<string>();
  for (const leak of leaks) reviewIds.add(leak.id);
  for (const cluster of identity.operationalDuplicateClusters) {
    for (const id of cluster.ingredientIds) reviewIds.add(id);
  }

  const rows: CatalogReviewRow[] = [];
  for (const ingredientId of [...reviewIds].sort()) {
    const entry = byId.get(ingredientId);
    const leak = leakById.get(ingredientId) ?? null;
    const discoveryKinds: CatalogReviewDiscoveryKind[] = [];
    if (leak) discoveryKinds.push("catalog_leak");
    if (identity.operationalDuplicateClusters.some((c) => c.ingredientIds.includes(ingredientId))) {
      discoveryKinds.push("operational_duplicate");
    }

    const leakDetail =
      entry && leak ? buildCatalogReviewLeakRowDetail(entry, leak) : null;
    const rawName = entry?.name?.trim() || leak?.name || ingredientId;

    rows.push({
      ingredientId,
      canonicalDisplayName: leakDetail?.canonicalDisplayName ?? displayNameForEntry(entry, ingredientId),
      rawName,
      sourceInvoiceAliases: aliasLabels.get(ingredientId) ?? [],
      createdAt:
        leakDetail?.createdAt ??
        (entry as IngredientCanonicalInput & { created_at?: string | null })?.created_at?.trim() ??
        null,
      recipeUsage: recipeUsage.get(ingredientId) ?? { count: 0, names: [] },
      invoiceReferenceCount: aliasCounts.get(ingredientId) ?? 0,
      leakReason: leak?.reason ?? null,
      discoveryKinds,
      leakDetail,
      mergeHints: mergeHintsForIngredient(
        ingredientId,
        identity.operationalDuplicateClusters,
        catalog,
      ),
      similarityCandidates: similarityCandidatesForEntry(entry, catalog),
      classification: classifications[ingredientId] ?? null,
    });
  }

  return rows.sort((a, b) => a.canonicalDisplayName.localeCompare(b.canonicalDisplayName, undefined, { sensitivity: "base" }));
}

export function logCatalogReviewClassification(params: {
  ingredientId: string;
  classification: CatalogReviewClassification;
  previous: CatalogReviewClassification | null;
}): void {
  console.info(CATALOG_REVIEW_CLASSIFICATION_PREFIX, {
    id: params.ingredientId,
    classification: params.classification,
    previous: params.previous,
  });
}

export function logCatalogManualMergeCandidate(hint: IngredientMergeReadOnlyHint): void {
  console.info(CATALOG_MANUAL_MERGE_CANDIDATE_PREFIX, {
    ids: hint.ingredientIds,
    operationalKey: hint.operationalKey,
    canonicalSuggestionId: hint.suggestedCanonicalIngredientId,
    displayNames: hint.displayNames,
  });
}

export function setCatalogReviewClassification(
  userId: string,
  ingredientId: string,
  classification: CatalogReviewClassification,
  storage: Pick<Storage, "getItem" | "setItem"> = typeof window !== "undefined" ? window.localStorage : (null as never),
): Record<string, CatalogReviewClassification> {
  const map = loadCatalogReviewClassifications(userId, storage);
  const previous = map[ingredientId] ?? null;
  map[ingredientId] = classification;
  saveCatalogReviewClassifications(userId, map, storage);
  logCatalogReviewClassification({ ingredientId, classification, previous });
  return map;
}

export const CATALOG_REVIEW_CLASSIFICATION_LABELS: Record<CatalogReviewClassification, string> = {
  valid_canonical: "Canónico válido",
  alias_pollution: "Poluição alias",
  packaging_pollution: "Poluição embalagem",
  review_needed: "Rever",
};

export const CATALOG_LEAK_REASON_LABELS: Record<CatalogLeakReason, string> = {
  explicit_alias_kind: "Tipo alias explícito",
  invoice_shorthand_name: "Abreviatura fatura",
  legacy_canonical_shorthand: "Canónico legado (abrev.)",
};
