import {
  normalizeInvoiceIngredientName,
  type IngredientCanonicalInput,
  type IngredientCanonicalMatch,
  type IngredientCanonicalMatchKind,
} from "@/lib/ingredient-canonical";
import {
  getInvoiceRowIngredientMatchState,
  suggestedIngredientMatchBadgeLabel,
  shouldShowMatchTargetLine,
  type InvoiceIngredientDisplayState,
  type InvoiceRowIngredientMatchState,
} from "@/lib/ingredient-match-explanation";
import type { InvoiceItemMatchRow, InvoiceItemMatchStatus } from "@/lib/invoice-item-match-types";
import {
  buildPersistedMatchSnapshot,
  buildVirtualMatchSnapshot,
  compareVirtualAndPersistedMatch,
  type DualReadComparisonResult,
} from "@/lib/invoice-item-match-dual-read";
import {
  isMatchLifecycleDualReadLogEnabled,
  isMatchLifecycleReadCutoverEnabled,
} from "@/lib/match-lifecycle-flags";

export const READ_CUTOVER_LOG_PREFIX = "[match-lifecycle-read-cutover]";

export type PersistedMatchForCutover = Pick<
  InvoiceItemMatchRow,
  "ingredient_id" | "status" | "match_kind"
>;

export type ReadCutoverOutcome =
  | "persisted_hit"
  | "fallback_hit"
  | "missing_record"
  | "mismatch";

export type InvoiceTableRowMatchCutoverContext = {
  invoiceItemId?: string;
  /** undefined = cutover context not provided; null = loaded but no row */
  persistedMatch?: PersistedMatchForCutover | null;
  /** Shadow seed / validation must pass false to keep virtual-only resolution. */
  useReadCutover?: boolean;
};

export type ReadCutoverMetrics = {
  total: number;
  persistedHits: number;
  fallbackHits: number;
  missingRecords: number;
  mismatches: number;
  intentionalStatusDrift: number;
};

const CANONICAL_MATCH_KINDS = new Set<string>([
  "confirmed-override",
  "confirmed-alias",
  "exact",
  "operational-memory",
  "operational-alias",
  "semantic",
  "operational-equivalent",
]);

export function matchStatusToDisplayState(
  status: InvoiceItemMatchStatus,
): InvoiceIngredientDisplayState {
  if (status === "confirmed") return "confirmed";
  if (status === "suggested") return "suggested";
  return "unmatched";
}

export function persistedMatchKindToCanonicalKind(
  matchKind: string | null | undefined,
  status: InvoiceItemMatchStatus,
): IngredientCanonicalMatchKind {
  if (matchKind && CANONICAL_MATCH_KINDS.has(matchKind)) {
    return matchKind as IngredientCanonicalMatchKind;
  }
  if (status === "confirmed") return "confirmed-override";
  if (status === "suggested") return "semantic";
  return "exact";
}

export function findIngredientInCatalog(
  ingredientId: string | null | undefined,
  catalog: readonly IngredientCanonicalInput[],
): IngredientCanonicalInput | null {
  const trimmed = ingredientId?.trim();
  if (!trimmed) return null;
  return catalog.find((row) => row.id?.trim() === trimmed) ?? null;
}

export function buildCanonicalMatchFromPersistedRecord(
  persisted: PersistedMatchForCutover,
  itemName: string,
  catalog: readonly IngredientCanonicalInput[],
): IngredientCanonicalMatch | null {
  if (persisted.status === "unmatched") return null;

  const ingredientId = persisted.ingredient_id?.trim();
  if (!ingredientId) return null;

  const ingredient =
    findIngredientInCatalog(ingredientId, catalog) ??
    ({
      id: ingredientId,
      name: null,
      normalized_name: null,
    } satisfies IngredientCanonicalInput);

  const normalizedItemName = normalizeInvoiceIngredientName(itemName);
  const normalizedIngredientName =
    ingredient.normalized_name?.trim() ||
    normalizeInvoiceIngredientName(ingredient.name ?? "");

  return {
    ingredient,
    normalizedItemName,
    normalizedIngredientName,
    kind: persistedMatchKindToCanonicalKind(persisted.match_kind, persisted.status),
    reason: "persisted match record",
    scoreBreakdown: {},
  };
}

