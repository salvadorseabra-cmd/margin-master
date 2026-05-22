/**
 * Reassign ingredient_aliases (and in-memory alias map) from one canonical to another.
 * Does not merge ingredients, archive sources, or touch recipe_ingredients unless done separately.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  isArchivedIngredientEntry,
  normalizeCanonicalIngredientName,
} from "@/lib/ingredient-canonical";
import {
  buildIngredientAliasLookupKey,
  loadConfirmedIngredientAliasMap,
} from "@/lib/ingredient-alias-memory";
import {
  rewriteIngredientIdInAliasMap,
  type AppSupabaseClient,
} from "@/lib/ingredient-merge";
import {
  catalogOperationalIdentityKeyForEntry,
  normalizeCatalogOperationalIdentityKey,
} from "@/lib/ingredient-operational-identity";
import { normalizeInvoiceAliasMemoryKey } from "@/lib/normalize-ingredient-name";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";
import {
  archiveOrphanIngredient,
  detectOrphanCanonicalIngredients,
  isIngredientOperationallyOrphaned,
  type IngredientOrphanReport,
} from "@/lib/ingredient-orphan-detection";

export { isAliasOnlyOperationalDependency } from "@/lib/ingredient-orphan-detection";

export const ALIAS_REASSIGNMENT_LOG_PREFIX = "[alias_reassignment]";
export const ORPHAN_ARCHIVE_AFTER_REASSIGNMENT_LOG_PREFIX =
  "[orphan_archive_after_reassignment]";

export type ReassignIngredientAliasesParams = {
  client: AppSupabaseClient;
  fromIngredientId: string;
  toIngredientId: string;
  userId: string;
  /** When omitted, only DB rows are updated (no in-memory map rewrite). */
  confirmedAliases?: IngredientAliasMap;
};

export type ReassignIngredientAliasesResult = {
  aliasesReassigned: number;
  nextConfirmedAliases?: IngredientAliasMap;
  error: PostgrestError | null;
};

export type ReassignIngredientAliasesValidationIssue =
  | "missing_from_id"
  | "missing_to_id"
  | "same_source_and_target";

export function validateReassignIngredientAliasesParams(
  params: Pick<ReassignIngredientAliasesParams, "fromIngredientId" | "toIngredientId">,
): ReassignIngredientAliasesValidationIssue[] {
  const issues: ReassignIngredientAliasesValidationIssue[] = [];
  const from = params.fromIngredientId?.trim();
  const to = params.toIngredientId?.trim();
  if (!from) issues.push("missing_from_id");
  if (!to) issues.push("missing_to_id");
  if (from && to && from === to) issues.push("same_source_and_target");
  return issues;
}

/**
 * Resolve active canonical ids by normalized operational name (case/accent insensitive).
 */
export function findActiveCanonicalIdsByNormalizedName(
  catalog: IngredientCanonicalInput[],
  names: string[],
  options?: { includeArchived?: boolean },
): Map<string, string> {
  const wanted = new Set(
    names
      .map((name) => normalizeCanonicalIngredientName(name))
      .filter(Boolean),
  );
  const out = new Map<string, string>();
  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id || (!options?.includeArchived && isArchivedIngredientEntry(entry))) continue;
    const norm = normalizeCanonicalIngredientName(entry.name ?? "");
    if (!norm || !wanted.has(norm)) continue;
    if (!out.has(norm)) out.set(norm, id);
  }
  return out;
}

export type IngredientAliasReassignmentRow = {
  id: string;
  ingredient_id: string;
  alias_name: string;
  normalized_alias: string;
  supplier_name: string | null;
  confidence: number;
};

function normalizeAliasSupplierScope(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeSupplierDisplayName(raw);
  return normalized || null;
}

/** Ownership key for duplicate detection (normalized alias + supplier scope). */
export function aliasReassignmentOwnershipKey(row: {
  alias_name?: string | null;
  normalized_alias?: string | null;
  supplier_name?: string | null;
}): string {
  const rawNorm = row.normalized_alias?.trim() || row.alias_name?.trim() || "";
  const normalized = normalizeInvoiceAliasMemoryKey(rawNorm);
  return buildIngredientAliasLookupKey(normalized, normalizeAliasSupplierScope(row.supplier_name));
}

function catalogEntryLabel(
  catalog: IngredientCanonicalInput[],
  ingredientId: string,
): { id: string; name: string } {
  const entry = catalog.find((row) => row.id?.trim() === ingredientId);
  return {
    id: ingredientId,
    name: entry?.name?.trim() || ingredientId,
  };
}

