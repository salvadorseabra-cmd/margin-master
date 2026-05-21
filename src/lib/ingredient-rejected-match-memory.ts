/**
 * Deterministic rejected invoice line → ingredient pairs (wrong-match).
 * Blocks automatic re-matching only; does not remove catalog entries or aliases.
 */

import { buildOverrideKeysFromInvoiceLine } from "@/lib/ingredient-match-override";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

export type RejectedIngredientMatch = {
  normalizedInvoiceText: string;
  rejectedIngredientId: string;
  supplierId?: string;
  rejectedByUser: true;
  createdAt: number;
};

const rejectedIngredientMatches = new Map<string, RejectedIngredientMatch>();

const STORAGE_PREFIX = "marginly:rejected-ingredient-matches:";

let hydratedRejectedMatchesForUserId: string | null = null;

export function rejectedIngredientMatchStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function normalizeSupplierScope(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = normalizeSupplierDisplayName(raw);
  return normalized || undefined;
}

export function buildRejectedIngredientMatchKey(
  normalizedInvoiceText: string,
  rejectedIngredientId: string,
  supplierName?: string | null,
): string {
  const supplierId = normalizeSupplierScope(supplierName);
  return supplierId
    ? `${supplierId}::${normalizedInvoiceText}::${rejectedIngredientId}`
    : `${normalizedInvoiceText}::${rejectedIngredientId}`;
}

function invoiceLineNamesForLookup(itemName: string, rawItemNames: string[] = []): string[] {
  return [...new Set([itemName, ...rawItemNames].map((name) => name?.trim()).filter(Boolean))];
}

function lookupKeysForInvoiceLine(
  itemName: string,
  supplierName?: string | null,
  rawItemNames: string[] = [],
): { normalizedTexts: string[]; supplierScopes: (string | undefined)[] } {
  const normalizedTexts = new Set<string>();
  const supplierScopes: (string | undefined)[] = [normalizeSupplierScope(supplierName), undefined];

  for (const lineName of invoiceLineNamesForLookup(itemName, rawItemNames)) {
    for (const scope of [supplierName, null] as const) {
      const keys = buildOverrideKeysFromInvoiceLine(lineName, scope);
      if (!keys) continue;
      normalizedTexts.add(keys.rawNormalized);
    }
  }

  return {
    normalizedTexts: [...normalizedTexts],
    supplierScopes: [...new Set(supplierScopes.map((s) => s ?? undefined))],
  };
}

/** Idempotent sync hydrate — safe during render before matcher / picker run. */
export function ensureRejectedIngredientMatchesHydrated(userId: string): void {
  if (!userId?.trim() || typeof window === "undefined") return;
  if (hydratedRejectedMatchesForUserId === userId) return;
  hydrateRejectedIngredientMatchesFromStorage(userId);
  hydratedRejectedMatchesForUserId = userId;
}

export function isIngredientMatchPairRejected(
  itemName: string,
  ingredientId: string,
  supplierName?: string | null,
  rawItemNames: string[] = [],
): boolean {
  const { normalizedTexts, supplierScopes } = lookupKeysForInvoiceLine(
    itemName,
    supplierName,
    rawItemNames,
  );
  for (const normalizedInvoiceText of normalizedTexts) {
    for (const supplierId of supplierScopes) {
      const key = buildRejectedIngredientMatchKey(
        normalizedInvoiceText,
        ingredientId,
        supplierId ?? null,
      );
      if (rejectedIngredientMatches.has(key)) return true;
    }
  }
  return false;
}

/** Remove persisted wrong-match rejection for this invoice line → ingredient pair. */
export function clearRejectedIngredientMatchPair(
  itemName: string,
  ingredientId: string,
  supplierName?: string | null,
  rawItemNames: string[] = [],
): number {
  const { normalizedTexts, supplierScopes } = lookupKeysForInvoiceLine(
    itemName,
    supplierName,
    rawItemNames,
  );
  let removed = 0;
  for (const normalizedInvoiceText of normalizedTexts) {
    for (const supplierId of supplierScopes) {
      const key = buildRejectedIngredientMatchKey(
        normalizedInvoiceText,
        ingredientId,
        supplierId ?? null,
      );
      if (rejectedIngredientMatches.delete(key)) removed += 1;
    }
  }
  return removed;
}

