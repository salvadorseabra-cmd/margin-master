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

import { lookupIngredientIdFromAliasMap } from "@/lib/ingredient-alias-lookup";
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
  cereja: "cherry",
  cerejas: "cherry",
};

const FORMAT_GROUPS: string[][] = [
  ["fatiado", "fatiada", "fatiadas", "fatias", "sliced"],
  ["molho", "molhos", "sauce", "salsa"],
  ["congelado", "congelada", "frozen"],
  ["fresco", "fresca", "fresh"],
  ["ralado", "ralada", "grated"],
  ["cherry", "cereja", "cerejas"],
  ["triturado", "triturada", "triturados", "polpa", "passata"],
];

/** Multi-word retailer / marketing phrases — tokens here are weak even if normalization missed a phrase. */
const WEAK_INGREDIENT_PHRASES: readonly string[] = [
  "food service",
  "top down",
  "oliveira da serra",
  "pingo doce",
  "private label",
  "para restauracao",
  "para restauração",
  "catering",
  "horeca",
  "foodservice",
];

/** Potato cut families that imply batata when the base core token is absent from OCR text. */
const POTATO_FORM_IMPLY_BATATA = new Set([
  "palha",
  "frita",
  "fritas",
  "wedges",
  "wedge",
  "hashbrown",
  "hashbrowns",
]);

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
]);

/**
 * Preparation / cut-family tokens — distinguish adjacent product lines (e.g. palha vs wedges).
 * Compared from raw supplier wording so invoice normalization synonyms cannot collapse families.
 */
export const FORM_INGREDIENT_MATCH_TOKENS = new Set([
  "palha",
  "frita",
  "fritas",
  "wedges",
  "wedge",
  "hashbrown",
  "hashbrowns",
  "corte_fino",
  "grated",
  "ralado",
  "ralada",
  "sliced",
  "fatiado",
  "fatiada",
  "molho",
  "molhos",
  "shredded",
  "triturado",
  "triturada",
  "triturados",
  "cherry",
  "cereja",
  "cerejas",
]);

/**
 * Ingredient family ids used for semantic grouping only — never override core or form.
 * Derived from product tokens + conservative inference (e.g. palha → potato family).
 */
export const FAMILY_INGREDIENT_MATCH_TOKENS = new Set([
  "potato",
  "cheese",
  "tomato",
  "sauce",
  "oil",
]);

/** Maps product tokens to a family id (semantic boost / inference only). */
const TOKEN_TO_INGREDIENT_FAMILY: Record<string, string> = {
  batata: "potato",
  palha: "potato",
  frita: "potato",
  fritas: "potato",
  wedges: "potato",
  wedge: "potato",
  hashbrown: "potato",
  hashbrowns: "potato",
  corte_fino: "potato",
  cheddar: "cheese",
  tomate: "tomato",
  cherry: "tomato",
  triturado: "tomato",
  triturada: "tomato",
  triturados: "tomato",
  ketchup: "sauce",
  maionese: "sauce",
  oleo: "oil",
  girassol: "oil",
};

const FORM_PHRASE_TO_FAMILY: { pattern: RegExp; family: string }[] = [
  { pattern: /\bcorte\s+fino\b/, family: "corte_fino" },
  { pattern: /\bcorte\s+fina\b/, family: "corte_fino" },
  { pattern: /\bhash\s*brown\b/, family: "hashbrown" },
];

const FORM_SINGLE_TOKEN_TO_FAMILY: Record<string, string> = {
  palha: "palha",
  frita: "frita",
  fritas: "frita",
  wedges: "wedges",
  wedge: "wedges",
  hashbrown: "hashbrown",
  hashbrowns: "hashbrown",
  grated: "grated",
  ralado: "grated",
  ralada: "grated",
  sliced: "sliced",
  fatiado: "sliced",
  fatiada: "sliced",
  molho: "molho",
  molhos: "molho",
  shredded: "shredded",
  triturado: "triturado",
  triturada: "triturado",
  triturados: "triturado",
  cherry: "cherry",
  cereja: "cherry",
  cerejas: "cherry",
};