/**
 * Move all `ingredient_aliases` rows from `fromIngredientId` to `toIngredientId`.
 * Colliding target rows (same normalized alias + supplier) are merged, not duplicated.
 * Optionally rewrites confirmed in-memory alias map values (same pattern as merge).
 */
export async function reassignIngredientAliases(
  params: ReassignIngredientAliasesParams,
): Promise<ReassignIngredientAliasesResult> {
  const issues = validateReassignIngredientAliasesParams(params);
  const fromIngredientId = params.fromIngredientId?.trim() ?? "";
  const toIngredientId = params.toIngredientId?.trim() ?? "";

  if (issues.length > 0) {
    console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "validation_failed", {
      fromIngredientId,
      toIngredientId,
      userId: params.userId?.trim() ?? null,
      issues,
    });
    return {
      aliasesReassigned: 0,
      nextConfirmedAliases: params.confirmedAliases,
      error: {
        message: `Invalid alias reassignment: ${issues.join(", ")}`,
        code: "alias_reassignment_validation",
        details: issues.join(","),
        hint: "",
      } as PostgrestError,
    };
  }

  const [sourceResult, targetResult] = await Promise.all([
    params.client
      .from("ingredient_aliases")
      .select("id, ingredient_id, alias_name, normalized_alias, supplier_name, confidence")
      .eq("ingredient_id", fromIngredientId),
    params.client
      .from("ingredient_aliases")
      .select("id, ingredient_id, alias_name, normalized_alias, supplier_name, confidence")
      .eq("ingredient_id", toIngredientId),
  ]);

  const queryError = sourceResult.error ?? targetResult.error;
  if (queryError) {
    console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "fetch_failed", {
      fromIngredientId,
      toIngredientId,
      error: queryError.message,
    });
    return {
      aliasesReassigned: 0,
      nextConfirmedAliases: params.confirmedAliases,
      error: queryError,
    };
  }

  const sourceRows = (sourceResult.data ?? []) as IngredientAliasReassignmentRow[];
  const targetRows = (targetResult.data ?? []) as IngredientAliasReassignmentRow[];
  const targetByKey = new Map<string, IngredientAliasReassignmentRow>();
  for (const row of targetRows) {
    targetByKey.set(aliasReassignmentOwnershipKey(row), row);
  }

  let moved = 0;
  let merged = 0;
  let deleted = 0;

  for (const sourceRow of sourceRows) {
    const key = aliasReassignmentOwnershipKey(sourceRow);
    const existingTarget = targetByKey.get(key);

    if (existingTarget) {
      const sourceConfidence = Number(sourceRow.confidence);
      const targetConfidence = Number(existingTarget.confidence);
      const nextConfidence = Math.max(
        Number.isFinite(targetConfidence) ? targetConfidence : 0,
        Number.isFinite(sourceConfidence) ? sourceConfidence : 0,
      );
      if (nextConfidence > targetConfidence) {
        const { error: mergeUpdateError } = await params.client
          .from("ingredient_aliases")
          .update({ confidence: nextConfidence })
          .eq("id", existingTarget.id);
        if (mergeUpdateError) {
          console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "merge_update_failed", {
            fromIngredientId,
            toIngredientId,
            sourceAliasId: sourceRow.id,
            targetAliasId: existingTarget.id,
            ownershipKey: key,
            error: mergeUpdateError.message,
          });
          return {
            aliasesReassigned: moved,
            nextConfirmedAliases: params.confirmedAliases,
            error: mergeUpdateError,
          };
        }
        existingTarget.confidence = nextConfidence;
      }
      const { error: deleteError } = await params.client
        .from("ingredient_aliases")
        .delete()
        .eq("id", sourceRow.id);
      if (deleteError) {
        console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "collision_delete_failed", {
          fromIngredientId,
          toIngredientId,
          sourceAliasId: sourceRow.id,
          ownershipKey: key,
          error: deleteError.message,
        });
        return {
          aliasesReassigned: moved,
          nextConfirmedAliases: params.confirmedAliases,
          error: deleteError,
        };
      }
      merged += 1;
      deleted += 1;
      continue;
    }

    const { error: moveError } = await params.client
      .from("ingredient_aliases")
      .update({ ingredient_id: toIngredientId })
      .eq("id", sourceRow.id);
    if (moveError) {
      console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "move_failed", {
        fromIngredientId,
        toIngredientId,
        sourceAliasId: sourceRow.id,
        ownershipKey: key,
        error: moveError.message,
      });
      return {
        aliasesReassigned: moved,
        nextConfirmedAliases: params.confirmedAliases,
        error: moveError,
      };
    }
    moved += 1;
    targetByKey.set(key, { ...sourceRow, ingredient_id: toIngredientId });
  }

  const aliasesReassigned = sourceRows.length;

  const nextConfirmedAliases = params.confirmedAliases
    ? rewriteIngredientIdInAliasMap(
        params.confirmedAliases,
        fromIngredientId,
        toIngredientId,
      )
    : undefined;

  console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "reassigned", {
    from: { id: fromIngredientId },
    to: { id: toIngredientId },
    userId: params.userId?.trim() ?? null,
    aliasesReassigned,
    moved,
    mergedCollisions: merged,
    deletedDuplicates: deleted,
    memoryKeysRewritten: nextConfirmedAliases
      ? Object.keys(nextConfirmedAliases).length
      : 0,
    ok: true,
  });

  return {
    aliasesReassigned,
    nextConfirmedAliases,
    error: null,
  };
}

