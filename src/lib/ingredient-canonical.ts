/**
 * Canonical ingredient keys strip pack sizes, units, and punctuation so
 * supplier-specific OCR strings can be deduped during invoice sync.
 *
 * Examples: "COCA COLA 33CL PACK24" → "coca cola"; "CHEDDAR FATIADO 1KG" → "cheddar fatiado".
 */
/** Whole-word / full-string aliases after other normalization (lowercase). */
export const ALIAS_MAP: Record<string, string> = {
  coke: "coca cola",
};

const UNIT_TOKEN_RE =
  /\b(kg|kgs|g|gr|grs|mg|ml|mL|cl|l|lt|lts|ltr|ltrs|un|unid|unids|cx|caixa|pc|pcs|und|unds)\b/gi;

const SIZE_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|mL|cl|l|lt|lts|ltr|ltrs)\b/gi;

const PACK_PATTERNS: RegExp[] = [
  /\bpack\s*\d+\b/gi,
  /\b(?:cx|caixa|caixas)\s*\d+\b/gi,
  /\b\d+\s*(?:cx|caixa|caixas)\b/gi,
  /\bx\s*\d+\b/gi,
  /\b\d+\s*un\b/gi,
  /\b\d+un\b/gi,
  /\b(?:garrafa|garrafas|lata|latas|saco|sacos)\b/gi,
];

function stripAccentsLower(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function applyAliases(s: string): string {
  let out = s.trim();
  const keys = Object.keys(ALIAS_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const val = ALIAS_MAP[key];
    if (!key || val == null) continue;
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (out === key) {
      out = val;
      continue;
    }
    out = out.replace(new RegExp(`\\b${esc}\\b`, "g"), val);
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Lowercase, strip punctuation, remove pack/unit/noise tokens and standalone numbers,
 * then apply {@link ALIAS_MAP}.
 */
export function normalizeCanonicalIngredientName(raw: string): string {
  let s = stripAccentsLower(raw);
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(SIZE_TOKEN_RE, " ");
  for (const re of PACK_PATTERNS) {
    s = s.replace(re, " ");
  }
  s = s.replace(UNIT_TOKEN_RE, " ");
  s = s.replace(/\b\d+\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = applyAliases(s);
  return s;
}

/** Sørensen–Dice coefficient on character bigrams (multiset), range [0, 1]. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (str: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let intersection = 0;
  for (const [k, va] of A) {
    const vb = B.get(k) ?? 0;
    intersection += Math.min(va, vb);
  }
  let total = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  return total === 0 ? 0 : (2 * intersection) / total;
}

const WEAK_MIN_SHORT = 5;

/** True if one canonical string contains the other as a contiguous token-bounded substring. */
export function canonicalWeakSubstringMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length < WEAK_MIN_SHORT) return false;
  return ` ${long} `.includes(` ${short} `);
}

export type IngredientCanonicalMatchKind = "confirmed-alias" | "exact" | "semantic";

export type IngredientCanonicalInput = {
  id: string;
  name: string | null;
  normalized_name?: string | null;
  unit?: string | null;
};

export type IngredientCanonicalMatch = {
  ingredient: IngredientCanonicalInput;
  normalizedItemName: string;
  normalizedIngredientName: string;
  kind: IngredientCanonicalMatchKind;
  reason: string;
};

export type IngredientAliasMap = Record<string, string>;

import { normalizeInvoiceMatchIngredientName } from "@/lib/normalize-ingredient-name";

const WEIGHT_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs)\.?\b/gi;
const VOLUME_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|lt|lts|ltr|ltrs)\.?\b/gi;
const NUMBER_WITH_UNIT_RE = /\b(\d+(?:[.,]\d+)?)(kg|g|ml|cl|l)\b/g;
const PRODUCT_STOPWORDS = new Set(["de", "do", "da", "dos", "das", "a", "o", "the"]);

const SEMANTIC_TOKEN_ALIASES: Record<string, string> = {
  hamburguer: "burger",
  hamburger: "burger",
  burgers: "burger",
  patties: "burger",
  patty: "burger",
  angus: "beef",
  bovino: "beef",
  vaca: "beef",
  beef: "beef",
};

const FORMAT_GROUPS: string[][] = [
  ["fatiado", "fatiada", "fatiadas", "fatias", "sliced"],
  ["congelado", "congelada", "frozen"],
  ["fresco", "fresca", "fresh"],
  ["ralado", "ralada", "grated"],
];

