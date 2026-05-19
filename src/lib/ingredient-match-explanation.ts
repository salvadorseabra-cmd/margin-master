import type {
  IngredientAliasMap,
  IngredientCanonicalMatch,
  IngredientCanonicalMatchKind,
} from "@/lib/ingredient-canonical";
import { buildIngredientAliasLookupKey } from "@/lib/ingredient-alias-lookup";

export type MatchConfidence = "high" | "suggested";

export type MatchReasoning = {
  headline: string;
  detail: string;
  confidence: MatchConfidence;
  confidenceLabel: string;
  caveats: string[];
};

export type MatchExplanationContext = {
  confirmedAliases?: IngredientAliasMap;
  supplierName?: string | null;
};

export type InvoiceIngredientDisplayState = "confirmed" | "suggested" | "unmatched";

export function isConfirmedIngredientMatch(
  match: Pick<IngredientCanonicalMatch, "kind"> | null | undefined,
): boolean {
  return match?.kind === "exact" || match?.kind === "confirmed-alias";
}

export function isSuggestedIngredientMatch(
  match: Pick<IngredientCanonicalMatch, "kind"> | null | undefined,
): boolean {
  return match?.kind === "semantic" || match?.kind === "operational-equivalent";
}

export function isInvoiceLineMatchedOrSuggested(
  match: IngredientCanonicalMatch | null | undefined,
): boolean {
  return isConfirmedIngredientMatch(match) || isSuggestedIngredientMatch(match);
}

export function resolveInvoiceIngredientDisplayState(
  match: IngredientCanonicalMatch | null | undefined,
): InvoiceIngredientDisplayState {
  if (!match) return "unmatched";
  if (isConfirmedIngredientMatch(match)) return "confirmed";
  if (isSuggestedIngredientMatch(match)) return "suggested";
  return "unmatched";
}

export function suggestedIngredientMatchBadgeLabel(kind: IngredientCanonicalMatchKind): string {
  return kind === "operational-equivalent"
    ? "possible operational equivalent"
    : "possible ingredient match";
}

export type InvoiceRowIngredientMatchState = {
  match: IngredientCanonicalMatch | null;
  displayState: InvoiceIngredientDisplayState;
  possibleMatch: IngredientCanonicalMatch | null;
  confirmedMatch: boolean;
  unmatched: boolean;
  showMatchTargetLine: boolean;
  badgeLabel: string | null;
};

/** Maps a canonical match to invoice-row presentation flags (no matching logic). */
export function getInvoiceRowIngredientMatchState(
  match: IngredientCanonicalMatch | null | undefined,
): InvoiceRowIngredientMatchState {
  const displayState = resolveInvoiceIngredientDisplayState(match);
  const resolvedMatch = match ?? null;
  return {
    match: resolvedMatch,
    displayState,
    possibleMatch: displayState === "suggested" ? resolvedMatch : null,
    confirmedMatch: displayState === "confirmed",
    unmatched: displayState === "unmatched",
    showMatchTargetLine: shouldShowMatchTargetLine(resolvedMatch),
    badgeLabel:
      displayState === "suggested" && resolvedMatch
        ? suggestedIngredientMatchBadgeLabel(resolvedMatch.kind)
        : null,
  };
}

const FORM_HINT_TOKENS = new Set([
  "fatiado",
  "fatiada",
  "fatiadas",
  "molho",
  "molhos",
  "congelado",
  "congelada",
  "fresco",
  "fresca",
  "ralado",
  "ralada",
  "cherry",
  "cereja",
  "cerejas",
  "triturado",
  "triturada",
  "polpa",
  "sliced",
  "frozen",
  "fresh",
  "grated",
]);

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

export function resolveConfirmedAliasScope(
  match: IngredientCanonicalMatch,
  aliases: IngredientAliasMap | undefined,
  supplierName?: string | null,
): "supplier" | "global" | null {
  if (match.kind !== "confirmed-alias" || !aliases) return null;
  const supplierKey = buildIngredientAliasLookupKey(match.normalizedItemName, supplierName);
  const isSupplierScopedKey = supplierKey.includes("::");
  if (isSupplierScopedKey && aliases[supplierKey] === match.ingredient.id) {
    return "supplier";
  }
  if (aliases[match.normalizedItemName] === match.ingredient.id) return "global";
  return null;
}

function deriveSemanticCaveats(match: IngredientCanonicalMatch): string[] {
  const caveats = new Set<string>(["requires human confirmation"]);
  const itemTokens = tokenSet(match.normalizedItemName);
  const ingredientTokens = tokenSet(match.normalizedIngredientName);

  if (match.normalizedItemName !== match.normalizedIngredientName) {
    caveats.add("commercial wording differs");
  }

  const symmetricDiff = [...itemTokens, ...ingredientTokens].filter(
    (token) => itemTokens.has(token) !== ingredientTokens.has(token),
  );
  if (symmetricDiff.some((token) => FORM_HINT_TOKENS.has(token))) {
    caveats.add("ingredient form differs");
  }

  const sharedCore = [...itemTokens].filter((token) => ingredientTokens.has(token));
  if (sharedCore.length > 0 && match.normalizedItemName !== match.normalizedIngredientName) {
    caveats.add("possible family overlap");
  }

  return [...caveats];
}

