/**
 * Deterministic per-portion weight extraction and compatibility scoring for invoice↔catalog matching.
 */

const DIACRITIC_RE = /\p{M}/gu;

const EXPLICIT_WEIGHT_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|gr|grs)\b|\b(\d+(?:[.,]\d+)?)(kg|g)\b/gi;

const BARE_PORTION_RE = /\b(\d{2,3})\b/g;

/** Score deltas applied in {@link scoreCanonicalIngredientSimilarity}. */
export const INGREDIENT_WEIGHT_SCORE_DELTAS = {
  exactMatch: 0.12,
  nearMatch: 0.05,
  largeMismatch: -0.35,
  oneSideMissing: -0.04,
} as const;

function stripForWeight(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ");
}

function parseDecimal(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

function toGrams(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("kg")) return value * 1000;
  return value;
}

export type ExtractedLineWeight = {
  grams: number;
  /** True when parsed from a bare portion number (e.g. "BUN 80"). */
  inferredUnit: boolean;
};

/**
 * Extract the primary per-unit weight in grams from supplier or catalog wording.
 * Prefers explicit g/kg tokens; falls back to a lone 20–500 portion number when no unit is present.
 */
export function extractLineWeightGrams(raw: string): ExtractedLineWeight | null {
  const text = stripForWeight(raw);
  if (!text) return null;

  const explicit: { grams: number; index: number }[] = [];
  for (const match of text.matchAll(EXPLICIT_WEIGHT_RE)) {
    const valueRaw = match[1] ?? match[3];
    const unitRaw = match[2] ?? match[4];
    if (!valueRaw || !unitRaw) continue;
    const grams = toGrams(parseDecimal(valueRaw), unitRaw);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    explicit.push({ grams, index: match.index ?? 0 });
  }

  if (explicit.length > 0) {
    const portionSized = explicit.filter((entry) => entry.grams < 2000);
    const pick =
      portionSized.length > 0
        ? portionSized.reduce((best, cur) => (cur.grams < best.grams ? cur : best))
        : explicit[0]!;
    return { grams: pick.grams, inferredUnit: false };
  }

  const bare: number[] = [];
  for (const match of text.matchAll(BARE_PORTION_RE)) {
    const value = Number.parseInt(match[1] ?? "", 10);
    if (value >= 20 && value <= 500) bare.push(value);
  }
  if (bare.length === 1) {
    return { grams: bare[0]!, inferredUnit: true };
  }
  if (bare.length > 1) {
    const smallest = Math.min(...bare);
    if (smallest >= 20 && smallest <= 500) {
      return { grams: smallest, inferredUnit: true };
    }
  }

  return null;
}

function isNearWeight(a: number, b: number): boolean {
  const delta = Math.abs(a - b);
  const max = Math.max(a, b);
  return delta <= 15 || delta / max <= 0.15;
}

function isLargeWeightMismatch(a: number, b: number): boolean {
  const delta = Math.abs(a - b);
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  if (max < 500) {
    return delta > 80 || (min > 0 && delta / max > 0.35);
  }
  return delta > 180 || delta / max > 0.47;
}

/**
 * Additive compatibility in [-0.2, 0.12] for canonical scoring.
 */
export function scoreWeightCompatibility(rawA: string, rawB: string): number {
  const weightA = extractLineWeightGrams(rawA);
  const weightB = extractLineWeightGrams(rawB);
  if (!weightA && !weightB) return 0;
  if (!weightA || !weightB) return INGREDIENT_WEIGHT_SCORE_DELTAS.oneSideMissing;

  const gramsA = weightA.grams;
  const gramsB = weightB.grams;
  if (gramsA === gramsB) return INGREDIENT_WEIGHT_SCORE_DELTAS.exactMatch;
  if (isNearWeight(gramsA, gramsB)) return INGREDIENT_WEIGHT_SCORE_DELTAS.nearMatch;
  if (isLargeWeightMismatch(gramsA, gramsB)) return INGREDIENT_WEIGHT_SCORE_DELTAS.largeMismatch;
  return 0;
}
