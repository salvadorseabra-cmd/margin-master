/**
 * Lightweight canonical ingredient identity — operational equivalence from raw
 * supplier wording without DB schema or invoice extraction changes.
 */

import {
  PARENT_FORM_MAX_PROMOTION_SCORE,
  PARENT_FORM_PARTIAL_COMPATIBILITY,
  resolveParentFormHierarchyMatch,
} from "@/lib/ingredient-parent-form";
import { operationalFamiliesIncompatibleFromRaw } from "@/lib/ingredient-operational-families";

const DIACRITIC_RE = /\p{M}/gu;

const QUANTITY_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)\b/gi;
const ATTACHED_QTY_RE = /\b\d+(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs)\b/gi;

/** Multi-word commercial / pack phrases (longest first). */
const COMMERCIAL_PHRASES: readonly string[] = [
  "food service",
  "foodservice",
  "top down",
  "oliveira da serra",
  "pingo doce",
  "private label",
  "para restauracao",
  "para restauração",
];

/** Standalone commercial / retailer / marketing tokens. */
const COMMERCIAL_NOISE_TOKENS = new Set([
  "premium",
  "service",
  "snack",
  "food",
  "auchan",
  "continente",
  "lidl",
  "eroski",
  "rama",
  "calve",
  "guloso",
  "heinz",
  "vaqueiro",
  "fula",
  "oliveira",
  "serra",
  "pingo",
  "doce",
  "top",
  "down",
  "mix",
  "gourmet",
  "especial",
  "classico",
  "tradicional",
  "extra",
  "super",
  "catering",
  "horeca",
  "restauracao",
  "profissional",
  "professional",
  "queijo",
]);

const FAMILY_TOKEN_TO_ID: Record<string, string> = {
  batata: "batata",
  potato: "batata",
  cheddar: "cheddar",
  tomate: "tomate",
  tom: "tomate",
  ketchup: "ketchup",
  maionese: "maionese",
  oleo: "oleo",
  girassol: "girassol",
  alface: "alface",
  iceberg: "alface",
};

const FORM_PHRASE_PATTERNS: { pattern: RegExp; form: string }[] = [
  { pattern: /\bcorte\s+fino\b/, form: "corte_fino" },
  { pattern: /\bcorte\s+fina\b/, form: "corte_fino" },
  { pattern: /\bhash\s*brown\b/, form: "hashbrown" },
  { pattern: /\bpotato\s+sticks\b/, form: "palha" },
  { pattern: /\bbatata\s+sticks\b/, form: "palha" },
];

const FORM_TOKEN_TO_ID: Record<string, string> = {
  palha: "palha",
  frita: "frita",
  fritas: "frita",
  wedges: "wedges",
  wedge: "wedges",
  hashbrown: "hashbrown",
  hashbrowns: "hashbrown",
  corte_fino: "corte_fino",
  molho: "molho",
  molhos: "molho",
  bloco: "block",
  block: "block",
  fatiado: "sliced",
  fatiada: "sliced",
  fatias: "sliced",
  sliced: "sliced",
  slices: "sliced",
  slice: "sliced",
  dip: "dip",
  dips: "dip",
  cherry: "cherry",
  cereja: "cherry",
  cerejas: "cherry",
  triturado: "triturado",
  triturada: "triturado",
  triturados: "triturado",
  congelado: "frozen",
  congelada: "frozen",
  frozen: "frozen",
  grated: "grated",
  ralado: "grated",
  ralada: "grated",
};

/** Potato cut tokens that imply batata family when batata is absent from OCR. */
const POTATO_FORM_IMPLY_BATATA = new Set([
  "palha",
  "frita",
  "fritas",
  "wedges",
  "wedge",
  "hashbrown",
  "hashbrowns",
  "sticks",
]);

/** Incompatible preparation forms — hard block for scoring. */
const INCOMPATIBLE_FORM_PAIRS: [string, string][] = [
  ["palha", "corte_fino"],
  ["palha", "frita"],
  ["palha", "wedges"],
  ["palha", "hashbrown"],
  ["molho", "sliced"],
  ["molho", "block"],
  ["molho", "grated"],
  ["molho", "dip"],
  ["dip", "sliced"],
  ["dip", "block"],
  ["dip", "grated"],
  ["sliced", "block"],
  ["cherry", "triturado"],
  ["frozen", "palha"],
  ["frita", "palha"],
];

