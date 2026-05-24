/**
 * Read-only heuristics for suspicious ingredient_aliases → canonical mappings.
 * Does not mutate the database. Used by CLI audit scripts and Catalog Review UI badges.
 *
 * Normal invoice wording (shorthand, packaging, supplier codes) is expected — only
 * semantically incompatible mappings are flagged.
 */

import {
  diceCoefficient,
  normalizeCanonicalIngredientName,
  normalizeInvoiceIngredientName,
} from "@/lib/ingredient-canonical";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { filterCanonicalCatalogIngredients } from "@/lib/ingredient-kind";
import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import { normalizeInvoiceAliasMemoryKey } from "@/lib/normalize-ingredient-name";

/** Below this score, Catalog Review shows a corruption / low-confidence badge. */
export const ALIAS_INTEGRITY_VERY_LOW_CONFIDENCE_THRESHOLD = 0.25;

export type IngredientAliasIntegrityReason =
  | "low_token_jaccard"
  | "low_string_similarity"
  | "category_token_mismatch";

export type AuditIngredientAliasMappingParams = {
  aliasName: string;
  canonicalName: string;
  aliasId?: string | null;
  canonicalId?: string | null;
};

export type IngredientAliasIntegrityAuditResult = {
  aliasId: string | null;
  aliasName: string;
  canonicalId: string | null;
  canonicalName: string;
  confidence: number;
  reasonFlags: IngredientAliasIntegrityReason[];
};

export type SuggestCanonicalForAliasParams = {
  aliasName: string;
  currentCanonicalId: string;
  catalog: readonly IngredientCanonicalInput[];
  /** Optional catalog-review similarity rows (read-only hints). */
  similarityCandidateIds?: readonly string[];
};

export type SuggestedCanonicalForAlias = {
  ingredientId: string;
  displayName: string;
  score: number;
  source: "token_overlap" | "similarity_candidate";
};

type SemanticCategory =
  | "potato"
  | "lettuce_greens"
  | "meat"
  | "beverage"
  | "bread"
  | "cheese"
  | "dairy"
  | "sauce"
  | "oil"
  | "unknown";

const POTATO_TOKENS = new Set([
  "batata",
  "bat",
  "potato",
  "palha",
  "pal",
  "shoestr",
  "shoestring",
  "wdg",
  "wedges",
  "fries",
  "frita",
  "fritas",
  "9x9",
]);

const LETTUCE_TOKENS = new Set([
  "alface",
  "lettuce",
  "iceberg",
  "rucula",
  "rúcula",
  "rucola",
  "mix",
  "salada",
  "greens",
  "folha",
  "folhas",
]);

const MEAT_TOKENS = new Set([
  "hamburguer",
  "hamburger",
  "burger",
  "burg",
  "patty",
  "pty",
  "angus",
  "beef",
  "bovino",
  "vaca",
  "chicken",
  "chk",
  "frango",
  "bacon",
  "bac",
  "carne",
  "meat",
  "fumado",
  "fum",
  "fatiado",
  "fatiada",
  "streaky",
  "strk",
]);

const BEVERAGE_TOKENS = new Set([
  "coca",
  "cola",
  "pepsi",
  "fanta",
  "sprite",
  "agua",
  "água",
  "water",
  "sumo",
  "juice",
  "cerveja",
  "beer",
  "refrigerante",
  "bebida",
  "zero",
]);

const BREAD_TOKENS = new Set(["pao", "pão", "bread", "bun", "brioche", "sesamo", "sesame"]);
const CHEESE_TOKENS = new Set(["cheddar", "mozzarella", "queijo", "cheese"]);
const DAIRY_TOKENS = new Set(["leite", "milk", "nata", "cream", "manteiga", "butter"]);
const SAUCE_TOKENS = new Set([
  "molho",
  "mol",
  "ketchup",
  "maio",
  "maionese",
  "mayo",
  "bbq",
  "pickles",
  "pickl",
]);
const OIL_TOKENS = new Set(["oleo", "oil", "girassol", "sunflower"]);

const ALL_CATEGORY_TOKEN_SETS: ReadonlyArray<ReadonlySet<string>> = [
  POTATO_TOKENS,
  LETTUCE_TOKENS,
  MEAT_TOKENS,
  BEVERAGE_TOKENS,
  BREAD_TOKENS,
  CHEESE_TOKENS,
  DAIRY_TOKENS,
  SAUCE_TOKENS,
  OIL_TOKENS,
];