export function getInvoiceRowMatchStateFromPersisted(
  persisted: PersistedMatchForCutover,
  match: IngredientCanonicalMatch | null,
): InvoiceRowIngredientMatchState {
  const displayState = matchStatusToDisplayState(persisted.status);
  const resolvedMatch = displayState === "unmatched" ? null : match;

  return {
    match: resolvedMatch,
    displayState,
    possibleMatch: displayState === "suggested" ? resolvedMatch : null,
    confirmedMatch: displayState === "confirmed",
    unmatched: displayState === "unmatched",
    showMatchTargetLine: resolvedMatch ? shouldShowMatchTargetLine(resolvedMatch) : false,
    badgeLabel:
      displayState === "suggested" && resolvedMatch
        ? suggestedIngredientMatchBadgeLabel(resolvedMatch.kind)
        : null,
  };
}

export function buildPersistedMatchMapFromRows(
  rows: readonly Pick<InvoiceItemMatchRow, "invoice_item_id" | "ingredient_id" | "status" | "match_kind">[],
): Map<string, PersistedMatchForCutover> {
  const map = new Map<string, PersistedMatchForCutover>();
  for (const row of rows) {
    map.set(row.invoice_item_id, {
      ingredient_id: row.ingredient_id,
      status: row.status,
      match_kind: row.match_kind,
    });
  }
  return map;
}

export function shouldApplyReadCutover(context?: InvoiceTableRowMatchCutoverContext): boolean {
  if (!isMatchLifecycleReadCutoverEnabled()) return false;
  if (context?.useReadCutover === false) return false;
  return true;
}

export function shouldLogReadCutoverDiagnostics(): boolean {
  return isMatchLifecycleReadCutoverEnabled() || isMatchLifecycleDualReadLogEnabled();
}

export function logReadCutoverDiagnostic(
  outcome: ReadCutoverOutcome,
  details: {
    invoiceItemId?: string;
    itemName?: string;
    comparison?: DualReadComparisonResult | null;
  },
): void {
  if (!shouldLogReadCutoverDiagnostics()) return;

  const idPart = details.invoiceItemId ? ` item=${details.invoiceItemId}` : "";
  const namePart = details.itemName ? ` name="${details.itemName}"` : "";
  const comparison = details.comparison;

  if (outcome === "mismatch" && comparison) {
    console.warn(
      `${READ_CUTOVER_LOG_PREFIX} mismatch${idPart}${namePart} alignment=${comparison.alignment} drift=[${comparison.driftKinds.join(",")}]`,
    );
    return;
  }

  if (outcome === "missing_record") {
    console.info(`${READ_CUTOVER_LOG_PREFIX} missing_record${idPart}${namePart}`);
    return;
  }

  if (outcome === "fallback_hit") {
    console.info(`${READ_CUTOVER_LOG_PREFIX} fallback_hit${idPart}${namePart}`);
    return;
  }

  if (outcome === "persisted_hit") {
    if (comparison?.intentionalStatusDrift) {
      console.info(
        `${READ_CUTOVER_LOG_PREFIX} persisted_hit${idPart}${namePart} intentional_status_drift=true`,
      );
      return;
    }
    console.info(`${READ_CUTOVER_LOG_PREFIX} persisted_hit${idPart}${namePart}`);
  }
}

function comparePersistedCutoverVsVirtual(
  invoiceItemId: string | undefined,
  virtualMatch: IngredientCanonicalMatch | null,
  persisted: PersistedMatchForCutover,
): DualReadComparisonResult {
  return compareVirtualAndPersistedMatch({
    invoiceItemId: invoiceItemId ?? "unknown",
    virtual: buildVirtualMatchSnapshot(virtualMatch),
    persisted: buildPersistedMatchSnapshot(persisted),
  });
}

