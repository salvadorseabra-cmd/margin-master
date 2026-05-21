import { normalizeIngredientName } from "@/lib/normalizeIngredient";

const DISPLAY_LOCALE = "pt-PT";

/** Known catalog acronyms kept uppercase in display labels. */
const DISPLAY_ACRONYM_ALLOWLIST = new Set([
  "BBQ",
  "IPA",
  "PET",
  "PVC",
  "S",
  "M",
  "L",
  "UHT",
  "XL",
]);

/** Standalone glove / apparel size tokens normalized to uppercase in catalog identity. */
const CATALOG_SIZE_TOKENS = new Set(["s", "m", "l", "xl"]);

const DIACRITIC_RE = /\p{M}/gu;

/** Multi-word supplier/pack phrases stripped from catalog identity (longest first). */
const CATALOG_NOISE_PHRASES = [
  "food service",
  "pingo doce",
  "top down",
  "oliveira da serra",
  "continente",
  "auchan",
] as const;

/** Product identity tokens that must never be dropped during catalog cleanup. */
const CATALOG_PRODUCT_IDENTITY_TOKENS = new Set(["batata", "palha", "frita", "wedges", "shoestring"]);

/** Standalone packaging / channel tokens removed from catalog identity names. */
const CATALOG_NOISE_TOKENS = new Set([
  "dispensador",
  "service",
  "snack",
  "food",
  "continente",
  "auchan",
  "premium",
  "rama",
  "top",
  "down",
  "calve",
  "guloso",
  "heinz",
  "cx",
  "caixa",
  "caixas",
  "pack",
  "packs",
]);

const DIMENSION_TOKEN_RE = /^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)$/i;

/** Bulk purchase volumes stripped from identity; beverage serving sizes (cl, <2L) are kept. */
const BULK_ATTACHED_KG_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs)\b|\b\d+(?:[.,]\d+)?(?:kg|kgs)\b/gi;

const BULK_ATTACHED_LITER_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|ltr|ltrs)\b|\b(\d+(?:[.,]\d+)?)(?:l|lt|lts|ltr|ltrs)\b/gi;

const COUNT_PACK_RE =
  /\b\d+\s*(?:un|und|unds|unid|unids|unit|units|pc|pcs)\b|\b\d+un\b/gi;

/** Parentheses that only carry pack / case counts (not product identity). */
const PACKAGING_ONLY_PAREN_RE =
  /\(\s*(?:pack\s*\d+|\d+\s*un|\d+un|cx\s*\d+|caixa\s*\d+|c\/\s*\d+)\s*\)/gi;

const PACK_COUNT_PHRASE_RE = /\bpack\s*\d+\b/gi;
const C_PER_COUNT_RE = /\bc\/\s*\d+\b/gi;
const CX_COUNT_PHRASE_RE = /\b(?:cx|caixa|caixas)\s*\d+\b/gi;

const OPERATIONAL_GRAM_RE = /\b(\d{2,3})\s*(?:g|gr|grs)\b|\b(\d{2,3})(?:g|gr|grs)\b/gi;