export type ReassignAliasesAndArchiveIfOrphanParams = ReassignIngredientAliasesParams & {
  catalog: IngredientCanonicalInput[];
  /** When true (default), archives `fromIngredientId` if orphan after reassignment. */
  autoArchiveIfOrphan?: boolean;
};

export type ReassignAliasesAndArchiveIfOrphanResult = ReassignIngredientAliasesResult & {
  sourceOrphanReport: IngredientOrphanReport | null;
  archived: boolean;
  archiveError: PostgrestError | null;
};

/**
 * Reassign aliases, recount orphan state for the source canonical, optionally soft-archive.
 */
export async function reassignAliasesAndArchiveIfOrphan(
  params: ReassignAliasesAndArchiveIfOrphanParams,
): Promise<ReassignAliasesAndArchiveIfOrphanResult> {
  const autoArchive = params.autoArchiveIfOrphan !== false;
  const fromId = params.fromIngredientId.trim();
  const toId = params.toIngredientId.trim();
  const fromLabel = catalogEntryLabel(params.catalog, fromId);
  const toLabel = catalogEntryLabel(params.catalog, toId);

  const sourceEntry = params.catalog.find((row) => row.id?.trim() === fromId);
  const detectCatalog = sourceEntry ? [sourceEntry] : [{ id: fromId, name: fromLabel.name }];

  const { reports: reportsBefore, error: detectBeforeError } =
    await detectOrphanCanonicalIngredients(params.client, detectCatalog);
  const orphanBefore = reportsBefore.get(fromId) ?? null;

  if (detectBeforeError) {
    console.info(ORPHAN_ARCHIVE_AFTER_REASSIGNMENT_LOG_PREFIX, "detect_before_failed", {
      from: fromLabel,
      to: toLabel,
      error: detectBeforeError,
    });
  } else {
    console.info(ORPHAN_ARCHIVE_AFTER_REASSIGNMENT_LOG_PREFIX, "orphan_before", {
      from: fromLabel,
      to: toLabel,
      isOrphan:
        orphanBefore != null && isIngredientOperationallyOrphaned(orphanBefore),
      report: orphanBefore,
    });
  }

  const reassignment = await reassignIngredientAliases(params);

  if (reassignment.error) {
    return {
      ...reassignment,
      sourceOrphanReport: orphanBefore,
      archived: false,
      archiveError: null,
    };
  }

  console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "reassigned_with_labels", {
    from: fromLabel,
    to: toLabel,
    aliasesReassigned: reassignment.aliasesReassigned,
    orphanBefore,
  });

  const { reports, error: detectError } = await detectOrphanCanonicalIngredients(
    params.client,
    detectCatalog,
  );

  if (detectError) {
    console.info(ORPHAN_ARCHIVE_AFTER_REASSIGNMENT_LOG_PREFIX, "detect_failed", {
      from: fromLabel,
      to: toLabel,
      error: detectError,
    });
    return {
      ...reassignment,
      sourceOrphanReport: orphanBefore,
      archived: false,
      archiveError: {
        message: detectError,
        code: "orphan_detect_after_reassignment",
        details: "",
        hint: "",
      } as PostgrestError,
    };
  }

  const sourceOrphanReport = reports.get(fromId) ?? null;
  const isOrphan =
    sourceOrphanReport != null && isIngredientOperationallyOrphaned(sourceOrphanReport);

  console.info(ORPHAN_ARCHIVE_AFTER_REASSIGNMENT_LOG_PREFIX, "orphan_after", {
    from: fromLabel,
    to: toLabel,
    isOrphan,
    report: sourceOrphanReport,
  });

  if (!autoArchive || !isOrphan) {
    console.info(ORPHAN_ARCHIVE_AFTER_REASSIGNMENT_LOG_PREFIX, "skip_archive", {
      from: fromLabel,
      to: toLabel,
      autoArchive,
      isOrphan,
      report: sourceOrphanReport,
    });
    return {
      ...reassignment,
      sourceOrphanReport,
      archived: false,
      archiveError: null,
    };
  }

  const { error: archiveError } = await archiveOrphanIngredient({
    client: params.client,
    ingredientId: fromId,
    userId: params.userId,
  });

  console.info(ORPHAN_ARCHIVE_AFTER_REASSIGNMENT_LOG_PREFIX, "archived", {
    from: fromLabel,
    to: toLabel,
    userId: params.userId.trim(),
    ok: !archiveError,
    error: archiveError?.message ?? null,
    orphanBefore,
    orphanAfter: sourceOrphanReport,
  });

  return {
    ...reassignment,
    sourceOrphanReport,
    archived: !archiveError,
    archiveError,
  };
}

