/**
 * Low-quality canonical name detection and deterministic rename suggestions (no auto-merge).
 */

import {
  buildCatalogIngredientIdentity,
  formatCanonicalIngredientDisplayName,
} from "@/lib/canonical-ingredient-display-name";
import {
  expandSupplierAbbreviations,
  generateOperationalIngredientName,
  looksLikeSupplierAbbreviatedCatalogName,
  suggestCanonicalRootNameRepair,
} from "@/lib/canonical-ingredient-operational-name";
import { looksLikeInvoiceShorthandName } from "@/lib/ingredient-kind";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import {
  OPERATIONAL_ALIASES,
  PROTECTED_OPERATIONAL_SHORTHAND,
  traceSupplierTokenExpansions,
  type SupplierTokenExpansionTrace,
} from "@/lib/ingredient-operational-aliases";
import {
  catalogOperationalIdentityKeyForEntry,
  normalizeCatalogOperationalIdentityKey,
  normalizeOperationalIdentityKey,
} from "@/lib/ingredient-operational-identity";
import { operationalFamiliesIncompatibleFromRaw } from "@/lib/ingredient-operational-families";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";

export type CanonicalImprovementConfidence = "high" | "medium" | "low";

/** Rename-only kinds — merge is never emitted from this module. */
export type CanonicalImprovementKind = "lexical_cleanup" | "semantic_equivalence";

export type CanonicalNameImprovementInput = {
  ingredient: Pick<IngredientCanonicalInput, "id" | "name" | "normalized_name">;
  /** Confirmed / stored invoice alias lines for this ingredient. */
  aliasNames?: readonly string[];
  /** Historical invoice line names from operational profile scans. */
  invoiceAliasNames?: readonly string[];
  /** Supplier key for per-supplier token expansion memory. */
  supplierKey?: string | null;
  /** Active catalog rows — used only to block cross-ingredient merge hints. */
  catalog?: readonly IngredientCanonicalInput[];
};

export type CanonicalIngredientQualityEvaluation = {
  ingredientId: string;
  currentName: string;
  isLowQuality: boolean;
  signals: string[];
  tokenTrace: SupplierTokenExpansionTrace;
};

export type CanonicalNamingSuggestion = CanonicalNameImprovement & {
  tokenTrace: SupplierTokenExpansionTrace;
};

export type CanonicalNameImprovement = {
  ingredientId: string;
  currentName: string;
  suggestedName: string;
  confidence: CanonicalImprovementConfidence;
  kind: CanonicalImprovementKind;
  reasons: string[];
};

const VOWEL_RE = /[aeiouàáâãéêíóôõú]/gi;
const WORD_TOKEN_RE = /[a-zA-ZÀ-ÿ]+(?:'[a-zA-ZÀ-ÿ]+)?/g;
const READABLE_NAME_SCORE_THRESHOLD = 0.62;
const READABILITY_IMPROVEMENT_MIN_DELTA = 0.08;

export { PROTECTED_OPERATIONAL_SHORTHAND };

function foldName(value: string): string {
  return normalizeIngredientName(value);
}

function displayEquals(a: string, b: string): boolean {
  return foldName(a) === foldName(b);
}

export function hasProtectedOperationalShorthand(raw: string | null | undefined): boolean {
  const name = raw?.trim() ?? "";
  if (!name) return false;
  if (/\bs\/\b/i.test(name) || /\bc\/\b/i.test(name)) return true;
  const lower = name.toLowerCase();
  return PROTECTED_OPERATIONAL_SHORTHAND.some((token) => {
    if (token.includes("/")) return false;
    return new RegExp(`\\b${token}\\b`, "i").test(lower);
  });
}

function countNaturalWordTokens(raw: string): number {
  const tokens = raw.match(WORD_TOKEN_RE) ?? [];
  return tokens.filter((token) => {
    const letters = token.replace(/[^a-zA-ZÀ-ÿ]/gi, "");
    if (letters.length < 4) return false;
    return (letters.match(VOWEL_RE) ?? []).length > 0;
  }).length;
}

/**
 * Human-readability score in [0, 1] for catalog display names.
 * High scores mean natural language, accents, and protected operational shorthand — not OCR blobs.
 */
export function scoreCanonicalNameReadability(raw: string | null | undefined): number {
  const name = raw?.trim() ?? "";
  if (!name) return 0;

  let score = 0.32;
  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 2) return score;

  const naturalWords = countNaturalWordTokens(name);
  if (naturalWords >= 3) score += 0.28;
  else if (naturalWords >= 2) score += 0.22;
  else if (naturalWords === 1) score += 0.1;

  if (/[àáâãéêíóôõúç]/i.test(name)) score += 0.14;

  const upperCount = (name.match(/[A-Z]/g) ?? []).length;
  const upperRatio = upperCount / letters.length;
  if (upperRatio > 0.2 && upperRatio < 0.82) score += 0.08;
  if (upperRatio >= 0.82 && naturalWords < 2) score -= 0.28;

  if (hasLowVowelDensity(name)) score -= 0.22;
  if (hasCompressedSupplierTokens(name)) score -= 0.18;
  if (looksLikeInvoiceShorthandName(name)) score -= 0.32;

  if (hasProtectedOperationalShorthand(name) && naturalWords >= 1) score += 0.1;
  if (/\bs\/\s+\S/i.test(name)) score += 0.06;

  const expanded = expandSupplierAbbreviations(name);
  if (expanded && foldName(expanded) !== foldName(name)) {
    const expandedNatural = countNaturalWordTokens(expanded);
    if (expandedNatural <= naturalWords) score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

/** True when a persisted catalog name is already human-readable operational text. */
export function isOperationallyReadableCanonicalName(raw: string | null | undefined): boolean {
  return scoreCanonicalNameReadability(raw) >= READABLE_NAME_SCORE_THRESHOLD;
}

export function canonicalSuggestionReadabilityDelta(
  currentName: string,
  suggestedName: string,
): number {
  return (
    scoreCanonicalNameReadability(suggestedName) -
    scoreCanonicalNameReadability(currentName)
  );
}

/** Consonant-heavy OCR / supplier codes with very few vowels. */
export function hasLowVowelDensity(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length < 4) return false;

  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4) return false;

  const vowels = (letters.match(VOWEL_RE) ?? []).length;
  const vowelRatio = vowels / letters.length;
  if (vowelRatio >= 0.22) return false;

  const upperCount = (trimmed.match(/[A-Z]/g) ?? []).length;
  const upperRatio = upperCount / Math.max(letters.length, 1);
  return upperRatio >= 0.65 || vowelRatio < 0.12;
}

