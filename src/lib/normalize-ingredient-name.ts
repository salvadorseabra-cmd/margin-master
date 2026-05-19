/**
 * Uppercase ingredient name normalization for stable invoice-line matching candidates.
 *
 * Strips accents, pack sizes, unit tokens, and common retailer/commercial wording while
 * keeping product identity tokens (e.g. variety names like ICEBERG).
 *
 * Not wired into invoice matching yet — see {@link normalizeInvoiceIngredientName} for the
 * conservative path used in production matching today.
 */

const DIACRITIC_RE = /\p{M}/gu;

/** Multi-word phrases removed as retailer / marketing noise (matched after uppercasing). */
const COMMERCIAL_PHRASES = [
  "FOOD SERVICE",
  "PINGO DOCE",
  "TOP DOWN",
  "CONTINENTE",
  "PREMIUM",
  "AUCHAN",
  "RAMA",
] as const;

/** Standalone pack / count unit tokens (not attached to a number). */
const STANDALONE_PACKAGING_UNITS = new Set([
  "KG",
  "KGS",
  "G",
  "GR",
  "GRS",
  "MG",
  "ML",
  "CL",
  "L",
  "LT",
  "UN",
  "UNI",
  "UNID",
]);

/** Product-form descriptors that are not variety/brand identity on invoice lines. */
const PRODUCT_FORM_TOKENS = new Set(["INTEIRA", "INTEIRO", "INTEIRAS", "INTEIROS"]);

/** `570G`, `2 KG`, `1,5L`, etc. */
const QUANTITY_WITH_UNIT_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:KG|KGS|G|GR|GRS|MG|ML|CL|L|LT|UN|UNI|UNID)\b/gi;

/** `570G` without a space between digits and unit. */
const ATTACHED_QUANTITY_UNIT_RE = /\b\d+(?:KG|KGS|G|GR|GRS|MG|ML|CL|L|LT)\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(DIACRITIC_RE, "");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function removeCommercialPhrases(value: string): string {
  let out = value;
  const phrases = [...COMMERCIAL_PHRASES].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const pattern = phrase
      .split(/\s+/)
      .map((part) => escapeRegExp(part))
      .join("\\s+");
    out = out.replace(new RegExp(`\\b${pattern}\\b`, "g"), " ");
  }
  return out;
}

function removePackagingTokens(value: string): string {
  const stripped = value
    .replace(QUANTITY_WITH_UNIT_RE, " ")
    .replace(ATTACHED_QUANTITY_UNIT_RE, " ");
  const tokens = stripped.split(/\s+/).filter(Boolean);
  return tokens.filter((token) => !STANDALONE_PACKAGING_UNITS.has(token)).join(" ");
}

function removeProductFormTokens(value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.filter((token) => !PRODUCT_FORM_TOKENS.has(token)).join(" ");
}

/**
 * Normalize a noisy supplier invoice ingredient name into a stable matching candidate.
 *
 * @example
 * normalizeIngredientName("Ketchup Heinz Top Down 570g") // "KETCHUP HEINZ"
 */
export function normalizeIngredientName(input: string): string {
  let value = stripAccents(input).toUpperCase();
  value = collapseWhitespace(value);
  value = removeCommercialPhrases(value);
  value = removePackagingTokens(value);
  value = removeProductFormTokens(value);
  return collapseWhitespace(value);
}

/** Documented input/output pairs for manual checks and tests. */
export const NORMALIZE_INGREDIENT_NAME_EXAMPLES = [
  { input: "KETCHUP HEINZ TOP DOWN 570G", output: "KETCHUP HEINZ" },
  { input: "BATATA PALHA CONTINENTE 2KG", output: "BATATA PALHA" },
  { input: "ALFACE ICEBERG INTEIRA", output: "ALFACE ICEBERG" },
  { input: "Queijo São Jorge Premium 1 KG", output: "QUEIJO SAO JORGE" },
] as const;
