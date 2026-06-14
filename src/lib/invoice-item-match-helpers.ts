import type { IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import type { InvoiceIngredientDisplayState } from "@/lib/ingredient-match-explanation";
import {
  INVOICE_ITEM_MATCH_STATUSES,
  type InvoiceItemMatchInsert,
  type InvoiceItemMatchRow,
  type InvoiceItemMatchStatus,
  type InvoiceItemMatchUpdate,
} from "@/lib/invoice-item-match-types";

export type MatchRecordValidationError =
  | "invalid_status"
  | "unmatched_has_ingredient"
  | "assigned_missing_ingredient"
  | "confirmed_missing_timestamp";

export function isInvoiceItemMatchStatus(value: string): value is InvoiceItemMatchStatus {
  return (INVOICE_ITEM_MATCH_STATUSES as readonly string[]).includes(value);
}

export function displayStateToMatchStatus(
  displayState: InvoiceIngredientDisplayState,
): InvoiceItemMatchStatus {
  return displayState;
}

export function validateMatchRecordFields(
  record: Pick<
    InvoiceItemMatchRow,
    "status" | "ingredient_id" | "confirmed_at" | "corrected_at"
  >,
): MatchRecordValidationError | null {
  if (!isInvoiceItemMatchStatus(record.status)) {
    return "invalid_status";
  }

  if (record.status === "unmatched") {
    if (record.ingredient_id != null) return "unmatched_has_ingredient";
    return null;
  }

  if (record.ingredient_id == null || record.ingredient_id.trim() === "") {
    return "assigned_missing_ingredient";
  }

  if (record.status === "confirmed" && record.confirmed_at == null) {
    return "confirmed_missing_timestamp";
  }

  return null;
}

export function assertValidMatchRecordFields(
  record: Pick<
    InvoiceItemMatchRow,
    "status" | "ingredient_id" | "confirmed_at" | "corrected_at"
  >,
): void {
  const error = validateMatchRecordFields(record);
  if (error) {
    throw new Error(`Invalid invoice_item_match record: ${error}`);
  }
}

export function normalizeMatchStatusUpdate(
  update: InvoiceItemMatchUpdate,
  existing?: Pick<InvoiceItemMatchRow, "status" | "ingredient_id" | "confirmed_at">,
): InvoiceItemMatchUpdate {
  const status = update.status ?? existing?.status;
  const ingredientId =
    update.ingredient_id !== undefined ? update.ingredient_id : existing?.ingredient_id ?? null;

  if (status === "unmatched") {
    return {
      ...update,
      status,
      ingredient_id: null,
      confirmed_at: null,
    };
  }

  if (status === "confirmed" && update.confirmed_at === undefined && existing?.confirmed_at == null) {
    return {
      ...update,
      status,
      ingredient_id: ingredientId,
      confirmed_at: new Date().toISOString(),
    };
  }

  return {
    ...update,
    status,
    ingredient_id: ingredientId,
  };
}

const PERSISTED_CONFIRMED_MATCH_KINDS = new Set<string>([
  "confirmed-alias",
  "confirmed-override",
]);

/**
 * Conservative V1 persisted status from matcher output (shadow seed / extract seed).
 * Only alias-backed high-trust kinds become confirmed; bare exact and memory paths stay suggested.
 */
export function resolvePersistedMatchStatusFromMatcher(
  match: IngredientCanonicalMatch | null | undefined,
): InvoiceItemMatchStatus {
  if (!match) return "unmatched";
  if (PERSISTED_CONFIRMED_MATCH_KINDS.has(match.kind)) return "confirmed";
  if (match.ingredient?.id?.trim()) return "suggested";
  return "unmatched";
}

export type MapMatcherToInitialMatchRecordParams = {
  invoiceItemId: string;
  invoiceId: string;
  userId: string;
  match: IngredientCanonicalMatch | null;
  /** ISO timestamp for confirmed rows; defaults to now when status is confirmed. */
  confirmedAt?: string | null;
  now?: string;
};

/**
 * Maps runtime matcher output to an initial persisted match record shape.
 * Does not perform DB writes — for extract/seed paths in later phases.
 */
export function mapMatcherOutputToInitialMatchRecord(
  params: MapMatcherToInitialMatchRecordParams,
): InvoiceItemMatchInsert {
  const status = resolvePersistedMatchStatusFromMatcher(params.match);
  const ingredientId =
    status === "unmatched" ? null : (params.match?.ingredient.id ?? null);
  const matchKind = params.match?.kind ?? null;
  const confirmedAt =
    status === "confirmed"
      ? (params.confirmedAt ?? params.now ?? new Date().toISOString())
      : null;

  const record: InvoiceItemMatchInsert = {
    invoice_item_id: params.invoiceItemId,
    invoice_id: params.invoiceId,
    user_id: params.userId,
    status,
    ingredient_id: ingredientId,
    match_kind: matchKind,
    confirmed_at: confirmedAt,
    corrected_at: null,
    previous_ingredient_id: null,
    pack_variant_id: null,
  };

  assertValidMatchRecordFields(record);
  return record;
}
