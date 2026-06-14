import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  assertValidMatchRecordFields,
  normalizeMatchStatusUpdate,
} from "@/lib/invoice-item-match-helpers";
import type {
  InvoiceItemMatchInsert,
  InvoiceItemMatchRow,
  InvoiceItemMatchStatusUpdate,
  InvoiceItemMatchUpdate,
} from "@/lib/invoice-item-match-types";

export type AppSupabaseClient = SupabaseClient<Database>;

const MATCH_SELECT =
  "invoice_item_id,user_id,invoice_id,ingredient_id,status,match_kind,confirmed_at,corrected_at,previous_ingredient_id,pack_variant_id,created_at,updated_at" as const;

const LOG_PREFIX = "[invoice_item_matches]";

function logSupabaseError(label: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${LOG_PREFIX} ${label} failed: ${error.message}${code}`);
}

export async function getInvoiceItemMatchByInvoiceItemId(
  supabase: AppSupabaseClient,
  invoiceItemId: string,
): Promise<{ data: InvoiceItemMatchRow | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("invoice_item_matches")
    .select(MATCH_SELECT)
    .eq("invoice_item_id", invoiceItemId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getByInvoiceItemId", error);
    return { data: null, error };
  }

  return { data: data as InvoiceItemMatchRow | null, error: null };
}

export async function getInvoiceItemMatchesByInvoiceId(
  supabase: AppSupabaseClient,
  invoiceId: string,
): Promise<{ data: InvoiceItemMatchRow[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("invoice_item_matches")
    .select(MATCH_SELECT)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("getByInvoiceId", error);
    return { data: [], error };
  }

  return { data: (data ?? []) as InvoiceItemMatchRow[], error: null };
}

export async function upsertInvoiceItemMatch(
  supabase: AppSupabaseClient,
  row: InvoiceItemMatchInsert,
): Promise<{ data: InvoiceItemMatchRow | null; error: PostgrestError | null }> {
  assertValidMatchRecordFields(row);

  const payload = {
    invoice_item_id: row.invoice_item_id,
    user_id: row.user_id,
    invoice_id: row.invoice_id,
    ingredient_id: row.ingredient_id ?? null,
    status: row.status,
    match_kind: row.match_kind ?? null,
    confirmed_at: row.confirmed_at ?? null,
    corrected_at: row.corrected_at ?? null,
    previous_ingredient_id: row.previous_ingredient_id ?? null,
    pack_variant_id: row.pack_variant_id ?? null,
  };

  const { data, error } = await supabase
    .from("invoice_item_matches")
    .upsert(payload, { onConflict: "invoice_item_id" })
    .select(MATCH_SELECT)
    .single();

  if (error) {
    logSupabaseError("upsert", error);
    return { data: null, error };
  }

  return { data: data as InvoiceItemMatchRow, error: null };
}

export async function updateInvoiceItemMatchStatus(
  supabase: AppSupabaseClient,
  invoiceItemId: string,
  update: InvoiceItemMatchStatusUpdate,
  existing?: Pick<InvoiceItemMatchRow, "status" | "ingredient_id" | "confirmed_at">,
): Promise<{ data: InvoiceItemMatchRow | null; error: PostgrestError | null }> {
  const normalized = normalizeMatchStatusUpdate(update, existing);
  assertValidMatchRecordFields({
    status: normalized.status ?? existing?.status ?? update.status,
    ingredient_id:
      normalized.ingredient_id !== undefined
        ? normalized.ingredient_id
        : (existing?.ingredient_id ?? null),
    confirmed_at:
      normalized.confirmed_at !== undefined
        ? normalized.confirmed_at
        : (existing?.confirmed_at ?? null),
    corrected_at: normalized.corrected_at ?? null,
  });

  const patch: InvoiceItemMatchUpdate = { ...normalized };
  if (patch.status === undefined) {
    patch.status = update.status;
  }

  const { data, error } = await supabase
    .from("invoice_item_matches")
    .update(patch)
    .eq("invoice_item_id", invoiceItemId)
    .select(MATCH_SELECT)
    .maybeSingle();

  if (error) {
    logSupabaseError("updateStatus", error);
    return { data: null, error };
  }

  return { data: data as InvoiceItemMatchRow | null, error: null };
}
