/**
 * Conservative supplier shorthand → operational tokens (deterministic, whole-token only).
 * Applied before {@link normalizeInvoiceIngredientName} in invoice ingredient matching.
 */

import {
  lookupSupplierTokenExpansion,
} from "@/lib/ingredient-supplier-expansion-memory";

export type OperationalTokenExpansionConfidence = "high" | "medium" | "low";

export type OperationalTokenExpansionSource =
  | "dictionary"
  | "supplier_memory"
  | "fuzzy"
  | "preserved";

export type OperationalTokenExpansion = {
  raw: string;
  expanded: string;
  confidence: OperationalTokenExpansionConfidence;
  source: OperationalTokenExpansionSource;
  /** Human-readable trace, e.g. "BAT → Batata". */
  reason: string;
};

export type SupplierTokenExpansionTrace = {
  input: string;
  expanded: string;
  tokens: OperationalTokenExpansion[];
};

export type ExpandSupplierTokensOptions = {
  supplierKey?: string | null;
};

export const OPERATIONAL_ALIASES: Record<string, string> = {
  /** PT beef-cut signals (acem vazia novilho). */
  acem: "acem",
  ang: "angus",
  angus: "angus",
  bac: "bacon",
  bat: "batata",
  bbq: "bbq",
  box: "box",
  brch: "brioche",
  brd: "breaded",
  breaded: "breaded",
  bun: "bun",
  bur: "burger",
  burg: "burger",
  caixa: "caixa",
  chk: "chicken",
  ched: "cheddar",
  cong: "cong",
  cx: "cx",
  disp: "dispenser",
  dn: "top down",
  emb: "emb",
  fat: "fatiado",
  fin: "fino",
  flt: "fatiado",
  fran: "frango",
  frango: "frango",
  fres: "fres",
  fum: "fumado",
  gr: "gr",
  hmb: "hamburguer",
  ketch: "ketchup",
  kraft: "kraft",
  maio: "maionese",
  mol: "molho",
  novilho: "novilho",
  on: "onion",
  oni: "onion",
  oreg: "orégãos",
  pack: "pack",
  pal: "palha",
  palha: "palha",
  pickl: "pickles",
  pkl: "pickles",
  pty: "patty",
  ring: "rings",
  rng: "rings",
  ses: "sesamo",
  slc: "fatiados",
  slcd: "fatiados",
  smk: "smoked",
  smash: "smash",
  shoe: "shoestring",
  shoestr: "shoestring",
  shoestrings: "shoestring",
  shoestring: "shoestring",
  strk: "streaky",
  top: "top",
  vazia: "vazia",
  wdg: "wedges",
};

/** Operational shorthand kept intact in readable catalog names (see canonical-ingredient-quality). */
export const PROTECTED_OPERATIONAL_SHORTHAND = [
  "s/",
  "c/",
  "kg",
  "gr",
  "cx",
  "emb",
  "un",
  "uni",
  "fat",
  "fum",
  "cong",
  "fres",
] as const;

const SUPPLIER_TOKEN_RE =
  /\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)?|\d+|s\/|c\/|[a-zA-ZÀ-ÿ]+(?:'[a-zA-ZÀ-ÿ]+)?/gi;

const PRESERVED_NUMERIC_TOKEN_RE =
  /^\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|cl|l|lt|lts|ltr|ltrs|un|uni|unid)?$/i;

function isPreservedNumericToken(token: string): boolean {
  return PRESERVED_NUMERIC_TOKEN_RE.test(token);
}

/** Merge `9 x 9` / `9X9` OCR splits into a single grid-cut token. */
function mergeGridCutTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i]!;
    const separator = tokens[i + 1];
    const trailing = tokens[i + 2];
    if (
      /^\d+$/i.test(current) &&
      separator?.toLowerCase() === "x" &&
      trailing &&
      /^\d+$/i.test(trailing)
    ) {
      out.push(`${current}x${trailing}`);
      i += 2;
      continue;
    }
    out.push(current);
  }
  return out;
}

export function tokenizeSupplierLine(text: string): string[] {
  return mergeGridCutTokens(text.match(SUPPLIER_TOKEN_RE) ?? []);
}

function levenshteinWithinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) return levenshteinWithinOne(b, a);

  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else {
      j += 1;
    }
  }
  return edits + (b.length - j) <= 1;
}

