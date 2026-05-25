import {
  detectVolume,
  detectWeight,
  normalizeForUnitMatch,
} from "@/lib/ingredient-unit-inference";

/** Canonical units for recipe line quantities (subset of purchase/stock units). */
export type RecipeUsageUnit = "ml" | "g" | "un" | "kg" | "l";

const VOLUME_TOKEN_RE =
  /\b(\d+(?:[.,]\d+)?\s*)?(ML|CL|LTS?|LTR|LTRS?|LT|L|LITRO|LITROS)\b/;
const WEIGHT_TOKEN_RE = /\b(\d+(?:[.,]\d+)?\s*)?(KG|KGS|G|GR|GRS)\b/;

const COUNTABLE_PACKAGE_RE = /\b(LATA|LATAS)\b/;
const COUNTABLE_UNIT_COUNT_RE = /\b\d+\s*(UN|UNID|UNIDS|UNIDADE|UNIDADES|PCS|PC|PECAS?)\b/;
const DISCRETE_PROTEIN_RE = /\b(HAMBURGUER|HAMBURGER|BURGER|HAMBURGUERS|HAMBURGERS)\b/;
const UNIT_DRIVEN_BAKERY_RE =
  /\b(PAO|BREAD|BRIOCHE|BURGER BUN|BUN|BUNS|BAGUETTE|CROISSANT|TORTILLA|TORTILLAS|WRAP|WRAPS)\b/;

/**
 * Infer the default unit when adding an ingredient to a recipe line.
 *
 * Priority:
 * 1. Obvious discrete items (lata, burgers with per-piece weight, bakery by unit) → `un`
 * 2. Liquid size in name (ml/cl/l/litro) → `ml`
 * 3. Mass in name (g/kg) → `g`
 * 4. Weak hint from purchase unit only when it is a measure (never blind `un`)
 * 5. Fallback `g`
 */
export function inferRecipeUsageUnit(
  ingredientName: string,
  purchaseUnit?: string | null,
): RecipeUsageUnit {
  if (detectObviousCountableUsage(ingredientName)) return "un";
  if (hasVolumeToken(ingredientName) || detectVolume(ingredientName)) return "ml";
  if (hasWeightToken(ingredientName) || detectWeight(ingredientName)) return "g";

  const hint = recipeUsageUnitFromPurchaseHint(purchaseUnit);
  if (hint) return hint;

  return "g";
}

function hasVolumeToken(name: string): boolean {
  VOLUME_TOKEN_RE.lastIndex = 0;
  return VOLUME_TOKEN_RE.test(normalizeForUnitMatch(name));
}

function hasWeightToken(name: string): boolean {
  WEIGHT_TOKEN_RE.lastIndex = 0;
  return WEIGHT_TOKEN_RE.test(normalizeForUnitMatch(name));
}

/** Discrete consumer units: cans, burgers, buns — even when a per-piece g/ml appears in the name. */
export function detectObviousCountableUsage(ingredientName: string): boolean {
  const s = normalizeForUnitMatch(ingredientName);
  if (COUNTABLE_PACKAGE_RE.test(s)) return true;

  const hasPerPieceSize = Boolean(detectWeight(ingredientName) || detectVolume(ingredientName));
  if (DISCRETE_PROTEIN_RE.test(s) && hasPerPieceSize) return true;
  if (UNIT_DRIVEN_BAKERY_RE.test(s) && hasPerPieceSize && COUNTABLE_UNIT_COUNT_RE.test(s)) {
    return true;
  }
  if (UNIT_DRIVEN_BAKERY_RE.test(s) && hasPerPieceSize && !hasBulkWeight(s)) {
    return true;
  }

  return false;
}

/** Bulk pack weight (e.g. 1KG block) — not a per-piece size for bakery heuristic. */
function hasBulkWeight(s: string): boolean {
  const m = s.match(/\b(\d+(?:[.,]\d+)?)\s*(KG|KGS)\b/);
  if (!m) return false;
  const qty = Number.parseFloat((m[1] ?? "").replace(",", "."));
  return Number.isFinite(qty) && qty >= 1;
}

/**
 * Purchase/stock unit as a weak fallback only for measure units (ml, g, kg, l).
 * Never maps purchase `un`, `cx`, `pack`, etc. to recipe usage.
 */
export function recipeUsageUnitFromPurchaseHint(
  purchaseUnit?: string | null,
): RecipeUsageUnit | null {
  const raw = purchaseUnit?.trim().toLowerCase();
  if (!raw) return null;

  if (raw === "ml" || raw === "cl") return "ml";
  if (raw === "l" || raw === "lt" || raw === "ltr" || raw === "litro" || raw === "litros") {
    return "ml";
  }
  if (raw === "g" || raw === "gr" || raw === "grs") return "g";
  if (raw === "kg" || raw === "kgs") return "g";

  return null;
}
