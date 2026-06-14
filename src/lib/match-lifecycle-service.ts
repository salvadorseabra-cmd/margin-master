import type { PostgrestError } from "@supabase/supabase-js";
import {
  type AppSupabaseClient,
  getInvoiceItemMatchByInvoiceItemId,
  updateInvoiceItemMatchStatus,
  upsertInvoiceItemMatch,
} from "@/lib/invoice-item-match-repository";
import type { InvoiceItemMatchRow } from "@/lib/invoice-item-match-types";
import { isMatchLifecycleDualWriteEnabled } from "@/lib/match-lifecycle-flags";

const LOG_PREFIX = "[match-lifecycle-service]";

export type MatchLifecycleContext = {
  invoiceItemId: string;
  userId: string;
  invoiceId: string;
};

export type MatchLifecycleWriteResult = {
  skipped: boolean;
  data: InvoiceItemMatchRow | null;
  error: PostgrestError | null;
};

function skippedWrite(): MatchLifecycleWriteResult {
  return { skipped: true, data: null, error: null };
}

function logWriteError(action: string, invoiceItemId: string, error: PostgrestError | null): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${LOG_PREFIX} ${action} failed for ${invoiceItemId}: ${error.message}${code}`);
}

/**
 * T3: Suggested → Confirmed (user Confirm). Idempotent when already confirmed to same ingredient.
 */
export async function confirmMatch(
  client: AppSupabaseClient,
  params: MatchLifecycleContext & {
    ingredientId: string;
    matchKind?: string | null;
    now?: string;
  },
): Promise<MatchLifecycleWriteResult> {
  if (!isMatchLifecycleDualWriteEnabled()) return skippedWrite();

  const now = params.now ?? new Date().toISOString();
  const { data: existing, error: loadError } = await getInvoiceItemMatchByInvoiceItemId(
    client,
    params.invoiceItemId,
  );
  if (loadError) {
    logWriteError("confirmMatch", params.invoiceItemId, loadError);
    return { skipped: false, data: null, error: loadError };
  }

  if (
    existing?.status === "confirmed" &&
    existing.ingredient_id === params.ingredientId
  ) {
    return { skipped: false, data: existing, error: null };
  }

  if (existing) {
    const { data, error } = await updateInvoiceItemMatchStatus(
      client,
      params.invoiceItemId,
      {
        status: "confirmed",
        ingredient_id: params.ingredientId,
        confirmed_at: existing.confirmed_at ?? now,
        match_kind: params.matchKind ?? existing.match_kind ?? null,
      },
      existing,
    );
    if (error) logWriteError("confirmMatch", params.invoiceItemId, error);
    return { skipped: false, data, error };
  }

  const { data, error } = await upsertInvoiceItemMatch(client, {
    invoice_item_id: params.invoiceItemId,
    user_id: params.userId,
    invoice_id: params.invoiceId,
    status: "confirmed",
    ingredient_id: params.ingredientId,
    match_kind: params.matchKind ?? "manual",
    confirmed_at: now,
    corrected_at: null,
    previous_ingredient_id: null,
  });
  if (error) logWriteError("confirmMatch", params.invoiceItemId, error);
  return { skipped: false, data, error };
}

/**
 * T6/T7: Correct to a different ingredient. When keepConfirmed, status stays confirmed (reassign).
 */
export async function correctMatch(
  client: AppSupabaseClient,
  params: MatchLifecycleContext & {
    newIngredientId: string;
    previousIngredientId?: string | null;
    keepConfirmed?: boolean;
    now?: string;
  },
): Promise<MatchLifecycleWriteResult> {
  if (!isMatchLifecycleDualWriteEnabled()) return skippedWrite();

  const now = params.now ?? new Date().toISOString();
  const { data: existing, error: loadError } = await getInvoiceItemMatchByInvoiceItemId(
    client,
    params.invoiceItemId,
  );
  if (loadError) {
    logWriteError("correctMatch", params.invoiceItemId, loadError);
    return { skipped: false, data: null, error: loadError };
  }

  if (existing?.ingredient_id === params.newIngredientId) {
    return { skipped: false, data: existing, error: null };
  }

  const previousIngredientId =
    params.previousIngredientId ?? existing?.ingredient_id ?? null;
  const keepConfirmed =
    params.keepConfirmed === true ||
    (params.keepConfirmed !== false && existing?.status === "confirmed");
  const status = keepConfirmed ? "confirmed" : "suggested";

  if (existing) {
    const { data, error } = await updateInvoiceItemMatchStatus(
      client,
      params.invoiceItemId,
      {
        status,
        ingredient_id: params.newIngredientId,
        previous_ingredient_id: previousIngredientId,
        corrected_at: now,
        match_kind: "manual",
        confirmed_at: keepConfirmed ? (existing.confirmed_at ?? now) : null,
      },
      existing,
    );
    if (error) logWriteError("correctMatch", params.invoiceItemId, error);
    return { skipped: false, data, error };
  }

  const { data, error } = await upsertInvoiceItemMatch(client, {
    invoice_item_id: params.invoiceItemId,
    user_id: params.userId,
    invoice_id: params.invoiceId,
    status,
    ingredient_id: params.newIngredientId,
    match_kind: "manual",
    confirmed_at: keepConfirmed ? now : null,
    corrected_at: now,
    previous_ingredient_id: previousIngredientId,
  });
  if (error) logWriteError("correctMatch", params.invoiceItemId, error);
  return { skipped: false, data, error };
}

/** T7 alias: Confirmed → Confirmed with new ingredient. */
export async function reassignMatch(
  client: AppSupabaseClient,
  params: MatchLifecycleContext & {
    newIngredientId: string;
    previousIngredientId: string;
    now?: string;
  },
): Promise<MatchLifecycleWriteResult> {
  return correctMatch(client, {
    ...params,
    keepConfirmed: true,
    previousIngredientId: params.previousIngredientId,
  });
}

/** T6 / shadow alignment: persist suggested assignment without confirming. */
export async function markSuggested(
  client: AppSupabaseClient,
  params: MatchLifecycleContext & {
    ingredientId: string;
    matchKind?: string | null;
    previousIngredientId?: string | null;
    now?: string;
  },
): Promise<MatchLifecycleWriteResult> {
  if (!isMatchLifecycleDualWriteEnabled()) return skippedWrite();

  const now = params.now ?? new Date().toISOString();
  const { data: existing, error: loadError } = await getInvoiceItemMatchByInvoiceItemId(
    client,
    params.invoiceItemId,
  );
  if (loadError) {
    logWriteError("markSuggested", params.invoiceItemId, loadError);
    return { skipped: false, data: null, error: loadError };
  }

  if (
    existing?.status === "suggested" &&
    existing.ingredient_id === params.ingredientId
  ) {
    return { skipped: false, data: existing, error: null };
  }

  const previousIngredientId =
    params.previousIngredientId ?? existing?.ingredient_id ?? null;

  if (existing) {
    const { data, error } = await updateInvoiceItemMatchStatus(
      client,
      params.invoiceItemId,
      {
        status: "suggested",
        ingredient_id: params.ingredientId,
        previous_ingredient_id: previousIngredientId,
        corrected_at: previousIngredientId ? now : null,
        match_kind: params.matchKind ?? existing.match_kind ?? null,
        confirmed_at: null,
      },
      existing,
    );
    if (error) logWriteError("markSuggested", params.invoiceItemId, error);
    return { skipped: false, data, error };
  }

  const { data, error } = await upsertInvoiceItemMatch(client, {
    invoice_item_id: params.invoiceItemId,
    user_id: params.userId,
    invoice_id: params.invoiceId,
    status: "suggested",
    ingredient_id: params.ingredientId,
    match_kind: params.matchKind ?? null,
    confirmed_at: null,
    corrected_at: null,
    previous_ingredient_id: null,
  });
  if (error) logWriteError("markSuggested", params.invoiceItemId, error);
  return { skipped: false, data, error };
}

/** T4/T5 write-only path — no UI wiring in Phase 3. */
export async function markUnmatched(
  client: AppSupabaseClient,
  params: MatchLifecycleContext & {
    previousIngredientId?: string | null;
    now?: string;
  },
): Promise<MatchLifecycleWriteResult> {
  if (!isMatchLifecycleDualWriteEnabled()) return skippedWrite();

  const { data: existing, error: loadError } = await getInvoiceItemMatchByInvoiceItemId(
    client,
    params.invoiceItemId,
  );
  if (loadError) {
    logWriteError("markUnmatched", params.invoiceItemId, loadError);
    return { skipped: false, data: null, error: loadError };
  }

  if (existing?.status === "unmatched") {
    return { skipped: false, data: existing, error: null };
  }

  const previousIngredientId =
    params.previousIngredientId ?? existing?.ingredient_id ?? null;

  if (existing) {
    const { data, error } = await updateInvoiceItemMatchStatus(
      client,
      params.invoiceItemId,
      {
        status: "unmatched",
        previous_ingredient_id: previousIngredientId,
      },
      existing,
    );
    if (error) logWriteError("markUnmatched", params.invoiceItemId, error);
    return { skipped: false, data, error };
  }

  const { data, error } = await upsertInvoiceItemMatch(client, {
    invoice_item_id: params.invoiceItemId,
    user_id: params.userId,
    invoice_id: params.invoiceId,
    status: "unmatched",
    ingredient_id: null,
    match_kind: null,
    confirmed_at: null,
    corrected_at: null,
    previous_ingredient_id: previousIngredientId,
  });
  if (error) logWriteError("markUnmatched", params.invoiceItemId, error);
  return { skipped: false, data, error };
}