function fuzzyDictionaryExpansion(token: string): string | null {
  const key = token.toLowerCase();
  if (key.length < 4 || !/[a-z]/i.test(key)) return null;

  let bestKey: string | null = null;
  for (const aliasKey of Object.keys(OPERATIONAL_ALIASES)) {
    if (aliasKey === key) continue;
    if (!levenshteinWithinOne(key, aliasKey)) continue;
    if (!bestKey || aliasKey.length < bestKey.length) {
      bestKey = aliasKey;
    }
  }
  return bestKey ? OPERATIONAL_ALIASES[bestKey]! : null;
}

function displayTokenForReason(expanded: string): string {
  const trimmed = expanded.trim();
  if (!trimmed) return trimmed;
  if (/^\d/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildExpansionReason(raw: string, expanded: string): string {
  if (raw === expanded) return raw;
  return `${raw} → ${displayTokenForReason(expanded)}`;
}

function isProtectedSlashShorthandToken(token: string): boolean {
  const lower = token.toLowerCase();
  return lower === "s/" || lower === "c/";
}

function expandOperationalToken(
  token: string,
  options?: ExpandSupplierTokensOptions,
): OperationalTokenExpansion {
  if (isProtectedSlashShorthandToken(token)) {
    return {
      raw: token,
      expanded: token,
      confidence: "high",
      source: "preserved",
      reason: token,
    };
  }

  if (isPreservedNumericToken(token)) {
    return {
      raw: token,
      expanded: token,
      confidence: "high",
      source: "preserved",
      reason: token,
    };
  }

  const key = token.toLowerCase();
  const supplierHit = lookupSupplierTokenExpansion(options?.supplierKey, token);
  if (supplierHit) {
    return {
      raw: token,
      expanded: supplierHit,
      confidence: "high",
      source: "supplier_memory",
      reason: buildExpansionReason(token, supplierHit),
    };
  }

  if (Object.hasOwn(OPERATIONAL_ALIASES, key)) {
    const dictionaryHit = OPERATIONAL_ALIASES[key]!;
    return {
      raw: token,
      expanded: dictionaryHit,
      confidence: "high",
      source: "dictionary",
      reason:
        dictionaryHit !== key || token !== dictionaryHit
          ? buildExpansionReason(token, dictionaryHit)
          : token,
    };
  }

  const fuzzyHit = fuzzyDictionaryExpansion(token);
  if (fuzzyHit) {
    return {
      raw: token,
      expanded: fuzzyHit,
      confidence: "medium",
      source: "fuzzy",
      reason: buildExpansionReason(token, fuzzyHit),
    };
  }

  return {
    raw: token,
    expanded: token,
    confidence: "low",
    source: "preserved",
    reason: token,
  };
}

/**
 * Per-token supplier shorthand expansion with confidence and trace metadata.
 */
export function traceSupplierTokenExpansions(
  text: string | null | undefined,
  options?: ExpandSupplierTokensOptions,
): SupplierTokenExpansionTrace {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return { input: "", expanded: "", tokens: [] };
  }

  const tokens = tokenizeSupplierLine(trimmed).map((token) =>
    expandOperationalToken(token, options),
  );
  const expanded = tokens
    .flatMap((hit) => hit.expanded.split(/\s+/).filter(Boolean))
    .join(" ");
  return { input: trimmed, expanded, tokens };
}

/**
 * Expands supplier shorthand tokens while preserving pack sizes and standalone numbers.
 *
 * @example normalizeSupplierShorthand("PICKL SLC 1KG") → "pickles fatiados 1KG"
 */
export function normalizeSupplierShorthand(
  text: string | null | undefined,
  options?: ExpandSupplierTokensOptions,
): string {
  return traceSupplierTokenExpansions(text, options).expanded;
}

/** @deprecated Use {@link traceSupplierTokenExpansions} — same data, clearer name. */
export function expandSupplierTokens(
  text: string | null | undefined,
  options?: ExpandSupplierTokensOptions,
): SupplierTokenExpansionTrace {
  return traceSupplierTokenExpansions(text, options);
}

export function operationalAliasCount(): number {
  return Object.keys(OPERATIONAL_ALIASES).length;
}
