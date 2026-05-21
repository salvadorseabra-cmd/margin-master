/**
 * Invoice ingredient name normalization for matching (lowercase, accent-stripped).
 *
 * Used by {@link normalizeInvoiceIngredientName} before fuzzy / semantic matching.
 * Strips pack sizes, retailer noise, and applies conservative abbreviations and synonyms
 * while keeping product identity tokens (e.g. iceberg, girassol).
 */

const DIACRITIC_RE = /\p{M}/gu;

const PACKAGING_WORD_RE =
  /\b(caixa|caixas|cx|pack|packs|un|und|unds|unid|unids|unit|units|pc|pcs)\b/i;

/** Multi-word phrases removed after accent strip (longest first). */
const COMMERCIAL_PHRASES = [
  "food service",
  "pingo doce",
  "top down",
  "oliveira da serra",
  "continente",
  "premium",
  "auchan",
  "rama",
] as const;

/** Standalone marketing / pack / brand tokens (not product identity). */
const COMMERCIAL_TOKENS = new Set([
  "premium",
  "mix",
  "rama",
  "inteira",
  "inteiro",
  "inteiras",
  "inteiros",
  "service",
  "top",
  "down",
  "corte",
  "fino",
  "snack",
  "food",
  "continente",
  "auchan",
  "calve",
  "guloso",
  "heinz",
]);

const PRODUCT_FORM_TOKENS = new Set(["inteira", "inteiro", "inteiras", "inteiros"]);

const STANDALONE_PACKAGING_UNITS = new Set([
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
]);

const QUANTITY_WITH_UNIT_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)\b/gi;

const ATTACHED_QUANTITY_UNIT_RE = /\b\d+(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs)\b/gi;

const OUTER_PACK_RE =
  /\b(?:caixa|caixas|cx|pack|packs)\s*\d+\s*(?:un|und|unds|unid|unids|unit|units)?\b/gi;