/** Retailer / brand / marketing tokens — minimal weight in similarity scoring. */
export const WEAK_INGREDIENT_MATCH_TOKENS = new Set([
  "premium",
  "rama",
  "vaqueiro",
  "fula",
  "calve",
  "guloso",
  "heinz",
  "hellmann",
  "hellmanns",
  "oliveira",
  "serra",
  "service",
  "mix",
  "top",
  "down",
  "inteira",
  "snack",
  "food",
  "continente",
  "auchan",
  "pingo",
  "doce",
  "lidl",
  "eroski",
  "minipreco",
  "gourmet",
  "especial",
  "classico",
  "tradicional",
  "extra",
  "super",
  "knorr",
  "nestle",
  "unilever",
  "private",
  "label",
  "marca",
  "brand",
  "s",
  "catering",
  "horeca",
  "restauracao",
  "restauração",
  "profissional",
  "professional",
  "fs",
  "kg",
  "un",
]);

const CORE_COVERAGE_MIN = 0.67;
const FALLBACK_COVERAGE_MIN = 0.67;
const FALLBACK_DICE_MIN = 0.58;
/** Minimum weighted score to surface a "possible ingredient match" (semantic kind). */
export const SEMANTIC_MATCH_MIN_SCORE = 0.72;
/** Minimum score to promote a semantic match to exact (auto-confirm) when core identity matches. */
export const SEMANTIC_AUTO_MATCH_MIN_SCORE = 0.88;

type ClassifiedMatchTokens = {
  core: string[];
  weak: string[];
  form: string[];
  family: string[];
  neutral: string[];
};

const FORM_EXTRACT_QUANTITY_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)\b/gi;
const FORM_EXTRACT_ATTACHED_QTY_RE = /\b\d+(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs)\b/gi;

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