/** Multiple supplier-dictionary tokens still compressed in the display name. */
export function hasCompressedSupplierTokens(raw: string | null | undefined): boolean {
  const tokens = raw?.match(WORD_TOKEN_RE) ?? [];
  if (tokens.length < 2) return false;

  let mapped = 0;
  for (const token of tokens) {
    const key = token.toLowerCase();
    const replacement = OPERATIONAL_ALIASES[key];
    if (replacement != null && replacement !== key) mapped += 1;
  }
  return mapped >= 2;
}

/**
 * True when a persisted canonical catalog name looks like invoice/shorthand pollution.
 */
export function isLowQualityCanonicalIngredientName(raw: string | null | undefined): boolean {
  const name = raw?.trim() ?? "";
  if (!name) return false;
  if (isOperationallyReadableCanonicalName(name)) return false;

  if (looksLikeInvoiceShorthandName(name)) return true;
  if (looksLikeSupplierAbbreviatedCatalogName(name)) return true;
  if (hasLowVowelDensity(name)) return true;
  if (hasCompressedSupplierTokens(name)) return true;

  const expanded = expandSupplierAbbreviations(name);
  if (expanded && foldName(expanded) !== foldName(name)) {
    return true;
  }

  return false;
}

function tokenExpansionReasons(trace: SupplierTokenExpansionTrace): string[] {
  return trace.tokens
    .filter((token) => token.raw !== token.expanded && token.confidence !== "low")
    .map((token) => token.reason);
}

function candidateFromOperationalExpansion(
  source: string,
  supplierKey?: string | null,
): { suggestedName: string; reasons: string[]; tokenTrace: SupplierTokenExpansionTrace } | null {
  const tokenTrace = traceSupplierTokenExpansions(source, { supplierKey });
  const suggestedName = generateOperationalIngredientName(source, { supplierKey });
  if (!suggestedName || displayEquals(suggestedName, source)) return null;

  const expanded = expandSupplierAbbreviations(source, { supplierKey });
  const reasons = ["Supplier abbreviation dictionary expanded invoice tokens"];
  const perToken = tokenExpansionReasons(tokenTrace);
  if (perToken.length) {
    reasons.push(...perToken);
  } else if (expanded && foldName(expanded) !== foldName(source)) {
    reasons.push(`Token expansion: ${source} → ${expanded}`);
  }
  return { suggestedName, reasons, tokenTrace };
}