const INCOMPATIBLE_CATEGORY_PAIRS: [SemanticCategory, SemanticCategory][] = [
  ["potato", "lettuce_greens"],
  ["potato", "meat"],
  ["potato", "beverage"],
  ["potato", "oil"],
  ["lettuce_greens", "meat"],
  ["lettuce_greens", "beverage"],
  ["lettuce_greens", "oil"],
  ["meat", "beverage"],
  ["bread", "beverage"],
  ["bread", "lettuce_greens"],
  ["bread", "oil"],
  ["cheese", "beverage"],
  ["dairy", "beverage"],
  ["sauce", "beverage"],
  ["oil", "potato"],
  ["oil", "lettuce_greens"],
  ["oil", "meat"],
  ["oil", "beverage"],
  ["oil", "bread"],
];

/** Packaging / format noise stripped before semantic comparison. */
const AUDIT_PACKAGING_TOKENS = new Set([
  "kg",
  "kgs",
  "g",
  "gr",
  "grs",
  "mg",
  "ml",
  "cl",
  "l",
  "lt",
  "lts",
  "ltr",
  "ltrs",
  "un",
  "uni",
  "unid",
  "unids",
  "und",
  "unds",
  "pc",
  "pcs",
  "lata",
  "pet",
  "garrafa",
  "bottle",
  "pack",
  "caixa",
  "cx",
  "emb",
  "disp",
]);

const GRID_CUT_TOKEN_RE = /^\d+x\d+$/i;

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.min(a.size, b.size);
}

function stripPackagingTokens(tokens: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const token of tokens) {
    if (AUDIT_PACKAGING_TOKENS.has(token)) continue;
    if (GRID_CUT_TOKEN_RE.test(token)) continue;
    if (/^\d+$/.test(token)) continue;
    out.add(token);
  }
  return out;
}

function tokenizeForAudit(raw: string, expandSupplierShorthand: boolean): Set<string> {
  const source = expandSupplierShorthand ? normalizeSupplierShorthand(raw) : raw;
  const normalized = normalizeCanonicalIngredientName(
    normalizeInvoiceIngredientName(normalizeInvoiceAliasMemoryKey(source)),
  );
  if (!normalized) return new Set();
  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return stripPackagingTokens(new Set(tokens));
}

function categoriesForTokens(tokens: Set<string>): Set<SemanticCategory> {
  const out = new Set<SemanticCategory>();
  for (const token of tokens) {
    if (POTATO_TOKENS.has(token)) out.add("potato");
    if (LETTUCE_TOKENS.has(token)) out.add("lettuce_greens");
    if (MEAT_TOKENS.has(token)) out.add("meat");
    if (BEVERAGE_TOKENS.has(token)) out.add("beverage");
    if (BREAD_TOKENS.has(token)) out.add("bread");
    if (CHEESE_TOKENS.has(token)) out.add("cheese");
    if (DAIRY_TOKENS.has(token)) out.add("dairy");
    if (SAUCE_TOKENS.has(token)) out.add("sauce");
    if (OIL_TOKENS.has(token)) out.add("oil");
  }
  return out.size > 0 ? out : new Set<SemanticCategory>(["unknown"]);
}

function hasCategoryMismatch(
  aliasCategories: Set<SemanticCategory>,
  canonicalCategories: Set<SemanticCategory>,
): boolean {
  if (aliasCategories.has("unknown") || canonicalCategories.has("unknown")) {
    return false;
  }
  for (const [left, right] of INCOMPATIBLE_CATEGORY_PAIRS) {
    const aHasLeft = aliasCategories.has(left);
    const aHasRight = aliasCategories.has(right);
    const bHasLeft = canonicalCategories.has(left);
    const bHasRight = canonicalCategories.has(right);
    if ((aHasLeft && bHasRight) || (aHasRight && bHasLeft)) return true;
  }
  if (aliasCategories.size === 1 && canonicalCategories.size === 1) {
    const [aliasOnly] = [...aliasCategories];
    const [canonicalOnly] = [...canonicalCategories];
    if (aliasOnly !== canonicalOnly && aliasOnly !== "unknown" && canonicalOnly !== "unknown") {
      return true;
    }
  }
  return false;
}

function isSemanticCoreToken(token: string): boolean {
  for (const bucket of ALL_CATEGORY_TOKEN_SETS) {
    if (bucket.has(token)) return true;
  }
  return false;
}

function semanticCoreOverlap(aliasTokens: Set<string>, canonicalTokens: Set<string>): number {
  return tokenOverlapRatio(
    new Set([...aliasTokens].filter(isSemanticCoreToken)),
    new Set([...canonicalTokens].filter(isSemanticCoreToken)),
  );
}

