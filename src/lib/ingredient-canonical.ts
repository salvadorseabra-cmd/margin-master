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

export type IngredientCanonicalMatchKind =
  | "confirmed-alias"
  | "exact"
  | "operational-memory"
  | "operational-alias"
  | "semantic"
  | "operational-equivalent";

export type FindCanonicalIngredientMatchOptions = {
  /** Original invoice line before supplier shorthand (operational memory lookup). */
  rawItemName?: string | null;
};

export const OPERATIONAL_EQUIVALENT_MATCH_REASON = "possible operational equivalent";

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
  /** Weighted semantic similarity from legacy token scoring [0, 1]. */
  semanticSimilarity?: number;
  /** Canonical operational-equivalence confidence [0, 1]. */
  operationalEquivalenceConfidence?: number;
  /** Deterministic promotion score decomposition (optional for explainability). */
  scoreBreakdown?: MatchScoreBreakdown;
  /** Match target is an invoice-inferred synthetic catalog row (not persisted). */
  syntheticTarget?: boolean;
};

export type IngredientAliasMap = Record<string, string>;

import { lookupIngredientIdFromAliasMap } from "@/lib/ingredient-alias-lookup";
import {
  canonicalizeIngredientIdentity,
  computeMatchScoreBreakdown,
  computeOperationalEquivalenceConfidence,
  hasCompatibleCanonicalForms,
  needsOperationalHumanConfirm,
  OPERATIONAL_EQUIVALENT_MIN_SCORE,
  resolveMatchScoreRejectionReason,
  scoreCanonicalIngredientSimilarity,
  shareOperationalAliasCluster,
  type MatchScoreBreakdown,
} from "@/lib/ingredient-identity";
import { operationalFamiliesIncompatibleFromRaw } from "@/lib/ingredient-operational-families";
import { resolveParentFormHierarchyMatch } from "@/lib/ingredient-parent-form";
import { inferCoarseIngredientFamily } from "@/lib/ingredient-token-families";
import { scoreWeightCompatibility } from "@/lib/ingredient-weight-match";

export { OPERATIONAL_EQUIVALENT_MIN_SCORE } from "@/lib/ingredient-identity";
export type { MatchScoreBreakdown, MatchScoreRejectionReason } from "@/lib/ingredient-identity";
import { resolveOperationalAliasCatalogMatch } from "@/lib/ingredient-operational-alias-memory";
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
  "burger",
  "bacon",
  "pickles",
  "chicken",
  "brioche",
  "bun",
  "beef",
  "bovino",
  "angus",
  "patty",
  "breaded",
  "shoestring",
  "palha",
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
  "dip",
  "dips",
  "slices",
  "slice",
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
  shoestring: "potato",
  frita: "potato",
  fritas: "potato",
  wedges: "potato",
  wedge: "potato",
  hashbrown: "potato",
  hashbrowns: "potato",
  corte_fino: "potato",
  cheddar: "cheese",
  mozzarella: "cheese",
  burger: "meat",
  bacon: "meat",
  pickles: "condiment",
  chicken: "meat",
  brioche: "bread",
  bun: "bread",
  beef: "meat",
  bovino: "meat",
  angus: "meat",
  patty: "meat",
  breaded: "meat",
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
  { pattern: /\b9\s*x\s*9\b/i, family: "frita" },
  { pattern: /\b9x9\b/i, family: "frita" },
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
  bloco: "block",
  block: "block",
  shredded: "shredded",
  triturado: "triturado",
  triturada: "triturado",
  triturados: "triturado",
  cherry: "cherry",
  cereja: "cherry",
  cerejas: "cherry",
  dip: "dip",
  dips: "dip",
  slices: "sliced",
  slice: "sliced",
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
  scoreBreakdown?: MatchScoreBreakdown;
}) {
  if (!import.meta.env.DEV) return;
  console.debug("[invoice-ingredient-match]", details);
}