/**
 * Static operational alias clusters — deterministic, in-memory only.
 * Maps noisy supplier phrases to the same family/form identity.
 */
export const OPERATIONAL_ALIAS_CLUSTERS: readonly {
  id: string;
  family: string;
  form: string | null;
  phrases: readonly string[];
}[] = [
  {
    id: "batata-palha",
    family: "batata",
    form: "palha",
    phrases: [
      "palha snack",
      "batata palha",
      "potato sticks",
      "batata sticks",
      "palha food service",
    ],
  },
  {
    id: "tomate-cherry",
    family: "tomate",
    form: "cherry",
    phrases: ["tomate cherry", "tom cherry", "tomate cereja"],
  },
  {
    id: "cheddar-sliced",
    family: "cheddar",
    form: "sliced",
    phrases: [
      "queijo cheddar fatiado",
      "queijo cheddar fatiada",
      "cheddar fatiado",
      "cheddar fatiada",
      "cheddar sliced",
    ],
  },
  {
    id: "cheddar-block",
    family: "cheddar",
    form: "block",
    phrases: ["queijo cheddar bloco", "cheddar bloco", "cheddar block"],
  },
  {
    id: "cheddar-molho",
    family: "cheddar",
    form: "molho",
    phrases: ["queijo cheddar molho", "cheddar molho", "cheddar sauce"],
  },
  {
    id: "cheddar-grated",
    family: "cheddar",
    form: "grated",
    phrases: [
      "queijo cheddar ralado",
      "queijo cheddar ralada",
      "cheddar ralado",
      "cheddar grated",
    ],
  },
  {
    id: "cheddar-dip",
    family: "cheddar",
    form: "dip",
    phrases: ["cheddar dip", "queijo cheddar dip"],
  },
  {
    id: "cheddar-plain",
    family: "cheddar",
    form: null,
    phrases: ["queijo cheddar", "cheddar"],
  },
];

/** Cheddar preparation tokens — plain cluster must not override these forms. */
const CHEDDAR_FORM_SURFACE_TOKENS = new Set([
  "fatiado",
  "fatiada",
  "fatias",
  "sliced",
  "slice",
  "slices",
  "bloco",
  "block",
  "molho",
  "molhos",
  "ralado",
  "ralada",
  "grated",
  "dip",
  "dips",
]);

/** Minimum canonical operational score to surface a human-reviewed operational-equivalent suggestion. */
export const OPERATIONAL_EQUIVALENT_MIN_SCORE = 0.58;

/** Minimum canonical identity score before weak_canonical_overlap rejection applies. */
export const WEAK_CANONICAL_OVERLAP_SCORE = 0.35;

/** Commercial-noise penalty above this can trigger commercial_dilution_too_high. */
export const COMMERCIAL_DILUTION_BLOCK_PENALTY = 0.14;

export type MatchScoreRejectionReason =
  | "insufficient_operational_confidence"
  | "blocked_incompatible_form"
  | "incompatible_operational_family"
  | "weak_canonical_overlap"
  | "commercial_dilution_too_high"
  | "no_safe_family_convergence"
  | "below_semantic_threshold"
  | "incompatible_ingredient_form"
  | "incompatible_measures"
  | "incompatible_format"
  | "no_viable_candidates";

export type MatchScoreBreakdown = {
  canonicalIdentityScore: number;
  operationalFamilyScore: number;
  formCompatibilityScore: number;
  commercialNoisePenalty: number;
  blockerPenalty: number;
  aliasConfidence: number;
  finalPromotionScore: number;
  rejectionReason: MatchScoreRejectionReason | null;
};

const FAMILY_RAW_SURFACE_TOKENS: Record<string, readonly string[]> = {
  batata: ["batata", "potato"],
  cheddar: ["cheddar", "queijo"],
  tomate: ["tomate", "tom"],
  ketchup: ["ketchup"],
  maionese: ["maionese", "mayonnaise", "mayo"],
  oleo: ["oleo", "oil"],
  girassol: ["girassol", "sunflower"],
  alface: ["alface", "lettuce"],
};

