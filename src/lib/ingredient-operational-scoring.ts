/**
 * Weighted operational token families for deterministic invoice↔catalog scoring.
 * Finer than coarse {@link inferCoarseIngredientFamily} — e.g. burger_meat vs bread.
 */

import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import { detectOperationalFamily } from "@/lib/ingredient-operational-families";
import { extractLineWeightGrams } from "@/lib/ingredient-weight-match";

const DIACRITIC_RE = /\p{M}/gu;

export type WeightedOperationalFamilyId =
  | "burger_meat"
  | "bread"
  | "frozen_potato"
  | "bacon"
  | "chicken"
  | "sauce";

export type OperationalFamilyConfidence = {
  family: WeightedOperationalFamilyId | null;
  /** Capped sum of matched token weights for the winning family, in [0, 1]. */
  score: number;
  tokenHits: string[];
};

/** Auto-promote weighted operational matches to exact (separate from semantic 0.88). */
export const OPERATIONAL_WEIGHT_AUTO_THRESHOLD = 0.65;

export const WEIGHTED_FAMILY_SCORE_DELTAS = {
  sameFamily: 0.08,
  burgerMeatBread: -0.4,
  frozenPotatoBread: -0.35,
  sauceMeat: -0.15,
} as const;

const FAMILY_TOKEN_WEIGHTS: Record<WeightedOperationalFamilyId, Record<string, number>> = {
  burger_meat: {
    smash: 0.55,
    pty: 0.45,
    patty: 0.45,
    ang: 0.35,
    angus: 0.35,
    burg: 0.3,
    burger: 0.3,
    hamburger: 0.3,
    hamburguer: 0.35,
    beef: 0.3,
    bovino: 0.35,
    hmb: 0.4,
    vaca: 0.3,
    acem: 0.35,
    vazia: 0.35,
    novilho: 0.35,
  },
  bread: {
    bun: 0.6,
    brioche: 0.7,
    brch: 0.65,
    ses: 0.4,
    sesamo: 0.4,
    sesame: 0.4,
    pao: 0.55,
  },
  frozen_potato: {
    shoe: 0.45,
    shoestr: 0.45,
    shoestring: 0.45,
    wdg: 0.45,
    wedges: 0.45,
    wedge: 0.45,
    pal: 0.4,
    palha: 0.4,
    "9x9": 0.5,
    batata: 0.25,
    bat: 0.25,
    frita: 0.2,
    fritas: 0.2,
  },
  bacon: {
    bac: 0.35,
    bacon: 0.35,
    fum: 0.25,
    fumado: 0.25,
    smoked: 0.25,
    smk: 0.25,
    strk: 0.4,
    streaky: 0.4,
    fat: 0.2,
    fatiado: 0.2,
    fatiada: 0.2,
    strips: 0.35,
    strip: 0.35,
  },
  chicken: {
    chk: 0.35,
    chicken: 0.35,
    frango: 0.35,
    breaded: 0.45,
    flt: 0.3,
    fillet: 0.3,
  },
  sauce: {
    molho: 0.4,
    mol: 0.35,
    sauce: 0.4,
    salsa: 0.35,
    ketchup: 0.45,
    ketch: 0.4,
    catchup: 0.4,
    maionese: 0.4,
    maio: 0.35,
    mayo: 0.35,
    bbq: 0.35,
    cheddar: 0.35,
    ched: 0.3,
    top: 0.35,
    down: 0.2,
    disp: 0.4,
    dispenser: 0.45,
  },
};

const GRID_CUT_PLACEHOLDER = "__grid9x9__";

const INCOMPATIBLE_WEIGHTED_PAIRS: {
  pair: [WeightedOperationalFamilyId, WeightedOperationalFamilyId];
  delta: number;
  skipCandidate: boolean;
}[] = [
  {
    pair: ["burger_meat", "bread"],
    delta: WEIGHTED_FAMILY_SCORE_DELTAS.burgerMeatBread,
    skipCandidate: true,
  },
  {
    pair: ["frozen_potato", "bread"],
    delta: WEIGHTED_FAMILY_SCORE_DELTAS.frozenPotatoBread,
    skipCandidate: true,
  },
  {
    pair: ["sauce", "burger_meat"],
    delta: WEIGHTED_FAMILY_SCORE_DELTAS.sauceMeat,
    skipCandidate: false,
  },
  {
    pair: ["sauce", "bacon"],
    delta: WEIGHTED_FAMILY_SCORE_DELTAS.sauceMeat,
    skipCandidate: false,
  },
  {
    pair: ["sauce", "chicken"],
    delta: WEIGHTED_FAMILY_SCORE_DELTAS.sauceMeat,
    skipCandidate: false,
  },
];

