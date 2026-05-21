import type { PostgrestError } from "@supabase/supabase-js";
import {
  rememberConfirmedAliasInMap,
  type AppSupabaseClient,
  upsertConfirmedAlias,
} from "@/lib/ingredient-alias-memory";
import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import {
  buildOverrideKeysFromInvoiceLine,
  rememberIngredientMatchOverride,
} from "@/lib/ingredient-match-override";
import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import {
  normalizeOperationalAliasKey,
  rememberOperationalAlias,
} from "@/lib/ingredient-operational-alias-memory";
import type { InvoiceRowIngredientMatchState } from "@/lib/ingredient-match-explanation";
import {
  clearRejectedIngredientMatchPair,
  listRejectedIngredientMatches,
  rememberRejectedIngredientMatch,
  persistRejectedIngredientMatchesToStorage,
} from "@/lib/ingredient-rejected-match-memory";
import { traceUnmatchPersistState, traceAliasUnmatchOrphan } from "@/lib/alias-state-trace";
import {
  getAliasTraceCompareBucket,
  traceIngredientAliases,
  traceIngredientAliasesInsertError,
  traceIngredientAliasesNormalizationRejection,
  traceIngredientAliasesValidationRejection,
} from "@/lib/ingredient-aliases-trace";
import { traceAliasOnly } from "@/lib/ingredient-catalog-diagnostics";
import { traceManualIngredientMatch } from "@/lib/manual-ingredient-match-trace";
import { normalizeInvoiceAliasMemoryKey } from "@/lib/normalize-ingredient-name";

export const MANUAL_CONFIRMATION_CONFIDENCE = 10;

export type ManualIngredientCorrectionKeys = {
  aliasName: string;
  normalizedAlias: string;
  aliasLookupKey: string;
  operationalAliasKey: string;
};

export type ManualIngredientCorrectionPayload = {
  itemName: string;
  ingredientId: string;
  ingredientName: string;
  supplierName?: string | null;
};

export type ApplyManualIngredientCorrectionResult = ManualIngredientCorrectionKeys & {
  nextConfirmedAliases: IngredientAliasMap;
};

export function buildManualIngredientCorrectionKeys(
  itemName: string,
  supplierName?: string | null,
): ManualIngredientCorrectionKeys | null {
  const aliasName = itemName.trim();
  if (!aliasName) {
    traceIngredientAliasesValidationRejection(
      "buildManualIngredientCorrectionKeys",
      "empty_item_name_trim",
      { itemName },
    );
    return null;
  }

  const overrideKeys = buildOverrideKeysFromInvoiceLine(aliasName, supplierName);
  if (!overrideKeys) {
    traceIngredientAliasesNormalizationRejection(
      "buildManualIngredientCorrectionKeys",
      "buildOverrideKeysFromInvoiceLine_null",
      { itemName: aliasName, supplierName: supplierName ?? null },
    );
    return null;
  }

  const expandedName = normalizeSupplierShorthand(aliasName);
  const operationalAliasKey = normalizeOperationalAliasKey(expandedName || aliasName);
  if (!operationalAliasKey) {
    traceIngredientAliasesNormalizationRejection(
      "buildManualIngredientCorrectionKeys",
      "operational_alias_key_empty",
      {
        itemName: aliasName,
        expandedName,
        supplierName: supplierName ?? null,
      },
    );
    return null;
  }

  traceIngredientAliases("buildManualIngredientCorrectionKeys:ok", {
    itemName: aliasName,
    compareBucket: getAliasTraceCompareBucket(aliasName),
    normalizedAlias: overrideKeys.rawNormalized,
    aliasLookupKey: overrideKeys.lookupKey,
    operationalAliasKey,
    expandedName,
    supplierName: supplierName ?? null,
  });

  return {
    aliasName,
    normalizedAlias: overrideKeys.rawNormalized,
    aliasLookupKey: overrideKeys.lookupKey,
    operationalAliasKey,
  };
}

/**
 * In-memory alias + operational memory for a user-confirmed or manually selected match.
 */
export function applyManualIngredientCorrection(
  payload: ManualIngredientCorrectionPayload,
  confirmedAliases: IngredientAliasMap,
): ApplyManualIngredientCorrectionResult | null {
  traceIngredientAliases("applyManualIngredientCorrection:enter", {
    function: "applyManualIngredientCorrection",
    itemName: payload.itemName,
    ingredientId: payload.ingredientId,
    supplierName: payload.supplierName ?? null,
  });
  const keys = buildManualIngredientCorrectionKeys(payload.itemName, payload.supplierName);
  if (!keys) {
    traceIngredientAliases("applyManualIngredientCorrection:early-return", {
      branch: "keys_null",
      itemName: payload.itemName,
    });
    return null;
  }

  const nextConfirmedAliases = rememberConfirmedAliasInMap(
    confirmedAliases,
    keys.aliasName,
    keys.normalizedAlias,
    payload.ingredientId,
    payload.supplierName,
  );

  rememberOperationalAlias(
    payload.itemName,
    payload.ingredientId,
    payload.ingredientName,
    "manual_confirmation",
    MANUAL_CONFIRMATION_CONFIDENCE,
  );

  rememberIngredientMatchOverride(
    payload.itemName,
    payload.ingredientId,
    payload.ingredientName,
    payload.supplierName,
  );

  traceIngredientAliases("applyManualIngredientCorrection:ok", {
    itemName: payload.itemName,
    aliasLookupKey: keys.aliasLookupKey,
    ingredientId: payload.ingredientId,
  });
  return { ...keys, nextConfirmedAliases };
}