function candidateFromAliasMemory(
  aliasNames: readonly string[],
  supplierKey?: string | null,
): {
  suggestedName: string;
  reasons: string[];
  tokenTrace: SupplierTokenExpansionTrace;
} | null {
  for (const alias of aliasNames) {
    const trimmed = alias?.trim();
    if (!trimmed) continue;
    const hit = candidateFromOperationalExpansion(trimmed, supplierKey);
    if (hit) {
      return {
        suggestedName: hit.suggestedName,
        reasons: [...hit.reasons, `Alias memory line: ${trimmed}`],
        tokenTrace: hit.tokenTrace,
      };
    }
  }
  return null;
}

function collectQualitySignals(name: string, supplierKey?: string | null): string[] {
  const signals: string[] = [];
  if (looksLikeInvoiceShorthandName(name)) signals.push("invoice_shorthand");
  if (looksLikeSupplierAbbreviatedCatalogName(name)) signals.push("supplier_abbreviation");
  if (hasLowVowelDensity(name)) signals.push("low_vowel_density");
  if (hasCompressedSupplierTokens(name)) signals.push("compressed_supplier_tokens");

  const expanded = expandSupplierAbbreviations(name, { supplierKey });
  if (expanded && foldName(expanded) !== foldName(name)) {
    signals.push("expandable_supplier_tokens");
  }
  return signals;
}

/**
 * Evaluates whether a catalog name is low-quality shorthand and returns token expansion trace.
 */
export function evaluateCanonicalIngredientQuality(
  input: Pick<CanonicalNameImprovementInput, "ingredient" | "supplierKey">,
): CanonicalIngredientQualityEvaluation | null {
  const id = input.ingredient.id?.trim();
  const currentName = input.ingredient.name?.trim() ?? "";
  if (!id || !currentName) return null;

  const tokenTrace = traceSupplierTokenExpansions(currentName, {
    supplierKey: input.supplierKey,
  });
  const signals = collectQualitySignals(currentName, input.supplierKey);

  return {
    ingredientId: id,
    currentName,
    isLowQuality: isLowQualityCanonicalIngredientName(currentName),
    signals,
    tokenTrace,
  };
}

/**
 * Rename-only canonical naming suggestion with per-token expansion explanations.
 */
export function generateCanonicalNamingSuggestion(
  input: CanonicalNameImprovementInput,
): CanonicalNamingSuggestion | null {
  const improvement = buildCanonicalNameImprovement(input);
  if (!improvement) return null;

  const tokenTrace = traceSupplierTokenExpansions(improvement.currentName, {
    supplierKey: input.supplierKey,
  });
  const tokenReasons = tokenExpansionReasons(tokenTrace);
  const reasons =
    tokenReasons.length > 0
      ? [...new Set([...improvement.reasons, ...tokenReasons])]
      : improvement.reasons;

  return { ...improvement, reasons, tokenTrace };
}

function scoreConfidence(
  reasonCount: number,
  operationalClear: boolean,
  readabilityDelta: number,
): CanonicalImprovementConfidence {
  if (readabilityDelta <= 0) return "low";
  if (readabilityDelta < READABILITY_IMPROVEMENT_MIN_DELTA) return "low";
  if (operationalClear && reasonCount >= 2 && readabilityDelta >= 0.15) return "high";
  if (operationalClear && reasonCount >= 2) return "high";
  if (operationalClear || reasonCount >= 2) return "medium";
  return "low";
}

function passesSuggestionConfidenceGate(confidence: CanonicalImprovementConfidence): boolean {
  return confidence === "high";
}

function classifyImprovementKind(currentName: string): CanonicalImprovementKind {
  if (isLowQualityCanonicalIngredientName(currentName)) return "lexical_cleanup";
  return "semantic_equivalence";
}

/**
 * Returns true when a rename suggestion would imply merging into another catalog row.
 * Canonical improvement suggestions must never surface merge actions.
 */
export function wouldCanonicalRenameImplyMerge(
  ingredientId: string,
  suggestedName: string,
  catalog: readonly IngredientCanonicalInput[] | undefined,
): boolean {
  const id = ingredientId?.trim();
  const suggestedKey = normalizeCatalogOperationalIdentityKey(suggestedName);
  if (!id || !suggestedKey || !catalog?.length) return false;

  for (const entry of catalog) {
    if (entry.id?.trim() === id) continue;
    const entryKey = catalogOperationalIdentityKeyForEntry(entry);
    if (!entryKey || entryKey !== suggestedKey) continue;
    const entryName = entry.name?.trim() ?? "";
    if (entryName && !displayEquals(entryName, suggestedName)) {
      return true;
    }
    if (displayEquals(entryName, suggestedName)) return true;
  }
  return false;
}

/**
 * True when two catalog names must not be consolidated via merge
 * (incompatible families or distinct operational products, e.g. palha vs shoestring).
 */
