import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { buildOverrideKeysFromInvoiceLine } from "@/lib/ingredient-match-override";
import { traceManualIngredientMatch } from "@/lib/manual-ingredient-match-trace";
import { normalizeInvoiceAliasMemoryKey } from "@/lib/normalize-ingredient-name";
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
  const keysTried: string[] = [];
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
    keysTried.push(key);
    const hit = aliases[key];
    if (hit) {
      debugAliasLog("alias lookup hit (operational key)", {
        normalizedItemName,
        key,
        ingredientId: hit,
      });
      traceManualIngredientMatch("[alias_link_lookup]", {
        hit: true,
        ingredientId: hit,
        lookupKey: key,
        keysTried,
        normalizeInvoiceAliasMemoryKey: normalizeInvoiceAliasMemoryKey(
          rawItemName ?? normalizedItemName,
        ),
        supplierScope: normalizeSupplierScope(supplierName),
        rawItemName: rawItemName ?? null,
        normalizedItemName,
      });
      return hit;
    }
  }

  const supplierKey = buildIngredientAliasLookupKey(normalizedItemName, supplierName);
  keysTried.push(supplierKey);
  const supplierHit = aliases[supplierKey];
  if (supplierHit) {
    debugAliasLog("alias lookup hit (supplier-scoped)", {
      normalizedItemName,
      supplierKey,
      ingredientId: supplierHit,
    });
    traceManualIngredientMatch("[alias_link_lookup]", {
      hit: true,
      ingredientId: supplierHit,
      lookupKey: supplierKey,
      keysTried,
      normalizeInvoiceAliasMemoryKey: normalizeInvoiceAliasMemoryKey(
        rawItemName ?? normalizedItemName,
      ),
      supplierScope: normalizeSupplierScope(supplierName),
      rawItemName: rawItemName ?? null,
      normalizedItemName,
    });
    return supplierHit;
  }

  const globalHit = aliases[normalizedItemName];
  keysTried.push(normalizedItemName);
  if (globalHit) {
    debugAliasLog("alias lookup hit (global)", {
      normalizedItemName,
      ingredientId: globalHit,
    });
    traceManualIngredientMatch("[alias_link_lookup]", {
      hit: true,
      ingredientId: globalHit,
      lookupKey: normalizedItemName,
      keysTried,
      normalizeInvoiceAliasMemoryKey: normalizeInvoiceAliasMemoryKey(
        rawItemName ?? normalizedItemName,
      ),
      supplierScope: normalizeSupplierScope(supplierName),
      rawItemName: rawItemName ?? null,
      normalizedItemName,
    });
    return globalHit;
  }

  debugAliasLog("alias lookup miss", { normalizedItemName, supplierKey });
  traceManualIngredientMatch("[alias_link_lookup]", {
    hit: false,
    ingredientId: null,
    lookupKey: null,
    keysTried,
    normalizeInvoiceAliasMemoryKey: normalizeInvoiceAliasMemoryKey(
      rawItemName ?? normalizedItemName,
    ),
    supplierScope: normalizeSupplierScope(supplierName),
    rawItemName: rawItemName ?? null,
    normalizedItemName,
  });
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