export type PersistManualIngredientCorrectionParams = ManualIngredientCorrectionPayload & {
  confirmedAliases: IngredientAliasMap;
  supabase: AppSupabaseClient;
};

export type PersistManualIngredientCorrectionResult = {
  applied: ApplyManualIngredientCorrectionResult | null;
  error: PostgrestError | null;
  /** Wrong-match rejection entries removed for this line → ingredient pair. */
  clearedRejectedPairs: number;
};

/**
 * Persist invoice wording → ingredient for manual confirm or catalog pick.
 * Updates alias map keys used by canonical matching before semantic lookup.
 */
const MANUAL_ALIAS_LOG_PREFIX = "[canonical-create]";

function traceManualAliasPersist(stage: string, details?: Record<string, unknown>): void {
  if (details) console.info(`${MANUAL_ALIAS_LOG_PREFIX} ${stage}`, details);
  else console.info(`${MANUAL_ALIAS_LOG_PREFIX} ${stage}`);
}

export async function persistManualIngredientCorrection({
  itemName,
  ingredientId,
  ingredientName,
  supplierName,
  confirmedAliases,
  supabase,
}: PersistManualIngredientCorrectionParams): Promise<PersistManualIngredientCorrectionResult> {
  traceManualIngredientMatch("[manual_match_attempt]", {
    itemName,
    ingredientId,
    ingredientName,
    supplierName: supplierName ?? null,
    invoiceAliasMemoryKey: normalizeInvoiceAliasMemoryKey(itemName),
    priorMapKeyCount: Object.keys(confirmedAliases).length,
  });
  traceAliasOnly("persist-manual-correction", {
    itemName,
    ingredientId,
    ingredientName,
    supplierName: supplierName ?? null,
    note: "ingredient_aliases only — no ingredients.insert",
  });
  traceManualAliasPersist("alias-persist-start", {
    itemName,
    ingredientId,
    ingredientName,
    supplierName: supplierName ?? null,
  });

  const rejectedBefore = listRejectedIngredientMatches().length;
  const clearedRejected = clearRejectedIngredientMatchPair(itemName, ingredientId, supplierName);
  traceUnmatchPersistState({
    phase: "before_manual_rematch_persist",
    itemName,
    ingredientId,
    supplierName: supplierName ?? null,
    clearedRejectedPairs: clearedRejected,
    rejectedPairCountBefore: rejectedBefore,
    rejectedPairCountAfter: listRejectedIngredientMatches().length,
  });

  const applied = applyManualIngredientCorrection(
    { itemName, ingredientId, ingredientName, supplierName },
    confirmedAliases,
  );
  if (!applied) {
    traceManualAliasPersist("alias-persist-skipped", {
      itemName,
      reason: "invalid_invoice_line_name",
    });
    traceManualIngredientMatch("[manual_match_persist_result]", {
      ok: false,
      itemName,
      reason: "applyManualIngredientCorrection_null",
      keysWritten: [],
      dbUpsertAttempted: false,
    });
    traceIngredientAliases("persistManualIngredientCorrection:early-return", {
      function: "persistManualIngredientCorrection",
      branch: "applyManualIngredientCorrection_null",
      itemName,
      compareBucket: getAliasTraceCompareBucket(itemName),
    });
    return {
      applied: null,
      error: { message: "Invalid invoice line name", code: "invalid_alias" } as PostgrestError,
      clearedRejectedPairs: clearedRejected,
    };
  }

  traceManualAliasPersist("alias-upsert-attempt", {
    aliasName: applied.aliasName,
    normalizedAlias: applied.normalizedAlias,
    aliasLookupKey: applied.aliasLookupKey,
    ingredientId,
  });

  traceIngredientAliases("persistManualIngredientCorrection:upsert-call", {
    function: "persistManualIngredientCorrection",
    itemName,
    aliasName: applied.aliasName,
    normalizedAlias: applied.normalizedAlias,
    ingredientId,
    supplierName: supplierName ?? null,
    compareBucket: getAliasTraceCompareBucket(itemName),
  });

  const { error } = await upsertConfirmedAlias({
    ingredientId,
    aliasName: applied.aliasName,
    normalizedAlias: applied.normalizedAlias,
    supplierName,
    supabase,
    manualConfirmation: true,
  });

  if (error) {
    traceIngredientAliasesInsertError({
      function: "persistManualIngredientCorrection",
      itemName,
      aliasName: applied.aliasName,
      error: { message: error.message, code: error.code },
    });
    traceManualAliasPersist("alias-upsert-failed", {
      aliasName: applied.aliasName,
      normalizedAlias: applied.normalizedAlias,
      message: error.message,
      code: error.code,
    });
    traceManualIngredientMatch("[manual_match_persist_result]", {
      ok: false,
      itemName,
      ingredientId,
      aliasLookupKey: applied.aliasLookupKey,
      operationalAliasKey: applied.operationalAliasKey,
      normalizedAlias: applied.normalizedAlias,
      keysWritten: Object.keys(applied.nextConfirmedAliases),
      dbUpsertAttempted: true,
      dbError: { message: error.message, code: error.code },
    });
  } else {
    traceManualAliasPersist("alias-upsert-ok", {
      aliasName: applied.aliasName,
      normalizedAlias: applied.normalizedAlias,
      ingredientId,
    });
    traceManualIngredientMatch("[manual_match_persist_result]", {
      ok: true,
      itemName,
      ingredientId,
      aliasLookupKey: applied.aliasLookupKey,
      operationalAliasKey: applied.operationalAliasKey,
      normalizedAlias: applied.normalizedAlias,
      keysWritten: Object.keys(applied.nextConfirmedAliases),
      dbUpsertAttempted: true,
      dbError: null,
    });
  }

  traceUnmatchPersistState({
    phase: "after_manual_rematch_persist",
    itemName,
    ingredientId,
    supplierName: supplierName ?? null,
    clearedRejectedPairs: clearedRejected,
    persistOk: !error,
    rejectedPairCount: listRejectedIngredientMatches().length,
  });

  return { applied, error, clearedRejectedPairs: clearedRejected };
}

