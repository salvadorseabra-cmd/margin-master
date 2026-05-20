/**
 * Lightweight token→coarse-family hints for deterministic invoice matching boosts/penalties.
 */

import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import {
  scoreWeightedOperationalFamilyCompatibility,
  weightedOperationalFamiliesShouldSkip,
} from "@/lib/ingredient-operational-scoring";

const DIACRITIC_RE = /\p{M}/gu;

export type CoarseIngredientFamily = "bread" | "meat" | "sauces" | "fried_potato" | "cheese";

/** Score deltas applied in {@link scoreCanonicalIngredientSimilarity}. */
export const INGREDIENT_TOKEN_FAMILY_SCORE_DELTAS = {
  sameFamily: 0.1,
  crossCritical: -0.22,
  crossCriticalFriedPotatoBread: -0.35,
  oneSideUnknown: -0.03,
} as const;

const CRITICAL_INCOMPATIBLE_PAIRS: {
  pair: [CoarseIngredientFamily, CoarseIngredientFamily];
  delta: number;
}[] = [
  { pair: ["meat", "bread"], delta: INGREDIENT_TOKEN_FAMILY_SCORE_DELTAS.crossCritical },
  {
    pair: ["fried_potato", "bread"],
    delta: INGREDIENT_TOKEN_FAMILY_SCORE_DELTAS.crossCriticalFriedPotatoBread,
  },
];

const COARSE_FAMILY_PHRASES: { phrase: string; family: CoarseIngredientFamily }[] = [
  { phrase: "pao de batata", family: "bread" },
  { phrase: "pao batata", family: "bread" },
  { phrase: "potato bread", family: "bread" },
  { phrase: "batata bread", family: "bread" },
  { phrase: "burger bun", family: "bread" },
  { phrase: "hamburger bun", family: "bread" },
  { phrase: "brioche bun", family: "bread" },
  { phrase: "sesame bun", family: "bread" },
  { phrase: "9x9", family: "fried_potato" },
  { phrase: "9 x 9", family: "fried_potato" },
  { phrase: "batata shoestring", family: "fried_potato" },
  { phrase: "batata palha", family: "fried_potato" },
  { phrase: "palha fina", family: "fried_potato" },
  { phrase: "palha snack", family: "fried_potato" },
  { phrase: "shoestring fries", family: "fried_potato" },
  { phrase: "batata wdg", family: "fried_potato" },
  { phrase: "batata wedges", family: "fried_potato" },
  { phrase: "chicken breaded", family: "meat" },
  { phrase: "bacon streaky", family: "meat" },
  { phrase: "hamburguer bovino", family: "meat" },
  { phrase: "hamburger bovino", family: "meat" },
  { phrase: "hamburger patty", family: "meat" },
  { phrase: "angus patty", family: "meat" },
  { phrase: "angus burger", family: "meat" },
  { phrase: "smash patty", family: "meat" },
  { phrase: "smash pty", family: "meat" },
  { phrase: "bac fum fat", family: "meat" },
  { phrase: "bacon fumado fatiado", family: "meat" },
  { phrase: "bac strk", family: "meat" },
  { phrase: "chk breaded", family: "meat" },
  { phrase: "ched top", family: "sauces" },
  { phrase: "cheddar top", family: "sauces" },
  { phrase: "molho cheddar dispenser", family: "sauces" },
  { phrase: "pickles fatiados", family: "sauces" },
  { phrase: "onion rings", family: "sauces" },
  { phrase: "on rng", family: "sauces" },
  { phrase: "bat shoe", family: "fried_potato" },
  { phrase: "bat shoestr", family: "fried_potato" },
].sort((a, b) => b.phrase.length - a.phrase.length);