/** Layered semantic score weights (sum ≈ 1.0 before bonuses). */
export const CANONICAL_IDENTITY_SCORE_WEIGHTS = {
  familyOverlap: 0.35,
  formCompatibility: 0.28,
  operationalAlias: 0.15,
  normalizedTokenOverlap: 0.12,
  packageSimilarity: 0.05,
  brandOverlap: 0.03,
  legacyCoreDice: 0.02,
} as const;

export type CanonicalIngredientIdentity = {
  family: string | null;
  form: string | null;
  commercialNoise: string[];
  normalizedCore: string;
};

export type CanonicalIdentityScoreBreakdown = {
  score: number;
  familyOverlap: number;
  formCompatibility: number;
  operationalAlias: number;
  normalizedTokenOverlap: number;
  packageSimilarity: number;
  brandOverlap: number;
  legacyCoreDice: number;
};

function stripAccentsLower(value: string): string {
  return value.normalize("NFD").replace(DIACRITIC_RE, "").toLowerCase();
}

function lightStripForIdentity(raw: string): string {
  let s = stripAccentsLower(raw);
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(QUANTITY_RE, " ");
  s = s.replace(ATTACHED_QTY_RE, " ");
  s = s.replace(/\b\d+\b/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function expandAbbreviations(value: string): string {
  return value.replace(/\btom\.\b/g, "tomate ").replace(/\btom\b/g, "tomate");
}

function commercialNoiseFromPhrases(normalized: string): string[] {
  const noise: string[] = [];
  const padded = ` ${normalized} `;
  const sorted = [...COMMERCIAL_PHRASES].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    const pattern = phrase
      .split(/\s+/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    if (!new RegExp(`\\s${pattern}\\s`).test(padded)) continue;
    for (const token of phrase.split(/\s+/)) {
      if (!noise.includes(token)) noise.push(token);
    }
  }
  return noise;
}

function phraseMatchesPadded(padded: string, phrase: string): boolean {
  const pattern = phrase
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`\\s${pattern}\\s`).test(padded);
}

function strippedHasExplicitCheddarForm(tokens: string[]): boolean {
  return tokens.some((token) => CHEDDAR_FORM_SURFACE_TOKENS.has(token));
}

function hasPotatoPalhaContext(tokens: string[]): boolean {
  return (
    tokens.includes("batata") ||
    tokens.includes("potato") ||
    tokens.includes("snack") ||
    tokens.includes("sticks") ||
    tokens.some((token) => POTATO_FORM_IMPLY_BATATA.has(token))
  );
}

/** Form-specific clusters first; plain cheddar last so forms are never collapsed. */
function operationalClustersBySpecificity(): (typeof OPERATIONAL_ALIAS_CLUSTERS)[number][] {
  return [...OPERATIONAL_ALIAS_CLUSTERS].sort((a, b) => {
    const aSpecific = a.form != null ? 0 : 1;
    const bSpecific = b.form != null ? 0 : 1;
    if (aSpecific !== bSpecific) return aSpecific - bSpecific;
    const aLen = Math.max(...a.phrases.map((p) => p.length));
    const bLen = Math.max(...b.phrases.map((p) => p.length));
    return bLen - aLen;
  });
}

function resolveOperationalCluster(stripped: string): (typeof OPERATIONAL_ALIAS_CLUSTERS)[number] | null {
  const padded = ` ${stripped} `;
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 1);

  for (const cluster of operationalClustersBySpecificity()) {
    if (cluster.id === "cheddar-plain" && strippedHasExplicitCheddarForm(tokens)) continue;
    for (const phrase of [...cluster.phrases].sort((a, b) => b.length - a.length)) {
      if (phraseMatchesPadded(padded, phrase)) return cluster;
    }
  }

  if (/\spalha\s/.test(padded) && hasPotatoPalhaContext(tokens)) {
    return OPERATIONAL_ALIAS_CLUSTERS.find((c) => c.id === "batata-palha") ?? null;
  }

  return null;
}

/**
 * Resolve operational alias cluster id from raw supplier wording (pre-semantic).
 */