function traceIngredientMatchRejected(details: {
  itemName: string;
  bestIngredientName: string | null;
  scoreBreakdown: MatchScoreBreakdown;
  semanticScore: number;
  operationalScore: number;
}) {
  if (!import.meta.env.DEV) return;
  console.debug("[ingredient-match-rejected]", details);
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

const GRID_CUT_PLACEHOLDER = "__grid9x9__";

function preserveGridCutToken(s: string): string {
  return s
    .replace(/\b9\s*x\s*9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `)
    .replace(/\b9x9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `);
}

function restoreGridCutToken(s: string): string {
  return s.replace(new RegExp(GRID_CUT_PLACEHOLDER, "g"), "9x9");
}

function lightStripForFormExtraction(raw: string): string {
  let s = stripAccentsLower(raw);
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(FORM_EXTRACT_QUANTITY_RE, " ");
  s = s.replace(FORM_EXTRACT_ATTACHED_QTY_RE, " ");
  s = preserveGridCutToken(s);
  s = s.replace(/\b\d+\b/g, " ");
  s = restoreGridCutToken(s);
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
  if (aForm.size === 0 || bForm.size === 0) {
    const identityA = canonicalizeIngredientIdentity(rawA);
    const identityB = canonicalizeIngredientIdentity(rawB);
    return resolveParentFormHierarchyMatch(identityA, identityB) != null;
  }
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

  if ((aMeasure.weight && bMeasure.volume) || (aMeasure.volume && bMeasure.weight)) {
    return false;
  }

  // Weight/volume mismatches are ranked via scoreWeightCompatibility, not blocked here.
  return true;
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
  if (needsOperationalHumanConfirm(rawA, rawB, a, b)) return false;
  return equalCoreIngredientIdentity(a, b, rawA, rawB);
}

function operationalEquivalenceConfidence(
  rawA: string,
  rawB: string,
  normA: string,
  normB: string,
  legacyCoreDice: number,
) {
  return computeOperationalEquivalenceConfidence(rawA, rawB, {
    legacyCoreDice,
  }).confidence;
}

function semanticSimilarity(a: string, b: string, rawA: string, rawB: string) {
  if (operationalFamiliesIncompatibleFromRaw(rawA, rawB)) return 0;
  if (!hasCompatibleMeasures(a, b)) return 0;
  if (!hasCompatibleIngredientFormFamilies(rawA, rawB)) return 0;

  const aTokens = new Set(productTokens(a));
  const bTokens = new Set(productTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0 || !hasCompatibleFormat(aTokens, bTokens)) return 0;

  const identityA = canonicalizeIngredientIdentity(rawA);
  const identityB = canonicalizeIngredientIdentity(rawB);
  const parentFormHierarchy = resolveParentFormHierarchyMatch(identityA, identityB);
  if (!hasCompatibleCanonicalForms(identityA.form, identityB.form) && !parentFormHierarchy) {
    return 0;
  }

  const sharedOperationalCluster = shareOperationalAliasCluster(identityA, identityB);

  const aClass = classifyIngredientMatchTokens(aTokens, a);
  const bClass = classifyIngredientMatchTokens(bTokens, b);
  const { aCore, bCore } = effectiveCoreSets(aClass, bClass, rawA, rawB);

  let legacyCoreDice = 0;
  if (aCore.size > 0 || bCore.size > 0) {
    if (aCore.size === 0 || bCore.size === 0) return 0;

    const coreCoverage = tokenOverlapRatio(aCore, bCore);
    if (coreCoverage < CORE_COVERAGE_MIN) return 0;

    const coresEqual =
      aCore.size === bCore.size && [...aCore].every((token) => bCore.has(token));

    if (!coresEqual) {
      const maxCoreSize = Math.max(aCore.size, bCore.size);
      const symmetricCoreCoverage =
        [...aCore].filter((token) => bCore.has(token)).length / maxCoreSize;
      if (symmetricCoreCoverage < CORE_COVERAGE_MIN) return 0;
    }

    legacyCoreDice = diceCoefficient([...aCore].sort().join(" "), [...bCore].sort().join(" "));
  }

  if (identityA.family && identityB.family) {
    const canonical = scoreCanonicalIngredientSimilarity(identityA, identityB, {
      legacyCoreDice,
      rawA,
      rawB,
    });
    if (canonical.score === 0) return 0;

    if (!sharedOperationalCluster && aCore.size > 0 && bCore.size > 0) {
      const coreCoverage = tokenOverlapRatio(aCore, bCore);
      if (coreCoverage < CORE_COVERAGE_MIN) return 0;
    }

    return Math.min(1, canonical.score);
  }

  if (aCore.size > 0 || bCore.size > 0) {
    if (aCore.size === 0 || bCore.size === 0) return 0;
    const coreCoverage = tokenOverlapRatio(aCore, bCore);
    if (coreCoverage < CORE_COVERAGE_MIN) return 0;
    const coresEqual =
      aCore.size === bCore.size && [...aCore].every((token) => bCore.has(token));
    let score = coreCoverage * 0.6 + legacyCoreDice * 0.4;
    if (coresEqual) score = Math.max(score, SEMANTIC_AUTO_MATCH_MIN_SCORE);
    return Math.min(1, score);
  }

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

function withSyntheticTargetFlag(match: IngredientCanonicalMatch): IngredientCanonicalMatch {
  if (!match.ingredient.id.startsWith("synthetic:")) return match;
  return { ...match, syntheticTarget: true };
}

function operationalRawCompareKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

type OperationalMemoryHit = {
  ingredient: IngredientCanonicalInput;
  normalizedIngredientName: string;
  kind: Extract<IngredientCanonicalMatchKind, "operational-memory" | "exact">;
  reason: string;
};

/**
 * Deterministic operational memory: exact raw catalog wording, then exact normalized key.
 * Runs before alias memory and semantic scoring.
 */
function findOperationalMemoryMatch(
  itemName: string,
  normalizedItemName: string,
  ingredients: IngredientCanonicalInput[],
  rawItemNames: string[],
): OperationalMemoryHit | null {
  const rawKeys = new Set(
    rawItemNames.map(operationalRawCompareKey).filter((key) => key.length > 0),
  );
  const itemKey = operationalRawCompareKey(itemName);
  if (itemKey) rawKeys.add(itemKey);

  for (const ingredient of ingredients) {
    const ingredientRaw = ingredient.name ?? ingredient.normalized_name ?? "";
    const catalogKey = operationalRawCompareKey(ingredientRaw);
    if (!catalogKey || !rawKeys.has(catalogKey)) continue;

    const normalizedIngredientName = normalizedIngredientCandidateName(ingredient);
    if (!hasCompatibleIngredientFormFamilies(itemName, ingredientRaw)) continue;
    if (
      needsOperationalHumanConfirm(
        itemName,
        ingredientRaw,
        normalizedItemName,
        normalizedIngredientName,
      )
    ) {
      continue;
    }

    return {
      ingredient,
      normalizedIngredientName,
      kind: "operational-memory",
      reason: "same persisted invoice wording",
    };
  }

  for (const ingredient of ingredients) {
    const normalizedIngredientName = normalizedIngredientCandidateName(ingredient);
    const ingredientRaw = ingredient.name ?? ingredient.normalized_name ?? "";
    const sharesGridCut =
      normalizedItemName.includes("9x9") &&
      normalizedIngredientName.includes("9x9") &&
      normalizedItemName.includes("batata") &&
      normalizedIngredientName.includes("batata") &&
      inferCoarseIngredientFamily(itemName) === "fried_potato" &&
      inferCoarseIngredientFamily(ingredientRaw) === "fried_potato";
    if (sharesGridCut) {
      if (!hasCompatibleIngredientFormFamilies(itemName, ingredientRaw)) continue;
      return {
        ingredient,
        normalizedIngredientName,
        kind: "operational-memory",
        reason: "same batata grid-cut identity",
      };
    }

    if (!normalizedIngredientName || normalizedIngredientName !== normalizedItemName) continue;
    if (!hasCompatibleIngredientFormFamilies(itemName, ingredientRaw)) continue;
    if (
      needsOperationalHumanConfirm(
        itemName,
        ingredientRaw,
        normalizedItemName,
        normalizedIngredientName,
      )
    ) {
      continue;
    }

    return {
      ingredient,
      normalizedIngredientName,
      kind: "exact",
      reason: "same normalized ingredient name",
    };
  }

  return null;
}

/**
 * Canonical ingredient match pipeline (deterministic order):
 * 1. Exact operational memory — catalog raw/normalized wording
 * 2. Supplier shorthand normalization — {@link normalizeSupplierShorthand} in invoice propagation
 * 3. Operational alias memory — recurring Horeca shorthand (in-memory / confirmed bridge)
 * 4. Confirmed DB aliases — {@link IngredientAliasMap}
 * 5. Family-aware deterministic scoring — families, weight, token families in candidate loop
 * 6. Semantic similarity fallback
 */
export function findCanonicalIngredientMatch(
  itemName: string,
  ingredients: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierName?: string | null,
  options?: FindCanonicalIngredientMatchOptions,
): IngredientCanonicalMatch | null {
  const normalizedItemName = normalizeInvoiceIngredientName(itemName);
  if (!normalizedItemName) return null;

  const rawLookupNames = [options?.rawItemName, itemName].filter(
    (name): name is string => Boolean(name?.trim()),
  );
  const operationalMemory = findOperationalMemoryMatch(
    itemName,
    normalizedItemName,
    ingredients,
    rawLookupNames,
  );
  if (operationalMemory) {
    return withSyntheticTargetFlag({
      ingredient: operationalMemory.ingredient,
      normalizedItemName,
      normalizedIngredientName: operationalMemory.normalizedIngredientName,
      kind: operationalMemory.kind,
      reason: operationalMemory.reason,
    });
  }

  const operationalAliasHit = resolveOperationalAliasCatalogMatch(
    itemName,
    ingredients,
    rawLookupNames,
    hasCompatibleIngredientFormFamilies,
  );
  if (operationalAliasHit) {
    const ingredient = ingredients.find(
      (candidate) => candidate.id === operationalAliasHit.entry.ingredientId,
    );
    if (ingredient) {
      return withSyntheticTargetFlag({
        ingredient,
        normalizedItemName,
        normalizedIngredientName: normalizedIngredientCandidateName(ingredient),
        kind: "operational-alias",
        reason: "recurring operational wording",
      });
    }
  }

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
      return withSyntheticTargetFlag({
        ingredient,
        normalizedItemName,
        normalizedIngredientName: normalizedIngredientCandidateName(ingredient),
        kind: "confirmed-alias",
        reason: "confirmed supplier wording",
      });
    }
  }

  let best: IngredientCanonicalMatch | null = null;
  let bestScore = 0;
  let bestCandidateScore = 0;
  let bestOperationalConfidence = 0;
  let bestBreakdown: MatchScoreBreakdown | null = null;
  const itemTokenClass = classifyIngredientMatchTokens(
    new Set(productTokens(normalizedItemName)),
    normalizedItemName,
  );

  for (const ingredient of ingredients) {
    const normalizedIngredientName = normalizedIngredientCandidateName(ingredient);
    if (!normalizedIngredientName) continue;
    const ingredientRaw = ingredient.name ?? ingredient.normalized_name ?? "";
    const itemIdentity = canonicalizeIngredientIdentity(itemName);
    const ingredientIdentity = canonicalizeIngredientIdentity(ingredientRaw);
    const parentFormHierarchy = resolveParentFormHierarchyMatch(
      itemIdentity,
      ingredientIdentity,
    );
    if (
      !hasCompatibleCanonicalForms(itemIdentity.form, ingredientIdentity.form) &&
      !parentFormHierarchy
    ) {
      continue;
    }
    const aTokens = new Set(productTokens(normalizedItemName));
    const bTokens = new Set(productTokens(normalizedIngredientName));
    const aClass = classifyIngredientMatchTokens(aTokens, normalizedItemName);
    const bClass = classifyIngredientMatchTokens(bTokens, normalizedIngredientName);
    const { aCore, bCore } = effectiveCoreSets(aClass, bClass, itemName, ingredientRaw);
    let legacyCoreDice = 0;
    if (aCore.size > 0 && bCore.size > 0) {
      legacyCoreDice = diceCoefficient([...aCore].sort().join(" "), [...bCore].sort().join(" "));
    }
    if (shareOperationalAliasCluster(itemIdentity, ingredientIdentity)) {
      const clusterCanonical = scoreCanonicalIngredientSimilarity(itemIdentity, ingredientIdentity, {
        legacyCoreDice,
        rawA: itemName,
        rawB: ingredientRaw,
      });
      legacyCoreDice = Math.max(legacyCoreDice, clusterCanonical.legacyCoreDice, clusterCanonical.score);
    }
    if (operationalFamiliesIncompatibleFromRaw(itemName, ingredientRaw)) {
      continue;
    }

    const score = semanticSimilarity(
      normalizedItemName,
      normalizedIngredientName,
      itemName,
      ingredientRaw,
    );
    const operationalConfidence = operationalEquivalenceConfidence(
      itemName,
      ingredientRaw,
      normalizedItemName,
      normalizedIngredientName,
      legacyCoreDice,
    );
    const breakdown = computeMatchScoreBreakdown({
      rawItem: itemName,
      rawIngredient: ingredientRaw,
      semanticSimilarity: score,
      legacyCoreDice,
      hasCompatibleMeasures: hasCompatibleMeasures(normalizedItemName, normalizedIngredientName),
      hasCompatibleIngredientForms: hasCompatibleIngredientFormFamilies(itemName, ingredientRaw),
      hasCompatibleFormat: hasCompatibleFormat(aTokens, bTokens),
      semanticMinScore: SEMANTIC_MATCH_MIN_SCORE,
      operationalMinScore: OPERATIONAL_EQUIVALENT_MIN_SCORE,
    });
    const weightDelta = scoreWeightCompatibility(itemName, ingredientRaw);
    const candidateScore = breakdown.finalPromotionScore + weightDelta;
    if (candidateScore > bestCandidateScore) {
      bestCandidateScore = candidateScore;
      bestScore = score;
      bestOperationalConfidence = operationalConfidence;
      bestBreakdown = breakdown;
      best = {
        ingredient,
        normalizedItemName,
        normalizedIngredientName,
        kind: "semantic",
        reason: "similar product wording and matching size",
        semanticSimilarity: score,
        operationalEquivalenceConfidence: operationalConfidence,
        scoreBreakdown: breakdown,
      };
    }
  }

  if (!best) {
    if (import.meta.env.DEV && ingredients.length > 0) {
      console.debug("[ingredient-match-rejected]", {
        itemName,
        reason: "no_viable_candidates",
      });
    }
    return null;
  }

  const ingredientRaw = best.ingredient.name ?? best.ingredient.normalized_name ?? "";
  const bestItemIdentity = canonicalizeIngredientIdentity(itemName);
  const bestIngredientIdentity = canonicalizeIngredientIdentity(ingredientRaw);
  const parentFormHierarchy = resolveParentFormHierarchyMatch(
    bestItemIdentity,
    bestIngredientIdentity,
  );
  const requiresOperationalReview = needsOperationalHumanConfirm(
    itemName,
    ingredientRaw,
    normalizedItemName,
    best.normalizedIngredientName,
  );
  const operationalReason =
    parentFormHierarchy?.reason ?? OPERATIONAL_EQUIVALENT_MATCH_REASON;
  const meetsSemanticBar = bestScore >= SEMANTIC_MATCH_MIN_SCORE;
  const meetsOperationalBar = bestOperationalConfidence >= OPERATIONAL_EQUIVALENT_MIN_SCORE;

  if (!meetsSemanticBar && !meetsOperationalBar) {
    const finalScore = Math.max(bestScore, bestOperationalConfidence);
    const rejectionBreakdown: MatchScoreBreakdown = {
      canonicalIdentityScore: bestBreakdown?.canonicalIdentityScore ?? 0,
      operationalFamilyScore: bestBreakdown?.operationalFamilyScore ?? 0,
      formCompatibilityScore: bestBreakdown?.formCompatibilityScore ?? 0,
      commercialNoisePenalty: bestBreakdown?.commercialNoisePenalty ?? 0,
      blockerPenalty: bestBreakdown?.blockerPenalty ?? 0,
      aliasConfidence: bestBreakdown?.aliasConfidence ?? 0,
      finalPromotionScore: finalScore,
      rejectionReason:
        bestBreakdown?.rejectionReason ??
        resolveMatchScoreRejectionReason({
          canonicalIdentityScore: bestBreakdown?.canonicalIdentityScore ?? 0,
          operationalFamilyScore: bestBreakdown?.operationalFamilyScore ?? 0,
          formCompatibilityScore: bestBreakdown?.formCompatibilityScore ?? 0,
          commercialNoisePenalty: bestBreakdown?.commercialNoisePenalty ?? 0,
          blockerPenalty: bestBreakdown?.blockerPenalty ?? 0,
          finalPromotionScore: finalScore,
          semanticMin: SEMANTIC_MATCH_MIN_SCORE,
          operationalMin: OPERATIONAL_EQUIVALENT_MIN_SCORE,
          measuresOk: hasCompatibleMeasures(normalizedItemName, best.normalizedIngredientName),
          ingredientFormsOk: hasCompatibleIngredientFormFamilies(itemName, ingredientRaw),
          formatOk: hasCompatibleFormat(
            new Set(productTokens(normalizedItemName)),
            new Set(productTokens(best.normalizedIngredientName)),
          ),
        }),
    };
    traceIngredientMatchRejected({
      itemName,
      bestIngredientName: best.ingredient.name ?? null,
      scoreBreakdown: rejectionBreakdown,
      semanticScore: bestScore,
      operationalScore: bestOperationalConfidence,
    });
    return null;
  }

  const autoConfirm =
    meetsSemanticBar &&
    shouldAutoConfirmSemanticMatch(
      normalizedItemName,
      best.normalizedIngredientName,
      bestScore,
      itemName,
      ingredientRaw,
    );

  const promotedBreakdown: MatchScoreBreakdown = {
    ...(bestBreakdown ?? {
      canonicalIdentityScore: 0,
      operationalFamilyScore: 0,
      formCompatibilityScore: 0,
      commercialNoisePenalty: 0,
      blockerPenalty: 0,
      aliasConfidence: 0,
      finalPromotionScore: Math.max(bestScore, bestOperationalConfidence),
    }),
    rejectionReason: null,
  };

  traceIngredientSemanticMatch({
    originalName: itemName,
    normalizedName: normalizedItemName,
    coreTokens: itemTokenClass.core,
    weakTokens: itemTokenClass.weak,
    matchedIngredient: best.ingredient.name,
    similarityScore: bestScore,
    scoreBreakdown: promotedBreakdown,
  });

  if (autoConfirm) {
    return withSyntheticTargetFlag({
      ...best,
      kind: "exact",
      reason: "same core product identity and matching size",
      scoreBreakdown: promotedBreakdown,
    });
  }

  if (parentFormHierarchy && meetsOperationalBar) {
    return withSyntheticTargetFlag({
      ...best,
      kind: "operational-equivalent",
      reason: operationalReason,
      scoreBreakdown: promotedBreakdown,
    });
  }

  if (requiresOperationalReview && meetsOperationalBar) {
    return withSyntheticTargetFlag({
      ...best,
      kind: "operational-equivalent",
      reason: operationalReason,
      scoreBreakdown: promotedBreakdown,
    });
  }

  if (meetsSemanticBar) {
    return withSyntheticTargetFlag({ ...best, scoreBreakdown: promotedBreakdown });
  }

  if (meetsOperationalBar) {
    return withSyntheticTargetFlag({
      ...best,
      kind: "operational-equivalent",
      reason: operationalReason,
      scoreBreakdown: promotedBreakdown,
    });
  }

  return null;
}
