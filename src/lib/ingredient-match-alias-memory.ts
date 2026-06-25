/**
 * When an invoice line matches a canonical ingredient, store alias relationships — never new alias rows.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import {
  rememberConfirmedAliasInMap,
  type AppSupabaseClient,
  upsertConfirmedAliasDualIdentity,
} from "@/lib/ingredient-alias-memory";
import type { IngredientAliasMap, IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import { isConfirmedIngredientMatch } from "@/lib/ingredient-match-explanation";
import { buildOverrideKeysFromInvoiceLine } from "@/lib/ingredient-match-override";
import { rememberOperationalAlias } from "@/lib/ingredient-operational-alias-memory";
import {
  getAliasTraceCompareBucket,
  traceIngredientAliases,
  traceIngredientAliasesInsertError,
  traceIngredientAliasesNormalizationRejection,
} from "@/lib/ingredient-aliases-trace";

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
  traceIngredientAliases("recordInvoiceLineAliasMemory:enter", {
    function: "recordInvoiceLineAliasMemory",
    itemName,
    compareBucket: getAliasTraceCompareBucket(itemName),
    matchKind: match.kind,
    ingredientId: match.ingredient.id,
  });
  const ingredientId = match.ingredient.id;
  const ingredientName = match.ingredient.name ?? match.ingredient.normalized_name ?? "";

  const itemKey = normalizeCompareKey(itemName);
  const catalogKey = normalizeCompareKey(ingredientName);
  if (!itemKey || !catalogKey || itemKey === catalogKey) {
    traceIngredientAliases("recordInvoiceLineAliasMemory:early-return", {
      branch: "item_equals_catalog",
      itemName,
      itemKey,
      catalogKey,
    });
    return { nextConfirmedAliases: confirmedAliases, recorded: false };
  }

  if (!isConfirmedIngredientMatch(match)) {
    traceIngredientAliases("recordInvoiceLineAliasMemory:early-return", {
      branch: "not_confirmed_match",
      itemName,
      matchKind: match.kind,
    });
    return { nextConfirmedAliases: confirmedAliases, recorded: false };
  }

  const keys = buildOverrideKeysFromInvoiceLine(itemName, supplierName);
  if (!keys) {
    traceIngredientAliasesNormalizationRejection(
      "recordInvoiceLineAliasMemory",
      "buildOverrideKeysFromInvoiceLine_null",
      { itemName, supplierName: supplierName ?? null },
    );
    return { nextConfirmedAliases: confirmedAliases, recorded: false };
  }

  let nextConfirmedAliases = rememberConfirmedAliasInMap(
    confirmedAliases,
    itemName.trim(),
    keys.rawNormalized,
    ingredientId,
    supplierName,
  );
  if (keys.operationalIdentityKey !== keys.rawNormalized) {
    nextConfirmedAliases = rememberConfirmedAliasInMap(
      nextConfirmedAliases,
      itemName.trim(),
      keys.operationalIdentityKey,
      ingredientId,
      supplierName,
    );
  }

  rememberOperationalAlias(itemName, ingredientId, ingredientName, "confirmed", 8);

  traceIngredientAliases("recordInvoiceLineAliasMemory:ok", {
    itemName,
    recorded: true,
    normalizedAlias: keys.rawNormalized,
  });
  return { nextConfirmedAliases, recorded: true };
}

export type PersistInvoiceAliasMemoryParams = RecordInvoiceAliasMemoryParams & {
  supabase: AppSupabaseClient;
};

export async function persistInvoiceLineAliasMemory(
  params: PersistInvoiceAliasMemoryParams,
): Promise<{ nextConfirmedAliases: IngredientAliasMap; error: PostgrestError | null }> {
  traceIngredientAliases("persistInvoiceLineAliasMemory:enter", {
    function: "persistInvoiceLineAliasMemory",
    itemName: params.itemName,
  });
  const applied = recordInvoiceLineAliasMemory(params);
  if (!applied.recorded) {
    traceIngredientAliases("persistInvoiceLineAliasMemory:early-return", {
      branch: "not_recorded_in_memory",
      itemName: params.itemName,
      insertAttempted: false,
    });
    return { nextConfirmedAliases: applied.nextConfirmedAliases, error: null };
  }

  traceIngredientAliases("persistInvoiceLineAliasMemory:upsert-call", {
    itemName: params.itemName,
    ingredientId: params.match.ingredient.id,
    insertAttempted: true,
  });

  const keys = buildOverrideKeysFromInvoiceLine(params.itemName, params.supplierName);
  if (!keys) {
    return { nextConfirmedAliases: applied.nextConfirmedAliases, error: null };
  }
  const { error } = await upsertConfirmedAliasDualIdentity({
    ingredientId: params.match.ingredient.id,
    aliasName: params.itemName.trim(),
    rawNormalizedAlias: keys.rawNormalized,
    supplierName: params.supplierName,
    supabase: params.supabase,
    manualConfirmation: false,
  });

  if (error) {
    traceIngredientAliasesInsertError({
      function: "persistInvoiceLineAliasMemory",
      itemName: params.itemName,
      error: { message: error.message, code: error.code },
    });
  }

  return { nextConfirmedAliases: applied.nextConfirmedAliases, error };
}