export function resolveOperationalAliasClusterIdFromRaw(rawName: string): string | null {
  let stripped = lightStripForIdentity(rawName);
  stripped = expandAbbreviations(stripped);
  if (!stripped) return null;
  return resolveOperationalCluster(stripped)?.id ?? null;
}

/** True when both identities map to the same operational alias cluster. */
export function shareOperationalAliasCluster(
  identityA: CanonicalIngredientIdentity,
  identityB: CanonicalIngredientIdentity,
): boolean {
  const clusterA = operationalAliasClusterId(identityA);
  const clusterB = operationalAliasClusterId(identityB);
  return clusterA != null && clusterA === clusterB;
}

function extractFormFromTokens(tokens: string[], stripped: string): string | null {
  let work = stripped;
  const forms = new Set<string>();

  for (const { pattern, form } of FORM_PHRASE_PATTERNS) {
    if (pattern.test(work)) {
      forms.add(form);
      work = work.replace(pattern, " ");
    }
  }

  const hasBatata = tokens.includes("batata");
  for (const token of tokens) {
    const mapped = FORM_TOKEN_TO_ID[token];
    if (!mapped) continue;
    if (mapped === "frita" && !hasBatata && !forms.has("corte_fino")) continue;
    if (mapped === "corte_fino") {
      forms.add("corte_fino");
      continue;
    }
    if (forms.has("corte_fino") && mapped === "frita") continue;
    forms.add(mapped);
  }

  if (forms.size === 0) return null;
  if (forms.size === 1) return [...forms][0]!;
  // Prefer specific cut over generic frita when both appear.
  if (forms.has("palha")) return "palha";
  if (forms.has("corte_fino")) return "corte_fino";
  if (forms.has("cherry")) return "cherry";
  if (forms.has("triturado")) return "triturado";
  return [...forms].sort().join("+");
}

function inferFamily(tokens: string[], form: string | null, cluster: (typeof OPERATIONAL_ALIAS_CLUSTERS)[number] | null): string | null {
  if (cluster) return cluster.family;

  for (const token of tokens) {
    const family = FAMILY_TOKEN_TO_ID[token];
    if (family) return family;
  }

  if (form && POTATO_FORM_IMPLY_BATATA.has(form)) return "batata";
  if (tokens.some((t) => POTATO_FORM_IMPLY_BATATA.has(t))) return "batata";

  return null;
}

function buildNormalizedCore(family: string | null, form: string | null, tokens: string[]): string {
  if (family && form) return `${family} ${form}`;
  if (family) return family;
  const product = tokens.filter(
    (t) => !COMMERCIAL_NOISE_TOKENS.has(t) && !FAMILY_TOKEN_TO_ID[t] && !FORM_TOKEN_TO_ID[t],
  );
  return product.length > 0 ? product.join(" ") : tokens.join(" ");
}

/**
 * Derive a canonical ingredient identity from raw supplier wording.
 */
export function canonicalizeIngredientIdentity(rawName: string): CanonicalIngredientIdentity {
  let stripped = lightStripForIdentity(rawName);
  stripped = expandAbbreviations(stripped);
  if (!stripped) {
    return { family: null, form: null, commercialNoise: [], normalizedCore: "" };
  }

  const cluster = resolveOperationalCluster(stripped);
  const phraseNoise = commercialNoiseFromPhrases(stripped);
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 1);

  const commercialNoise: string[] = [...phraseNoise];
  const productTokens: string[] = [];

  for (const token of tokens) {
    if (COMMERCIAL_NOISE_TOKENS.has(token) || phraseNoise.includes(token)) {
      if (!commercialNoise.includes(token)) commercialNoise.push(token);
    } else {
      productTokens.push(token);
    }
  }

  let form = extractFormFromTokens(productTokens, stripped);
  const family = inferFamily(productTokens, form, cluster);

  if (cluster?.form != null) form = cluster.form;
  else if (family === "batata" && productTokens.includes("palha")) form = form ?? "palha";

  const normalizedCore = buildNormalizedCore(family, form, productTokens);

  return { family, form, commercialNoise, normalizedCore };
}