/** Product-identity tokens — overlap here drives semantic suggestions. */
export const CORE_INGREDIENT_MATCH_TOKENS = new Set([
  "tomate",
  "cherry",
  "oleo",
  "girassol",
  "ketchup",
  "maionese",
  "alface",
  "iceberg",
  "cebola",
  "cheddar",
  "batata",
  "frita",
]);

/** Retailer / brand / marketing tokens — minimal weight in similarity scoring. */
export const WEAK_INGREDIENT_MATCH_TOKENS = new Set([
  "premium",
  "rama",
  "vaqueiro",
  "service",
  "mix",
  "top",
  "down",
  "inteira",
  "corte",
  "fino",
  "snack",
  "food",
  "continente",
  "auchan",
  "pingo",
  "doce",
]);

const CORE_COVERAGE_MIN = 0.67;
const FALLBACK_COVERAGE_MIN = 0.67;
const FALLBACK_DICE_MIN = 0.58;
/** Minimum weighted score to surface a "possible ingredient match" (semantic kind). */
export const SEMANTIC_MATCH_MIN_SCORE = 0.72;

type ClassifiedMatchTokens = {
  core: string[];
  weak: string[];
  neutral: string[];
};

function traceInvoiceIngredientNormalize(original: string, normalized: string) {
  if (!import.meta.env.DEV || !original) return;
  console.debug("[invoice-ingredient-normalize]", { original, normalized });
}

function traceIngredientSemanticMatch(details: {
  originalName: string;
  normalizedName: string;
  coreTokens: string[];
  weakTokens: string[];
  matchedIngredient: string | null;
  similarityScore: number;
}) {
  if (!import.meta.env.DEV) return;
  console.debug("[invoice-ingredient-match]", details);
}

function classifyIngredientMatchTokens(tokens: Set<string>): ClassifiedMatchTokens {
  const core: string[] = [];
  const weak: string[] = [];
  const neutral: string[] = [];

  for (const token of tokens) {
    if (CORE_INGREDIENT_MATCH_TOKENS.has(token)) core.push(token);
    else if (WEAK_INGREDIENT_MATCH_TOKENS.has(token)) weak.push(token);
    else neutral.push(token);
  }

  return { core, weak, neutral };
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.min(a.size, b.size);
}

/**
 * Invoice-name normalization used before exact, alias, and semantic ingredient matching.
 *
 * Strips pack sizes and retailer noise, expands conservative abbreviations, and applies
 * lightweight synonyms so supermarket-specific wording converges on the same key.
 */
export function normalizeInvoiceIngredientName(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = normalizeInvoiceMatchIngredientName(raw);
  traceInvoiceIngredientNormalize(raw, normalized);
  return normalized;
}

function extractMeasureSignature(normalizedName: string) {
  const weight = (normalizedName.match(WEIGHT_TOKEN_RE) ?? []).map((token) =>
    normalizeInvoiceIngredientName(token),
  );
  const volume = (normalizedName.match(VOLUME_TOKEN_RE) ?? []).map((token) =>
    normalizeInvoiceIngredientName(token),
  );
  return {
    weight: weight[0] ?? null,
    volume: volume[0] ?? null,
  };
}

function productTokens(normalizedName: string) {
  return normalizedName
    .replace(NUMBER_WITH_UNIT_RE, " ")
    .split(/\s+/)
    .map((token) => SEMANTIC_TOKEN_ALIASES[token] ?? token)
    .filter((token) => token.length > 1 && !PRODUCT_STOPWORDS.has(token));
}

function formatGroupsForTokens(tokens: Set<string>) {
  return FORMAT_GROUPS.filter((group) => group.some((token) => tokens.has(token))).map((group) =>
    group.join("|"),
  );
}

function hasCompatibleFormat(aTokens: Set<string>, bTokens: Set<string>) {
  const aGroups = formatGroupsForTokens(aTokens);
  const bGroups = formatGroupsForTokens(bTokens);
  if (aGroups.length === 0 || bGroups.length === 0) return true;
  return aGroups.some((group) => bGroups.includes(group));
}

function hasCompatibleMeasures(a: string, b: string) {
  const aMeasure = extractMeasureSignature(a);
  const bMeasure = extractMeasureSignature(b);

  if (aMeasure.weight && bMeasure.weight) return aMeasure.weight === bMeasure.weight;
  if (aMeasure.volume && bMeasure.volume) return aMeasure.volume === bMeasure.volume;
  if ((aMeasure.weight && bMeasure.volume) || (aMeasure.volume && bMeasure.weight)) return false;

  // If only one side declares a size, do not make a semantic suggestion. Missing
  // a match is safer than linking two different product formats.
  return !aMeasure.weight && !aMeasure.volume && !bMeasure.weight && !bMeasure.volume;
}