export const PALHA_LEGACY_ALIAS_SEARCH_TERMS = [
  "PALHA",
  "palha",
  "BAT PAL",
  "BAT PALHA",
  "PALHA SNACK",
] as const;

export const BAT_SHOESTR_LEGACY_ALIAS_SEARCH_TERMS = [
  "BAT shoestr",
  "BAT SHOESTR",
  "bat shoestr",
  "shoestr",
] as const;

export type CanonicalIngredientSourceState = "active" | "archived" | "merged" | "unknown";

export type CanonicalIngredientResolverMethod =
  | "explicit_id"
  | "alias_ownership"
  | "catalog_normalized_name"
  | "catalog_fuzzy_legacy_palha";

export type CanonicalIngredientResolution = {
  ingredientId: string | null;
  sourceState: CanonicalIngredientSourceState;
  aliasCount: number;
  resolverMethod: CanonicalIngredientResolverMethod | null;
  fallbackReason: string | null;
};

export type CanonicalReassignmentHints = {
  explicitIngredientId?: string | null;
  normalizedNames?: string[];
  aliasSearchTerms?: string[];
  /** Fuzzy legacy PALHA name match in catalog (excludes Batata palha identities). */
  legacyPalhaFuzzyCatalog?: boolean;
  /** Fuzzy legacy BAT shoestr catalog match (excludes Batata palha). */
  legacyBatShoestrFuzzyCatalog?: boolean;
  excludeNormalizedNames?: string[];
  catalog?: IngredientCanonicalInput[];
  includeArchived?: boolean;
  activeOnly?: boolean;
};

function catalogEntrySourceState(
  entry: IngredientCanonicalInput | undefined,
): CanonicalIngredientSourceState {
  if (!entry) return "unknown";
  if (entry.merged_into_ingredient_id?.trim()) return "merged";
  if (entry.is_archived === true || isArchivedIngredientEntry(entry)) return "archived";
  return "active";
}

function normalizedNamesSet(names: string[] | undefined): Set<string> {
  return new Set(
    (names ?? [])
      .map((name) => normalizeCanonicalIngredientName(name))
      .filter(Boolean),
  );
}

function isExcludedNormalizedIdentity(
  norm: string,
  excludeNormalizedNames: string[] | undefined,
): boolean {
  if (!norm) return true;
  const excluded = normalizedNamesSet(excludeNormalizedNames);
  return excluded.has(norm);
}

function isBatataPalhaNormalizedIdentity(norm: string): boolean {
  if (!norm) return false;
  if (norm === "batata palha") return true;
  return norm.includes("batata") && norm.includes("palha");
}

/** True when alias text refers to legacy PALHA, not Batata palha product lines. */
export function isLegacyPalhaAliasField(
  raw: string | null | undefined,
  searchTerms: string[] = [...PALHA_LEGACY_ALIAS_SEARCH_TERMS],
): boolean {
  const field = raw?.trim();
  if (!field) return false;
  const memory = normalizeInvoiceAliasMemoryKey(field);
  const canonical = normalizeCanonicalIngredientName(field);
  if (isBatataPalhaNormalizedIdentity(canonical) || isBatataPalhaNormalizedIdentity(memory)) {
    return false;
  }
  if (canonical === "palha" || memory === "palha") return true;
  if (/^bat\s+pal(h(a)?)?$/i.test(memory) || /^bat\s+pal(h(a)?)?$/i.test(canonical)) {
    return true;
  }
  for (const term of searchTerms) {
    const termMemory = normalizeInvoiceAliasMemoryKey(term);
    const termCanon = normalizeCanonicalIngredientName(term);
    if (termMemory && memory === termMemory) return true;
    if (termCanon && canonical === termCanon) return true;
    if (
      termCanon === "palha" &&
      (canonical === "palha" || memory === "palha" || /\bpalha\b/.test(memory))
    ) {
      return true;
    }
  }
  return false;
}

