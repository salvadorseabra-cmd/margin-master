/**
 * When an invoice line matches a canonical ingredient, store alias relationships — never new alias rows.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import {
  rememberAliasInMap,
  type AppSupabaseClient,
  upsertConfirmedAlias,
} from "@/lib/ingredient-alias-memory";
import type { IngredientAliasMap, IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import { isConfirmedIngredientMatch } from "@/lib/ingredient-match-explanation";
import { rememberOperationalAlias } from "@/lib/ingredient-operational-alias-memory";

export type RecordInvoiceAliasMemoryParams = {
  itemName: string;
  match: IngredientCanonicalMatch;
  confirmedAliases: IngredientAliasMap;
  supplierName?: string | null;
};

export type RecordInvoiceAliasMemoryResult = {
  nextConfirmedAliases: IngredientAliasMap;
  recorded: boolean;
};

function normalizeCompareKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * In-memory alias + operational memory when invoice wording differs from canonical display name.
 */
export function recordInvoiceLineAliasMemory(
  params: RecordInvoiceAliasMemoryParams,
): RecordInvoiceAliasMemoryResult {
  const { itemName, match, confirmedAliases, supplierName } = params;
  const ingredientId = match.ingredient.id;
  const ingredientName = match.ingredient.name ?? match.ingredient.normalized_name ?? "";

  const itemKey = normalizeCompareKey(itemName);
  const catalogKey = normalizeCompareKey(ingredientName);
  if (!itemKey || !catalogKey || itemKey === catalogKey) {
    return { nextConfirmedAliases: confirmedAliases, recorded: false };
  }

  if (!isConfirmedIngredientMatch(match)) {
    return { nextConfirmedAliases: confirmedAliases, recorded: false };
  }

  const nextConfirmedAliases = rememberAliasInMap(
    confirmedAliases,
    itemName,
    ingredientId,
    supplierName,
  );

  rememberOperationalAlias(itemName, ingredientId, ingredientName, "confirmed", 8);

  return { nextConfirmedAliases, recorded: true };
}

export type PersistInvoiceAliasMemoryParams = RecordInvoiceAliasMemoryParams & {
  supabase: AppSupabaseClient;
};

export async function persistInvoiceLineAliasMemory(
  params: PersistInvoiceAliasMemoryParams,
): Promise<{ nextConfirmedAliases: IngredientAliasMap; error: PostgrestError | null }> {
  const applied = recordInvoiceLineAliasMemory(params);
  if (!applied.recorded) {
    return { nextConfirmedAliases: applied.nextConfirmedAliases, error: null };
  }

  const { error } = await upsertConfirmedAlias({
    ingredientId: params.match.ingredient.id,
    aliasName: params.itemName.trim(),
    supplierName: params.supplierName,
    supabase: params.supabase,
    manualConfirmation: false,
  });

  return { nextConfirmedAliases: applied.nextConfirmedAliases, error };
}