function semanticSimilarity(a: string, b: string) {
  if (!hasCompatibleMeasures(a, b)) return 0;

  const aTokens = new Set(productTokens(a));
  const bTokens = new Set(productTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0 || !hasCompatibleFormat(aTokens, bTokens)) return 0;

  const aClass = classifyIngredientMatchTokens(aTokens);
  const bClass = classifyIngredientMatchTokens(bTokens);
  const aCore = new Set(aClass.core);
  const bCore = new Set(bClass.core);

  if (aCore.size > 0 || bCore.size > 0) {
    if (aCore.size === 0 || bCore.size === 0) return 0;

    const coreCoverage = tokenOverlapRatio(aCore, bCore);
    if (coreCoverage < CORE_COVERAGE_MIN) return 0;

    const coreDice = diceCoefficient([...aCore].sort().join(" "), [...bCore].sort().join(" "));
    const weakCoverage = tokenOverlapRatio(new Set(aClass.weak), new Set(bClass.weak));

    // Core identity drives the score; weak/brand tokens contribute at most ~3%.
    const score = coreCoverage * 0.72 + coreDice * 0.23 + weakCoverage * 0.05;
    return Math.min(1, score);
  }

  // No core tokens on either side — fall back to neutral-only overlap (conservative).
  const aNeutral = new Set(aClass.neutral);
  const bNeutral = new Set(bClass.neutral);
  if (aNeutral.size === 0 || bNeutral.size === 0) return 0;

  const coverage = tokenOverlapRatio(aNeutral, bNeutral);
  const stringSimilarity = diceCoefficient(
    [...aNeutral].sort().join(" "),
    [...bNeutral].sort().join(" "),
  );

  return coverage >= FALLBACK_COVERAGE_MIN && stringSimilarity >= FALLBACK_DICE_MIN
    ? (coverage + stringSimilarity) / 2
    : 0;
}

function normalizedIngredientCandidateName(ingredient: IngredientCanonicalInput) {
  const fromName = normalizeInvoiceIngredientName(ingredient.name);
  if (fromName) return fromName;
  return normalizeInvoiceIngredientName(ingredient.normalized_name);
}

export function findCanonicalIngredientMatch(
  itemName: string,
  ingredients: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
): IngredientCanonicalMatch | null {
  const normalizedItemName = normalizeInvoiceIngredientName(itemName);
  if (!normalizedItemName) return null;

  const aliasIngredientId = confirmedAliases[normalizedItemName];
  if (aliasIngredientId) {
    const ingredient = ingredients.find((candidate) => candidate.id === aliasIngredientId);
    if (ingredient) {
      return {
        ingredient,
        normalizedItemName,
        normalizedIngredientName: normalizedIngredientCandidateName(ingredient),
        kind: "confirmed-alias",
        reason: "confirmed supplier wording",
      };
    }
  }

  for (const ingredient of ingredients) {
    const normalizedIngredientName = normalizedIngredientCandidateName(ingredient);
    if (normalizedIngredientName && normalizedIngredientName === normalizedItemName) {
      return {
        ingredient,
        normalizedItemName,
        normalizedIngredientName,
        kind: "exact",
        reason: "same normalized ingredient name",
      };
    }
  }

  let best: IngredientCanonicalMatch | null = null;
  let bestScore = 0;
  const itemTokenClass = classifyIngredientMatchTokens(new Set(productTokens(normalizedItemName)));

  for (const ingredient of ingredients) {
    const normalizedIngredientName = normalizedIngredientCandidateName(ingredient);
    if (!normalizedIngredientName) continue;
    const score = semanticSimilarity(normalizedItemName, normalizedIngredientName);
    if (score > bestScore) {
      bestScore = score;
      best = {
        ingredient,
        normalizedItemName,
        normalizedIngredientName,
        kind: "semantic",
        reason: "similar product wording and matching size",
      };
    }
  }

  if (best && bestScore >= SEMANTIC_MATCH_MIN_SCORE) {
    traceIngredientSemanticMatch({
      originalName: itemName,
      normalizedName: normalizedItemName,
      coreTokens: itemTokenClass.core,
      weakTokens: itemTokenClass.weak,
      matchedIngredient: best.ingredient.name,
      similarityScore: bestScore,
    });
    return best;
  }

  return null;
}
