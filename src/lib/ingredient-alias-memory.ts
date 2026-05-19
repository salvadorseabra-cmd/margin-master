import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { normalizeInvoiceIngredientName } from "@/lib/ingredient-canonical";
import { normalizeIngredientName } from "@/lib/normalizeIngredient";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";
import type { Database } from "@/integrations/supabase/types";

export type AppSupabaseClient = SupabaseClient<Database>;

const CONFIDENCE_CAP = 10;
const LOG_PREFIX = "[ingredient_aliases]";

export type UpsertConfirmedAliasParams = {
  ingredientId: string;
  aliasName: string;
  supplierName?: string | null;
  supabase: AppSupabaseClient;
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
  supplierName,
  supabase,
}: UpsertConfirmedAliasParams): Promise<{ error: PostgrestError | null }> {
  const alias = aliasName.trim();
  if (!alias) {
    return {
      error: { message: "Alias name is required", code: "invalid_alias" } as PostgrestError,
    };
  }

  const normalizedAlias = normalizeIngredientName(alias);
  if (!normalizedAlias) {
    return {
      error: {
        message: "Alias name is empty after normalization",
        code: "invalid_alias",
      } as PostgrestError,
    };
  }

  const supplier = normalizeSupplierScope(supplierName);

  const { data: existing, error: selectError } = await existingAliasQuery(
    supabase,
    ingredientId,
    normalizedAlias,
    supplier,
  );

  if (selectError) {
    logSupabaseError("upsertConfirmedAlias select", selectError);
    return { error: selectError };
  }

  if (existing) {
    const currentConfidence = Number(existing.confidence);
    const nextConfidence = Math.min(
      CONFIDENCE_CAP,
      (Number.isFinite(currentConfidence) ? currentConfidence : 0) + 1,
    );
    const { error: updateError } = await supabase
      .from("ingredient_aliases")
      .update({
        alias_name: alias,
        confidence: nextConfidence,
        confirmed_by_user: true,
      })
      .eq("id", existing.id);

    if (updateError) {
      logSupabaseError("upsertConfirmedAlias update", updateError);
    }
    return { error: updateError };
  }

  const { error: insertError } = await supabase.from("ingredient_aliases").insert({
    ingredient_id: ingredientId,
    alias_name: alias,
    normalized_alias: normalizedAlias,
    supplier_name: supplier,
    confidence: 1,
    confirmed_by_user: true,
  });

  if (insertError) {
    logSupabaseError("upsertConfirmedAlias insert", insertError);
  }
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
      .select("ingredient_id, alias_name")
      .eq("confirmed_by_user", true);

    if (error) {
      logSupabaseError("loadConfirmedIngredientAliasMap", error);
      return {};
    }

    const map: IngredientAliasMap = {};
    for (const row of (data ?? []) as { ingredient_id: string; alias_name: string }[]) {
      const key = normalizeInvoiceIngredientName(row.alias_name);
      if (key) map[key] = row.ingredient_id;
    }
    return map;
  } catch (err) {
    console.error(
      `${LOG_PREFIX} loadConfirmedIngredientAliasMap threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}