export type IngredientCorrectionUiState = {
  showConfirm: boolean;
  showWrongMatch: boolean;
  showPicker: boolean;
  suppressMatchPresentation: boolean;
};

/** Session-only row dismissal for immediate UI (pair rejection is persisted separately). */
export function rejectIngredientMatchSuggestion(
  rejectedItemIds: ReadonlySet<string>,
  itemId: string,
): Set<string> {
  const next = new Set(rejectedItemIds);
  next.add(itemId);
  return next;
}

export type RejectIngredientMatchPairParams = {
  itemName: string;
  rejectedIngredientId: string;
  supplierName?: string | null;
  userId?: string | null;
  rawItemName?: string | null;
};

/**
 * Persist a user "wrong match" for this invoice wording → ingredient pair only.
 * Does not mutate catalog, aliases, or dropdown options.
 */
export function rejectIngredientMatchPair({
  itemName,
  rejectedIngredientId,
  supplierName,
  userId,
  rawItemName,
}: RejectIngredientMatchPairParams): void {
  traceUnmatchPersistState({
    phase: "before_wrong_match",
    itemName,
    rejectedIngredientId,
    supplierName: supplierName ?? null,
    rejectedPairCount: listRejectedIngredientMatches().length,
    note: "alias row and confirmed map are not removed on wrong match",
  });
  const remembered = rememberRejectedIngredientMatch(
    itemName,
    rejectedIngredientId,
    supplierName,
    Date.now(),
    rawItemName ? [rawItemName] : [],
  );
  traceUnmatchPersistState({
    phase: "after_wrong_match",
    itemName,
    rejectedIngredientId,
    supplierName: supplierName ?? null,
    remembered: Boolean(remembered),
    rejectedPairCount: listRejectedIngredientMatches().length,
  });
  traceAliasUnmatchOrphan({
    itemName,
    rejectedIngredientId,
    supplierName: supplierName ?? null,
    note: "ingredient_aliases row may remain; matcher blocks via rejected pair memory",
  });
  if (remembered && userId) {
    persistRejectedIngredientMatchesToStorage(userId);
  }
}

export function resolveIngredientCorrectionUiState(
  itemId: string,
  matchState: InvoiceRowIngredientMatchState,
  rejectedItemIds: ReadonlySet<string>,
): IngredientCorrectionUiState {
  const rejected = rejectedItemIds.has(itemId);

  if (rejected) {
    return {
      showConfirm: false,
      showWrongMatch: false,
      showPicker: true,
      suppressMatchPresentation: true,
    };
  }

  if (matchState.displayState === "suggested" && matchState.possibleMatch) {
    return {
      showConfirm: true,
      showWrongMatch: true,
      showPicker: false,
      suppressMatchPresentation: false,
    };
  }

  if (matchState.displayState === "confirmed") {
    return {
      showConfirm: false,
      showWrongMatch: true,
      showPicker: false,
      suppressMatchPresentation: false,
    };
  }

  return {
    showConfirm: false,
    showWrongMatch: false,
    showPicker: true,
    suppressMatchPresentation: false,
  };
}
