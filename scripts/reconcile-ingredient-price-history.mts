/**
 * One-off / repair: delete orphan price-history rows and rechain linked rows.
 *
 *   npx vite-node scripts/reconcile-ingredient-price-history.mts [ingredient-id ...]
 *
 * With no args, reconciles every ingredient that has orphan rows (invoice_id IS NULL).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in `.env.local`.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { reconcileIngredientPriceHistoryChain } from "../src/lib/ingredient-price-history-reconcile";

function loadEnvLocal(): void {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

await loadEnvLocal();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !serviceKey) {
  console.error(
    JSON.stringify({
      error: "Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    }),
  );
  process.exit(1);
}

const client = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const argIds = process.argv.slice(2).map((id) => id.trim()).filter(Boolean);
let ingredientIds = argIds;

if (ingredientIds.length === 0) {
  const { data, error } = await client
    .from("ingredient_price_history")
    .select("ingredient_id")
    .is("invoice_id", null);
  if (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
  ingredientIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.ingredient_id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

const results = [];
for (const ingredientId of ingredientIds) {
  results.push({
    ingredientId,
    ...(await reconcileIngredientPriceHistoryChain(client, ingredientId)),
  });
}

console.log(JSON.stringify({ ingredientCount: ingredientIds.length, results }, null, 2));