/** Invoice/catalog shorthand for legacy BAT shoestr rows (merge scripts only; not Batata palha). */
export function isBatShoestrMisclassifiedShorthand(
  raw: string | null | undefined,
): boolean {
  const field = raw?.trim();
  if (!field) return false;
  const canonical = normalizeCanonicalIngredientName(field);
  if (isBatataPalhaNormalizedIdentity(canonical)) return false;
  if (canonical === "batata shoestring") return false;
  if (canonical === "bat shoestr") return true;
  if (/^bat\s+shoestr$/i.test(field)) return true;
  if (/\bbat\s*shoestr\b/i.test(field) && !/\bbatata\s+palha\b/i.test(field)) return true;
  return false;
}

/** Catalog row is legacy BAT shoestr source, not Batata palha or full shoestring product. */
export function isLegacyBatShoestrCatalogEntry(entry: IngredientCanonicalInput): boolean {
  const displayNorm = normalizeCanonicalIngredientName(entry.name ?? "");
  const storedNorm = entry.normalized_name
    ? normalizeCanonicalIngredientName(entry.normalized_name)
    : "";
  if (
    isBatataPalhaNormalizedIdentity(displayNorm) ||
    isBatataPalhaNormalizedIdentity(storedNorm)
  ) {
    return false;
  }
  if (displayNorm === "batata shoestring" || storedNorm === "batata shoestring") return false;
  if (displayNorm === "bat shoestr" || storedNorm === "bat shoestr") return true;
  const lower = (entry.name ?? "").toLowerCase();
  if (/\bbat\s*shoestr\b/i.test(lower) && !/\bbatata\s+palha\b/i.test(lower)) return true;
  return false;
}

/** True when alias text refers to legacy BAT shoestr lines, not Batata palha products. */
export function isLegacyBatShoestrAliasField(
  raw: string | null | undefined,
  searchTerms: string[] = [...BAT_SHOESTR_LEGACY_ALIAS_SEARCH_TERMS],
): boolean {
  const field = raw?.trim();
  if (!field) return false;
  if (isBatataPalhaNormalizedIdentity(normalizeCanonicalIngredientName(field))) return false;
  if (isBatShoestrMisclassifiedShorthand(field)) return true;
  for (const term of searchTerms) {
    const termNorm = normalizeCanonicalIngredientName(term);
    const fieldNorm = normalizeCanonicalIngredientName(field);
    if (termNorm && fieldNorm === termNorm) return true;
    if (term.toLowerCase() === "shoestr" && /\bshoestr\b/i.test(field) && /\bbat\b/i.test(field)) {
      return true;
    }
  }
  return false;
}

/** Catalog row is legacy PALHA source, not active Batata palha canonical. */
export function isLegacyPalhaCatalogEntry(entry: IngredientCanonicalInput): boolean {
  const displayNorm = normalizeCanonicalIngredientName(entry.name ?? "");
  const storedNorm = entry.normalized_name
    ? normalizeCanonicalIngredientName(entry.normalized_name)
    : "";
  const identity = catalogOperationalIdentityKeyForEntry(entry);
  if (
    isBatataPalhaNormalizedIdentity(displayNorm) ||
    isBatataPalhaNormalizedIdentity(storedNorm) ||
    isBatataPalhaNormalizedIdentity(identity)
  ) {
    return false;
  }
  if (displayNorm === "palha" || storedNorm === "palha") return true;
  const identityKey = normalizeCatalogOperationalIdentityKey("PALHA");
  if (identity && identityKey && identity === identityKey) return true;
  const lower = (entry.name ?? "").toLowerCase();
  if (/\bbat\s*pal(h(a)?)?\b/i.test(lower)) return true;
  if (/\bpalha\b/i.test(lower) && !/\bbatata\b/i.test(lower)) return true;
  return false;
}

export type AliasOwnershipResolution = {
  ingredientId: string | null;
  aliasCount: number;
};

/**
 * Resolve legacy canonical id from `ingredient_aliases` ownership (works when catalog name is archived/missing).
 */
