import type { IngredientCanonicalMatchKind } from "@/lib/ingredient-canonical";

/** Persisted match lifecycle status (V1 three-state model). */
export type InvoiceItemMatchStatus = "unmatched" | "suggested" | "confirmed";

export const INVOICE_ITEM_MATCH_STATUSES: readonly InvoiceItemMatchStatus[] = [
  "unmatched",
  "suggested",
  "confirmed",
] as const;

/** Matcher provenance stored on the match record. */
export type InvoiceItemMatchKind = IngredientCanonicalMatchKind | "manual";

export type InvoiceItemMatchRow = {
  invoice_item_id: string;
  user_id: string;
  invoice_id: string;
  ingredient_id: string | null;
  status: InvoiceItemMatchStatus;
  match_kind: string | null;
  confirmed_at: string | null;
  corrected_at: string | null;
  previous_ingredient_id: string | null;
  pack_variant_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItemMatchInsert = {
  invoice_item_id: string;
  user_id: string;
  invoice_id: string;
  status: InvoiceItemMatchStatus;
  ingredient_id?: string | null;
  match_kind?: string | null;
  confirmed_at?: string | null;
  corrected_at?: string | null;
  previous_ingredient_id?: string | null;
  pack_variant_id?: string | null;
};

export type InvoiceItemMatchUpdate = Partial<
  Pick<
    InvoiceItemMatchRow,
    | "ingredient_id"
    | "status"
    | "match_kind"
    | "confirmed_at"
    | "corrected_at"
    | "previous_ingredient_id"
    | "pack_variant_id"
  >
>;

export type InvoiceItemMatchStatusUpdate = InvoiceItemMatchUpdate & {
  status: InvoiceItemMatchStatus;
};
