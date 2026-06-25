import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { buildIngredientAliasLookupKey, rememberAliasInMap } from "@/lib/ingredient-alias-lookup";
import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { normalizeInvoiceAliasMemoryKey } from "@/lib/normalize-ingredient-name";
import { buildOverrideKeysFromInvoiceLine } from "@/lib/ingredient-match-override";
import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import {
  buildOperationalIdentityAliasKey,
  normalizeOperationalAliasKey,
} from "@/lib/ingredient-operational-alias-memory";
import {
  traceAliasHiddenConstraint,
  traceAliasReloadCollision,
  traceAliasStateDesync,
  traceRematchBlockedExistingRow,
} from "@/lib/alias-state-trace";
import { traceManualIngredientMatch } from "@/lib/manual-ingredient-match-trace";
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

export type AliasOwnershipRow = {
  id: string;
  ingredient_id: string;
  alias_name?: string;
  confidence: number;
};

export type AliasOwnershipCollision = {
  lookupKey: string;
  normalizedAlias: string;
  supplierName: string | null;
  rows: Array<{
    aliasId: string;
    ingredientId: string;
    aliasName: string;
  }>;
};

function aliasOwnershipScopeQuery(
  client: AppSupabaseClient,
  normalizedAlias: string,
  supplierName: string | null,
) {
  let query = client
    .from("ingredient_aliases")
    .select("id, ingredient_id, alias_name, confidence")
    .eq("normalized_alias", normalizedAlias);

  if (supplierName) {
    query = query.eq("supplier_name", supplierName);
  } else {
    query = query.is("supplier_name", null);
  }

  return query;
}

function existingAliasQuery(
  client: AppSupabaseClient,
  ingredientId: string,
  normalizedAlias: string,
  supplierName: string | null,
) {
  return aliasOwnershipScopeQuery(client, normalizedAlias, supplierName)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();
}

/** Rows sharing the same supplier-scoped ownership key (any ingredient). */
export async function listAliasOwnershipRows(
  client: AppSupabaseClient,
  normalizedAlias: string,
  supplierName: string | null,
): Promise<{ rows: AliasOwnershipRow[]; error: PostgrestError | null }> {
  const { data, error } = await aliasOwnershipScopeQuery(client, normalizedAlias, supplierName);
  if (error) {
    return { rows: [], error };
  }
  return { rows: (data ?? []) as AliasOwnershipRow[], error: null };
}

/**
 * Remove alias rows on other ingredients that own the same supplier + normalized_alias.
 * Only identical ownership keys are affected — distinct suppliers or aliases are untouched.
 */
export async function releaseStaleAliasOwnership(
  client: AppSupabaseClient,
  targetIngredientId: string,
  normalizedAlias: string,
  supplierName: string | null,
): Promise<{ releasedIds: string[]; error: PostgrestError | null }> {
  const { rows, error } = await listAliasOwnershipRows(client, normalizedAlias, supplierName);
  if (error) {
    return { releasedIds: [], error };
  }

  const staleRows = rows.filter((row) => row.ingredient_id !== targetIngredientId);
  if (staleRows.length === 0) {
    return { releasedIds: [], error: null };
  }

  const releasedIds: string[] = [];
  for (const staleRow of staleRows) {
    traceIngredientAliases("releaseStaleAliasOwnership:delete", {
      staleAliasId: staleRow.id,
      staleIngredientId: staleRow.ingredient_id,
      targetIngredientId,
      normalizedAlias,
      supplierName,
    });
    const { error: deleteError } = await client
      .from("ingredient_aliases")
      .delete()
      .eq("id", staleRow.id);
    if (deleteError) {
      logSupabaseError("releaseStaleAliasOwnership delete", deleteError);
      return { releasedIds, error: deleteError };
    }
    releasedIds.push(staleRow.id);
  }

  return { releasedIds, error: null };
}

/** Read-only scan: same supplier + normalized_alias mapped to multiple ingredients. */
export function detectAliasOwnershipCollisions(
  rows: Array<{
    id: string;
    ingredient_id: string;
    alias_name: string;
    normalized_alias: string;
    supplier_name: string | null;
  }>,
): AliasOwnershipCollision[] {
  const byKey = new Map<string, AliasOwnershipCollision>();

  for (const row of rows) {
    const normalizedAlias = row.normalized_alias?.trim();
    if (!normalizedAlias) continue;
    const supplier = normalizeSupplierScope(row.supplier_name);
    const lookupKey = buildIngredientAliasLookupKey(normalizedAlias, supplier);
    const existing = byKey.get(lookupKey);
    const entry = {
      aliasId: row.id,
      ingredientId: row.ingredient_id,
      aliasName: row.alias_name,
    };
    if (existing) {
      if (!existing.rows.some((r) => r.ingredientId === row.ingredient_id && r.aliasId === row.id)) {
        existing.rows.push(entry);
      }
    } else {
      byKey.set(lookupKey, {
        lookupKey,
        normalizedAlias,
        supplierName: supplier,
        rows: [entry],
      });
    }
  }

  return [...byKey.values()].filter((collision) => {
    const uniqueIngredients = new Set(collision.rows.map((r) => r.ingredientId));
    return uniqueIngredients.size > 1;
  });
}