const SCORE_SUM_CAP = 1;

const FORCED_BREAD_PHRASES = ["pao de batata", "pao batata", "potato bread", "batata bread"];

function preserveGridCutToken(s: string): string {
  return s
    .replace(/\b9\s*x\s*9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `)
    .replace(/\b9x9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `);
}

function restoreGridCutToken(s: string): string {
  return s.replace(new RegExp(GRID_CUT_PLACEHOLDER, "g"), "9x9");
}

function stripForWeightedFamily(raw: string): string {
  let s = raw
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(
    /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)\b/gi,
    " ",
  );
  s = s.replace(/\b\d+(?:kg|g|ml|cl|l)\b/gi, " ");
  s = preserveGridCutToken(s);
  s = s.replace(/\b\d+\b/g, " ");
  s = restoreGridCutToken(s);
  return s.replace(/\s+/g, " ").trim();
}

function tokenizeForWeightedFamily(raw: string): string[] {
  const expanded = normalizeSupplierShorthand(raw);
  const normalized = stripForWeightedFamily(expanded || raw);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((t) => t.length > 0);
}

function scoreFamilyFromTokens(
  familyId: WeightedOperationalFamilyId,
  tokens: string[],
): { score: number; tokenHits: string[] } {
  const weights = FAMILY_TOKEN_WEIGHTS[familyId];
  let sum = 0;
  const tokenHits: string[] = [];
  for (const token of tokens) {
    const weight = weights[token];
    if (weight == null) continue;
    sum += weight;
    tokenHits.push(token);
  }
  if (familyId === "bacon" && !tokenHits.includes("bac") && !tokenHits.includes("bacon")) {
    return { score: 0, tokenHits: [] };
  }
  if (familyId === "bacon" && (tokenHits.includes("fat") || tokenHits.includes("fatiado"))) {
    if (!tokenHits.some((t) => t === "bac" || t === "bacon" || t === "strk" || t === "streaky")) {
      return { score: 0, tokenHits: [] };
    }
  }
  return { score: Math.min(SCORE_SUM_CAP, sum), tokenHits };
}

function allFamilyScores(
  tokens: string[],
): Map<WeightedOperationalFamilyId, OperationalFamilyConfidence> {
  const scores = new Map<WeightedOperationalFamilyId, OperationalFamilyConfidence>();
  for (const familyId of Object.keys(FAMILY_TOKEN_WEIGHTS) as WeightedOperationalFamilyId[]) {
    const { score, tokenHits } = scoreFamilyFromTokens(familyId, tokens);
    if (score > 0 && tokenHits.length > 0) {
      scores.set(familyId, { family: familyId, score, tokenHits });
    }
  }
  return scores;
}

/**
 * Infer the strongest weighted operational family from supplier/catalog wording.
 */
function phraseMatches(normalized: string, phrase: string): boolean {
  if (normalized === phrase) return true;
  return ` ${normalized} `.includes(` ${phrase} `);
}

function hasCheeseSauceDispSignal(tokens: string[]): boolean {
  const hasCheese = tokens.includes("cheddar") || tokens.includes("ched");
  if (!hasCheese) return false;
  return tokens.some((t) => ["top", "down", "disp", "dispenser", "molho", "mol"].includes(t));
}

function applyPattyPortionWeightBoost(
  rawName: string,
  tokens: string[],
  confidence: OperationalFamilyConfidence,
): OperationalFamilyConfidence {
  if (confidence.family !== "burger_meat") return confidence;
  if (!tokens.some((t) => t === "patty" || t === "pty")) return confidence;
  const portion = extractLineWeightGrams(rawName);
  if (!portion) return confidence;
  if (portion.grams !== 180 && portion.grams !== 90) return confidence;
  const boost = portion.grams === 180 ? 0.15 : 0.08;
  return {
    ...confidence,
    score: Math.min(SCORE_SUM_CAP, confidence.score + boost),
    tokenHits: [...confidence.tokenHits, `${portion.grams}g`],
  };
}