function weakTokensFromPhrases(normalizedName: string): Set<string> {
  const weak = new Set<string>();
  const padded = ` ${normalizedName} `;
  const sortedPhrases = [...WEAK_INGREDIENT_PHRASES].sort((a, b) => b.length - a.length);
  for (const phrase of sortedPhrases) {
    const pattern = phrase
      .split(/\s+/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    if (!new RegExp(`\\s${pattern}\\s`).test(padded)) continue;
    for (const token of phrase.split(/\s+/)) {
      weak.add(token);
    }
  }
  return weak;
}

function classifyIngredientMatchTokens(
  tokens: Set<string>,
  normalizedName = "",
): ClassifiedMatchTokens {
  const phraseWeak = weakTokensFromPhrases(normalizedName);
  const core: string[] = [];
  const weak: string[] = [];
  const form: string[] = [];
  const family: string[] = [];
  const neutral: string[] = [];

  for (const token of tokens) {
    if (CORE_INGREDIENT_MATCH_TOKENS.has(token)) core.push(token);
    else if (WEAK_INGREDIENT_MATCH_TOKENS.has(token) || phraseWeak.has(token)) weak.push(token);
    else if (FORM_INGREDIENT_MATCH_TOKENS.has(token)) form.push(token);
    else {
      const familyId = TOKEN_TO_INGREDIENT_FAMILY[token];
      if (familyId && FAMILY_INGREDIENT_MATCH_TOKENS.has(familyId)) family.push(familyId);
      else neutral.push(token);
    }
  }

  return { core, weak, form, family, neutral };
}

function deriveIngredientFamilies(
  classified: ClassifiedMatchTokens,
  formFamilies: Set<string>,
): Set<string> {
  const families = new Set(classified.family);
  for (const token of [...classified.core, ...classified.form]) {
    const familyId = TOKEN_TO_INGREDIENT_FAMILY[token];
    if (familyId) families.add(familyId);
  }
  if (
    [...formFamilies].some((family) => POTATO_FORM_IMPLY_BATATA.has(family)) ||
    classified.form.some((token) => POTATO_FORM_IMPLY_BATATA.has(token))
  ) {
    families.add("potato");
  }
  return families;
}

function applyImplicitBatataCore(
  core: Set<string>,
  formTokens: string[],
  formFamilies: Set<string>,
) {
  if (core.has("batata")) return;
  const hasPotatoForm =
    formTokens.some((token) => POTATO_FORM_IMPLY_BATATA.has(token)) ||
    [...formFamilies].some((family) => POTATO_FORM_IMPLY_BATATA.has(family));
  if (hasPotatoForm) core.add("batata");
}

function effectiveCoreSets(
  aClass: ClassifiedMatchTokens,
  bClass: ClassifiedMatchTokens,
  rawA: string,
  rawB: string,
) {
  const aCore = new Set(aClass.core);
  const bCore = new Set(bClass.core);
  applyImplicitBatataCore(aCore, aClass.form, extractIngredientFormFamilies(rawA));
  applyImplicitBatataCore(bCore, bClass.form, extractIngredientFormFamilies(rawB));
  return { aCore, bCore };
}

function mutualWeakOverlapRatio(aWeak: Set<string>, bWeak: Set<string>) {
  if (aWeak.size === 0 && bWeak.size === 0) return 1;
  if (aWeak.size === 0 || bWeak.size === 0) return 0;
  let shared = 0;
  for (const token of aWeak) {
    if (bWeak.has(token)) shared += 1;
  }
  return shared / Math.max(aWeak.size, bWeak.size);
}

function lightStripForFormExtraction(raw: string): string {
  let s = stripAccentsLower(raw);
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(FORM_EXTRACT_QUANTITY_RE, " ");
  s = s.replace(FORM_EXTRACT_ATTACHED_QTY_RE, " ");
  s = s.replace(/\b\d+\b/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Product cut / preparation families from raw wording (before palha→frita invoice synonyms).
 */
export function extractIngredientFormFamilies(raw: string): Set<string> {
  let s = lightStripForFormExtraction(raw);
  if (!s) return new Set();

  const families = new Set<string>();

  for (const { pattern, family } of FORM_PHRASE_TO_FAMILY) {
    if (pattern.test(s)) {
      families.add(family);
      s = s.replace(pattern, " ");
    }
  }

  const tokens = s.split(/\s+/).filter((token) => token.length > 1);
  const hasBatata = tokens.includes("batata");

  for (const token of tokens) {
    const mapped = FORM_SINGLE_TOKEN_TO_FAMILY[token];
    if (!mapped) continue;
    if (mapped === "frita" && !hasBatata) continue;
    if (mapped === "corte_fino") continue;
    if (families.has("corte_fino") && mapped === "frita") continue;
    families.add(mapped);
  }

  return families;
}

/** Both sides must share the same form-family set, or both must lack form tokens. */
export function hasCompatibleIngredientFormFamilies(rawA: string, rawB: string): boolean {
  const aForm = extractIngredientFormFamilies(rawA);
  const bForm = extractIngredientFormFamilies(rawB);

  if (aForm.size === 0 && bForm.size === 0) return true;
  if (aForm.size === 0 || bForm.size === 0) return false;
  if (aForm.size !== bForm.size) return false;
  for (const family of aForm) {
    if (!bForm.has(family)) return false;
  }
  return true;
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

function coreTokenSet(normalizedName: string, rawName = normalizedName) {
  const tokens = new Set(productTokens(normalizedName));
  const classified = classifyIngredientMatchTokens(tokens, normalizedName);
  const { aCore } = effectiveCoreSets(classified, classified, rawName, rawName);
  return aCore;
}

/** Same product-identity cores on both sides (brand/neutral tokens may differ). */
export function equalCoreIngredientIdentity(
  a: string,
  b: string,
  rawA = a,
  rawB = b,
): boolean {
  const aTokens = new Set(productTokens(a));
  const bTokens = new Set(productTokens(b));
  const aClass = classifyIngredientMatchTokens(aTokens, a);
  const bClass = classifyIngredientMatchTokens(bTokens, b);
  const { aCore, bCore } = effectiveCoreSets(aClass, bClass, rawA, rawB);
  if (aCore.size === 0 || bCore.size === 0) return false;
  if (aCore.size !== bCore.size) return false;
  for (const token of aCore) {
    if (!bCore.has(token)) return false;
  }
  return true;
}

function shouldAutoConfirmSemanticMatch(
  a: string,
  b: string,
  score: number,
  rawA: string,
  rawB: string,
) {
  if (score < SEMANTIC_AUTO_MATCH_MIN_SCORE) return false;
  if (!hasCompatibleMeasures(a, b)) return false;
  if (!hasCompatibleIngredientFormFamilies(rawA, rawB)) return false;
  return equalCoreIngredientIdentity(a, b, rawA, rawB);
}

function semanticSimilarity(a: string, b: string, rawA: string, rawB: string) {
  if (!hasCompatibleMeasures(a, b)) return 0;
  if (!hasCompatibleIngredientFormFamilies(rawA, rawB)) return 0;

  const aTokens = new Set(productTokens(a));
  const bTokens = new Set(productTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0 || !hasCompatibleFormat(aTokens, bTokens)) return 0;

  const aClass = classifyIngredientMatchTokens(aTokens, a);
  const bClass = classifyIngredientMatchTokens(bTokens, b);
  const { aCore, bCore } = effectiveCoreSets(aClass, bClass, rawA, rawB);
  const aForm = new Set(aClass.form);
  const bForm = new Set(bClass.form);
  const aFamilies = deriveIngredientFamilies(aClass, extractIngredientFormFamilies(rawA));
  const bFamilies = deriveIngredientFamilies(bClass, extractIngredientFormFamilies(rawB));

  if (aCore.size > 0 || bCore.size > 0) {
    if (aCore.size === 0 || bCore.size === 0) return 0;

    const coreCoverage = tokenOverlapRatio(aCore, bCore);
    if (coreCoverage < CORE_COVERAGE_MIN) return 0;

    const coresEqual =
      aCore.size === bCore.size && [...aCore].every((token) => bCore.has(token));

    // One-sided extra core tokens (e.g. tomate vs tomate cherry) must not auto-match.
    if (!coresEqual) {
      const maxCoreSize = Math.max(aCore.size, bCore.size);
      const symmetricCoreCoverage =
        [...aCore].filter((token) => bCore.has(token)).length / maxCoreSize;
      if (symmetricCoreCoverage < CORE_COVERAGE_MIN) return 0;
    }

    const coreDice = diceCoefficient([...aCore].sort().join(" "), [...bCore].sort().join(" "));
    const formCoverage =
      aForm.size > 0 && bForm.size > 0 ? tokenOverlapRatio(aForm, bForm) : 1;
    const weakCoverage = mutualWeakOverlapRatio(
      new Set(aClass.weak),
      new Set(bClass.weak),
    );
    const familyCoverage =
      aFamilies.size > 0 && bFamilies.size > 0 ? tokenOverlapRatio(aFamilies, bFamilies) : 1;

    // Core identity dominates; form overlap refines; family overlap is a small tie-breaker only.
    let score =
      coreCoverage * 0.6 +
      coreDice * 0.2 +
      formCoverage * 0.12 +
      familyCoverage * 0.05 +
      weakCoverage * 0.03;
    if (coresEqual) {
      score = Math.max(score, SEMANTIC_AUTO_MATCH_MIN_SCORE);
    }
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
  supplierName?: string | null,
): IngredientCanonicalMatch | null {
  const normalizedItemName = normalizeInvoiceIngredientName(itemName);
  if (!normalizedItemName) return null;

  const aliasIngredientId = lookupIngredientIdFromAliasMap(
    confirmedAliases,
    normalizedItemName,
    supplierName,
  );
  if (aliasIngredientId) {
    const ingredient = ingredients.find((candidate) => candidate.id === aliasIngredientId);
    if (ingredient) {
      if (import.meta.env.DEV) {
        console.debug("[ingredient_aliases] auto-matched from alias memory", {
          itemName,
          normalizedItemName,
          ingredientId: aliasIngredientId,
          ingredientName: ingredient.name,
        });
      }
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
      if (
        !hasCompatibleIngredientFormFamilies(itemName, ingredient.name ?? ingredient.normalized_name ?? "")
      ) {
        continue;
      }
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
  const itemTokenClass = classifyIngredientMatchTokens(
    new Set(productTokens(normalizedItemName)),
    normalizedItemName,
  );

  for (const ingredient of ingredients) {
    const normalizedIngredientName = normalizedIngredientCandidateName(ingredient);
    if (!normalizedIngredientName) continue;
    const score = semanticSimilarity(
      normalizedItemName,
      normalizedIngredientName,
      itemName,
      ingredient.name ?? ingredient.normalized_name ?? "",
    );
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
    const autoConfirm = shouldAutoConfirmSemanticMatch(
      normalizedItemName,
      best.normalizedIngredientName,
      bestScore,
      itemName,
      best.ingredient.name ?? best.ingredient.normalized_name ?? "",
    );
    traceIngredientSemanticMatch({
      originalName: itemName,
      normalizedName: normalizedItemName,
      coreTokens: itemTokenClass.core,
      weakTokens: itemTokenClass.weak,
      matchedIngredient: best.ingredient.name,
      similarityScore: bestScore,
    });
    if (autoConfirm) {
      return {
        ...best,
        kind: "exact",
        reason: "same core product identity and matching size",
      };
    }
    return best;
  }

  return null;
}