export function rememberRejectedIngredientMatch(
  itemName: string,
  rejectedIngredientId: string,
  supplierName?: string | null,
  createdAt = Date.now(),
  rawItemNames: string[] = [],
): RejectedIngredientMatch | null {
  const primaryKeys = buildOverrideKeysFromInvoiceLine(itemName, supplierName);
  if (!primaryKeys) return null;

  const entry: RejectedIngredientMatch = {
    normalizedInvoiceText: primaryKeys.rawNormalized,
    rejectedIngredientId,
    supplierId: primaryKeys.invoiceSupplierNormalized,
    rejectedByUser: true,
    createdAt,
  };

  for (const lineName of invoiceLineNamesForLookup(itemName, rawItemNames)) {
    const keys = buildOverrideKeysFromInvoiceLine(lineName, supplierName);
    if (!keys) continue;
    rejectedIngredientMatches.set(
      buildRejectedIngredientMatchKey(keys.rawNormalized, rejectedIngredientId, supplierName),
      entry,
    );
  }

  return entry;
}

export function listRejectedIngredientMatches(): RejectedIngredientMatch[] {
  const seen = new Set<string>();
  const rows: RejectedIngredientMatch[] = [];
  for (const entry of rejectedIngredientMatches.values()) {
    const dedupeKey = `${entry.supplierId ?? ""}|${entry.normalizedInvoiceText}|${entry.rejectedIngredientId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push(entry);
  }
  return rows;
}

export function hydrateRejectedIngredientMatchesFromStorage(userId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(rejectedIngredientMatchStorageKey(userId));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as RejectedIngredientMatch[];
    if (!Array.isArray(parsed)) return 0;
    let merged = 0;
    for (const row of parsed) {
      if (
        !row?.normalizedInvoiceText ||
        !row.rejectedIngredientId ||
        row.rejectedByUser !== true
      ) {
        continue;
      }
      const key = buildRejectedIngredientMatchKey(
        row.normalizedInvoiceText,
        row.rejectedIngredientId,
        row.supplierId ?? null,
      );
      rejectedIngredientMatches.set(key, {
        normalizedInvoiceText: row.normalizedInvoiceText,
        rejectedIngredientId: row.rejectedIngredientId,
        supplierId: row.supplierId,
        rejectedByUser: true,
        createdAt: row.createdAt ?? Date.now(),
      });
      merged += 1;
    }
    return merged;
  } catch {
    return 0;
  }
}

export function persistRejectedIngredientMatchesToStorage(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      rejectedIngredientMatchStorageKey(userId),
      JSON.stringify(listRejectedIngredientMatches()),
    );
  } catch {
    // ignore quota / private mode
  }
}

/** Rewire wrong-match memory when a duplicate ingredient id is merged away. */
export function remapRejectedIngredientId(
  sourceIngredientId: string,
  canonicalIngredientId: string,
): number {
  if (sourceIngredientId === canonicalIngredientId) return 0;
  const toRekey: { oldKey: string; entry: RejectedIngredientMatch }[] = [];

  for (const [key, entry] of rejectedIngredientMatches.entries()) {
    if (entry.rejectedIngredientId !== sourceIngredientId) continue;
    const newEntry: RejectedIngredientMatch = {
      ...entry,
      rejectedIngredientId: canonicalIngredientId,
    };
    const newKey = buildRejectedIngredientMatchKey(
      entry.normalizedInvoiceText,
      canonicalIngredientId,
      entry.supplierId,
    );
    toRekey.push({ oldKey: key, entry: newEntry });
    if (newKey !== key) rejectedIngredientMatches.delete(key);
    rejectedIngredientMatches.set(newKey, newEntry);
  }

  return toRekey.length;
}

export function clearRejectedIngredientMatchesForTests(): void {
  rejectedIngredientMatches.clear();
  hydratedRejectedMatchesForUserId = null;
}
