/**
 * Deterministic in-memory operational alias memory for recurring Horeca shorthand.
 * Keys: supplier shorthand → invoice normalization → compact lookup key (weights preserved).
 *
 * No vector DB, embeddings, or UI persistence — session/static/confirmed-bridge only.
 */

import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import { normalizeInvoiceMatchIngredientName } from "@/lib/normalize-ingredient-name";
import { shouldSkipByOperationalProductFamilyGate } from "@/lib/ingredient-operational-family-gate";

const DIACRITIC_RE = /\p{M}/gu;
const GRID_CUT_PLACEHOLDER = "__grid9x9__";

const ATTACHED_WEIGHT_RE = /\b\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs)\b/gi;
const STANDALONE_WEIGHT_RE = /\b(\d{2,3})\b/g;

export type OperationalAliasSource = "static" | "session" | "confirmed" | "manual_confirmation";

export type OperationalAliasEntry = {
  ingredientId: string;
  ingredientName: string;
  source: OperationalAliasSource;
  confidence: number;
  createdAt?: number;
};

/** In-memory operational alias store (no DB writes). */
export const operationalAliasMemory = new Map<string, OperationalAliasEntry>();

function preserveGridCutToken(value: string): string {
  return value
    .replace(/\b9\s*x\s*9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `)
    .replace(/\b9x9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `);
}

function restoreGridCutToken(value: string): string {
  return value.replace(new RegExp(GRID_CUT_PLACEHOLDER, "g"), "9x9");
}

function normalizeWeightToken(raw: string): string {
  const compact = raw.toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
  const numeric = compact.match(/^(\d+(?:\.\d+)?)/);
  return numeric ? numeric[1]! : compact;
}

/** Pack/case sizes (1KG, 2.5KG) are not product identity weights for alias keys. */
function isPackSizeWeightToken(raw: string): boolean {
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  return /^\d+(?:\.\d+)?(?:kg|kgs)$/.test(compact);
}

/** Product gram weights (180g, 90) used to distinguish SKUs in Horeca shorthand. */
function isProductWeightToken(raw: string): boolean {
  const compact = raw.toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
  if (isPackSizeWeightToken(compact)) return false;
  if (/^\d{2,3}(?:g|gr|grs)$/.test(compact)) return true;
  if (/^\d{2,3}$/.test(compact)) return true;
  return false;
}

function extractPreservedWeightTokens(expanded: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  const push = (raw: string) => {
    if (!isProductWeightToken(raw)) return;
    const token = normalizeWeightToken(raw);
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  };

  for (const match of expanded.match(ATTACHED_WEIGHT_RE) ?? []) {
    push(match);
  }

  const withoutAttached = expanded.replace(ATTACHED_WEIGHT_RE, " ");
  for (const match of withoutAttached.match(STANDALONE_WEIGHT_RE) ?? []) {
    push(match);
  }

  for (const match of expanded.match(/\b9\s*x\s*9\b/gi) ?? []) {
    push(match.replace(/\s+/g, ""));
  }

  return tokens;
}

/**
 * Compact operational lookup key: shorthand → {@link normalizeInvoiceIngredientName} →
 * lowercase collapsed text with product weights / grid cuts preserved.
 */
export function normalizeOperationalAliasKey(raw: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "";

  const expanded = normalizeSupplierShorthand(trimmed);
  const weightTokens = extractPreservedWeightTokens(expanded || trimmed);
  const normalized = normalizeInvoiceMatchIngredientName(expanded || trimmed);

  let compact = (normalized || expanded || trimmed)
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ");

  compact = preserveGridCutToken(compact);
  compact = compact.replace(/\s+/g, " ").trim();
  compact = restoreGridCutToken(compact);

  const parts = [...compact.split(/\s+/).filter(Boolean), ...weightTokens];
  return [...new Set(parts)].join(" ").trim();
}

export function buildOperationalAliasLookupKeys(
  itemName: string,
  rawItemNames: string[] = [],
): string[] {
  const names = [...rawItemNames, itemName].filter((name) => name?.trim());
  return [...new Set(names.map((name) => normalizeOperationalAliasKey(name)).filter(Boolean))];
}

/** Deterministic reorder/substitution keys for partial lookup boost (no fuzzy). */
const RELATED_ALIAS_TOKEN_SWAPS: Record<string, string[]> = {
  bac: ["bacon"],
  bacon: ["bac"],
  strk: ["streaky", "strips"],
  streaky: ["strk", "strips"],
  strips: ["strk", "streaky"],
};