export function operationalAliasClusterId(identity: CanonicalIngredientIdentity): string | null {
  const core = identity.normalizedCore;
  for (const cluster of OPERATIONAL_ALIAS_CLUSTERS) {
    const clusterCore = cluster.form ? `${cluster.family} ${cluster.form}` : cluster.family;
    if (core === clusterCore) return cluster.id;
    if (identity.family === cluster.family && identity.form === cluster.form) return cluster.id;
  }
  return null;
}

export function hasCompatibleCanonicalForms(formA: string | null, formB: string | null): boolean {
  if (!formA && !formB) return true;
  if (!formA || !formB) return false;
  if (formA === formB) return true;
  for (const [left, right] of INCOMPATIBLE_FORM_PAIRS) {
    if ((formA === left && formB === right) || (formA === right && formB === left)) return false;
  }
  return false;
}

function tokenSetFromCore(core: string): Set<string> {
  return new Set(core.split(/\s+/).filter((t) => t.length > 0));
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.min(a.size, b.size);
}

function diceCoefficient(a: string, b: string): number {
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
    intersection += Math.min(va, B.get(k) ?? 0);
  }
  let total = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  return total === 0 ? 0 : (2 * intersection) / total;
}

function brandOverlapScore(noiseA: string[], noiseB: string[]): number {
  const brands = new Set(
    [...noiseA, ...noiseB].filter((t) =>
      ["auchan", "continente", "lidl", "calve", "guloso", "heinz", "vaqueiro", "fula"].includes(t),
    ),
  );
  if (brands.size === 0) return 1;
  const shared = noiseA.filter((t) => noiseB.includes(t)).length;
  return shared > 0 ? 0.5 : 0;
}

function commercialNoiseSuppressionFactor(noiseA: string[], noiseB: string[], coreOverlap: number): number {
  const onlyNoise =
    (noiseA.length > 0 || noiseB.length > 0) && coreOverlap >= 0.67;
  return onlyNoise ? 1 : 0.85;
}

/**
 * Layered similarity from canonical identities (deterministic, explainable).
 */
export function scoreCanonicalIngredientSimilarity(
  identityA: CanonicalIngredientIdentity,
  identityB: CanonicalIngredientIdentity,
  options?: { legacyCoreDice?: number },
): CanonicalIdentityScoreBreakdown {
  const w = CANONICAL_IDENTITY_SCORE_WEIGHTS;
  const parentFormHierarchy = resolveParentFormHierarchyMatch(identityA, identityB);

  if (!hasCompatibleCanonicalForms(identityA.form, identityB.form) && !parentFormHierarchy) {
    return {
      score: 0,
      familyOverlap: 0,
      formCompatibility: 0,
      operationalAlias: 0,
      normalizedTokenOverlap: 0,
      packageSimilarity: 0,
      brandOverlap: 0,
      legacyCoreDice: 0,
    };
  }

  const familyOverlap =
    identityA.family && identityB.family
      ? identityA.family === identityB.family
        ? 1
        : 0
      : 0;

  const formCompatibility = parentFormHierarchy
    ? PARENT_FORM_PARTIAL_COMPATIBILITY
    : !identityA.form && !identityB.form
      ? 1
      : identityA.form && identityB.form && identityA.form === identityB.form
        ? 1
        : 0;

  const clusterA = operationalAliasClusterId(identityA);
  const clusterB = operationalAliasClusterId(identityB);
  const operationalAlias =
    clusterA && clusterB ? (clusterA === clusterB ? 1 : 0) : familyOverlap * formCompatibility;

  const coreA = tokenSetFromCore(identityA.normalizedCore);
  const coreB = tokenSetFromCore(identityB.normalizedCore);
  const normalizedTokenOverlap = overlapRatio(coreA, coreB);

  const packageSimilarity = 1;
  const brandOverlap = brandOverlapScore(identityA.commercialNoise, identityB.commercialNoise);
  const legacyCoreDice = options?.legacyCoreDice ?? diceCoefficient(
    identityA.normalizedCore,
    identityB.normalizedCore,
  );

  let score =
    familyOverlap * w.familyOverlap +
    formCompatibility * w.formCompatibility +
    operationalAlias * w.operationalAlias +
    normalizedTokenOverlap * w.normalizedTokenOverlap +
    packageSimilarity * w.packageSimilarity +
    brandOverlap * w.brandOverlap +
    legacyCoreDice * w.legacyCoreDice;

  score *= commercialNoiseSuppressionFactor(
    identityA.commercialNoise,
    identityB.commercialNoise,
    normalizedTokenOverlap,
  );

  if (
    !parentFormHierarchy &&
    familyOverlap === 1 &&
    formCompatibility === 1 &&
    normalizedTokenOverlap >= 0.67
  ) {
    score = Math.max(score, 0.88);
  }

  if (parentFormHierarchy) {
    score = Math.min(score, PARENT_FORM_MAX_PROMOTION_SCORE);
  }

  return {
    score: Math.min(1, score),
    familyOverlap,
    formCompatibility,
    operationalAlias,
    normalizedTokenOverlap,
    packageSimilarity,
    brandOverlap,
    legacyCoreDice,
  };
}

