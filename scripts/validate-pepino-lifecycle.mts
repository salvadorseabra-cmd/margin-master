/**
 * Read-only Pepino lifecycle validation queries.
 *
 *   npx vite-node scripts/validate-pepino-lifecycle.mts [baseline|after-step]
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const BIDFOOD = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const CONSERVA = "635a1189-36ea-4ff2-9012-8172ab1ab81d";
const POISON = "a689bd91-5b83-41d9-b060-b5a63ccfb3b4";
const KNOWN_PEPINO_ITEM = "aca361a1-ad60-43fa-9cc4-1345b7d45af3";

const mode = process.argv[2] ?? "baseline";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findPepinoItemId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("invoice_items")
    .select("id,name")
    .eq("invoice_id", BIDFOOD)
    .ilike("name", "pepino")
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

async function coverageSnapshot() {
  const [{ data: items, error: itemsErr }, { data: matches, error: matchesErr }] =
    await Promise.all([
      supabase.from("invoice_items").select("id"),
      supabase.from("invoice_item_matches").select("invoice_item_id"),
    ]);

  if (itemsErr) throw itemsErr;
  if (matchesErr) throw matchesErr;

  const itemSet = new Set((items ?? []).map((r) => r.id));
  const matchIds = (matches ?? []).map((r) => r.invoice_item_id);
  const orphans = matchIds.filter((id) => !itemSet.has(id));

  const seen = new Map<string, number>();
  for (const id of matchIds) {
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([invoice_item_id, count]) => ({ invoice_item_id, count }));

  return {
    total_items: items?.length ?? 0,
    total_matches: matches?.length ?? 0,
    orphan_count: orphans.length,
    duplicate_count: duplicates.length,
    orphan_sample: orphans.slice(0, 5),
    duplicates_sample: duplicates.slice(0, 5),
  };
}

async function snapshot() {
  const pepinoItemId = await findPepinoItemId();

  const queries: Record<string, unknown> = {
    mode,
    queried_at: new Date().toISOString(),
    bidfood_invoice_id: BIDFOOD,
    pepino_conserva_id: CONSERVA,
    poison_history_id: POISON,
    pepino_item_id: pepinoItemId,
    known_pepino_item_id: KNOWN_PEPINO_ITEM,
    pepino_item_id_matches_known: pepinoItemId === KNOWN_PEPINO_ITEM,
  };

  if (pepinoItemId) {
    const { data: match, error: matchErr } = await supabase
      .from("invoice_item_matches")
      .select("*")
      .eq("invoice_item_id", pepinoItemId)
      .maybeSingle();
    if (matchErr) throw matchErr;
    queries.pepinoMatch = match;
  }

  const [
    { data: conserva, error: conservaErr },
    { data: fresco, error: frescoErr },
    { data: conservaHistory, error: conservaHistoryErr },
    { data: poison, error: poisonErr },
    { data: bidfoodHistory, error: bidfoodHistoryErr },
    { data: aliases, error: aliasesErr },
    { data: allPepinoIngredients, error: allPepinoErr },
  ] = await Promise.all([
    supabase.from("ingredients").select("*").eq("id", CONSERVA).maybeSingle(),
    supabase
      .from("ingredients")
      .select("*")
      .or("name.ilike.%pepino fresco%,normalized_name.ilike.%pepino fresco%"),
    supabase
      .from("ingredient_price_history")
      .select("*")
      .eq("ingredient_id", CONSERVA)
      .order("created_at"),
    supabase.from("ingredient_price_history").select("*").eq("id", POISON).maybeSingle(),
    supabase.from("ingredient_price_history").select("*").eq("invoice_id", BIDFOOD),
    supabase
      .from("ingredient_aliases")
      .select("*")
      .or("alias_name.ilike.%pepino%,normalized_alias.ilike.%pepino%"),
    supabase
      .from("ingredients")
      .select("id,name,normalized_name,current_price")
      .or("name.ilike.%pepino%,normalized_name.ilike.%pepino%"),
  ]);

  for (const err of [
    conservaErr,
    frescoErr,
    conservaHistoryErr,
    poisonErr,
    bidfoodHistoryErr,
    aliasesErr,
    allPepinoErr,
  ]) {
    if (err) throw err;
  }

  queries.conserva = conserva;
  queries.pepinoFresco = fresco;
  queries.allPepinoIngredients = allPepinoIngredients;
  queries.conservaHistory = conservaHistory;
  queries.poisonRow = poison;
  queries.poisonRowExists = poison != null;
  queries.bidfoodPriceHistory = bidfoodHistory;
  queries.pepinoAliases = aliases;
  queries.coverage = await coverageSnapshot();

  if (mode === "after-step" && fresco && fresco.length > 0) {
    const frescoIds = fresco.map((i) => i.id);
    const { data: frescoHistory, error: frescoHistoryErr } = await supabase
      .from("ingredient_price_history")
      .select("*")
      .in("ingredient_id", frescoIds)
      .order("created_at");
    if (frescoHistoryErr) throw frescoHistoryErr;
    queries.frescoHistory = frescoHistory;
  }

  return queries;
}

console.log(JSON.stringify(await snapshot(), null, 2));
