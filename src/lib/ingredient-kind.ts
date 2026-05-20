/**
 * Official ingredient kind: canonical (human catalog) vs alias (invoice/OCR shorthand rows).
 * Backward compatible when `ingredient_kind` column is absent — inferred from display name.
 */

import {
  diceCoefficient,
  filterActiveCatalogIngredients,
  normalizeCanonicalIngredientName,
  type IngredientCanonicalInput,
} from "@/lib/ingredient-canonical";
import { normalizeOperationalAliasKey } from "@/lib/ingredient-operational-alias-memory";
import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import {
  normalizeOperationalIdentityKey,
  operationalIdentityKeyForCatalogEntry,
} from "@/lib/ingredient-operational-identity";
import { normalizeInvoiceIngredientName } from "@/lib/ingredient-canonical";

export const INGREDIENT_KIND_CANONICAL = "canonical" as const;
export const INGREDIENT_KIND_ALIAS = "alias" as const;

export type IngredientKind = typeof INGREDIENT_KIND_CANONICAL | typeof INGREDIENT_KIND_ALIAS;

export type IngredientKindInput = IngredientCanonicalInput & {
  ingredient_kind?: string | null;
  current_price?: number | null;
};

/** Invoice/OCR shorthand: mostly uppercase with multiple abbreviated tokens (≤4 chars). */
export function looksLikeInvoiceShorthandName(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.length < 3) return false;

  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 2) return false;

  const upperCount = (trimmed.match(/[A-Z]/g) ?? []).length;
  const upperRatio = upperCount / letters.length;
  if (upperRatio < 0.82) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8) return false;

  if (tokens.some((token) => token.length > 14)) return false;

  const hasAccentLower =
    /[àáâãéêíóôõúç]/i.test(trimmed) && /[a-zà-ÿ]/.test(trimmed) && upperRatio < 0.95;
  if (hasAccentLower) return false;

  const wordTokens = tokens.filter((token) => {
    const letters = token.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letters.length < 2) return false;
    if (/\d/.test(token)) return false;
    return true;
  });
  if (wordTokens.some((token) => token.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 8)) {
    return false;
  }

  const tokenCoreLengths = wordTokens.map((token) => token.replace(/[^A-Za-z0-9]/g, "").length);
  const shorthandTokens = wordTokens.filter((_, index) => {
    const coreLen = tokenCoreLengths[index] ?? 0;
    return coreLen > 0 && coreLen <= 4;
  });

  if (
    shorthandTokens.length >= 2 &&
    shorthandTokens.length / Math.max(wordTokens.length, 1) > 0.5
  ) {
    return true;
  }

  const hasShortAbbrevToken = tokenCoreLengths.some((len) => len > 0 && len <= 4);
  const maxWordCoreLength = tokenCoreLengths.reduce((max, len) => Math.max(max, len), 0);
  if (
    wordTokens.length >= 2 &&
    hasShortAbbrevToken &&
    maxWordCoreLength > 0 &&
    maxWordCoreLength <= 5 &&
    upperRatio >= 0.82
  ) {
    return true;
  }

  const hasNumericSizeToken = tokens.some((token) => /\d/.test(token));
  if (
    wordTokens.length === 1 &&
    hasShortAbbrevToken &&
    hasNumericSizeToken &&
    upperRatio >= 0.82
  ) {
    return true;
  }

  const aliasKey = normalizeOperationalAliasKey(trimmed);
  const identityKey = normalizeOperationalIdentityKey(trimmed);
  if (
    aliasKey &&
    identityKey &&
    aliasKey !== identityKey &&
    upperRatio >= 0.9 &&
    hasShortAbbrevToken
  ) {
    return true;
  }

  return false;
}

export function normalizeIngredientKindValue(
  value: string | null | undefined,
): IngredientKind | null {
  const v = value?.trim().toLowerCase();
  if (v === INGREDIENT_KIND_CANONICAL || v === INGREDIENT_KIND_ALIAS) return v;
  return null;
}

