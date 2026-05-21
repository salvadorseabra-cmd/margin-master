import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { buildOverrideKeysFromInvoiceLine } from "@/lib/ingredient-match-override";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

const LOG_PREFIX = "[ingredient_aliases]";

function normalizeSupplierScope(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeSupplierDisplayName(raw);
  return normalized || null;
}

function debugAliasLog(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.debug(`${LOG_PREFIX} ${message}`, details);
    return;
  }
  console.debug(`${LOG_PREFIX} ${message}`);
}

/** In-memory lookup key: supplier-scoped when supplier is known, else global normalized alias. */
export function buildIngredientAliasLookupKey(
  normalizedAlias: string,
  supplierName?: string | null,
): string {
  const supplier = normalizeSupplierScope(supplierName);
  return supplier ? `${supplier}::${normalizedAlias}` : normalizedAlias;
}

export function lookupIngredientIdFromAliasMap(
  aliases: IngredientAliasMap,
  normalizedItemName: string,
  supplierName?: string | null,
  rawItemName?: string | null,
): string | undefined {
  const operationalCandidates = new Set<string>();
  for (const name of [rawItemName, normalizedItemName]) {
    if (!name?.trim()) continue;
    const keys = buildOverrideKeysFromInvoiceLine(name, supplierName);
    if (!keys) continue;
    operationalCandidates.add(keys.lookupKey);
    operationalCandidates.add(keys.rawNormalized);
    const globalKeys = buildOverrideKeysFromInvoiceLine(name, null);
    if (globalKeys) {
      operationalCandidates.add(globalKeys.lookupKey);
      operationalCandidates.add(globalKeys.rawNormalized);
    }
  }

  for (const key of operationalCandidates) {
    const hit = aliases[key];
    if (hit) {
      debugAliasLog("alias lookup hit (operational key)", {
        normalizedItemName,
        key,
        ingredientId: hit,
      });
      return hit;
    }
  }

  const supplierKey = buildIngredientAliasLookupKey(normalizedItemName, supplierName);
  const supplierHit = aliases[supplierKey];
  if (supplierHit) {
    debugAliasLog("alias lookup hit (supplier-scoped)", {
      normalizedItemName,
      supplierKey,
      ingredientId: supplierHit,
    });
    return supplierHit;
  }

  const globalHit = aliases[normalizedItemName];
  if (globalHit) {
    debugAliasLog("alias lookup hit (global)", {
      normalizedItemName,
      ingredientId: globalHit,
    });
    return globalHit;
  }

  debugAliasLog("alias lookup miss", { normalizedItemName, supplierKey });
  return undefined;
}

export function rememberAliasInMap(
  aliases: IngredientAliasMap,
  normalizedItemName: string,
  ingredientId: string,
  supplierName?: string | null,
): IngredientAliasMap {
  const key = buildIngredientAliasLookupKey(normalizedItemName, supplierName);
  return { ...aliases, [key]: ingredientId };
}

/**
 * Store all lookup keys used by invoice matching (supplier-scoped, global, legacy invoice norm).
 */
export function rememberConfirmedAliasInMap(
  aliases: IngredientAliasMap,
  _aliasName: string,
  normalizedAlias: string,
  ingredientId: string,
  supplierName?: string | null,
): IngredientAliasMap {
  let next = rememberAliasInMap(aliases, normalizedAlias, ingredientId, supplierName);
  next = rememberAliasInMap(next, normalizedAlias, ingredientId, null);
  return next;
}