/**
 * Persist a user-confirmed invoice line → ingredient link.
 * Dedupes on supplier + normalized alias globally; at most one ingredient owns each key.
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

  const { releasedIds, error: releaseError } = await releaseStaleAliasOwnership(
    supabase,
    ingredientId,
    normalizedAlias,
    supplier,
  );
  if (releaseError) {
    logSupabaseError("upsertConfirmedAlias releaseStaleAliasOwnership", releaseError);
    traceIngredientAliasesInsertError({
      function: "upsertConfirmedAlias",
      phase: "release_stale_ownership",
      aliasName: alias,
      error: {
        message: releaseError.message,
        code: releaseError.code,
        details: releaseError.details,
      },
    });
    return { error: releaseError };
  }
  if (releasedIds.length > 0) {
    traceIngredientAliases("upsertConfirmedAlias:released-stale-ownership", {
      aliasName: alias,
      ingredientId,
      normalizedAlias,
      supplierName: supplier,
      releasedIds,
    });
  }

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
    traceRematchBlockedExistingRow({
      phase: "upsert_existing_row",
      aliasName: alias,
      ingredientId,
      normalizedAlias,
      supplierName: supplier,
      existingId: existing.id,
      note: "update path — not blocked; row already linked to this ingredient",
    });
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
    if (insertError.code === "23505") {
      traceAliasHiddenConstraint({
        phase: "insert_unique_violation",
        aliasName: alias,
        ingredientId,
        normalizedAlias,
        supplierName: supplier,
        code: insertError.code,
        message: insertError.message,
      });
    }
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
 * Persist raw + operational identity alias rows when commodity brand prefix strip yields
 * a distinct lookup key. Uses releaseStaleAliasOwnership per key — no duplicate ownership.
 */
export async function upsertConfirmedAliasDualIdentity({
  ingredientId,
  aliasName,
  rawNormalizedAlias,
  supplierName,
  supabase,
  manualConfirmation = false,
}: {
  ingredientId: string;
  aliasName: string;
  rawNormalizedAlias: string;
  supplierName?: string | null;
  supabase: AppSupabaseClient;
  manualConfirmation?: boolean;
}): Promise<{ error: PostgrestError | null }> {
  const operationalAlias = buildOperationalIdentityAliasKey(aliasName) || rawNormalizedAlias;

  const { error: primaryError } = await upsertConfirmedAlias({
    ingredientId,
    aliasName,
    normalizedAlias: rawNormalizedAlias,
    supplierName,
    supabase,
    manualConfirmation,
  });
  if (primaryError) return { error: primaryError };

  if (operationalAlias !== rawNormalizedAlias) {
    const { error: operationalError } = await upsertConfirmedAlias({
      ingredientId,
      aliasName,
      normalizedAlias: operationalAlias,
      supplierName,
      supabase,
      manualConfirmation,
    });
    if (operationalError) return { error: operationalError };
  }

  return { error: null };
}

export type ConfirmedIngredientAliasRow = {
  ingredient_id: string;
  alias_name: string;
  normalized_alias: string;
  supplier_name: string | null;
};

/** Resolve lookup key from DB row — prefer operational identity re-derived from alias_name. */
export function resolveNormalizedAliasFromConfirmedRow(
  row: ConfirmedIngredientAliasRow,
): string | null {
  const aliasName = row.alias_name?.trim();
  if (aliasName) {
    const operational = buildOperationalIdentityAliasKey(aliasName);
    if (operational) return operational;
  }

  const fromLine = aliasName
    ? buildOverrideKeysFromInvoiceLine(aliasName, row.supplier_name)
    : null;
  if (fromLine?.rawNormalized) return fromLine.rawNormalized;

  if (aliasName) {
    const expanded = normalizeSupplierShorthand(aliasName);
    const fallback = normalizeOperationalAliasKey(expanded || aliasName);
    if (fallback) return fallback;
  }

  return row.normalized_alias?.trim().toLowerCase() || null;
}

/** Build the in-memory alias map used by invoice matching from confirmed DB rows. */
export function buildConfirmedAliasMapFromRows(
  rows: ConfirmedIngredientAliasRow[],
): IngredientAliasMap {
  const map: IngredientAliasMap = {};
  const collisions: Array<{
    lookupKey: string;
    previousIngredientId: string;
    nextIngredientId: string;
    aliasName: string;
  }> = [];

  for (const row of rows) {
    const normalizedAlias = resolveNormalizedAliasFromConfirmedRow(row);
    if (!normalizedAlias) continue;

    const lookupKey = buildIngredientAliasLookupKey(normalizedAlias, row.supplier_name);
    const previousIngredientId = map[lookupKey];
    if (previousIngredientId && previousIngredientId !== row.ingredient_id) {
      const collision = {
        lookupKey,
        previousIngredientId,
        nextIngredientId: row.ingredient_id,
        aliasName: row.alias_name,
      };
      collisions.push(collision);
      traceAliasReloadCollision({ ...collision, rowCount: rows.length });
    }
    map[lookupKey] = row.ingredient_id;
  }

  if (collisions.length > 0) {
    traceAliasStateDesync({
      memoryKeyCount: Object.keys(map).length,
      trigger: "buildConfirmedAliasMapFromRows:collision_summary",
    });
    traceManualIngredientMatch("[manual_match_reload_result]", {
      phase: "alias_map_collision",
      collisionCount: collisions.length,
      collisions,
      mapKeyCount: Object.keys(map).length,
    });
  }

  return map;
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

    const rows = (data ?? []) as ConfirmedIngredientAliasRow[];
    const map = buildConfirmedAliasMapFromRows(rows);
    traceManualIngredientMatch("[manual_match_reload_result]", {
      phase: "load_confirmed_aliases",
      rowCount: rows.length,
      mapKeyCount: Object.keys(map).length,
      sampleKeys: Object.keys(map).slice(0, 12),
    });
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