function aliasOwnershipMatchesSearchTerms(
  aliasName: string,
  normalizedAlias: string,
  terms: string[],
  mode: "palha" | "bat_shoestr" | "generic",
): boolean {
  if (mode === "palha") {
    return (
      isLegacyPalhaAliasField(aliasName, terms) || isLegacyPalhaAliasField(normalizedAlias, terms)
    );
  }
  if (mode === "bat_shoestr") {
    return (
      isLegacyBatShoestrAliasField(aliasName, terms) ||
      isLegacyBatShoestrAliasField(normalizedAlias, terms)
    );
  }
  return (
    isLegacyPalhaAliasField(aliasName, terms) ||
    isLegacyPalhaAliasField(normalizedAlias, terms) ||
    isLegacyBatShoestrAliasField(aliasName, terms) ||
    isLegacyBatShoestrAliasField(normalizedAlias, terms)
  );
}

export async function findSourceCanonicalFromAliasOwnership(
  client: AppSupabaseClient,
  userId: string,
  searchTerms: string[],
  options?: { ownershipMode?: "palha" | "bat_shoestr" | "generic" },
): Promise<AliasOwnershipResolution> {
  const terms = searchTerms.length > 0 ? searchTerms : [...PALHA_LEGACY_ALIAS_SEARCH_TERMS];
  const ownershipMode = options?.ownershipMode ?? "palha";
  const { data, error } = await client
    .from("ingredient_aliases")
    .select("ingredient_id, alias_name, normalized_alias");

  if (error) {
    console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "alias_ownership_lookup_failed", {
      userId: userId.trim(),
      error: error.message,
    });
    return { ingredientId: null, aliasCount: 0 };
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = row.ingredient_id?.trim();
    if (!id) continue;
    const aliasName = row.alias_name ?? "";
    const normalizedAlias = row.normalized_alias ?? "";
    if (!aliasOwnershipMatchesSearchTerms(aliasName, normalizedAlias, terms, ownershipMode)) {
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return { ingredientId: null, aliasCount: 0 };
  }

  let winnerId: string | null = null;
  let winnerCount = 0;
  for (const [id, count] of counts) {
    if (count > winnerCount) {
      winnerId = id;
      winnerCount = count;
    }
  }

  if (!winnerId || !userId.trim()) {
    return { ingredientId: winnerId, aliasCount: winnerCount };
  }

  const { data: owned, error: ownedError } = await client
    .from("ingredients")
    .select("id")
    .eq("user_id", userId.trim())
    .eq("id", winnerId)
    .maybeSingle();

  if (ownedError) {
    console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "alias_ownership_owner_check_failed", {
      userId: userId.trim(),
      winnerId,
      error: ownedError.message,
    });
    return { ingredientId: winnerId, aliasCount: winnerCount };
  }

  if (!owned?.id) {
    return { ingredientId: null, aliasCount: 0 };
  }

  return { ingredientId: winnerId, aliasCount: winnerCount };
}

function resolveFromCatalogHints(
  catalog: IngredientCanonicalInput[],
  hints: CanonicalReassignmentHints,
): CanonicalIngredientResolution | null {
  const wanted = normalizedNamesSet(hints.normalizedNames);
  if (
    wanted.size === 0 &&
    !hints.legacyPalhaFuzzyCatalog &&
    !hints.legacyBatShoestrFuzzyCatalog
  ) {
    return null;
  }

  const activeOnly = hints.activeOnly === true;
  const includeArchived = hints.includeArchived === true;

  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id) continue;
    if (activeOnly && isArchivedIngredientEntry(entry)) continue;
    if (!includeArchived && !activeOnly && isArchivedIngredientEntry(entry)) continue;

    const displayNorm = normalizeCanonicalIngredientName(entry.name ?? "");
    const storedNorm = entry.normalized_name
      ? normalizeCanonicalIngredientName(entry.normalized_name)
      : "";
    const identityNorm = normalizeCatalogOperationalIdentityKey(
      entry.normalized_name ?? entry.name ?? "",
    );

    if (
      isExcludedNormalizedIdentity(displayNorm, hints.excludeNormalizedNames) ||
      isExcludedNormalizedIdentity(storedNorm, hints.excludeNormalizedNames) ||
      isExcludedNormalizedIdentity(identityNorm, hints.excludeNormalizedNames)
    ) {
      continue;
    }

    const matchesNormalized =
      (displayNorm && wanted.has(displayNorm)) ||
      (storedNorm && wanted.has(storedNorm)) ||
      (identityNorm && wanted.has(identityNorm));

    if (matchesNormalized) {
      return {
        ingredientId: id,
        sourceState: catalogEntrySourceState(entry),
        aliasCount: 0,
        resolverMethod: "catalog_normalized_name",
        fallbackReason: null,
      };
    }
  }

  if (hints.legacyPalhaFuzzyCatalog) {
    for (const entry of catalog) {
      const id = entry.id?.trim();
      if (!id) continue;
      if (activeOnly && isArchivedIngredientEntry(entry)) continue;
      if (!includeArchived && !activeOnly && isArchivedIngredientEntry(entry)) continue;
      if (!isLegacyPalhaCatalogEntry(entry)) continue;
      const displayNorm = normalizeCanonicalIngredientName(entry.name ?? "");
      if (isExcludedNormalizedIdentity(displayNorm, hints.excludeNormalizedNames)) continue;
      return {
        ingredientId: id,
        sourceState: catalogEntrySourceState(entry),
        aliasCount: 0,
        resolverMethod: "catalog_fuzzy_legacy_palha",
        fallbackReason: null,
      };
    }
  }

  if (hints.legacyBatShoestrFuzzyCatalog) {
    for (const entry of catalog) {
      const id = entry.id?.trim();
      if (!id) continue;
      if (activeOnly && isArchivedIngredientEntry(entry)) continue;
      if (!includeArchived && !activeOnly && isArchivedIngredientEntry(entry)) continue;
      if (!isLegacyBatShoestrCatalogEntry(entry)) continue;
      const displayNorm = normalizeCanonicalIngredientName(entry.name ?? "");
      if (isExcludedNormalizedIdentity(displayNorm, hints.excludeNormalizedNames)) continue;
      return {
        ingredientId: id,
        sourceState: catalogEntrySourceState(entry),
        aliasCount: 0,
        resolverMethod: "catalog_fuzzy_legacy_palha",
        fallbackReason: null,
      };
    }
  }

  return null;
}

