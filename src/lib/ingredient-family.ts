/**
 * Operational ingredient families for catalog intelligence — grouping only, never merge.
 * Canonical ids and recipe links stay unchanged.
 */

import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  normalizeSupplierShorthand,
  traceSupplierTokenExpansions,
} from "@/lib/ingredient-operational-aliases";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import { getIngredientFamilyOverride } from "@/lib/ingredient-family-storage";

export type IngredientFamilyId =
  | "frozen_potato"
  | "burger_bread"
  | "sliced_cheese"
  | "cheese_sauce"
  | "bacon_products"
  | "soft_drinks"
  | "cooking_oil"
  | "leafy_greens"
  | "ketchup"
  | "burger_meat"
  | "chicken_products";

export type IngredientFamilyConfidence = "high" | "medium" | "low";

export type IngredientFamilyClassification = {
  familyId: IngredientFamilyId;
  label: string;
  confidence: IngredientFamilyConfidence;
  reasons: string[];
  relatedIngredientIds?: string[];
};

export type IngredientAliasRow = { aliasName: string };

export type ClassifyIngredientFamilyInput = {
  ingredient: Pick<IngredientCanonicalInput, "id" | "name" | "normalized_name">;
  catalog?: readonly IngredientCanonicalInput[];
  aliasRows?: readonly IngredientAliasRow[] | readonly string[];
  supplierKey?: string | null;
  /** Supplier invoice category / department hint (when available). */
  supplierCategory?: string | null;
  userId?: string | null;
};

export type RelatedIngredientByFamily = {
  id: string;
  name: string;
  displayName: string;
};

export const INGREDIENT_FAMILY_LABELS: Record<IngredientFamilyId, string> = {
  frozen_potato: "Frozen potato products",
  burger_bread: "Burger bread & buns",
  sliced_cheese: "Sliced cheese",
  cheese_sauce: "Cheese sauce & dispensers",
  bacon_products: "Bacon products",
  soft_drinks: "Soft drinks",
  cooking_oil: "Cooking oil",
  leafy_greens: "Leafy greens & salads",
  ketchup: "Ketchup",
  burger_meat: "Burger meat & patties",
  chicken_products: "Breaded chicken & fillets",
};

type FamilyDefinition = {
  id: IngredientFamilyId;
  phrases: readonly string[];
  supplierCategoryKeywords?: readonly string[];
};

const DIACRITIC_RE = /\p{M}/gu;
const QUANTITY_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)\b/gi;
const ATTACHED_QTY_RE = /\b\d+(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs)\b/gi;
const GRID_CUT_PLACEHOLDER = "__grid9x9__";