const COUNT_PACK_RE = /\b\d+\s*(?:un|und|unds|unid|unids|unit|units|pc|pcs)\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAccentsLower(value: string): string {
  return value.normalize("NFD").replace(DIACRITIC_RE, "").toLowerCase();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Word-boundary abbreviations applied before punctuation is stripped. */
function expandAbbreviations(value: string): string {
  return value.replace(/\btom\.\b/g, "tomate ").replace(/\btom\b/g, "tomate");
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

const GRID_CUT_PLACEHOLDER = "__grid9x9__";

function preserveGridCutToken(value: string): string {
  return value
    .replace(/\b9\s*x\s*9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `)
    .replace(/\b9x9\b/gi, ` ${GRID_CUT_PLACEHOLDER} `);
}

function restoreGridCutToken(value: string): string {
  return value.replace(new RegExp(GRID_CUT_PLACEHOLDER, "g"), "9x9");
}

function removePackagingQuantities(value: string): string {
  let s = value
    .replace(QUANTITY_WITH_UNIT_RE, " ")
    .replace(ATTACHED_QUANTITY_UNIT_RE, " ");
  s = preserveGridCutToken(s);
  s = s.replace(/\b\d+\b/g, " ");
  return restoreGridCutToken(s);
}

function filterTokens(tokens: string[], exclude: Set<string>): string[] {
  return tokens.filter((token) => token.length > 0 && !exclude.has(token));
}

function applyConservativeSynonyms(tokens: string[]): string[] {
  const hasBatata = tokens.includes("batata");
  const out: string[] = [];

  for (const token of tokens) {
    if (token === "cereja") {
      out.push("cherry");
      continue;
    }
    if (token === "palha") {
      if (hasBatata || out.includes("batata")) {
        out.push("frita");
      } else {
        out.push("batata", "frita");
      }
      continue;
    }
    out.push(token);
  }

  return out;
}

/** Alias persistence keys: keep product-form tokens (palha vs frita), still expand cereja→cherry. */
function applyAliasMemorySynonyms(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    if (token === "cereja") {
      out.push("cherry");
      continue;
    }
    out.push(token);
  }
  return out;
}

type InvoiceNameNormalizeMode = "match" | "alias_memory";

function normalizeInvoiceNameCore(raw: string, mode: InvoiceNameNormalizeMode): string {
  let value = stripAccentsLower(raw);
  value = expandAbbreviations(value);
  value = stripPackagingParentheticals(value);
  value = stripOuterPackWording(value);
  value = value.replace(/[^a-z0-9\s]+/g, " ");
  value = collapseWhitespace(value);
  value = removeCommercialPhrases(value);
  value = removePackagingQuantities(value);

  let tokens = filterTokens(value.split(/\s+/), STANDALONE_PACKAGING_UNITS);
  tokens = filterTokens(tokens, COMMERCIAL_TOKENS);
  tokens = filterTokens(tokens, PRODUCT_FORM_TOKENS);
  tokens =
    mode === "alias_memory" ? applyAliasMemorySynonyms(tokens) : applyConservativeSynonyms(tokens);

  return collapseWhitespace(tokens.join(" "));
}

function stripOuterPackWording(value: string): string {
  let s = value;
  s = s.replace(OUTER_PACK_RE, " ");
  s = s.replace(COUNT_PACK_RE, " ");
  s = s.replace(
    /\b(?:caixa|caixas|cx|pack|packs|un|und|unds|unid|unids|unit|units|pc|pcs)\b/g,
    " ",
  );
  return s;
}

function stripPackagingParentheticals(value: string): string {
  return value.replace(/\(([^)]*)\)/g, (match, inner) => {
    const normalizedInner = stripAccentsLower(String(inner));
    return PACKAGING_WORD_RE.test(normalizedInner) ? " " : ` ${match.replace(/[()]/g, " ")} `;
  });
}

/**
 * Normalize a noisy supplier invoice line name for ingredient matching.
 *
 * @example
 * normalizeInvoiceMatchIngredientName("TOM. CHERRY RAMA 250GR") // "tomate cherry"
 */
export function normalizeInvoiceMatchIngredientName(raw: string): string {
  return normalizeInvoiceNameCore(raw, "match");
}

/**
 * Line-specific key for ingredient_aliases / confirmed alias map.
 * Strips pack and retailer noise like match normalization but does not collapse
 * distinct potato forms (palha vs frita) into one shared bucket.
 */
export function normalizeInvoiceAliasMemoryKey(raw: string): string {
  return normalizeInvoiceNameCore(raw, "alias_memory");
}

/** @deprecated Use {@link normalizeInvoiceMatchIngredientName}; kept for tests that expect uppercase. */
export function normalizeIngredientName(input: string): string {
  return normalizeInvoiceMatchIngredientName(input).toUpperCase();
}

/** Documented input/output pairs for manual checks and tests. */
export const NORMALIZE_INGREDIENT_NAME_EXAMPLES = [
  { input: "KETCHUP GULOSO TOP DOWN 570G", output: "ketchup" },
  { input: "BATATA PALHA 2KG SERVICE", output: "batata frita" },
  { input: "ALFACE ICEBERG INTEIRA", output: "alface iceberg" },
  { input: "MAIONESE CALVE TOP DOWN 450ML", output: "maionese" },
] as const;

/** User-requested supermarket wording cases (invoice match path). */
export const INVOICE_MATCH_NORMALIZATION_EXAMPLES = [
  { input: "TOM CHERRY MIX 250GR", output: "tomate cherry" },
  { input: "TOMATE CEREJA PREMIUM", output: "tomate cherry" },
  { input: "TOM. CHERRY RAMA", output: "tomate cherry" },
  { input: "ALFACE ICEBERG INTEIRA", output: "alface iceberg" },
  { input: "MAIONESE CALVE TOP DOWN 450ML", output: "maionese" },
  { input: "KETCHUP GULOSO TOP DOWN 570G", output: "ketchup" },
  { input: "ÓLEO GIRASSOL OLIVEIRA DA SERRA 1L", output: "oleo girassol" },
  { input: "BATATA PALHA 2KG SERVICE", output: "batata frita" },
  { input: "BATATA FRITA CORTE FINO 2KG", output: "batata frita" },
  { input: "PALHA SNACK FOOD SERVICE 2KG", output: "batata frita" },
] as const;