/**
 * Resolve a canonical ingredient id for reassignment (source or target).
 * Order: explicit id → alias ownership → catalog normalized name → legacy PALHA fuzzy catalog.
 */
export async function resolveCanonicalIngredientForReassignment(params: {
  client: AppSupabaseClient;
  userId: string;
  hints: CanonicalReassignmentHints;
}): Promise<CanonicalIngredientResolution> {
  const catalog = params.hints.catalog ?? [];
  const explicitId = params.hints.explicitIngredientId?.trim();
  if (explicitId) {
    const entry = catalog.find((row) => row.id?.trim() === explicitId);
    return {
      ingredientId: explicitId,
      sourceState: catalogEntrySourceState(entry),
      aliasCount: 0,
      resolverMethod: "explicit_id",
      fallbackReason: entry ? null : "explicit_id_not_in_catalog",
    };
  }

  const aliasTerms = params.hints.aliasSearchTerms;
  if (aliasTerms && aliasTerms.length > 0) {
    const ownershipMode = params.hints.legacyBatShoestrFuzzyCatalog
      ? "bat_shoestr"
      : params.hints.legacyPalhaFuzzyCatalog
        ? "palha"
        : "generic";
    const ownership = await findSourceCanonicalFromAliasOwnership(
      params.client,
      params.userId,
      aliasTerms,
      { ownershipMode },
    );
    if (ownership.ingredientId) {
      const entry = catalog.find((row) => row.id?.trim() === ownership.ingredientId);
      return {
        ingredientId: ownership.ingredientId,
        sourceState: catalogEntrySourceState(entry),
        aliasCount: ownership.aliasCount,
        resolverMethod: "alias_ownership",
        fallbackReason: entry ? null : "alias_ownership_id_missing_from_catalog",
      };
    }
  }

  const catalogHit = resolveFromCatalogHints(catalog, params.hints);
  if (catalogHit?.ingredientId) return catalogHit;

  if (params.hints.aliasSearchTerms?.length) {
    return {
      ingredientId: null,
      sourceState: "unknown",
      aliasCount: 0,
      resolverMethod: null,
      fallbackReason: "no_alias_ownership_or_catalog_match",
    };
  }

  return {
    ingredientId: null,
    sourceState: "unknown",
    aliasCount: 0,
    resolverMethod: null,
    fallbackReason: "no_catalog_match",
  };
}

export type PalhaMigrationResolutionDiagnostics = {
  resolvedSourceId: string | null;
  resolvedTargetId: string | null;
  sourceState: CanonicalIngredientSourceState;
  aliasCount: number;
  resolverMethod: CanonicalIngredientResolverMethod | null;
  fallbackReason: string | null;
};

export type PreviewAliasReassignmentParams = {
  client: AppSupabaseClient;
  fromIngredientId: string;
  toIngredientId: string;
};

export type PreviewAliasReassignmentResult = {
  aliasCount: number;
  aliasNames: string[];
  validationIssues: ReassignIngredientAliasesValidationIssue[];
  queryError: string | null;
};

