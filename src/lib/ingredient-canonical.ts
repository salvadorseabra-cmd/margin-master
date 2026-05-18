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

const PACKAGING_WORD_RE =
  /\b(caixa|caixas|cx|pack|packs|un|und|unds|unid|unids|unit|units|pc|pcs)\b/i;
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

function normalizeQuantity(raw: string) {
  return raw.replace(",", ".").replace(/\.0+$/, "");
}

function stripAccentsLowerForInvoiceName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeUnitTokens(s: string) {
  return s
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(kgs?|kg)\.?\b/gi, (_match, qty) => {
      return `${normalizeQuantity(String(qty))}kg`;
    })
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(grs?|g)\.?\b/gi, (_match, qty) => {
      return `${normalizeQuantity(String(qty))}g`;
    })
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(ml)\.?\b/gi, (_match, qty) => {
      return `${normalizeQuantity(String(qty))}ml`;
    })
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(cl)\.?\b/gi, (_match, qty) => {
      return `${normalizeQuantity(String(qty))}cl`;
    })
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(lt|lts|ltr|ltrs|l)\.?\b/gi, (_match, qty) => {
      return `${normalizeQuantity(String(qty))}l`;
    });
}

/**
 * Conservative invoice-name normalization for matching only.
 *
 * This preserves product semantics and size tokens such as `180g` because those
 * are operationally meaningful for stock and pack understanding. It only removes
 * obvious outer-pack wording when it is separated from the product name.
 */
export function normalizeInvoiceIngredientName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = stripAccentsLowerForInvoiceName(raw);
  s = normalizeUnitTokens(s);
  s = s.replace(/\(([^)]*)\)/g, (match, inner) => {
    const normalizedInner = normalizeUnitTokens(stripAccentsLowerForInvoiceName(String(inner)));
    return PACKAGING_WORD_RE.test(normalizedInner) ? " " : ` ${match.replace(/[()]/g, " ")} `;
  });
  s = s.replace(
    /\b(?:caixa|caixas|cx|pack|packs)\s*\d+\s*(?:un|und|unds|unid|unids|unit|units)?\b/gi,
    " ",
  );
  s = s.replace(/\b\d+\s*(?:un|und|unds|unid|unids|unit|units|pc|pcs)\b/gi, " ");
  s = s.replace(
    /\b(?:caixa|caixas|cx|pack|packs|un|und|unds|unid|unids|unit|units|pc|pcs)\b/gi,
    " ",
  );
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = normalizeUnitTokens(s);
  return s.replace(/\s+/g, " ").trim();
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

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  const coverage = overlap / Math.min(aTokens.size, bTokens.size);
  const stringSimilarity = diceCoefficient([...aTokens].join(" "), [...bTokens].join(" "));

  // Keep the threshold intentionally high: this is a suggestion layer, not an
  // auto-merge path, and false ingredient links are operationally expensive.
  return coverage >= 0.67 && stringSimilarity >= 0.58 ? (coverage + stringSimilarity) / 2 : 0;
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

  return bestScore >= 0.72 ? best : null;
}
