import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { buildIngredientAliasLookupKey, rememberAliasInMap } from "@/lib/ingredient-alias-lookup";
import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { normalizeInvoiceAliasMemoryKey } from "@/lib/normalize-ingredient-name";
import { buildOverrideKeysFromInvoiceLine } from "@/lib/ingredient-match-override";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";
import type { Database } from "@/integrations/supabase/types";
import {
  traceIngredientAliases,
  traceIngredientAliasesCatch,
  traceIngredientAliasesInsertAfter,
  traceIngredientAliasesInsertBefore,
  traceIngredientAliasesInsertError,
  traceIngredientAliasesNormalizationRejection,
  traceIngredientAliasesValidationRejection,
} from "@/lib/ingredient-aliases-trace";

export type AppSupabaseClient = SupabaseClient<Database>;

export {
  buildIngredientAliasLookupKey,
  lookupIngredientIdFromAliasMap,
  rememberAliasInMap,
  rememberConfirmedAliasInMap,
} from "@/lib/ingredient-alias-lookup";

const CONFIDENCE_CAP = 10;
const LOG_PREFIX = "[ingredient_aliases]";

function debugAliasLog(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.debug(`${LOG_PREFIX} ${message}`, details);
    return;
  }
  console.debug(`${LOG_PREFIX} ${message}`);
}

export type UpsertConfirmedAliasParams = {
  ingredientId: string;
  aliasName: string;
  /** When set (e.g. manual correction), persisted normalized_alias uses this operational key. */
  normalizedAlias?: string;
  supplierName?: string | null;
  supabase: AppSupabaseClient;
  /** User explicitly confirmed or manually selected — store max confidence in DB. */
  manualConfirmation?: boolean;
};

function logSupabaseError(label: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  const code = error.code ? ` code=${error.code}` : "";
  console.error(`${LOG_PREFIX} ${label} failed: ${error.message}${code}`);
}

function normalizeSupplierScope(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeSupplierDisplayName(raw);
  return normalized || null;
}

function existingAliasQuery(
  client: AppSupabaseClient,
  ingredientId: string,
  normalizedAlias: string,
  supplierName: string | null,
) {
  let query = client
    .from("ingredient_aliases")
    .select("id, confidence")
    .eq("ingredient_id", ingredientId)
    .eq("normalized_alias", normalizedAlias);

  if (supplierName) {
    query = query.eq("supplier_name", supplierName);
  } else {
    query = query.is("supplier_name", null);
  }

  return query.maybeSingle();
}

/**
 * Persist a user-confirmed invoice line → ingredient link.
 * Dedupes on ingredient + normalized alias (+ supplier when provided).
 */
