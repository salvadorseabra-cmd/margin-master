/**
 * Highest-priority deterministic ingredient match overrides (user-confirmed).
 * Backed by ingredient_aliases rows; in-memory map mirrors DB on load.
 */

import { buildIngredientAliasLookupKey } from "@/lib/ingredient-alias-lookup";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import {
  buildOperationalIdentityAliasKey,
  normalizeOperationalAliasKey,
} from "@/lib/ingredient-operational-alias-memory";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";
import {
  traceIngredientAliasesNormalizationRejection,
  traceIngredientAliasesValidationRejection,
} from "@/lib/ingredient-aliases-trace";

export type IngredientMatchOverride = {
  invoiceSupplierNormalized?: string;
  rawInvoiceDescriptionNormalized: string;
  canonicalIngredientId: string;
  canonicalIngredientName: string;
  confirmedByUser: true;
  createdAt: number;
};

/** In-memory override store (hydrated from DB + session writes). */
export const ingredientMatchOverrides = new Map<string, IngredientMatchOverride>();

function normalizeSupplierScope(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = normalizeSupplierDisplayName(raw);
  return normalized || undefined;
}

export function buildIngredientMatchOverrideLookupKey(
  rawInvoiceDescriptionNormalized: string,
  supplierName?: string | null,
): string {
  return buildIngredientAliasLookupKey(rawInvoiceDescriptionNormalized, supplierName);
}

/**
 * Same key shape used when persisting manual corrections and when matching invoice lines.
 * Applies supplier shorthand before operational alias normalization.
 */
export type OverrideKeysFromInvoiceLine = {
  /** Legacy exact alias key (no brand-prefix strip). */
  rawNormalized: string;
  /** Model D operational identity key (commodity brand prefix stripped). */
  operationalIdentityKey: string;
  lookupKey: string;
  operationalLookupKey: string;
  invoiceSupplierNormalized?: string;
};

export function buildOverrideKeysFromInvoiceLine(
  itemName: string,
  supplierName?: string | null,
): OverrideKeysFromInvoiceLine | null {
  const trimmed = itemName?.trim();
  if (!trimmed) {
    traceIngredientAliasesValidationRejection("buildOverrideKeysFromInvoiceLine", "empty_trim", {
      itemName,
    });
    return null;
  }

  const expanded = normalizeSupplierShorthand(trimmed);
  const rawNormalized = normalizeOperationalAliasKey(expanded || trimmed);
  if (!rawNormalized) {
    traceIngredientAliasesNormalizationRejection(
      "buildOverrideKeysFromInvoiceLine",
      "normalizeOperationalAliasKey_empty",
      { itemName: trimmed, expanded, supplierName: supplierName ?? null },
    );
    return null;
  }

  const operationalIdentityKey = buildOperationalIdentityAliasKey(trimmed) || rawNormalized;
  const invoiceSupplierNormalized = normalizeSupplierScope(supplierName);
  return {
    rawNormalized,
    operationalIdentityKey,
    lookupKey: buildIngredientMatchOverrideLookupKey(rawNormalized, supplierName),
    operationalLookupKey: buildIngredientMatchOverrideLookupKey(
      operationalIdentityKey,
      supplierName,
    ),
    invoiceSupplierNormalized,
  };
}

function collectOverrideLookupKeys(keys: OverrideKeysFromInvoiceLine): string[] {
  const out = [keys.lookupKey, keys.rawNormalized];
  if (keys.operationalIdentityKey !== keys.rawNormalized) {
    out.push(keys.operationalLookupKey, keys.operationalIdentityKey);
  }
  return out;
}

export function rememberIngredientMatchOverride(
  itemName: string,
  ingredientId: string,
  ingredientName: string,
  supplierName?: string | null,
  createdAt = Date.now(),
): IngredientMatchOverride | null {
  const keys = buildOverrideKeysFromInvoiceLine(itemName, supplierName);
  if (!keys) return null;

  const entry: IngredientMatchOverride = {
    invoiceSupplierNormalized: keys.invoiceSupplierNormalized,
    rawInvoiceDescriptionNormalized: keys.rawNormalized,
    canonicalIngredientId: ingredientId,
    canonicalIngredientName: ingredientName,
    confirmedByUser: true,
    createdAt,
  };
  for (const key of collectOverrideLookupKeys(keys)) {
    ingredientMatchOverrides.set(key, entry);
  }
  return entry;
}

export function lookupIngredientMatchOverride(
  itemName: string,
  supplierName?: string | null,
  rawItemNames: string[] = [],
): IngredientMatchOverride | null {
  const names = [...rawItemNames, itemName].filter((name) => name?.trim());
  const tried = new Set<string>();

  for (const name of names) {
    const keys = buildOverrideKeysFromInvoiceLine(name, supplierName);
    if (!keys) continue;
    for (const key of collectOverrideLookupKeys(keys)) {
      if (tried.has(key)) continue;
      tried.add(key);
      const hit = ingredientMatchOverrides.get(key);
      if (hit) return hit;
    }
  }

  for (const name of names) {
    const keys = buildOverrideKeysFromInvoiceLine(name, null);
    if (!keys) continue;
    for (const key of collectOverrideLookupKeys(keys)) {
      if (tried.has(key)) continue;
      tried.add(key);
      const hit = ingredientMatchOverrides.get(key);
      if (hit) return hit;
    }
  }

  return null;
}

export type ConfirmedAliasRowForOverride = {
  ingredient_id: string;
  alias_name: string;
  normalized_alias: string;
  supplier_name: string | null;
};

export function hydrateIngredientMatchOverridesFromAliasRows(
  rows: ConfirmedAliasRowForOverride[],
  ingredients: IngredientCanonicalInput[],
): number {
  let merged = 0;
  for (const row of rows) {
    const ingredient = ingredients.find((entry) => entry.id === row.ingredient_id);
    const ingredientName = ingredient?.name ?? ingredient?.normalized_name ?? "";
    const sourceName = row.alias_name?.trim() || row.normalized_alias;
    const remembered = rememberIngredientMatchOverride(
      sourceName,
      row.ingredient_id,
      ingredientName,
      row.supplier_name,
    );
    if (remembered) merged += 1;
  }
  return merged;
}

export function hydrateIngredientMatchOverridesFromConfirmedMap(
  confirmedAliases: IngredientAliasMap,
  ingredients: IngredientCanonicalInput[],
): number {
  let merged = 0;
  for (const [mapKey, ingredientId] of Object.entries(confirmedAliases)) {
    const supplierSegment = mapKey.includes("::") ? mapKey.split("::")[0] : null;
    const aliasSegment = mapKey.includes("::") ? mapKey.split("::").pop()! : mapKey;
    const ingredient = ingredients.find((row) => row.id === ingredientId);
    const ingredientName = ingredient?.name ?? ingredient?.normalized_name ?? "";
    const remembered = rememberIngredientMatchOverride(
      aliasSegment,
      ingredientId,
      ingredientName,
      supplierSegment,
    );
    if (remembered) merged += 1;
  }
  return merged;
}

export function clearIngredientMatchOverridesForTests(): void {
  ingredientMatchOverrides.clear();
}