export type OperationalEquivalenceBreakdown = {
  /** Derived operational-equivalence confidence in [0, 1]. */
  confidence: number;
  /** Same ingredient family on both sides. */
  operationalFamilyConfidence: number;
  /** Compatible preparation form (0 when blocked). */
  formCompatibility: number;
  /** Prior human confirmation via alias memory (alias kind only). */
  historicalConfirmation: number;
  /** Supplier-scoped alias memory boost — never sufficient alone. */
  aliasMemoryConfidence: number;
  /** Penalty when only commercial/retailer tokens differ. */
  commercialNoiseSuppression: number;
};

function rawSurfaceContainsFamilyToken(raw: string, family: string | null): boolean {
  if (!family) return true;
  const tokens = FAMILY_RAW_SURFACE_TOKENS[family] ?? [family];
  const padded = ` ${lightStripForIdentity(raw)} `;
  return tokens.some((token) => padded.includes(` ${token} `));
}

/**
 * True when wording is plausibly the same product operationally but needs human confirmation
 * (missing family token on one side, retailer-only asymmetry, or distinct alias clusters).
 */
export function needsOperationalHumanConfirm(
  rawA: string,
  rawB: string,
  normalizedA?: string,
  normalizedB?: string,
): boolean {
  const identityA = canonicalizeIngredientIdentity(rawA);
  const identityB = canonicalizeIngredientIdentity(rawB);

  if (resolveParentFormHierarchyMatch(identityA, identityB)) return true;

  const clusterA = operationalAliasClusterId(identityA);
  const clusterB = operationalAliasClusterId(identityB);
  if (clusterA && clusterB && clusterA !== clusterB) return true;

  if (identityA.family && identityB.family && identityA.family === identityB.family) {
    const aHas = rawSurfaceContainsFamilyToken(rawA, identityA.family);
    const bHas = rawSurfaceContainsFamilyToken(rawB, identityB.family);
    if (aHas !== bHas) return true;
  }

  const retailerTokens = new Set([
    "auchan",
    "continente",
    "lidl",
    "eroski",
    "rama",
    "calve",
    "guloso",
    "heinz",
    "vaqueiro",
    "fula",
    "pingo",
    "doce",
  ]);
  const noiseA = identityA.commercialNoise.filter((t) => retailerTokens.has(t));
  const noiseB = identityB.commercialNoise.filter((t) => retailerTokens.has(t));
  const asymmetricRetailer =
    noiseA.some((t) => !noiseB.includes(t)) || noiseB.some((t) => !noiseA.includes(t));
  const plainFamilyLine = !identityA.form && !identityB.form;
  const retailerReviewFamilies = new Set(["cheddar"]);
  if (
    asymmetricRetailer &&
    plainFamilyLine &&
    identityA.family &&
    retailerReviewFamilies.has(identityA.family) &&
    identityB.family === identityA.family &&
    normalizedA &&
    normalizedB &&
    normalizedA === normalizedB
  ) {
    return true;
  }

  return false;
}

/**
 * Layered operational-equivalence confidence from canonical identities.
 * Supplier/alias boosts are additive caps — they cannot override form blockers.
 */