export async function upsertConfirmedAlias({
  ingredientId,
  aliasName,
  normalizedAlias: normalizedAliasOverride,
  supplierName,
  supabase,
  manualConfirmation = false,
}: UpsertConfirmedAliasParams): Promise<{ error: PostgrestError | null }> {
  traceIngredientAliases("upsertConfirmedAlias:enter", {
    function: "upsertConfirmedAlias",
    aliasName,
    ingredientId,
    normalizedAliasOverride: normalizedAliasOverride ?? null,
    supplierName: supplierName ?? null,
    manualConfirmation,
  });

  const alias = aliasName.trim();
  if (!alias) {
    traceIngredientAliasesValidationRejection("upsertConfirmedAlias", "empty_alias_trim", {
      aliasName,
    });
    return {
      error: { message: "Alias name is required", code: "invalid_alias" } as PostgrestError,
    };
  }

  const normalizedAlias = (
    normalizedAliasOverride?.trim() || normalizeInvoiceAliasMemoryKey(alias)
  );
  if (!normalizedAlias) {
    traceIngredientAliasesNormalizationRejection("upsertConfirmedAlias", "empty_after_normalize", {
      aliasName: alias,
      normalizedAliasOverride: normalizedAliasOverride ?? null,
    });
    return {
      error: {
        message: "Alias name is empty after normalization",
        code: "invalid_alias",
      } as PostgrestError,
    };
  }

  const supplier = normalizeSupplierScope(supplierName);

  const { data: existing, error: selectError, status: selectStatus } = await existingAliasQuery(
    supabase,
    ingredientId,
    normalizedAlias,
    supplier,
  );

  traceIngredientAliases("upsertConfirmedAlias:select-after", {
    aliasName: alias,
    ingredientId,
    normalizedAlias,
    supplierName: supplier,
    existingId: existing?.id ?? null,
    selectStatus: selectStatus ?? null,
    selectError: selectError
      ? { message: selectError.message, code: selectError.code, details: selectError.details }
      : null,
  });

  if (selectError) {
    logSupabaseError("upsertConfirmedAlias select", selectError);
    traceIngredientAliasesInsertError({
      function: "upsertConfirmedAlias",
      phase: "select",
      aliasName: alias,
      selectError: {
        message: selectError.message,
        code: selectError.code,
        details: selectError.details,
      },
    });
    return { error: selectError };
  }

  if (existing) {
    traceIngredientAliases("upsertConfirmedAlias:update-branch", {
      aliasName: alias,
      existingId: existing.id,
      manualConfirmation,
    });
    const currentConfidence = Number(existing.confidence);
    const nextConfidence = manualConfirmation
      ? CONFIDENCE_CAP
      : Math.min(CONFIDENCE_CAP, (Number.isFinite(currentConfidence) ? currentConfidence : 0) + 1);
    const updatePayload = {
      alias_name: alias,
      confidence: nextConfidence,
      confirmed_by_user: true,
    };
    traceIngredientAliasesInsertBefore({
      function: "upsertConfirmedAlias",
      phase: "update",
      aliasName: alias,
      payload: updatePayload,
      existingId: existing.id,
    });
    const updateResponse = await supabase
      .from("ingredient_aliases")
      .update(updatePayload)
      .eq("id", existing.id);
    traceIngredientAliasesInsertAfter({
      function: "upsertConfirmedAlias",
      phase: "update",
      aliasName: alias,
      data: updateResponse.data,
      status: updateResponse.status,
      statusText: updateResponse.statusText,
      error: updateResponse.error
        ? {
            message: updateResponse.error.message,
            code: updateResponse.error.code,
            details: updateResponse.error.details,
          }
        : null,
    });

    const updateError = updateResponse.error;
    if (updateError) {
      logSupabaseError("upsertConfirmedAlias update", updateError);
      traceIngredientAliasesInsertError({
        function: "upsertConfirmedAlias",
        phase: "update",
        aliasName: alias,
        error: {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
        },
      });
    } else {
      debugAliasLog("saved alias (updated)", {
        ingredientId,
        aliasName: alias,
        normalizedAlias,
        supplierName: supplier,
      });
    }
    return { error: updateError };
  }

  const insertPayload = {
    ingredient_id: ingredientId,
    alias_name: alias,
    normalized_alias: normalizedAlias,
    supplier_name: supplier,
    confidence: manualConfirmation ? CONFIDENCE_CAP : 1,
    confirmed_by_user: true,
  };
  traceIngredientAliasesInsertBefore({
    function: "upsertConfirmedAlias",
    phase: "insert",
    aliasName: alias,
    payload: insertPayload,
  });

  const insertResponse = await supabase.from("ingredient_aliases").insert(insertPayload);

  traceIngredientAliasesInsertAfter({
    function: "upsertConfirmedAlias",
    phase: "insert",
    aliasName: alias,
    data: insertResponse.data,
    status: insertResponse.status,
    statusText: insertResponse.statusText,
    error: insertResponse.error
      ? {
          message: insertResponse.error.message,
          code: insertResponse.error.code,
          details: insertResponse.error.details,
          hint: insertResponse.error.hint,
        }
      : null,
  });

  const insertError = insertResponse.error;
  if (insertError) {
    logSupabaseError("upsertConfirmedAlias insert", insertError);
    traceIngredientAliasesInsertError({
      function: "upsertConfirmedAlias",
      phase: "insert",
      aliasName: alias,
      payload: insertPayload,
      error: {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      },
    });
  } else {
    debugAliasLog("saved alias (inserted)", {
      ingredientId,
      aliasName: alias,
      normalizedAlias,
      supplierName: supplier,
    });
  }
  traceIngredientAliases("upsertConfirmedAlias:exit", {
    aliasName: alias,
    insertAttempted: true,
    ok: !insertError,
  });
  return { error: insertError };
}

/**
 * Build the in-memory alias map used by invoice matching from confirmed DB rows.
 */
export async function loadConfirmedIngredientAliasMap(
  client: AppSupabaseClient,
): Promise<IngredientAliasMap> {
  try {
    const { data, error } = await client
      .from("ingredient_aliases")
      .select("ingredient_id, alias_name, normalized_alias, supplier_name")
      .eq("confirmed_by_user", true);

    if (error) {
      logSupabaseError("loadConfirmedIngredientAliasMap", error);
      return {};
    }

    const map: IngredientAliasMap = {};
    for (const row of (data ?? []) as {
      ingredient_id: string;
      alias_name: string;
      normalized_alias: string;
      supplier_name: string | null;
    }[]) {
      const fromLine = row.alias_name?.trim()
        ? buildOverrideKeysFromInvoiceLine(row.alias_name, row.supplier_name)
        : null;
      const normalizedAlias = (
        fromLine?.rawNormalized ?? row.normalized_alias?.trim().toLowerCase()
      );
      if (!normalizedAlias) continue;
      map[buildIngredientAliasLookupKey(normalizedAlias, row.supplier_name)] = row.ingredient_id;
    }
    debugAliasLog("loaded confirmed aliases", { count: Object.keys(map).length });
    return map;
  } catch (err) {
    traceIngredientAliasesCatch("loadConfirmedIngredientAliasMap", err);
    console.error(
      `${LOG_PREFIX} loadConfirmedIngredientAliasMap threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}