export function computeOperationalFamilyConfidence(rawName: string): OperationalFamilyConfidence {
  if (detectOperationalFamily(rawName) === "burger_bread") {
    return { family: "bread", score: 0.75, tokenHits: ["pao", "batata"] };
  }

  const expanded = normalizeSupplierShorthand(rawName);
  const normalized = stripForWeightedFamily(expanded || rawName);
  if (!normalized) {
    return { family: null, score: 0, tokenHits: [] };
  }

  const tokensPreview = normalized.split(/\s+/).filter((t) => t.length > 0);
  if (hasCheeseSauceDispSignal(tokensPreview)) {
    return {
      family: "sauce",
      score: 0.78,
      tokenHits: tokensPreview.filter((t) =>
        ["cheddar", "ched", "top", "down", "disp", "dispenser", "molho", "mol"].includes(t),
      ),
    };
  }

  for (const phrase of FORCED_BREAD_PHRASES) {
    if (phraseMatches(normalized, phrase)) {
      return { family: "bread", score: 0.75, tokenHits: ["pao", "batata"] };
    }
  }
  if (tokensPreview.includes("pao") && tokensPreview.includes("batata")) {
    return { family: "bread", score: 0.75, tokenHits: ["pao", "batata"] };
  }

  const tokens = tokensPreview;
  if (tokens.length === 0) {
    return { family: null, score: 0, tokenHits: [] };
  }

  const byFamily = allFamilyScores(tokens);
  let best: OperationalFamilyConfidence = { family: null, score: 0, tokenHits: [] };
  for (const entry of byFamily.values()) {
    if (entry.score > best.score) best = entry;
  }
  return applyPattyPortionWeightBoost(rawName, tokens, best);
}

function weightedFamilyPenalty(
  familyA: WeightedOperationalFamilyId,
  familyB: WeightedOperationalFamilyId,
): { delta: number; skipCandidate: boolean } | null {
  if (familyA === familyB) return null;
  for (const { pair, delta, skipCandidate } of INCOMPATIBLE_WEIGHTED_PAIRS) {
    const [left, right] = pair;
    if ((familyA === left && familyB === right) || (familyA === right && familyB === left)) {
      return { delta, skipCandidate };
    }
  }
  return null;
}

const MIN_FAMILY_SIGNAL = 0.2;

/**
 * True when both sides have confident opposing families (e.g. burger_meat vs bread).
 */
export function weightedOperationalFamiliesShouldSkip(rawA: string, rawB: string): boolean {
  const confA = computeOperationalFamilyConfidence(rawA);
  const confB = computeOperationalFamilyConfidence(rawB);
  const registryFamilyA = detectOperationalFamily(rawA);
  const registryFamilyB = detectOperationalFamily(rawB);
  if (
    confA.family === "frozen_potato" &&
    (confB.family === "bread" || registryFamilyB === "burger_bread")
  ) {
    return true;
  }
  if (
    confA.family === "burger_meat" &&
    (confB.family === "bread" || registryFamilyB === "burger_bread")
  ) {
    return true;
  }
  if (
    !confA.family ||
    !confB.family ||
    confA.score < MIN_FAMILY_SIGNAL ||
    confB.score < MIN_FAMILY_SIGNAL
  ) {
    return false;
  }
  if (registryFamilyA === "fried_potato_products" && registryFamilyB === "burger_bread") {
    return true;
  }
  const penalty = weightedFamilyPenalty(confA.family, confB.family);
  return penalty?.skipCandidate === true;
}

/**
 * Additive compatibility for candidate scoring in [-0.4, 0.08].
 */
export function scoreWeightedOperationalFamilyCompatibility(rawA: string, rawB: string): number {
  const confA = computeOperationalFamilyConfidence(rawA);
  const confB = computeOperationalFamilyConfidence(rawB);
  if (!confA.family || !confB.family) return 0;
  if (confA.score < MIN_FAMILY_SIGNAL || confB.score < MIN_FAMILY_SIGNAL) return 0;
  if (confA.family === confB.family) return WEIGHTED_FAMILY_SCORE_DELTAS.sameFamily;
  const penalty = weightedFamilyPenalty(confA.family, confB.family);
  return penalty?.delta ?? 0;
}

/**
 * Weighted operational auto-exact: same family, both above threshold, no blockers.
 */
export function meetsOperationalWeightAutoExact(
  rawItem: string,
  rawCatalog: string,
  options?: {
    hasOperationalAlias?: boolean;
    weightCompatible?: boolean;
    formsCompatible?: boolean;
  },
): boolean {
  if (options?.hasOperationalAlias) {
    return (
      (options.weightCompatible ?? true) &&
      (options.formsCompatible ?? true) &&
      !weightedOperationalFamiliesShouldSkip(rawItem, rawCatalog)
    );
  }

  const itemConf = computeOperationalFamilyConfidence(rawItem);
  const catalogConf = computeOperationalFamilyConfidence(rawCatalog);
  if (!itemConf.family || !catalogConf.family || itemConf.family !== catalogConf.family) {
    return false;
  }
  if (itemConf.score < OPERATIONAL_WEIGHT_AUTO_THRESHOLD) return false;
  if (catalogConf.score < OPERATIONAL_WEIGHT_AUTO_THRESHOLD) return false;
  if (weightedOperationalFamiliesShouldSkip(rawItem, rawCatalog)) return false;
  if (options?.weightCompatible === false || options?.formsCompatible === false) return false;
  return true;
}
