import {
  buildCatalogIngredientIdentity,
  formatCanonicalIngredientDisplayName,
  stripCatalogSupplierPackPhrases,
  type CatalogIngredientIdentity,
} from "@/lib/canonical-ingredient-display-name";
import { looksLikeInvoiceShorthandName } from "@/lib/ingredient-kind";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  normalizeSupplierShorthand,
  OPERATIONAL_ALIASES,
  type ExpandSupplierTokensOptions,
  traceSupplierTokenExpansions,
  type SupplierTokenExpansionTrace,
} from "@/lib/ingredient-operational-aliases";

export type { ExpandSupplierTokensOptions, SupplierTokenExpansionTrace };
export { traceSupplierTokenExpansions };
import { normalizeIngredientName } from "@/lib/normalizeIngredient";

const BARE_WEIGHT_CONTEXT = new Set([
  "angus",
  "batata",
  "bovino",
  "breaded",
  "brioche",
  "bun",
  "burger",
  "cheddar",
  "chicken",
  "frito",
  "hamburguer",
  "palha",
  "patty",
  "shoestring",
  "smash",
  "wedges",
]);

const BREAD_PREFIX_SKIP = /\b(pao|pão|bread|bun)\b/i;

/**
 * Expand supplier invoice tokens to operational words (deterministic, not LLM).
 * Wraps {@link normalizeSupplierShorthand} with catalog-oriented context fixes.
 */
export function expandSupplierAbbreviations(
  text: string | null | undefined,
  options?: ExpandSupplierTokensOptions,
): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "";

  let expanded = normalizeSupplierShorthand(trimmed, options);
  expanded = applyStandalonePalhaContext(expanded, trimmed);
  expanded = attachGramSuffixToBareWeights(expanded);
  expanded = applyBriocheBreadPrefix(expanded);
  return expanded.replace(/\s+/g, " ").trim();
}

function applyStandalonePalhaContext(expanded: string, original: string): string {
  const expandedTokens = expanded.toLowerCase().split(/\s+/).filter(Boolean);
  if (expandedTokens.length === 1 && expandedTokens[0] === "palha") {
    return "batata palha";
  }
  const originalUpper = original.toUpperCase();
  if (
    expandedTokens.length === 1 &&
    expandedTokens[0] === "palha" &&
    /\bPALHA\b/.test(originalUpper) &&
    !/\bBAT\b/.test(originalUpper)
  ) {
    return "batata palha";
  }
  return expanded;
}

function attachGramSuffixToBareWeights(expanded: string): string {
  const tokens = expanded.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return expanded;

  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const bareWeight = token.match(/^(\d{2,3})$/);
    if (!bareWeight) {
      out.push(token);
      continue;
    }
    const prev = out[out.length - 1]?.toLowerCase().replace(/[^a-z0-9]/g, "");
    const next = tokens[i + 1]?.toLowerCase();
    const hasWeightContext =
      (prev && BARE_WEIGHT_CONTEXT.has(prev)) ||
      (next && BARE_WEIGHT_CONTEXT.has(next.replace(/[^a-z]/g, "")));
    if (hasWeightContext) {
      out.push(`${bareWeight[1]}g`);
      continue;
    }
    out.push(token);
  }
  return out.join(" ");
}

function applyBriocheBreadPrefix(expanded: string): string {
  const lower = expanded.toLowerCase();
  if (!/\bbrioche\b/.test(lower)) return expanded;
  if (BREAD_PREFIX_SKIP.test(expanded)) return expanded;
  return `pão ${expanded}`;
}

/**
 * Human-readable operational catalog label from invoice/shorthand raw text.
 */
export function generateOperationalIngredientName(
  raw: string | null | undefined,
  options?: ExpandSupplierTokensOptions,
): string {
  const trimmed = raw?.trim() ?? "";
  const preprocessed = stripCatalogSupplierPackPhrases(trimmed) || trimmed;
  const expanded = expandSupplierAbbreviations(preprocessed, options);
  if (!expanded) return "";
  return formatCanonicalIngredientDisplayName(expanded);
}

/**
 * Resolve persisted catalog identity from supplier shorthand or legacy polluted names.
 */
export function normalizeCanonicalRootIngredientName(
  raw: string | null | undefined,
): CatalogIngredientIdentity {
  const operational = generateOperationalIngredientName(raw);
  const source = operational || raw?.trim() || "";
  return buildCatalogIngredientIdentity(source);
}

export type CanonicalRootNameRepairSuggestion = {
  ingredientId: string;
  currentName: string;
  suggestedName: string;
  suggestedNormalizedName: string;
  reason: "invoice_shorthand" | "operational_expansion";
};

/**
 * Suggest a safe catalog name repair (name + normalized_name only).
 */
export function suggestCanonicalRootNameRepair(
  ingredient: Pick<IngredientCanonicalInput, "id" | "name" | "normalized_name">,
): CanonicalRootNameRepairSuggestion | null {
  const id = ingredient.id?.trim();
  const currentName = ingredient.name?.trim() ?? "";
  if (!id || !currentName) return null;

  const identity = normalizeCanonicalRootIngredientName(currentName);
  if (!identity.name || !identity.normalized_name) return null;

  const currentIdentity = buildCatalogIngredientIdentity(currentName);
  const unchanged =
    identity.name === currentIdentity.name &&
    identity.normalized_name === currentIdentity.normalized_name;
  if (unchanged && !looksLikeInvoiceShorthandName(currentName)) return null;

  const reason: CanonicalRootNameRepairSuggestion["reason"] = isInvoiceShorthandPollution(
    currentName,
  )
    ? "invoice_shorthand"
    : "operational_expansion";

  if (unchanged && reason !== "invoice_shorthand") return null;

  return {
    ingredientId: id,
    currentName,
    suggestedName: identity.name,
    suggestedNormalizedName: identity.normalized_name,
    reason,
  };
}

function hasResolvableSupplierAliasToken(raw: string): boolean {
  const tokens = raw.match(/[a-zA-Z]+(?:'[a-zA-Z]+)?/gi) ?? [];
  return tokens.some((token) => {
    const key = token.toLowerCase();
    const mapped = OPERATIONAL_ALIASES[key];
    return mapped != null && mapped !== key;
  });
}

/** True when raw text is supplier abbreviations that must not be saved as catalog name. */
export function looksLikeSupplierAbbreviatedCatalogName(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return false;

  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upperRatio =
    letters.length > 0 ? (trimmed.match(/[A-Z]/g) ?? []).length / letters.length : 0;

  if (looksLikeInvoiceShorthandName(trimmed)) return true;
  if (upperRatio >= 0.82 && looksLikeInvoiceShorthandName(trimmed.toUpperCase())) return true;
  if (!hasResolvableSupplierAliasToken(trimmed)) return false;

  const expanded = expandSupplierAbbreviations(trimmed);
  const fold = (value: string) => normalizeIngredientName(value);
  return fold(expanded) !== fold(trimmed);
}

export function shouldBlockCanonicalNameOnCreate(raw: string | null | undefined): boolean {
  const name = raw?.trim() ?? "";
  if (!name) return true;
  return looksLikeInvoiceShorthandName(name) || looksLikeSupplierAbbreviatedCatalogName(name);
}

function isInvoiceShorthandPollution(name: string): boolean {
  return looksLikeInvoiceShorthandName(name) || looksLikeSupplierAbbreviatedCatalogName(name);
}