const FAMILY_REGISTRY: Record<IngredientFamilyId, FamilyDefinition> = {
  frozen_potato: {
    id: "frozen_potato",
    phrases: [
      "batata shoestring",
      "batata shoestr",
      "batata palha",
      "batata frita",
      "batatas fritas",
      "batata wedge",
      "batata wedges",
      "batata wdg",
      "bat shoe",
      "bat shoestr",
      "bat wdg",
      "bat pal",
      "bat fries",
      "shoestring fries",
      "potato sticks",
      "batata sticks",
      "steakhouse fries",
      "frozen fries",
      "french fries",
      "hash brown",
      "hashbrown",
      "palha snack",
      "batata snack",
      "9x9",
      "9 x 9",
      "batata 9x9",
      "corte fino",
    ],
    supplierCategoryKeywords: [
      "batata congelada",
      "batatas congeladas",
      "frozen potato",
      "frozen fries",
      "batatas fritas",
    ],
  },
  burger_bread: {
    id: "burger_bread",
    phrases: [
      "pao de batata",
      "pao batata",
      "batata bread",
      "potato bread",
      "pao hamburger",
      "pao hamburguer",
      "hamburger bun",
      "burger bun",
      "sesame bun",
      "brioche bun",
      "brioche artesanal",
      "brioche gourmet",
    ],
    supplierCategoryKeywords: ["pao", "paes", "panificacao", "bakery", "bread"],
  },
  sliced_cheese: {
    id: "sliced_cheese",
    phrases: [
      "queijo cheddar fatiado",
      "cheddar fatiado",
      "cheddar slices",
      "cheddar sliced",
      "fatias burger",
      "cheddar fatias",
    ],
    supplierCategoryKeywords: ["queijo fatiado", "sliced cheese"],
  },
  cheese_sauce: {
    id: "cheese_sauce",
    phrases: [
      "molho cheddar",
      "cheddar sauce",
      "cheese sauce",
      "nacho cheese",
      "ched top",
      "cheddar top",
      "molho cheddar dispenser",
    ],
    supplierCategoryKeywords: ["molho", "sauce dispenser"],
  },
  bacon_products: {
    id: "bacon_products",
    phrases: [
      "bacon fatiado",
      "bacon fumado",
      "bacon streaky",
      "bac fat",
      "bac strk",
      "bac fum",
      "streaky bacon",
      "smoked bacon",
    ],
    supplierCategoryKeywords: ["bacon", "charcutaria"],
  },
  soft_drinks: {
    id: "soft_drinks",
    phrases: [
      "coca cola",
      "coca-cola",
      "pepsi",
      "fanta",
      "sprite",
      "sumol",
      "ice tea",
      "iced tea",
      "refrigerante",
      "soft drink",
    ],
    supplierCategoryKeywords: ["bebidas", "refrigerantes", "soft drinks", "sodas"],
  },
  cooking_oil: {
    id: "cooking_oil",
    phrases: [
      "oleo fritura",
      "oleo de girassol",
      "oleo girassol",
      "sunflower oil",
      "frying oil",
      "oleo alimentar",
    ],
    supplierCategoryKeywords: ["oleos", "oleo", "oil"],
  },
  leafy_greens: {
    id: "leafy_greens",
    phrases: [
      "alface",
      "lettuce",
      "rucula",
      "arugula",
      "mix salada",
      "salada mista",
      "iceberg",
      "folhas verdes",
    ],
    supplierCategoryKeywords: ["saladas", "verduras", "horticolas", "leafy"],
  },
  ketchup: {
    id: "ketchup",
    phrases: ["ketchup", "catchup", "catsup"],
    supplierCategoryKeywords: ["ketchup", "condimentos"],
  },
  burger_meat: {
    id: "burger_meat",
    phrases: [
      "hamburguer bovino",
      "hamburger bovino",
      "hamburger patty",
      "angus patty",
      "smash patty",
      "smash burger",
      "burger meat",
    ],
    supplierCategoryKeywords: ["carne bovina", "hamburguer", "burger meat"],
  },
  chicken_products: {
    id: "chicken_products",
    phrases: [
      "frango panado",
      "chicken breaded",
      "chk breaded",
      "nuggets frango",
      "chicken nuggets",
      "filete panado",
    ],
    supplierCategoryKeywords: ["frango", "panados", "chicken"],
  },
};

