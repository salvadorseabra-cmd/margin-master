import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { isArchivedIngredientEntry } from "@/lib/ingredient-canonical";
import { lookupIngredientIdFromAliasMap } from "@/lib/ingredient-alias-lookup";
import {
  normalizeOperationalIdentityKey,
  operationalIdentityKeyForCatalogEntry,
} from "@/lib/ingredient-operational-identity";
import type { IngredientMergeCluster } from "@/lib/ingredient-merge-hooks";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import { normalizeOperationalAliasKey } from "@/lib/ingredient-operational-alias-memory";

export type DuplicateNormalizedNameGroup = {
  normalizedName: string;
  ingredientIds: string[];
  displayNames: string[];
};

export type RepeatedDisplayNameGroup = {
  displayName: string;
  ingredientIds: string[];
};

export type AliasCollision = {
  aliasKey: string;
  ingredientIds: string[];
};

export type IngredientIdentityDiagnostics = {
  duplicateNormalizedNames: DuplicateNormalizedNameGroup[];
  operationalDuplicateClusters: IngredientMergeCluster[];
  aliasCollisions: AliasCollision[];
  repeatedDisplayNames: RepeatedDisplayNameGroup[];
};

function displayNameFor(entry: IngredientCanonicalInput): string {
  return entry.name?.trim() || entry.normalized_name?.trim() || entry.id;
}

export function findDuplicateNormalizedNameGroups(
  catalog: IngredientCanonicalInput[],
): DuplicateNormalizedNameGroup[] {
  const byNormalized = new Map<string, IngredientCanonicalInput[]>();

  for (const entry of catalog) {
    if (isArchivedIngredientEntry(entry)) continue;
    const normalized =
      entry.normalized_name?.trim().toLowerCase() ||
      normalizeIngredientName(entry.name ?? "");
    if (!normalized) continue;
    const bucket = byNormalized.get(normalized) ?? [];
    bucket.push(entry);
    byNormalized.set(normalized, bucket);
  }

  const groups: DuplicateNormalizedNameGroup[] = [];
  for (const [normalizedName, entries] of byNormalized) {
    if (entries.length < 2) continue;
    groups.push({
      normalizedName,
      ingredientIds: entries.map((e) => e.id),
      displayNames: entries.map(displayNameFor),
    });
  }
  return groups.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}

export function findOperationalDuplicateClusters(
  catalog: IngredientCanonicalInput[],
): IngredientMergeCluster[] {
  const byKey = new Map<string, IngredientCanonicalInput[]>();

  for (const entry of catalog) {
    if (isArchivedIngredientEntry(entry)) continue;
    const key = operationalIdentityKeyForCatalogEntry(entry);
    if (!key) continue;
    const bucket = byKey.get(key) ?? [];
    bucket.push(entry);
    byKey.set(key, bucket);
  }

  const clusters: IngredientMergeCluster[] = [];
  for (const [operationalKey, entries] of byKey) {
    if (entries.length < 2) continue;
    clusters.push({
      operationalKey,
      ingredientIds: entries.map((e) => e.id),
      displayNames: entries.map(displayNameFor),
      confidence: "exact_operational_key",
    });
  }
  return clusters.sort((a, b) => a.operationalKey.localeCompare(b.operationalKey));
}

export function findSuspiciousOperationalEquivalents(
  catalog: IngredientCanonicalInput[],
): IngredientMergeCluster[] {
  const byAliasKey = new Map<string, IngredientCanonicalInput[]>();

  for (const entry of catalog) {
    if (isArchivedIngredientEntry(entry)) continue;
    const aliasKey = normalizeOperationalAliasKey(entry.name ?? entry.normalized_name ?? "");
    if (!aliasKey) continue;
    const identityKey = normalizeOperationalIdentityKey(entry.name ?? entry.normalized_name ?? "");
    if (aliasKey === identityKey) continue;
    const bucket = byAliasKey.get(aliasKey) ?? [];
    bucket.push(entry);
    byAliasKey.set(aliasKey, bucket);
  }

  const clusters: IngredientMergeCluster[] = [];
  for (const [operationalKey, entries] of byAliasKey) {
    if (entries.length < 2) continue;
    const identityKeys = new Set(entries.map(operationalIdentityKeyForCatalogEntry));
    if (identityKeys.size <= 1) continue;
    clusters.push({
      operationalKey,
      ingredientIds: entries.map((e) => e.id),
      displayNames: entries.map(displayNameFor),
      confidence: "exact_operational_key",
    });
  }
  return clusters;
}

export function findAliasCollisions(
  confirmedAliases: IngredientAliasMap,
): AliasCollision[] {
  const byAlias = new Map<string, Set<string>>();

  for (const [mapKey, ingredientId] of Object.entries(confirmedAliases)) {
    if (!ingredientId?.trim()) continue;
    const aliasSegment = mapKey.includes("::") ? mapKey.split("::").pop()! : mapKey;
    const normalized = aliasSegment.trim().toLowerCase();
    if (!normalized) continue;
    const bucket = byAlias.get(normalized) ?? new Set<string>();
    bucket.add(ingredientId);
    byAlias.set(normalized, bucket);
  }

  const collisions: AliasCollision[] = [];
  for (const [aliasKey, ids] of byAlias) {
    if (ids.size < 2) continue;
    collisions.push({ aliasKey, ingredientIds: [...ids] });
  }
  return collisions.sort((a, b) => a.aliasKey.localeCompare(b.aliasKey));
}

export function findRepeatedDisplayNameGroups(
  catalog: IngredientCanonicalInput[],
): RepeatedDisplayNameGroup[] {
  const byDisplay = new Map<string, IngredientCanonicalInput[]>();

  for (const entry of catalog) {
    if (isArchivedIngredientEntry(entry)) continue;
    const display = (entry.name ?? "").trim().toLowerCase();
    if (!display) continue;
    const bucket = byDisplay.get(display) ?? [];
    bucket.push(entry);
    byDisplay.set(display, bucket);
  }

  const groups: RepeatedDisplayNameGroup[] = [];
  for (const [displayName, entries] of byDisplay) {
    if (entries.length < 2) continue;
    groups.push({
      displayName,
      ingredientIds: entries.map((e) => e.id),
    });
  }
  return groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function diagnoseIngredientCatalogIdentity(
  catalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
): IngredientIdentityDiagnostics {
  const operationalDuplicateClusters = findOperationalDuplicateClusters(catalog);
  const suspicious = findSuspiciousOperationalEquivalents(catalog);

  return {
    duplicateNormalizedNames: findDuplicateNormalizedNameGroups(catalog),
    operationalDuplicateClusters: [
      ...operationalDuplicateClusters,
      ...suspicious.filter(
        (s) => !operationalDuplicateClusters.some((c) => c.operationalKey === s.operationalKey),
      ),
    ],
    aliasCollisions: findAliasCollisions(confirmedAliases),
    repeatedDisplayNames: findRepeatedDisplayNameGroups(catalog),
  };
}

/** Resolve alias map collisions against catalog (read-only diagnostic). */
export function findAliasMapIngredientCollisions(
  itemName: string,
  confirmedAliases: IngredientAliasMap,
  supplierName?: string | null,
): string[] {
  const id = lookupIngredientIdFromAliasMap(
    confirmedAliases,
    normalizeIngredientName(itemName),
    supplierName,
    itemName,
  );
  return id ? [id] : [];
}