/** Explicit DB kind when present; otherwise infer from display name heuristics. */
export function inferIngredientKindFromName(raw: string | null | undefined): IngredientKind {
  return looksLikeInvoiceShorthandName(raw) ? INGREDIENT_KIND_ALIAS : INGREDIENT_KIND_CANONICAL;
}

export function resolveIngredientKind(entry: IngredientKindInput): IngredientKind {
  const explicit = normalizeIngredientKindValue(entry.ingredient_kind);
  if (explicit) return explicit;
  return inferIngredientKindFromName(entry.name ?? entry.normalized_name ?? "");
}

export function isExplicitAliasIngredientEntry(entry: IngredientKindInput): boolean {
  return normalizeIngredientKindValue(entry.ingredient_kind) === INGREDIENT_KIND_ALIAS;
}

/** True for explicit alias rows, or shorthand display names (UI / detection). */
export function isAliasIngredientEntry(entry: IngredientKindInput): boolean {
  const explicit = normalizeIngredientKindValue(entry.ingredient_kind);
  if (explicit === INGREDIENT_KIND_ALIAS) return true;
  if (explicit === INGREDIENT_KIND_CANONICAL) return false;
  return (
    inferIngredientKindFromName(entry.name ?? entry.normalized_name ?? "") === INGREDIENT_KIND_ALIAS
  );
}

export function isCanonicalIngredientEntry(entry: IngredientKindInput): boolean {
  return !isAliasIngredientEntry(entry);
}

/** Active rows suitable for human catalog UI (canonical only, includes name heuristics). */
export function filterCanonicalCatalogIngredients<T extends IngredientKindInput>(
  catalog: T[],
): T[] {
  return filterActiveCatalogIngredients(catalog).filter((entry) =>
    isCanonicalIngredientEntry(entry),
  );
}

/** Active rows for invoice matching — excludes only explicit DB alias kind (not all-caps heuristic). */
export function filterMatchingCatalogIngredients<T extends IngredientKindInput>(catalog: T[]): T[] {
  return filterActiveCatalogIngredients(catalog).filter(
    (entry) => !isExplicitAliasIngredientEntry(entry),
  );
}

const ALIAS_SIMILARITY_MIN = 0.58;

export type AliasCanonicalSimilarity = {
  canonical: IngredientCanonicalInput;
  score: number;
};

/** Best canonical neighbor for a likely alias row (deterministic, no embeddings). */
export function findCanonicalNeighborForAlias(
  aliasEntry: IngredientKindInput,
  catalog: IngredientCanonicalInput[],
): AliasCanonicalSimilarity | null {
  const aliasName = aliasEntry.name ?? aliasEntry.normalized_name ?? "";
  const aliasExpanded = normalizeInvoiceIngredientName(normalizeSupplierShorthand(aliasName));
  const aliasCanonical = normalizeCanonicalIngredientName(aliasExpanded || aliasName);
  if (!aliasCanonical) return null;

  const aliasOpKey = operationalIdentityKeyForCatalogEntry(aliasEntry);
  let best: AliasCanonicalSimilarity | null = null;

  for (const candidate of filterCanonicalCatalogIngredients(catalog)) {
    if (candidate.id === aliasEntry.id) continue;
    const candidateName = candidate.name ?? candidate.normalized_name ?? "";
    const candidateCanonical = normalizeCanonicalIngredientName(candidateName);
    if (!candidateCanonical) continue;

    const opKey = operationalIdentityKeyForCatalogEntry(candidate);
    if (aliasOpKey && opKey && aliasOpKey === opKey) {
      return { canonical: candidate, score: 1 };
    }

    const dice = diceCoefficient(aliasCanonical, candidateCanonical);
    const weakContainment =
      aliasCanonical.length >= 4 &&
      (candidateCanonical.includes(aliasCanonical) || aliasCanonical.includes(candidateCanonical));
    const score = Math.max(dice, weakContainment ? 0.65 : 0);
    if (score < ALIAS_SIMILARITY_MIN) continue;
    if (!best || score > best.score) {
      best = { canonical: candidate, score };
    }
  }

  return best;
}