export function shouldBlockCanonicalMergeBetween(nameA: string, nameB: string): boolean {
  const expandedA = expandSupplierAbbreviations(nameA) || nameA;
  const expandedB = expandSupplierAbbreviations(nameB) || nameB;
  if (operationalFamiliesIncompatibleFromRaw(expandedA, expandedB)) return true;

  const keyA = normalizeCatalogOperationalIdentityKey(expandedA);
  const keyB = normalizeCatalogOperationalIdentityKey(expandedB);
  if (keyA && keyB && keyA !== keyB) return true;

  return false;
}

function pickBestCandidate(
  currentName: string,
  candidates: { suggestedName: string; reasons: string[]; weight: number }[],
): { suggestedName: string; reasons: string[] } | null {
  const viable = candidates.filter((c) => c.suggestedName && !displayEquals(c.suggestedName, currentName));
  if (viable.length === 0) return null;
  viable.sort((a, b) => b.weight - a.weight || b.reasons.length - a.reasons.length);
  const best = viable[0]!;
  const mergedReasons = [...new Set(viable.flatMap((c) => c.reasons))];
  return { suggestedName: best.suggestedName, reasons: mergedReasons.length ? mergedReasons : best.reasons };
}

/**
 * Deterministic rename suggestion for a low-quality canonical name.
 * Never returns merge targets or cross-ingredient consolidation hints.
 */
export function buildCanonicalNameImprovement(
  input: CanonicalNameImprovementInput,
): CanonicalNameImprovement | null {
  const id = input.ingredient.id?.trim();
  const currentName = input.ingredient.name?.trim() ?? "";
  if (!id || !currentName) return null;
  if (isOperationallyReadableCanonicalName(currentName)) return null;
  if (!isLowQualityCanonicalIngredientName(currentName)) return null;

  const candidates: { suggestedName: string; reasons: string[]; weight: number }[] = [];

  const operational = candidateFromOperationalExpansion(currentName, input.supplierKey);
  if (operational) {
    candidates.push({ ...operational, weight: 100 });
  }

  const repair = suggestCanonicalRootNameRepair({
    id,
    name: currentName,
    normalized_name: input.ingredient.normalized_name,
  });
  if (repair?.suggestedName && !displayEquals(repair.suggestedName, currentName)) {
    const reasons =
      repair.reason === "invoice_shorthand"
        ? ["Invoice shorthand canonical pollution"]
        : ["Operational token expansion to catalog display form"];
    candidates.push({ suggestedName: repair.suggestedName, reasons, weight: 90 });
  }

  const aliasNames = [
    ...(input.aliasNames ?? []),
    ...(input.invoiceAliasNames ?? []),
  ];
  const fromAliases = candidateFromAliasMemory(aliasNames, input.supplierKey);
  if (fromAliases) {
    candidates.push({ ...fromAliases, weight: 70 });
  }

  for (const alias of aliasNames) {
    const trimmed = alias?.trim();
    if (!trimmed || displayEquals(trimmed, currentName)) continue;
    const display = formatCanonicalIngredientDisplayName(trimmed);
    if (display && !displayEquals(display, currentName) && !displayEquals(display, trimmed)) {
      candidates.push({
        suggestedName: display,
        reasons: [`Historical invoice alias display: ${trimmed}`],
        weight: 40,
      });
    }
  }

  const picked = pickBestCandidate(currentName, candidates);
  if (!picked) return null;

  if (
    input.catalog &&
    wouldCanonicalRenameImplyMerge(id, picked.suggestedName, input.catalog)
  ) {
    return null;
  }

  for (const entry of input.catalog ?? []) {
    const otherName = entry.name?.trim();
    if (!otherName || entry.id?.trim() === id) continue;
    if (
      shouldBlockCanonicalMergeBetween(currentName, otherName) &&
      foldName(picked.suggestedName) === foldName(otherName)
    ) {
      return null;
    }
  }

  const identity = buildCatalogIngredientIdentity(picked.suggestedName);
  const suggestedName = identity.name || picked.suggestedName;
  const readabilityDelta = canonicalSuggestionReadabilityDelta(currentName, suggestedName);
  if (readabilityDelta <= 0) return null;

  const operationalClear =
    Boolean(operational) &&
    foldName(expandSupplierAbbreviations(currentName)) === foldName(suggestedName);

  const confidence = scoreConfidence(
    picked.reasons.length,
    operationalClear,
    readabilityDelta,
  );
  if (!passesSuggestionConfidenceGate(confidence)) return null;

  return {
    ingredientId: id,
    currentName,
    suggestedName,
    confidence,
    kind: classifyImprovementKind(currentName),
    reasons: picked.reasons,
  };
}
