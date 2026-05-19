import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIngredientAliasLookupKey } from "@/lib/ingredient-alias-lookup";
import { getVolatileIngredients } from "@/lib/ingredient-price-history";
import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

const LOG_PREFIX = "[invoice-operational-metadata]";

export type InvoiceOperationalMetadata = {
  recipeCountByIngredientId: Record<string, number>;
  volatileIngredientIds: Set<string>;
  priceHistoryLatestAtByIngredientId: Record<string, string | null>;
  aliasCreatedAtByLookupKey: Record<string, string>;
};

export type IngredientPriceFields = {
  current_price?: number | null;
  updated_at?: string | null;
};

export function emptyInvoiceOperationalMetadata(): InvoiceOperationalMetadata {
  return {
    recipeCountByIngredientId: {},
    volatileIngredientIds: new Set(),
    priceHistoryLatestAtByIngredientId: {},
    aliasCreatedAtByLookupKey: {},
  };
}

function logQueryFailure(label: string, message: string): void {
  console.error(`${LOG_PREFIX} ${label} failed: ${message}`);
}

/**
 * Optional catalog price fields for operational badges. Matching uses id/name/unit only.
 */
export async function loadIngredientPriceFieldsById(
  client: AppSupabaseClient,
): Promise<Record<string, IngredientPriceFields>> {
  try {
    const { data, error } = await client
      .from("ingredients")
      .select("id, current_price");
    if (error) {
      logQueryFailure("loadIngredientPriceFieldsById", error.message);
      return {};
    }
    const byId: Record<string, IngredientPriceFields> = {};
    for (const row of data ?? []) {
      if (!row.id) continue;
      byId[row.id] = {
        current_price: row.current_price,
        updated_at: row.updated_at,
      };
    }
    return byId;
  } catch (err) {
    logQueryFailure(
      "loadIngredientPriceFieldsById",
      err instanceof Error ? err.message : String(err),
    );
    return {};
  }
}

export function mergeIngredientPriceFields<T extends { id: string }>(
  catalog: T[],
  priceById: Record<string, IngredientPriceFields>,
): (T & IngredientPriceFields)[] {
  return catalog.map((row) => ({
    ...row,
    ...priceById[row.id],
  }));
}

/**
 * Loads presentation-only operational metadata. Never throws; failed queries yield empty slices.
 */
export async function loadInvoiceOperationalMetadata(
  client: AppSupabaseClient,
  ingredientIds: string[],
): Promise<InvoiceOperationalMetadata> {
  const metadata = emptyInvoiceOperationalMetadata();

  const enrichmentSettled = await Promise.allSettled([
    ingredientIds.length > 0
      ? client.from("recipe_ingredients").select("ingredient_id").in("ingredient_id", ingredientIds)
      : Promise.resolve({ data: [], error: null }),
    ingredientIds.length > 0
      ? client
          .from("ingredient_price_history")
          .select("ingredient_id, created_at")
          .in("ingredient_id", ingredientIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    getVolatileIngredients(client),
    client
      .from("ingredient_aliases")
      .select("normalized_alias, supplier_name, created_at")
      .eq("confirmed_by_user", true),
  ]);

  const recipeResult = enrichmentSettled[0];
  if (recipeResult.status === "fulfilled") {
    const { data, error } = recipeResult.value;
    if (error) {
      logQueryFailure("recipe_ingredients", error.message);
    } else {
      for (const link of data ?? []) {
        if (!link.ingredient_id) continue;
        metadata.recipeCountByIngredientId[link.ingredient_id] =
          (metadata.recipeCountByIngredientId[link.ingredient_id] ?? 0) + 1;
      }
    }
  } else {
    logQueryFailure("recipe_ingredients", String(recipeResult.reason));
  }

  const historyResult = enrichmentSettled[1];
  if (historyResult.status === "fulfilled") {
    const { data, error } = historyResult.value;
    if (error) {
      logQueryFailure("ingredient_price_history", error.message);
    } else {
      for (const row of data ?? []) {
        if (!row.ingredient_id || metadata.priceHistoryLatestAtByIngredientId[row.ingredient_id]) {
          continue;
        }
        metadata.priceHistoryLatestAtByIngredientId[row.ingredient_id] = row.created_at;
      }
    }
  } else {
    logQueryFailure("ingredient_price_history", String(historyResult.reason));
  }

  const volatileResult = enrichmentSettled[2];
  if (volatileResult.status === "fulfilled") {
    metadata.volatileIngredientIds = new Set(
      volatileResult.value.map((summary) => summary.ingredient_id),
    );
  } else {
    logQueryFailure("getVolatileIngredients", String(volatileResult.reason));
  }

  const aliasResult = enrichmentSettled[3];
  if (aliasResult.status === "fulfilled") {
    const { data, error } = aliasResult.value;
    if (error) {
      logQueryFailure("ingredient_aliases", error.message);
    } else {
      for (const row of data ?? []) {
        const normalizedAlias = row.normalized_alias?.trim().toLowerCase();
        if (!normalizedAlias || !row.created_at) continue;
        const key = buildIngredientAliasLookupKey(normalizedAlias, row.supplier_name);
        const previous = metadata.aliasCreatedAtByLookupKey[key];
        if (!previous || row.created_at > previous) {
          metadata.aliasCreatedAtByLookupKey[key] = row.created_at;
        }
      }
    }
  } else {
    logQueryFailure("ingredient_aliases", String(aliasResult.reason));
  }

  return metadata;
}