export function buildMatchExplanation(
  match: IngredientCanonicalMatch,
  context: MatchExplanationContext = {},
): MatchReasoning {
  if (match.kind === "confirmed-alias") {
    const scope = resolveConfirmedAliasScope(match, context.confirmedAliases, context.supplierName);
    if (scope === "supplier") {
      return {
        headline: "Matched by supplier history",
        detail:
          "This invoice line matches supplier-specific wording you confirmed on a previous purchase.",
        confidence: "high",
        confidenceLabel: "High confidence",
        caveats: [],
      };
    }
    return {
      headline: "Matched from previous confirmed purchase",
      detail: "Matched automatically from alias memory for this product wording.",
      confidence: "high",
      confidenceLabel: "High confidence",
      caveats: [],
    };
  }

  if (match.kind === "operational-equivalent") {
    const caveats = deriveSemanticCaveats(match);
    caveats.unshift("possible operational equivalent");
    return {
      headline: "Possible operational equivalent",
      detail:
        "Product family and preparation look aligned operationally, but wording differs enough that you should confirm before treating this as the same ingredient.",
      confidence: "suggested",
      confidenceLabel: "Suggested match",
      caveats,
    };
  }

  if (match.kind === "exact") {
    if (match.reason === "same core product identity and matching size") {
      return {
        headline: "Matched by ingredient family",
        detail:
          "Core product tokens and pack size align closely enough to treat this as the same ingredient.",
        confidence: "high",
        confidenceLabel: "High confidence",
        caveats: [],
      };
    }
    return {
      headline: "Matched by normalized ingredient identity",
      detail: "Invoice wording normalizes to the same ingredient identity in your catalog.",
      confidence: "high",
      confidenceLabel: "High confidence",
      caveats: [],
    };
  }

  const caveats = deriveSemanticCaveats(match);
  return {
    headline: "Matched by semantic similarity",
    detail:
      "Product wording is similar, but this match still needs your confirmation before it is treated as the same ingredient.",
    confidence: "suggested",
    confidenceLabel: "Suggested match",
    caveats,
  };
}

export function formatMatchReasoningTooltip(reasoning: MatchReasoning): string {
  const caveatText = reasoning.caveats.length > 0 ? ` ${reasoning.caveats.join(" · ")}.` : "";
  return `${reasoning.headline}. ${reasoning.detail}${caveatText}`;
}

export type MatchTargetLabel = {
  prefix: string;
  name: string;
};

export function shouldShowMatchTargetLine(
  match: Pick<IngredientCanonicalMatch, "ingredient"> | null | undefined,
): boolean {
  return Boolean(match?.ingredient?.id);
}

export function resolveMatchTargetDisplayName(
  match: Pick<IngredientCanonicalMatch, "ingredient">,
  catalogIngredient?: Pick<
    IngredientCanonicalMatch["ingredient"],
    "name" | "normalized_name"
  > | null,
): string | null {
  for (const candidate of [
    catalogIngredient?.name,
    match.ingredient.name,
    catalogIngredient?.normalized_name,
    match.ingredient.normalized_name,
  ]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function matchTargetLabelPrefix(
  kind: IngredientCanonicalMatchKind,
  aliasScope: "supplier" | "global" | null,
): string {
  if (kind === "confirmed-alias") {
    return aliasScope === "supplier" ? "Using existing ingredient:" : "Alias of:";
  }
  return "Matched to:";
}

export function buildMatchTargetLabel(
  match: Pick<IngredientCanonicalMatch, "kind" | "ingredient" | "normalizedItemName">,
  context: MatchExplanationContext = {},
  catalogIngredient?: Pick<
    IngredientCanonicalMatch["ingredient"],
    "name" | "normalized_name"
  > | null,
): MatchTargetLabel | null {
  if (!shouldShowMatchTargetLine(match)) return null;

  const name = resolveMatchTargetDisplayName(match, catalogIngredient) ?? "Unnamed ingredient";

  const aliasScope =
    match.kind === "confirmed-alias"
      ? resolveConfirmedAliasScope(
          match as IngredientCanonicalMatch,
          context.confirmedAliases,
          context.supplierName,
        )
      : null;

  return {
    prefix: matchTargetLabelPrefix(match.kind, aliasScope),
    name,
  };
}

export function formatMatchTargetLabel(label: MatchTargetLabel): string {
  return `${label.prefix} ${label.name}`;
}