function sharesCategory(aliasCategories: Set<SemanticCategory>, canonicalCategories: Set<SemanticCategory>): boolean {
  if (aliasCategories.has("unknown") || canonicalCategories.has("unknown")) return true;
  for (const category of aliasCategories) {
    if (canonicalCategories.has(category)) return true;
  }
  return false;
}

function isCompatibleAliasMapping(params: {
  aliasTokens: Set<string>;
  canonicalTokens: Set<string>;
  aliasCategories: Set<SemanticCategory>;
  canonicalCategories: Set<SemanticCategory>;
  categoryMismatch: boolean;
  tokenJaccard: number;
  stringSimilarity: number;
  coreOverlap: number;
}): boolean {
  if (params.categoryMismatch) return false;

  if (params.coreOverlap >= 0.34) return true;
  if (params.tokenJaccard >= 0.2) return true;
  if (params.stringSimilarity >= 0.45) return true;

  if (
    sharesCategory(params.aliasCategories, params.canonicalCategories) &&
    (params.coreOverlap > 0 || params.tokenJaccard >= 0.12 || params.stringSimilarity >= 0.35)
  ) {
    return true;
  }

  return false;
}

function normalizedPairForAudit(aliasName: string, canonicalName: string): {
  aliasNorm: string;
  canonicalNorm: string;
} {
  const aliasNorm = normalizeCanonicalIngredientName(
    normalizeInvoiceIngredientName(normalizeSupplierShorthand(aliasName)),
  );
  const canonicalNorm = normalizeCanonicalIngredientName(canonicalName);
  return { aliasNorm, canonicalNorm };
}

/**
 * Score how plausible an alias→canonical link is (1 = strong match, 0 = likely corruption).
 * Read-only — never writes to the database.
 */
export function auditIngredientAliasMapping(
  params: AuditIngredientAliasMappingParams,
): IngredientAliasIntegrityAuditResult {
  const aliasName = params.aliasName?.trim() ?? "";
  const canonicalName = params.canonicalName?.trim() ?? "";
  const { aliasNorm, canonicalNorm } = normalizedPairForAudit(aliasName, canonicalName);

  const aliasTokens = tokenizeForAudit(aliasName, true);
  const canonicalTokens = tokenizeForAudit(canonicalName, false);
  const tokenJaccard = jaccardSimilarity(aliasTokens, canonicalTokens);
  const stringSimilarity = aliasNorm && canonicalNorm ? diceCoefficient(aliasNorm, canonicalNorm) : 0;
  const coreOverlap = semanticCoreOverlap(aliasTokens, canonicalTokens);

  const aliasCategories = categoriesForTokens(aliasTokens);
  const canonicalCategories = categoriesForTokens(canonicalTokens);
  const categoryMismatch = hasCategoryMismatch(aliasCategories, canonicalCategories);

  const compatible = isCompatibleAliasMapping({
    aliasTokens,
    canonicalTokens,
    aliasCategories,
    canonicalCategories,
    categoryMismatch,
    tokenJaccard,
    stringSimilarity,
    coreOverlap,
  });

  if (aliasNorm && canonicalNorm && aliasNorm === canonicalNorm) {
    return {
      aliasId: params.aliasId?.trim() ?? null,
      aliasName,
      canonicalId: params.canonicalId?.trim() ?? null,
      canonicalName,
      confidence: 1,
      reasonFlags: [],
    };
  }

  if (compatible) {
    const confidence = Math.max(
      0.72,
      Math.min(1, tokenJaccard * 0.35 + stringSimilarity * 0.35 + coreOverlap * 0.3 + 0.15),
    );
    return {
      aliasId: params.aliasId?.trim() ?? null,
      aliasName,
      canonicalId: params.canonicalId?.trim() ?? null,
      canonicalName,
      confidence,
      reasonFlags: [],
    };
  }

  const reasonFlags: IngredientAliasIntegrityReason[] = [];
  if (categoryMismatch) {
    reasonFlags.push("category_token_mismatch");
  } else if (coreOverlap === 0 && tokenJaccard < 0.15 && stringSimilarity < 0.35) {
    if (tokenJaccard < 0.12) reasonFlags.push("low_token_jaccard");
    if (stringSimilarity < 0.3) reasonFlags.push("low_string_similarity");
  }

  let confidence = tokenJaccard * 0.35 + stringSimilarity * 0.35 + coreOverlap * 0.3;
  if (categoryMismatch) {
    confidence = Math.min(confidence, 0.12);
  } else {
    confidence = Math.min(confidence, 0.22);
  }
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    aliasId: params.aliasId?.trim() ?? null,
    aliasName,
    canonicalId: params.canonicalId?.trim() ?? null,
    canonicalName,
    confidence,
    reasonFlags,
  };
}