const PHRASE_TO_FAMILY: { phrase: string; familyId: IngredientFamilyId }[] = Object.values(
  FAMILY_REGISTRY,
)
  .flatMap((def) => def.phrases.map((phrase) => ({ phrase, familyId: def.id })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

const FROZEN_POTATO_CUT_TOKENS = new Set([
  "9x9",
  "shoe",
  "shoestr",
  "shoestring",
  "wdg",
  "wedge",
  "wedges",
  "pal",
  "palha",
  "fries",
  "frita",
  "fritas",
  "hashbrown",
  "hashbrowns",
]);

const BURGER_BREAD_SIGNAL_TOKENS = new Set([
  "bun",
  "brioche",
  "brch",
  "pao",
  "ses",
  "sesamo",
  "sesame",
]);

const SUPPLIER_CATEGORY_TO_FAMILY: { keyword: string; familyId: IngredientFamilyId }[] =
  Object.values(FAMILY_REGISTRY)
    .flatMap((def) =>
      (def.supplierCategoryKeywords ?? []).map((keyword) => ({
        keyword,
        familyId: def.id,
      })),
    )
    .sort((a, b) => b.keyword.length - a.keyword.length);

function preserveGridCutToken(s: string): string {
  return s
    .replace(/\b9\s*x\s*9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `)
    .replace(/\b9x9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `);
}

function restoreGridCutToken(s: string): string {
  return s.replace(new RegExp(GRID_CUT_PLACEHOLDER, "g"), "9x9");
}

function stripForFamily(raw: string): string {
  let s = raw.normalize("NFD").replace(DIACRITIC_RE, "").toLowerCase();
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(QUANTITY_RE, " ");
  s = s.replace(ATTACHED_QTY_RE, " ");
  s = preserveGridCutToken(s);
  s = s.replace(/\b\d+\b/g, " ");
  s = restoreGridCutToken(s);
  return s.replace(/\s+/g, " ").trim();
}

function phraseMatches(normalized: string, phrase: string): boolean {
  if (!phrase) return false;
  if (normalized === phrase) return true;
  const padded = ` ${normalized} `;
  return padded.includes(` ${phrase} `);
}

function aliasNamesFromRows(
  aliasRows: ClassifyIngredientFamilyInput["aliasRows"],
): string[] {
  if (!aliasRows?.length) return [];
  return aliasRows
    .map((row) => (typeof row === "string" ? row : row.aliasName))
    .map((name) => name.trim())
    .filter(Boolean);
}

function detectFamilyFromTokenRules(normalized: string): {
  familyId: IngredientFamilyId;
  reason: string;
} | null {
  if (!normalized) return null;
  if (phraseMatches(normalized, "pao de batata") || phraseMatches(normalized, "pao batata")) {
    return {
      familyId: "burger_bread",
      reason: "Bread product tokens (pão de batata) — distinct from frozen fries",
    };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const hasBatata = tokens.includes("batata") || tokens.includes("bat");
  const hasCut = tokens.some((token) => FROZEN_POTATO_CUT_TOKENS.has(token));
  const hasBreadSignal = tokens.some((token) => BURGER_BREAD_SIGNAL_TOKENS.has(token));

  if (hasBatata && hasCut) {
    return {
      familyId: "frozen_potato",
      reason: "Batata + frozen cut token (shoestring, palha, wedge, frita, etc.)",
    };
  }
  if (hasBreadSignal && !hasCut) {
    return { familyId: "burger_bread", reason: "Bun / brioche / pão tokens without fry cut" };
  }

  if (tokens.includes("bacon") || tokens.includes("bac")) {
    return { familyId: "bacon_products", reason: "Bacon product tokens" };
  }

  return null;
}

function detectFamilyFromPhrases(
  normalizedSurfaces: string[],
): { familyId: IngredientFamilyId; phrase: string } | null {
  for (const normalized of normalizedSurfaces) {
    for (const { phrase, familyId } of PHRASE_TO_FAMILY) {
      if (phraseMatches(normalized, phrase)) return { familyId, phrase };
    }
  }
  return null;
}

function detectFamilyFromSupplierCategory(
  supplierCategory: string | null | undefined,
): { familyId: IngredientFamilyId; keyword: string } | null {
  const normalized = stripForFamily(supplierCategory ?? "");
  if (!normalized) return null;
  for (const { keyword, familyId } of SUPPLIER_CATEGORY_TO_FAMILY) {
    if (phraseMatches(normalized, stripForFamily(keyword))) {
      return { familyId, keyword };
    }
  }
  return null;
}

type ScoredCandidate = {
  familyId: IngredientFamilyId;
  confidence: IngredientFamilyConfidence;
  reasons: string[];
};

function mergeCandidate(
  candidates: ScoredCandidate[],
  next: ScoredCandidate,
): ScoredCandidate[] {
  const existing = candidates.find((c) => c.familyId === next.familyId);
  if (!existing) return [...candidates, next];
  existing.reasons = [...new Set([...existing.reasons, ...next.reasons])];
  if (
    next.confidence === "high" ||
    (next.confidence === "medium" && existing.confidence === "low")
  ) {
    existing.confidence = next.confidence;
  }
  return candidates;
}

function scoreSurfaces(
  rawSurfaces: string[],
  supplierKey: string | null | undefined,
  supplierCategory: string | null | undefined,
): { candidates: ScoredCandidate[]; expansionReasons: string[] } {
  let candidates: ScoredCandidate[] = [];
  const expansionReasons: string[] = [];
  const normalizedSurfaces: string[] = [];

  for (const raw of rawSurfaces) {
    if (!raw?.trim()) continue;
    const rawNormalized = stripForFamily(raw);
    const expanded = normalizeSupplierShorthand(raw, { supplierKey });
    const expandedNormalized = stripForFamily(expanded || raw);
    const trace = traceSupplierTokenExpansions(raw, { supplierKey });
    const traceNormalized = stripForFamily(trace.expanded);

    for (const surface of [rawNormalized, expandedNormalized, traceNormalized].filter(Boolean)) {
      normalizedSurfaces.push(surface);
    }

    for (const token of trace.tokens) {
      if (token.raw === token.expanded) continue;
      expansionReasons.push(`Token expansion: ${token.reason}`);
    }
  }

  const phraseHit = detectFamilyFromPhrases(normalizedSurfaces);
  if (phraseHit) {
    candidates = mergeCandidate(candidates, {
      familyId: phraseHit.familyId,
      confidence: "high",
      reasons: [`Phrase match: “${phraseHit.phrase}”`],
    });
  }

  for (const normalized of normalizedSurfaces) {
    const tokenHit = detectFamilyFromTokenRules(normalized);
    if (tokenHit) {
      candidates = mergeCandidate(candidates, {
        familyId: tokenHit.familyId,
        confidence: "high",
        reasons: [tokenHit.reason],
      });
    }
  }

  const categoryHit = detectFamilyFromSupplierCategory(supplierCategory);
  if (categoryHit) {
    candidates = mergeCandidate(candidates, {
      familyId: categoryHit.familyId,
      confidence: "medium",
      reasons: [`Supplier category hint: “${categoryHit.keyword}”`],
    });
  }

  return { candidates, expansionReasons: [...new Set(expansionReasons)] };
}

function pickBestCandidate(candidates: ScoredCandidate[]): ScoredCandidate | null {
  if (candidates.length === 0) return null;
  const rank: Record<IngredientFamilyConfidence, number> = { high: 3, medium: 2, low: 1 };
  return [...candidates].sort((a, b) => {
    const conf = rank[b.confidence] - rank[a.confidence];
    if (conf !== 0) return conf;
    return b.reasons.length - a.reasons.length;
  })[0]!;
}

/**
 * Classify operational family for one catalog ingredient. Does not mutate ids or recipes.
 */
export function classifyIngredientFamily(
  input: ClassifyIngredientFamilyInput,
): IngredientFamilyClassification | null {
  const ingredientId = input.ingredient.id?.trim();
  if (!ingredientId) return null;

  const overrideRaw = getIngredientFamilyOverride(input.userId ?? undefined, ingredientId);
  const override = overrideRaw as IngredientFamilyId | null;
  if (override && INGREDIENT_FAMILY_LABELS[override]) {
    const related = input.catalog
      ? findRelatedByFamily(input.catalog, override, ingredientId).map((r) => r.id)
      : undefined;
    return {
      familyId: override,
      label: INGREDIENT_FAMILY_LABELS[override],
      confidence: "high",
      reasons: ["Saved family override for this ingredient"],
      relatedIngredientIds: related,
    };
  }

  const rawSurfaces = [
    input.ingredient.name,
    input.ingredient.normalized_name,
    ...aliasNamesFromRows(input.aliasRows),
  ].filter((s): s is string => Boolean(s?.trim()));

  const { candidates, expansionReasons } = scoreSurfaces(
    rawSurfaces,
    input.supplierKey,
    input.supplierCategory,
  );
  const best = pickBestCandidate(candidates);
  if (!best) return null;

  const reasons = [...best.reasons];
  if (expansionReasons.length > 0) {
    reasons.push(...expansionReasons);
  }

  const related = input.catalog
    ? findRelatedByFamily(input.catalog, best.familyId, ingredientId).map((r) => r.id)
    : undefined;

  return {
    familyId: best.familyId,
    label: INGREDIENT_FAMILY_LABELS[best.familyId],
    confidence: best.confidence,
    reasons: [...new Set(reasons)],
    relatedIngredientIds: related,
  };
}

/** Catalog siblings in the same operational family (separate canonical ids). */
export function findRelatedByFamily(
  catalog: readonly IngredientCanonicalInput[],
  familyId: IngredientFamilyId,
  excludeId?: string,
): RelatedIngredientByFamily[] {
  const exclude = excludeId?.trim();
  const related: RelatedIngredientByFamily[] = [];

  for (const entry of catalog) {
    const id = entry.id?.trim();
    if (!id || id === exclude) continue;
    const classification = classifyIngredientFamily({ ingredient: entry });
    if (classification?.familyId !== familyId) continue;
    const name = entry.name?.trim() || entry.normalized_name?.trim() || id;
    related.push({
      id,
      name,
      displayName: formatCanonicalIngredientDisplayName(name),
    });
  }

  return related.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
}

export function ingredientFamilyIdForName(
  name: string,
  options?: Pick<ClassifyIngredientFamilyInput, "supplierKey" | "supplierCategory" | "aliasRows">,
): IngredientFamilyId | null {
  return classifyIngredientFamily({
    ingredient: { id: "__probe__", name, normalized_name: normalizeIngredientName(name) },
    ...options,
  })?.familyId ?? null;
}