/** Read-only preview for UI confirm dialogs. */
export async function previewIngredientAliasReassignment(
  params: PreviewAliasReassignmentParams,
): Promise<PreviewAliasReassignmentResult> {
  const validationIssues = validateReassignIngredientAliasesParams(params);
  if (validationIssues.length > 0) {
    return { aliasCount: 0, aliasNames: [], validationIssues, queryError: null };
  }

  const { data, error } = await params.client
    .from("ingredient_aliases")
    .select("alias_name, normalized_alias")
    .eq("ingredient_id", params.fromIngredientId.trim());

  if (error) {
    return {
      aliasCount: 0,
      aliasNames: [],
      validationIssues,
      queryError: error.message,
    };
  }

  const aliasNames = [
    ...new Set(
      (data ?? [])
        .map((row) => row.alias_name?.trim() || row.normalized_alias?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return {
    aliasCount: (data ?? []).length,
    aliasNames,
    validationIssues,
    queryError: null,
  };
}

export type RunPalhaToBatataPalhaReassignmentParams = {
  client: AppSupabaseClient;
  userId: string;
  catalog: IngredientCanonicalInput[];
  confirmedAliases?: IngredientAliasMap;
  /** When UI already knows the legacy PALHA row id, skip name-only catalog lookup. */
  fromIngredientId?: string | null;
  toIngredientId?: string | null;
};

export type RunPalhaToBatataPalhaReassignmentResult = ReassignAliasesAndArchiveIfOrphanResult & {
  fromIngredientId: string | null;
  toIngredientId: string | null;
  resolutionError: string | null;
  resolutionDiagnostics?: PalhaMigrationResolutionDiagnostics;
};

/** Operational migration: legacy PALHA → Batata palha (aliases only, then archive PALHA if orphan). */
export async function runPalhaToBatataPalhaAliasReassignment(
  params: RunPalhaToBatataPalhaReassignmentParams,
): Promise<RunPalhaToBatataPalhaReassignmentResult> {
  const sourceResolution = await resolveCanonicalIngredientForReassignment({
    client: params.client,
    userId: params.userId,
    hints: {
      explicitIngredientId: params.fromIngredientId,
      normalizedNames: ["PALHA"],
      aliasSearchTerms: [...PALHA_LEGACY_ALIAS_SEARCH_TERMS],
      legacyPalhaFuzzyCatalog: true,
      excludeNormalizedNames: ["Batata palha"],
      catalog: params.catalog,
      includeArchived: true,
    },
  });
  const targetResolution = await resolveCanonicalIngredientForReassignment({
    client: params.client,
    userId: params.userId,
    hints: {
      explicitIngredientId: params.toIngredientId,
      normalizedNames: ["Batata palha"],
      catalog: params.catalog,
      activeOnly: true,
    },
  });

  const fromIngredientId = sourceResolution.ingredientId;
  const toIngredientId = targetResolution.ingredientId;
  const resolutionDiagnostics: PalhaMigrationResolutionDiagnostics = {
    resolvedSourceId: fromIngredientId,
    resolvedTargetId: toIngredientId,
    sourceState: sourceResolution.sourceState,
    aliasCount: sourceResolution.aliasCount,
    resolverMethod: sourceResolution.resolverMethod,
    fallbackReason: sourceResolution.fallbackReason,
  };

  if (!fromIngredientId || !toIngredientId) {
    const resolutionError = !fromIngredientId
      ? "PALHA canonical not found"
      : "Batata palha canonical not found";
    console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "palha_migration_resolve_failed", {
      resolutionError,
      resolutionDiagnostics,
      targetState: targetResolution.sourceState,
      targetFallbackReason: targetResolution.fallbackReason,
    });
    return {
      fromIngredientId,
      toIngredientId,
      resolutionError,
      resolutionDiagnostics,
      aliasesReassigned: 0,
      error: {
        message: resolutionError,
        code: "palha_migration_resolve",
        details: "",
        hint: "",
      } as PostgrestError,
      sourceOrphanReport: null,
      archived: false,
      archiveError: null,
    };
  }

  console.info(ALIAS_REASSIGNMENT_LOG_PREFIX, "palha_migration_resolved", resolutionDiagnostics);

  let confirmedAliases = params.confirmedAliases;
  if (confirmedAliases === undefined) {
    confirmedAliases = await loadConfirmedIngredientAliasMap(params.client);
  }

  const result = await reassignAliasesAndArchiveIfOrphan({
    client: params.client,
    fromIngredientId,
    toIngredientId,
    userId: params.userId,
    catalog: params.catalog,
    confirmedAliases,
  });

  return {
    ...result,
    fromIngredientId,
    toIngredientId,
    resolutionError: null,
    resolutionDiagnostics,
  };
}
