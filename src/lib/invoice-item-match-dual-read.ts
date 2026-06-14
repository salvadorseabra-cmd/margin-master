import type { IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import {
  resolveInvoiceIngredientDisplayState,
  type InvoiceIngredientDisplayState,
} from "@/lib/ingredient-match-explanation";
import {
  displayStateToMatchStatus,
  resolvePersistedMatchStatusFromMatcher,
} from "@/lib/invoice-item-match-helpers";
import type { InvoiceItemMatchRow, InvoiceItemMatchStatus } from "@/lib/invoice-item-match-types";
import { isMatchLifecycleDualReadLogEnabled } from "@/lib/match-lifecycle-flags";

export const DUAL_READ_LOG_PREFIX = "[match-lifecycle-dual-read]";

/** Sub-classifications when virtual and persisted disagree. */
export type DualReadDriftKind =
  | "ingredient_id_mismatch"
  | "status_mismatch"
  | "match_kind_mismatch"
  | "confirmed_to_suggested";

export type DualReadAlignment = "aligned" | "drifted" | "missing" | "orphaned";

export type VirtualMatchSnapshot = {
  ingredientId: string | null;
  displayState: InvoiceIngredientDisplayState;
  matchKind: string | null;
  /** Status the shadow seed / dual-write path would persist from matcher output. */
  expectedPersistedStatus: InvoiceItemMatchStatus;
};

export type PersistedMatchSnapshot = {
  ingredientId: string | null;
  status: InvoiceItemMatchStatus;
  matchKind: string | null;
};

export type DualReadComparisonInput = {
  invoiceItemId: string;
  virtual: VirtualMatchSnapshot | null;
  persisted: PersistedMatchSnapshot | null;
};

export type DualReadComparisonResult = DualReadComparisonInput & {
  alignment: DualReadAlignment;
  driftKinds: DualReadDriftKind[];
  /** True when only drift is virtual confirmed vs persisted suggested with same ingredient (Pepino). */
  intentionalStatusDrift: boolean;
};

export type DualReadMetrics = {
  total: number;
  aligned: number;
  drifted: number;
  missing: number;
  orphaned: number;
  intentionalStatusDrift: number;
  byDriftKind: Record<DualReadDriftKind, number>;
};

export function buildVirtualMatchSnapshot(
  match: IngredientCanonicalMatch | null | undefined,
): VirtualMatchSnapshot {
  const displayState = resolveInvoiceIngredientDisplayState(match);
  const expectedPersistedStatus = resolvePersistedMatchStatusFromMatcher(match);
  const ingredientId =
    expectedPersistedStatus === "unmatched" ? null : (match?.ingredient.id ?? null);

  return {
    ingredientId,
    displayState,
    matchKind: match?.kind ?? null,
    expectedPersistedStatus,
  };
}

export function buildPersistedMatchSnapshot(
  row: Pick<InvoiceItemMatchRow, "ingredient_id" | "status" | "match_kind">,
): PersistedMatchSnapshot {
  return {
    ingredientId: row.ingredient_id,
    status: row.status,
    matchKind: row.match_kind,
  };
}

function normalizeIngredientId(id: string | null | undefined): string | null {
  const trimmed = id?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Returns true for the documented Pepino pattern: virtual confirmed, persisted suggested,
 * same ingredient, bare exact match kind.
 */
export function isIntentionalConfirmedToSuggestedDrift(
  virtual: VirtualMatchSnapshot,
  persisted: PersistedMatchSnapshot,
): boolean {
  return (
    virtual.displayState === "confirmed" &&
    persisted.status === "suggested" &&
    virtual.expectedPersistedStatus === "suggested" &&
    virtual.matchKind === "exact" &&
    normalizeIngredientId(virtual.ingredientId) === normalizeIngredientId(persisted.ingredientId)
  );
}

export function compareVirtualAndPersistedMatch(
  input: DualReadComparisonInput,
): DualReadComparisonResult {
  const { invoiceItemId, virtual, persisted } = input;
  const driftKinds: DualReadDriftKind[] = [];

  if (!virtual && persisted) {
    return {
      invoiceItemId,
      virtual: null,
      persisted,
      alignment: "orphaned",
      driftKinds: [],
      intentionalStatusDrift: false,
    };
  }

  if (virtual && !persisted) {
    return {
      invoiceItemId,
      virtual,
      persisted: null,
      alignment: "missing",
      driftKinds: [],
      intentionalStatusDrift: false,
    };
  }

  if (!virtual || !persisted) {
    return {
      invoiceItemId,
      virtual,
      persisted,
      alignment: "aligned",
      driftKinds: [],
      intentionalStatusDrift: false,
    };
  }

  const virtualIngredientId = normalizeIngredientId(virtual.ingredientId);
  const persistedIngredientId = normalizeIngredientId(persisted.ingredientId);

  if (virtualIngredientId !== persistedIngredientId) {
    driftKinds.push("ingredient_id_mismatch");
  }

  const intentionalStatusDrift = isIntentionalConfirmedToSuggestedDrift(virtual, persisted);

  if (persisted.status !== virtual.expectedPersistedStatus) {
    if (!intentionalStatusDrift) {
      driftKinds.push("status_mismatch");
    }
  } else if (
    displayStateToMatchStatus(virtual.displayState) !== persisted.status &&
    !intentionalStatusDrift
  ) {
    driftKinds.push("status_mismatch");
  }

  if (
    virtual.matchKind != null &&
    persisted.matchKind != null &&
    virtual.matchKind !== persisted.matchKind
  ) {
    driftKinds.push("match_kind_mismatch");
  }

  if (intentionalStatusDrift) {
    driftKinds.push("confirmed_to_suggested");
  }

  const alignment: DualReadAlignment =
    driftKinds.length === 0 || (driftKinds.length === 1 && intentionalStatusDrift)
      ? "aligned"
      : "drifted";

  return {
    invoiceItemId,
    virtual,
    persisted,
    alignment,
    driftKinds,
    intentionalStatusDrift,
  };
}

export function aggregateDualReadMetrics(
  results: readonly DualReadComparisonResult[],
): DualReadMetrics {
  const byDriftKind: Record<DualReadDriftKind, number> = {
    ingredient_id_mismatch: 0,
    status_mismatch: 0,
    match_kind_mismatch: 0,
    confirmed_to_suggested: 0,
  };

  let aligned = 0;
  let drifted = 0;
  let missing = 0;
  let orphaned = 0;
  let intentionalStatusDrift = 0;

  for (const result of results) {
    switch (result.alignment) {
      case "aligned":
        aligned += 1;
        break;
      case "drifted":
        drifted += 1;
        break;
      case "missing":
        missing += 1;
        break;
      case "orphaned":
        orphaned += 1;
        break;
    }
    if (result.intentionalStatusDrift) intentionalStatusDrift += 1;
    for (const kind of result.driftKinds) {
      byDriftKind[kind] += 1;
    }
  }

  return {
    total: results.length,
    aligned,
    drifted,
    missing,
    orphaned,
    intentionalStatusDrift,
    byDriftKind,
  };
}

export function formatDualReadComparisonLine(result: DualReadComparisonResult): string {
  const virtualPart = result.virtual
    ? `virtual=${result.virtual.displayState}/${result.virtual.matchKind ?? "null"}/${result.virtual.ingredientId ?? "null"}`
    : "virtual=null";
  const persistedPart = result.persisted
    ? `persisted=${result.persisted.status}/${result.persisted.matchKind ?? "null"}/${result.persisted.ingredientId ?? "null"}`
    : "persisted=null";
  const driftPart =
    result.driftKinds.length > 0 ? ` drift=[${result.driftKinds.join(",")}]` : "";
  const intentionalPart = result.intentionalStatusDrift ? " intentional=true" : "";
  return `${result.invoiceItemId} ${result.alignment} ${virtualPart} ${persistedPart}${driftPart}${intentionalPart}`;
}

export function logDualReadComparison(result: DualReadComparisonResult): void {
  if (!isMatchLifecycleDualReadLogEnabled()) return;
  if (result.alignment === "aligned" && !result.intentionalStatusDrift) return;

  const line = formatDualReadComparisonLine(result);
  if (result.alignment === "drifted" || result.alignment === "missing" || result.alignment === "orphaned") {
    console.warn(`${DUAL_READ_LOG_PREFIX} ${line}`);
    return;
  }
  if (result.intentionalStatusDrift) {
    console.info(`${DUAL_READ_LOG_PREFIX} ${line}`);
  }
}

export function logDualReadMetrics(metrics: DualReadMetrics): void {
  if (!isMatchLifecycleDualReadLogEnabled()) return;
  console.info(
    `${DUAL_READ_LOG_PREFIX} metrics total=${metrics.total} aligned=${metrics.aligned} drifted=${metrics.drifted} missing=${metrics.missing} orphaned=${metrics.orphaned} intentional=${metrics.intentionalStatusDrift}`,
  );
}