const DIMENSION_CAPTURE_RE = /\b(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\b/g;

type PreservedToken = { placeholder: string; value: string };

function stripAccentsLower(value: string): string {
  return value.normalize("NFD").replace(DIACRITIC_RE, "").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCompactNumericPrefix(compact: string): number | null {
  const match = compact.match(/^(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return Number.parseFloat(match[1].replace(",", "."));
}

/** Beverage / single-serve format kept on catalog identity (25cl, 33cl, 1.5L). */
function isServingFormatToken(token: string): boolean {
  const compact = token.toLowerCase().replace(/\s+/g, "");
  if (/^\d+(?:[.,]\d+)?cl$/.test(compact)) return true;
  const liter = compact.match(/^(\d+(?:[.,]\d+)?)(?:l|lt|lts|ltr|ltrs)$/);
  if (!liter) return false;
  const liters = parseCompactNumericPrefix(liter[1]);
  return liters != null && liters > 0 && liters < 2;
}

function isPackSizeWeightToken(token: string): boolean {
  const compact = token.toLowerCase().replace(/\s+/g, "");
  if (isServingFormatToken(token)) return false;
  return /^\d+(?:[.,]\d+)?(?:kg|kgs)$/.test(compact);
}

function isBulkLiterAttachedValue(numeric: string): boolean {
  const liters = Number.parseFloat(numeric.replace(",", "."));
  return Number.isFinite(liters) && liters >= 2;
}

function removeBulkAttachedLiters(value: string): string {
  return value.replace(BULK_ATTACHED_LITER_RE, (match, spaced, attached) => {
    const numeric = (spaced ?? attached ?? "").trim();
    return numeric && isBulkLiterAttachedValue(numeric) ? " " : match;
  });
}

function removePackagingPhrases(value: string): string {
  return value
    .replace(PACKAGING_ONLY_PAREN_RE, " ")
    .replace(PACK_COUNT_PHRASE_RE, " ")
    .replace(C_PER_COUNT_RE, " ")
    .replace(CX_COUNT_PHRASE_RE, " ");
}

function normalizeCatalogSizeToken(token: string): string {
  if (CATALOG_SIZE_TOKENS.has(stripAccentsLower(token))) {
    return token.toLocaleUpperCase(DISPLAY_LOCALE);
  }
  return token;
}

function isOperationalGramToken(token: string): boolean {
  const compact = token.toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
  if (isPackSizeWeightToken(compact)) return false;
  return /^\d{2,3}(?:g|gr|grs)?$/.test(compact);
}

function isDimensionToken(token: string): boolean {
  const compact = token.replace(/\s+/g, "");
  return DIMENSION_TOKEN_RE.test(compact);
}

function removeCatalogNoisePhrases(value: string): string {
  let out = value;
  const phrases = [...CATALOG_NOISE_PHRASES].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const pattern = phrase
      .split(/\s+/)
      .map((part) => escapeRegExp(part))
      .join("\\s+");
    out = out.replace(new RegExp(`\\b${pattern}\\b`, "gi"), " ");
  }
  return out;
}

function preserveOperationalTokens(input: string): { text: string; preserved: PreservedToken[] } {
  const preserved: PreservedToken[] = [];
  let text = input;
  let index = 0;

  const stash = (value: string) => {
    const placeholder = `__CATID${index++}__`;
    preserved.push({ placeholder, value });
    return placeholder;
  };

  text = text.replace(DIMENSION_CAPTURE_RE, (match, a, b) =>
    stash(`${String(a).replace(",", ".")}x${String(b).replace(",", ".")}`),
  );

  text = text.replace(OPERATIONAL_GRAM_RE, (match) => {
    const compact = match.replace(/\s+/g, "").replace(/,/g, ".");
    if (!isOperationalGramToken(compact)) return match;
    return stash(compact);
  });

  return { text, preserved };
}

function restorePreservedTokens(text: string, preserved: PreservedToken[]): string {
  let out = text;
  for (const { placeholder, value } of preserved) {
    out = out.replace(new RegExp(placeholder, "g"), value);
  }
  return out;
}

function shouldDropCatalogToken(token: string, contextTokens: string[]): boolean {
  if (!token) return true;
  if (isOperationalGramToken(token)) return false;
  if (isDimensionToken(token)) return false;

  const lower = stripAccentsLower(token);
  if (CATALOG_PRODUCT_IDENTITY_TOKENS.has(lower)) return false;
  if (lower === "palha" && contextTokens.some((t) => stripAccentsLower(t) === "batata")) {
    return false;
  }
  if (CATALOG_NOISE_TOKENS.has(lower)) return true;

  const compact = lower.replace(/\s+/g, "");
  if (isServingFormatToken(token)) return false;
  if (/^\d+(?:[.,]\d+)?(?:kg|kgs|l|lt|lts|ltr|ltrs|ml)$/.test(compact)) return true;
  if (/^\d+(?:un|und|unid)$/.test(compact)) return true;
  if (/^\d+f$/i.test(compact)) return true;
  if (/^\d+$/.test(compact)) return true;

  return false;
}

/**
 * Strip pack/purchase noise from a catalog ingredient identity string.
 * Preserves operational gram weights (90g vs 180g) and dimension tokens (33x33).
 * Does not touch invoice aliases, matcher keys, or OCR text.
 */
export function cleanCanonicalIngredientNameForCatalog(
  raw: string | null | undefined,
): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";

  const { text: withPlaceholders, preserved } = preserveOperationalTokens(trimmed);
  let text = withPlaceholders;
  text = removePackagingPhrases(text);
  text = removeCatalogNoisePhrases(text);
  text = text.replace(BULK_ATTACHED_KG_RE, " ");
  text = removeBulkAttachedLiters(text);
  text = text.replace(COUNT_PACK_RE, " ");

  const rawTokens = text.split(/\s+/).filter(Boolean);
  const tokens = rawTokens
    .filter((token) => !shouldDropCatalogToken(token, rawTokens))
    .map(normalizeCatalogSizeToken);
  let cleaned = restorePreservedTokens(tokens.join(" "), preserved);
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned || trimmed;
}

/** Suggested catalog identity after semantic cleanup (not title-cased). */
export function suggestCanonicalIngredientIdentityName(
  raw: string | null | undefined,
): string {
  return cleanCanonicalIngredientNameForCatalog(raw);
}

export type CatalogIngredientIdentity = {
  /** Title-cased catalog label for UI and `ingredients.name`. */
  name: string;
  /** Lowercase accent-stripped key for `ingredients.normalized_name` (full product identity). */
  normalized_name: string;
};

/**
 * Resolve persisted catalog identity from user-confirmed input.
 * Display cleanup strips pack/supplier noise; normalized_name keeps product tokens (e.g. batata + palha).
 * Does not apply invoice-matcher synonyms (palha → frita).
 */
export function buildCatalogIngredientIdentity(
  raw: string | null | undefined,
): CatalogIngredientIdentity {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { name: "", normalized_name: "" };

  const cleaned = cleanCanonicalIngredientNameForCatalog(trimmed) || trimmed;
  const name = formatCanonicalIngredientDisplayName(trimmed);
  const normalized_name = normalizeIngredientName(cleaned);
  return { name, normalized_name };
}

function formatDimensionToken(word: string): string | null {
  const dim = word.match(/^(\d+(?:[.,]\d+)?)[xX](\d+(?:[.,]\d+)?)$/);
  if (dim) return `${dim[1]}x${dim[2]}`;

  const size = word.match(/^(\d+(?:[.,]\d+)?)([a-zA-Z]+)$/);
  if (!size) return null;

  const numeric = size[1];
  const unit = size[2];
  if (/^l$/i.test(unit)) return `${numeric}L`;
  return `${numeric}${unit.toLowerCase()}`;
}

function isDisplayAcronym(word: string): boolean {
  if (!/^[A-Z]+$/.test(word)) return false;
  if (DISPLAY_ACRONYM_ALLOWLIST.has(word)) return true;
  return word.length >= 2 && word.length <= 3;
}

function isAlreadyDisplayCased(word: string): boolean {
  return /^[\p{L}][\p{Ll}]*$/u.test(word);
}

function formatWordForDisplay(word: string, isFirstWord: boolean): string {
  if (!word) return word;

  const dimension = formatDimensionToken(word);
  if (dimension) return dimension;
  if (isDisplayAcronym(word)) return word;

  if (!isFirstWord && isAlreadyDisplayCased(word)) return word.toLocaleLowerCase(DISPLAY_LOCALE);

  const lower = word.toLocaleLowerCase(DISPLAY_LOCALE);
  if (!lower) return word;

  if (isFirstWord) {
    return lower.charAt(0).toLocaleUpperCase(DISPLAY_LOCALE) + lower.slice(1);
  }
  return lower;
}

function formatDisplayToken(token: string, isFirstWord: boolean): string {
  if (!token) return token;
  const parts = token.split(/([/-])/);
  let first = isFirstWord;
  return parts
    .map((part) => {
      if (part === "/" || part === "-") return part;
      const formatted = formatWordForDisplay(part, first);
      first = false;
      return formatted;
    })
    .join("");
}

/**
 * Human-readable canonical ingredient label for UI only.
 * Applies catalog identity cleanup then title case.
 * Does not affect matcher keys, alias memory, or invoice line raw text.
 */
export function formatCanonicalIngredientDisplayName(
  raw: string | null | undefined,
): string {
  const cleaned = cleanCanonicalIngredientNameForCatalog(raw);
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/);
  return words
    .map((word, index) => formatDisplayToken(word, index === 0))
    .join(" ");
}