const RELATED_ALIAS_PARTIAL_CONFIDENCE = 0.92;

function deriveOperationalAliasRelatedKeys(primaryKey: string): string[] {
  const tokens = primaryKey.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return [];

  const related = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const swaps = RELATED_ALIAS_TOKEN_SWAPS[token];
    if (!swaps) continue;
    for (const swap of swaps) {
      const variant = [...tokens.slice(0, i), swap, ...tokens.slice(i + 1)].join(" ");
      const normalized = normalizeOperationalAliasKey(variant);
      if (normalized && normalized !== primaryKey) related.add(normalized);
    }
  }
  return [...related];
}

export function rememberOperationalAlias(
  key: string,
  ingredientId: string,
  ingredientName: string,
  source: OperationalAliasSource = "session",
  confidence = 1,
): void {
  const normalizedKey = normalizeOperationalAliasKey(key);
  if (!normalizedKey || !ingredientId) return;
  const entry: OperationalAliasEntry = {
    ingredientId,
    ingredientName,
    source,
    confidence,
    createdAt: Date.now(),
  };
  operationalAliasMemory.set(normalizedKey, entry);

  for (const relatedKey of deriveOperationalAliasRelatedKeys(normalizedKey)) {
    const existing = operationalAliasMemory.get(relatedKey);
    if (existing && existing.confidence >= RELATED_ALIAS_PARTIAL_CONFIDENCE) continue;
    operationalAliasMemory.set(relatedKey, {
      ...entry,
      confidence: Math.min(confidence, RELATED_ALIAS_PARTIAL_CONFIDENCE),
    });
  }
}

export function lookupOperationalAlias(key: string): OperationalAliasEntry | null {
  const normalizedKey = normalizeOperationalAliasKey(key);
  if (!normalizedKey) return null;
  return operationalAliasMemory.get(normalizedKey) ?? null;
}

/** Test isolation — clears the in-memory map. */
export function clearOperationalAliasMemoryForTests(): void {
  operationalAliasMemory.clear();
}

/**
 * Read-only bridge: merge confirmed DB alias keys into operational lookup (same normalized key format).
 * Does not persist; callers hydrate once per session when alias map is loaded.
 */
export function hydrateOperationalAliasMemoryFromConfirmedMap(
  confirmedAliases: IngredientAliasMap,
  ingredients: IngredientCanonicalInput[],
): number {
  let merged = 0;
  for (const [mapKey, ingredientId] of Object.entries(confirmedAliases)) {
    const normalizedAlias = mapKey.includes("::") ? mapKey.split("::").pop()! : mapKey;
    const operationalKey = normalizeOperationalAliasKey(normalizedAlias);
    if (!operationalKey) continue;

    const ingredient = ingredients.find((row) => row.id === ingredientId);
    const ingredientName = ingredient?.name ?? ingredient?.normalized_name ?? "";
    const existing = operationalAliasMemory.get(operationalKey);
    if (existing?.source === "session" && existing.confidence >= 1) continue;

    operationalAliasMemory.set(operationalKey, {
      ingredientId,
      ingredientName,
      source: "confirmed",
      confidence: existing ? Math.max(existing.confidence, 1) : 1,
      createdAt: existing?.createdAt ?? Date.now(),
    });
    merged += 1;
  }
  return merged;
}

export type OperationalAliasMemoryHit = {
  entry: OperationalAliasEntry;
  lookupKey: string;
};

export function lookupOperationalAliasFromNames(
  itemName: string,
  rawItemNames: string[] = [],
): OperationalAliasMemoryHit | null {
  for (const lookupKey of buildOperationalAliasLookupKeys(itemName, rawItemNames)) {
    const entry = operationalAliasMemory.get(lookupKey);
    if (entry) return { entry, lookupKey };
  }
  return null;
}

export function resolveOperationalAliasCatalogMatch(
  itemName: string,
  ingredients: IngredientCanonicalInput[],
  rawItemNames: string[] = [],
  hasCompatibleForms: (rawA: string, rawB: string) => boolean,
): OperationalAliasMemoryHit | null {
  const hit = lookupOperationalAliasFromNames(itemName, rawItemNames);
  if (!hit) return null;

  const ingredient = ingredients.find((row) => row.id === hit.entry.ingredientId);
  if (!ingredient) return null;

  const ingredientRaw = ingredient.name ?? ingredient.normalized_name ?? "";
  if (shouldSkipByOperationalProductFamilyGate(itemName, ingredientRaw)) return null;
  if (!hasCompatibleForms(itemName, ingredientRaw)) return null;

  return hit;
}