export function computeOperationalEquivalenceConfidence(
  rawA: string,
  rawB: string,
  options?: {
    legacyCoreDice?: number;
    hasConfirmedAlias?: boolean;
    supplierConsistent?: boolean;
  },
): OperationalEquivalenceBreakdown {
  const identityA = canonicalizeIngredientIdentity(rawA);
  const identityB = canonicalizeIngredientIdentity(rawB);
  const parentFormHierarchy = resolveParentFormHierarchyMatch(identityA, identityB);
  const canonical = scoreCanonicalIngredientSimilarity(identityA, identityB, {
    legacyCoreDice: options?.legacyCoreDice,
  });

  const operationalFamilyConfidence = canonical.familyOverlap;
  const formCompatibility = parentFormHierarchy
    ? PARENT_FORM_PARTIAL_COMPATIBILITY
    : canonical.formCompatibility;
  const historicalConfirmation = options?.hasConfirmedAlias ? 1 : 0;
  const aliasMemoryConfidence =
    options?.hasConfirmedAlias && options?.supplierConsistent ? 0.12 : options?.hasConfirmedAlias ? 0.06 : 0;

  const coreA = tokenSetFromCore(identityA.normalizedCore);
  const coreB = tokenSetFromCore(identityB.normalizedCore);
  const coreOverlap = overlapRatio(coreA, coreB);
  const commercialNoiseSuppression = commercialNoiseSuppressionFactor(
    identityA.commercialNoise,
    identityB.commercialNoise,
    coreOverlap,
  );

  let confidence = canonical.score * commercialNoiseSuppression;
  const clusterA = operationalAliasClusterId(identityA);
  const clusterB = operationalAliasClusterId(identityB);
  if (
    clusterA &&
    clusterB &&
    clusterA === clusterB &&
    formCompatibility === 1 &&
    operationalFamilyConfidence === 1
  ) {
    confidence = Math.max(confidence, OPERATIONAL_EQUIVALENT_MIN_SCORE);
  }
  if (historicalConfirmation > 0) {
    confidence = Math.min(1, confidence + aliasMemoryConfidence);
  }

  if (parentFormHierarchy && operationalFamilyConfidence === 1) {
    confidence = Math.max(
      confidence,
      Math.min(OPERATIONAL_EQUIVALENT_MIN_SCORE + 0.04, PARENT_FORM_MAX_PROMOTION_SCORE),
    );
    confidence = Math.min(confidence, PARENT_FORM_MAX_PROMOTION_SCORE);
  }

  return {
    confidence: Math.min(1, confidence),
    operationalFamilyConfidence,
    formCompatibility,
    historicalConfirmation,
    aliasMemoryConfidence,
    commercialNoiseSuppression,
  };
}

export type MatchScoreBreakdownInput = {
  rawItem: string;
  rawIngredient: string;
  semanticSimilarity: number;
  legacyCoreDice?: number;
  hasCompatibleMeasures?: boolean;
  hasCompatibleIngredientForms?: boolean;
  hasCompatibleFormat?: boolean;
  aliasConfidence?: number;
  semanticMinScore?: number;
  operationalMinScore?: number;
};

function traceMatchScoreBreakdown(
  itemName: string,
  ingredientName: string,
  breakdown: MatchScoreBreakdown,
) {
  if (!import.meta.env.DEV) return;
  console.debug("[ingredient-match-score]", {
    itemName,
    ingredientName,
    ...breakdown,
  });
}

/**
 * Deterministic promotion score decomposition for a single invoice↔catalog candidate.
 */