export function isVeryLowAliasMappingConfidence(confidence: number): boolean {
  return confidence < ALIAS_INTEGRITY_VERY_LOW_CONFIDENCE_THRESHOLD;
}

export function isSuspiciousIngredientAliasMapping(
  audit: Pick<IngredientAliasIntegrityAuditResult, "confidence" | "reasonFlags">,
): boolean {
  return isVeryLowAliasMappingConfidence(audit.confidence);
}

export function aliasIntegrityBadgeLabel(
  audit: Pick<IngredientAliasIntegrityAuditResult, "confidence" | "reasonFlags">,
): "Likely corrupted mapping" | "Very low semantic confidence" {
  if (audit.reasonFlags.includes("category_token_mismatch")) {
    return "Likely corrupted mapping";
  }
  return "Very low semantic confidence";
}

export function countSuspiciousIngredientAliasMappings(
  aliasNames: readonly string[],
  canonicalName: string,
): number {
  const canonical = canonicalName.trim();
  if (!canonical) return 0;
  let count = 0;
  for (const aliasName of aliasNames) {
    const trimmed = aliasName?.trim();
    if (!trimmed) continue;
    const audit = auditIngredientAliasMapping({ aliasName: trimmed, canonicalName: canonical });
    if (isSuspiciousIngredientAliasMapping(audit)) count += 1;
  }
  return count;
}

function scoreAliasAgainstCanonicalName(aliasName: string, canonicalName: string): number {
  const { aliasNorm, canonicalNorm } = normalizedPairForAudit(aliasName, canonicalName);
  if (!aliasNorm || !canonicalNorm) return 0;
  if (aliasNorm === canonicalNorm) return 1;
  const aliasTokens = tokenizeForAudit(aliasName, true);
  const canonicalTokens = tokenizeForAudit(canonicalName, false);
  const tokenJaccard = jaccardSimilarity(aliasTokens, canonicalTokens);
  const stringSimilarity = diceCoefficient(aliasNorm, canonicalNorm);
  return Math.max(tokenJaccard, stringSimilarity);
}

/**
 * Best alternate canonical for a suspicious alias (read-only suggestion for Catalog Review).
 */
export function suggestCanonicalIngredientForAlias(
  params: SuggestCanonicalForAliasParams,
): SuggestedCanonicalForAlias | null {
  const aliasName = params.aliasName?.trim() ?? "";
  const currentId = params.currentCanonicalId?.trim() ?? "";
  if (!aliasName || !currentId) return null;

  const catalog = filterCanonicalCatalogIngredients([...params.catalog]);
  const similarityIds = new Set(
    (params.similarityCandidateIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id && id !== currentId)),
  );

  let best: SuggestedCanonicalForAlias | null = null;

  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id || id === currentId) continue;
    const name = entry.name?.trim() || entry.normalized_name?.trim() || id;
    const score = scoreAliasAgainstCanonicalName(aliasName, name);
    if (score <= 0) continue;
    const source: SuggestedCanonicalForAlias["source"] = similarityIds.has(id)
      ? "similarity_candidate"
      : "token_overlap";
    if (!best || score > best.score || (score === best.score && source === "similarity_candidate")) {
      best = { ingredientId: id, displayName: name, score, source };
    }
  }

  if (best && best.score < 0.2) return null;
  return best;
}

export type IngredientAliasAuditRow = {
  id: string;
  ingredient_id: string;
  alias_name: string;
  normalized_alias: string | null;
};

export type IngredientAliasAuditCanonicalRow = {
  id: string;
  name: string;
};

/**
 * Audit all alias rows against their linked canonical display names (read-only).
 */
export function auditIngredientAliasRows(
  aliasRows: readonly IngredientAliasAuditRow[],
  canonicalById: ReadonlyMap<string, IngredientAliasAuditCanonicalRow>,
): IngredientAliasIntegrityAuditResult[] {
  const results: IngredientAliasIntegrityAuditResult[] = [];
  for (const row of aliasRows) {
    const aliasId = row.id?.trim();
    const canonicalId = row.ingredient_id?.trim();
    if (!aliasId || !canonicalId) continue;
    const canonical = canonicalById.get(canonicalId);
    const aliasName = row.alias_name?.trim() || row.normalized_alias?.trim() || "";
    const canonicalName = canonical?.name?.trim() || canonicalId;
    if (!aliasName) continue;
    results.push(
      auditIngredientAliasMapping({
        aliasId,
        aliasName,
        canonicalId,
        canonicalName,
      }),
    );
  }
  return results.sort((a, b) => a.confidence - b.confidence);
}