const TOKEN_TO_COARSE_FAMILY: Record<string, CoarseIngredientFamily> = {
  bun: "bread",
  brioche: "bread",
  brch: "bread",
  sesamo: "bread",
  sesame: "bread",
  ses: "bread",
  pao: "bread",
  hamburguer: "meat",
  hamburger: "meat",
  burger: "meat",
  burg: "meat",
  patty: "meat",
  pty: "meat",
  smash: "meat",
  angus: "meat",
  beef: "meat",
  bovino: "meat",
  vaca: "meat",
  hmb: "meat",
  chicken: "meat",
  chk: "meat",
  frango: "meat",
  flt: "meat",
  bacon: "meat",
  bac: "meat",
  streaky: "meat",
  strk: "meat",
  fum: "meat",
  fumado: "meat",
  breaded: "meat",
  bbq: "sauces",
  mayo: "sauces",
  maionese: "sauces",
  ketchup: "sauces",
  ketch: "sauces",
  maio: "sauces",
  mol: "sauces",
  molho: "sauces",
  bbq: "sauces",
  top: "sauces",
  disp: "sauces",
  dispenser: "sauces",
  pickles: "sauces",
  pickl: "sauces",
  pkl: "sauces",
  onion: "sauces",
  oni: "sauces",
  rings: "sauces",
  rng: "sauces",
  batata: "fried_potato",
  bat: "fried_potato",
  palha: "fried_potato",
  pal: "fried_potato",
  shoe: "fried_potato",
  shoestr: "fried_potato",
  shoestring: "fried_potato",
  wdg: "fried_potato",
  wedges: "fried_potato",
  wedge: "fried_potato",
  fries: "fried_potato",
  frita: "fried_potato",
  fritas: "fried_potato",
  cheddar: "cheese",
  mozzarella: "cheese",
  queijo: "cheese",
};

const GRID_CUT_PLACEHOLDER = "__grid9x9__";

function preserveGridCutToken(s: string): string {
  return s
    .replace(/\b9\s*x\s*9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `)
    .replace(/\b9x9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `);
}

function restoreGridCutToken(s: string): string {
  return s.replace(new RegExp(GRID_CUT_PLACEHOLDER, "g"), "9x9");
}

function stripForFamily(raw: string): string {
  let s = raw
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
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

function phraseMatches(normalized: string, phrase: string): boolean {
  if (normalized === phrase) return true;
  return ` ${normalized} `.includes(` ${phrase} `);
}

/**
 * Infer a coarse product family from supplier shorthand (expanded) and catalog wording.
 */
export function inferCoarseIngredientFamily(raw: string): CoarseIngredientFamily | null {
  const expanded = normalizeSupplierShorthand(raw);
  const normalized = stripForFamily(expanded || raw);
  if (!normalized) return null;

  for (const { phrase, family } of COARSE_FAMILY_PHRASES) {
    if (phraseMatches(normalized, phrase)) return family;
  }

  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);
  const seen = new Set<CoarseIngredientFamily>();
  for (const token of tokens) {
    const family = TOKEN_TO_COARSE_FAMILY[token];
    if (family) seen.add(family);
  }
  if (seen.size === 1) return [...seen][0]!;
  if (seen.has("meat") && !seen.has("bread")) return "meat";
  if (seen.has("bread") && !seen.has("meat")) return "bread";
  if (seen.has("fried_potato")) return "fried_potato";
  if (seen.has("cheese")) return "cheese";
  if (seen.has("sauces")) return "sauces";
  return null;
}

function criticalIncompatibleDelta(
  a: CoarseIngredientFamily,
  b: CoarseIngredientFamily,
): number | null {
  if (a === b) return null;
  for (const { pair, delta } of CRITICAL_INCOMPATIBLE_PAIRS) {
    const [left, right] = pair;
    if ((a === left && b === right) || (a === right && b === left)) return delta;
  }
  return null;
}

/**
 * Additive compatibility in [-0.4, 0.1] for canonical scoring.
 * Prefers weighted operational families when both sides have signal.
 */
export function scoreTokenFamilyCompatibility(rawA: string, rawB: string): number {
  const weightedDelta = scoreWeightedOperationalFamilyCompatibility(rawA, rawB);
  if (weightedDelta !== 0) return weightedDelta;
  if (weightedOperationalFamiliesShouldSkip(rawA, rawB)) {
    return INGREDIENT_TOKEN_FAMILY_SCORE_DELTAS.crossCriticalFriedPotatoBread;
  }

  const familyA = inferCoarseIngredientFamily(rawA);
  const familyB = inferCoarseIngredientFamily(rawB);
  if (!familyA && !familyB) return 0;
  if (!familyA || !familyB) return INGREDIENT_TOKEN_FAMILY_SCORE_DELTAS.oneSideUnknown;
  if (familyA === familyB) return INGREDIENT_TOKEN_FAMILY_SCORE_DELTAS.sameFamily;
  const criticalDelta = criticalIncompatibleDelta(familyA, familyB);
  if (criticalDelta != null) return criticalDelta;
  return 0;
}