export function buildCutoverContextForInvoiceItem(
  itemId: string,
  persistedMatchByItemId?: ReadonlyMap<string, PersistedMatchForCutover>,
): InvoiceTableRowMatchCutoverContext | undefined {
  if (!persistedMatchByItemId) return undefined;
  return {
    invoiceItemId: itemId,
    persistedMatch: persistedMatchByItemId.get(itemId) ?? null,
  };
}

export function resolveReadCutoverMatch(params: {
  itemName: string;
  ingredientCatalog: readonly IngredientCanonicalInput[];
  virtualMatch: IngredientCanonicalMatch | null;
  virtualState: InvoiceRowIngredientMatchState;
  cutover?: InvoiceTableRowMatchCutoverContext;
}): {
  match: IngredientCanonicalMatch | null;
  state: InvoiceRowIngredientMatchState;
  outcome?: ReadCutoverOutcome;
} {
  const { itemName, ingredientCatalog, virtualMatch, virtualState, cutover } = params;

  if (!shouldApplyReadCutover(cutover)) {
    return { match: virtualMatch, state: virtualState };
  }

  if (cutover?.persistedMatch === undefined) {
    return { match: virtualMatch, state: virtualState };
  }

  const invoiceItemId = cutover.invoiceItemId;
  const persisted = cutover.persistedMatch;

  if (persisted === null) {
    const comparison = compareVirtualAndPersistedMatch({
      invoiceItemId: invoiceItemId ?? "unknown",
      virtual: buildVirtualMatchSnapshot(virtualMatch),
      persisted: null,
    });
    logReadCutoverDiagnostic("missing_record", { invoiceItemId, itemName, comparison });
    return {
      match: virtualMatch,
      state: virtualState,
      outcome: "missing_record",
    };
  }

  const persistedMatch = buildCanonicalMatchFromPersistedRecord(
    persisted,
    itemName,
    ingredientCatalog,
  );
  const persistedState = getInvoiceRowMatchStateFromPersisted(persisted, persistedMatch);
  const comparison = comparePersistedCutoverVsVirtual(invoiceItemId, virtualMatch, persisted);

  if (comparison.alignment === "drifted" && !comparison.intentionalStatusDrift) {
    logReadCutoverDiagnostic("mismatch", { invoiceItemId, itemName, comparison });
    return {
      match: persistedMatch,
      state: persistedState,
      outcome: "mismatch",
    };
  }

  if (comparison.intentionalStatusDrift) {
    logReadCutoverDiagnostic("persisted_hit", { invoiceItemId, itemName, comparison });
    return {
      match: persistedMatch,
      state: persistedState,
      outcome: "persisted_hit",
    };
  }

  logReadCutoverDiagnostic("persisted_hit", { invoiceItemId, itemName, comparison });
  return {
    match: persistedMatch,
    state: persistedState,
    outcome: "persisted_hit",
  };
}

export function aggregateReadCutoverMetrics(
  outcomes: readonly (ReadCutoverOutcome | undefined)[],
  comparisons: readonly DualReadComparisonResult[],
): ReadCutoverMetrics {
  let persistedHits = 0;
  let fallbackHits = 0;
  let missingRecords = 0;
  let mismatches = 0;
  let intentionalStatusDrift = 0;

  for (const outcome of outcomes) {
    switch (outcome) {
      case "persisted_hit":
        persistedHits += 1;
        break;
      case "fallback_hit":
        fallbackHits += 1;
        break;
      case "missing_record":
        missingRecords += 1;
        fallbackHits += 1;
        break;
      case "mismatch":
        mismatches += 1;
        persistedHits += 1;
        break;
      default:
        break;
    }
  }

  for (const comparison of comparisons) {
    if (comparison.intentionalStatusDrift) intentionalStatusDrift += 1;
  }

  return {
    total: outcomes.length,
    persistedHits,
    fallbackHits,
    missingRecords,
    mismatches,
    intentionalStatusDrift,
  };
}

/** Re-export for callers that only need virtual baseline state. */
export { getInvoiceRowIngredientMatchState };
