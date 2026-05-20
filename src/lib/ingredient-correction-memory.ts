import type { PostgrestError } from "@supabase/supabase-js";
import {
  rememberAliasInMap,
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
  rememberRejectedIngredientMatch,
  persistRejectedIngredientMatchesToStorage,
} from "@/lib/ingredient-rejected-match-memory";

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
  if (!aliasName) return null;

  const overrideKeys = buildOverrideKeysFromInvoiceLine(aliasName, supplierName);
  if (!overrideKeys) return null;

  const expandedName = normalizeSupplierShorthand(aliasName);
  const operationalAliasKey = normalizeOperationalAliasKey(expandedName || aliasName);

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
  const keys = buildManualIngredientCorrectionKeys(payload.itemName, payload.supplierName);
  if (!keys) return null;

  const nextConfirmedAliases = rememberAliasInMap(
    confirmedAliases,
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

  return { ...keys, nextConfirmedAliases };
}

export type PersistManualIngredientCorrectionParams = ManualIngredientCorrectionPayload & {
  confirmedAliases: IngredientAliasMap;
  supabase: AppSupabaseClient;
};

export type PersistManualIngredientCorrectionResult = {
  applied: ApplyManualIngredientCorrectionResult | null;
  error: PostgrestError | null;
};

/**
 * Persist invoice wording → ingredient for manual confirm or catalog pick.
 * Updates alias map keys used by canonical matching before semantic lookup.
 */
export async function persistManualIngredientCorrection({
  itemName,
  ingredientId,
  ingredientName,
  supplierName,
  confirmedAliases,
  supabase,
}: PersistManualIngredientCorrectionParams): Promise<PersistManualIngredientCorrectionResult> {
  const applied = applyManualIngredientCorrection(
    { itemName, ingredientId, ingredientName, supplierName },
    confirmedAliases,
  );
  if (!applied) {
    return {
      applied: null,
      error: { message: "Invalid invoice line name", code: "invalid_alias" } as PostgrestError,
    };
  }

  const { error } = await upsertConfirmedAlias({
    ingredientId,
    aliasName: applied.aliasName,
    normalizedAlias: applied.normalizedAlias,
    supplierName,
    supabase,
    manualConfirmation: true,
  });

  return { applied, error };
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
  const remembered = rememberRejectedIngredientMatch(
    itemName,
    rejectedIngredientId,
    supplierName,
    Date.now(),
    rawItemName ? [rawItemName] : [],
  );
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