export function computeMatchScoreBreakdown(
  input: MatchScoreBreakdownInput,
): MatchScoreBreakdown {
  const semanticMin = input.semanticMinScore ?? 0.72;
  const operationalMin = input.operationalMinScore ?? OPERATIONAL_EQUIVALENT_MIN_SCORE;
  const identityA = canonicalizeIngredientIdentity(input.rawItem);
  const identityB = canonicalizeIngredientIdentity(input.rawIngredient);
  const parentFormHierarchy = resolveParentFormHierarchyMatch(identityA, identityB);
  const formsCompatible =
    hasCompatibleCanonicalForms(identityA.form, identityB.form) || parentFormHierarchy != null;
  const canonical = scoreCanonicalIngredientSimilarity(identityA, identityB, {
    legacyCoreDice: input.legacyCoreDice,
  });
  const operational = computeOperationalEquivalenceConfidence(
    input.rawItem,
    input.rawIngredient,
    { legacyCoreDice: input.legacyCoreDice },
  );

  const operationalFamilyScore = canonical.familyOverlap;
  const formCompatibilityScore = formsCompatible
    ? parentFormHierarchy
      ? PARENT_FORM_PARTIAL_COMPATIBILITY
      : canonical.formCompatibility
    : 0;
  const commercialNoisePenalty = Math.max(
    0,
    1 - operational.commercialNoiseSuppression,
  );
  const blockerPenalty = formsCompatible ? 0 : 1;
  const aliasConfidence = input.aliasConfidence ?? 0;

  const measuresOk = input.hasCompatibleMeasures !== false;
  const ingredientFormsOk = input.hasCompatibleIngredientForms !== false;
  const formatOk = input.hasCompatibleFormat !== false;
  const operationalCatalogFamiliesOk = !operationalFamiliesIncompatibleFromRaw(
    input.rawItem,
    input.rawIngredient,
  );

  let finalPromotionScore = 0;
  if (
    blockerPenalty === 0 &&
    measuresOk &&
    ingredientFormsOk &&
    formatOk &&
    operationalCatalogFamiliesOk
  ) {
    finalPromotionScore = Math.max(input.semanticSimilarity, operational.confidence);
  }

  const base: Omit<MatchScoreBreakdown, "rejectionReason"> = {
    canonicalIdentityScore: canonical.score,
    operationalFamilyScore,
    formCompatibilityScore,
    commercialNoisePenalty,
    blockerPenalty,
    aliasConfidence,
    finalPromotionScore,
  };

  const rejectionReason = operationalCatalogFamiliesOk
    ? resolveMatchScoreRejectionReason({
        ...base,
        semanticMin,
        operationalMin,
        measuresOk,
        ingredientFormsOk,
        formatOk,
      })
    : "incompatible_operational_family";

  const breakdown: MatchScoreBreakdown = { ...base, rejectionReason };
  if (rejectionReason) {
    traceMatchScoreBreakdown(input.rawItem, input.rawIngredient, breakdown);
  }
  return breakdown;
}

export function resolveMatchScoreRejectionReason(params: {
  canonicalIdentityScore: number;
  operationalFamilyScore: number;
  formCompatibilityScore: number;
  commercialNoisePenalty: number;
  blockerPenalty: number;
  finalPromotionScore: number;
  semanticMin: number;
  operationalMin: number;
  measuresOk: boolean;
  ingredientFormsOk: boolean;
  formatOk: boolean;
}): MatchScoreRejectionReason | null {
  if (params.blockerPenalty > 0 || params.formCompatibilityScore === 0) {
    return "blocked_incompatible_form";
  }
  if (!params.measuresOk) return "incompatible_measures";
  if (!params.ingredientFormsOk) return "incompatible_ingredient_form";
  if (!params.formatOk) return "incompatible_format";
  if (params.finalPromotionScore >= params.semanticMin) return null;
  if (params.finalPromotionScore >= params.operationalMin) return null;

  if (params.operationalFamilyScore === 0) {
    return params.canonicalIdentityScore < WEAK_CANONICAL_OVERLAP_SCORE
      ? "no_safe_family_convergence"
      : "weak_canonical_overlap";
  }

  if (
    params.commercialNoisePenalty >= COMMERCIAL_DILUTION_BLOCK_PENALTY &&
    params.finalPromotionScore < params.operationalMin
  ) {
    return "commercial_dilution_too_high";
  }

  if (params.canonicalIdentityScore < WEAK_CANONICAL_OVERLAP_SCORE) {
    return "weak_canonical_overlap";
  }

  if (params.finalPromotionScore < params.semanticMin) {
    return params.finalPromotionScore < params.operationalMin
      ? "insufficient_operational_confidence"
      : "below_semantic_threshold";
  }

  return "insufficient_operational_confidence";
}
