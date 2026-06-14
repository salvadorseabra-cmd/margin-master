/**
 * Read-only Anchoas re-read investigation queries.
 *
 *   npx vite-node scripts/validate-anchoas-reread.mts [baseline|matcher]
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import { normalizeInvoiceIngredientName } from "../src/lib/ingredient-canonical";
import { getInvoiceRowIngredientMatchState } from "../src/lib/ingredient-match-explanation";
import { lookupIngredientIdFromAliasMap } from "../src/lib/ingredient-alias-lookup";
import { findInvoiceItemIngredientMatch } from "../src/lib/invoice-ingredient-match-propagation";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const AVILUDO_APRIL = "c2f52357-0f80-491a-ba14-c97ff4837472";
const ANCHOAS_ID = "c811f67f-df4d-4194-ba8b-7a15d4af38bd";
const KNOWN_ANCHOVAS_ITEM = "69d22f75-87a0-430b-926a-ed4be27ce1c5";

const OCR_VARIANTS = [
  "Filete de Anchovas Alconfi sta Lt 495 g",
  "Filete de Anchovas Alconfrisa Lt 495 g",
  "Filete de Anchovas Alconfirsta L1 495 g",
  "Filete de Anchoas Alconfilosa LI 495 g",
] as const;

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

async function findAnchovasItemId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("invoice_items")
    .select("id,name")
    .eq("invoice_id", AVILUDO_APRIL)
    .or("name.ilike.%anchov%,name.ilike.%anchoa%")
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

async function matcherSnapshot() {
  const { rows: catalog } = await loadCanonicalIngredientCatalog(supabase);
  const { data: allAliasRows, error: aliasErr } = await supabase
    .from("ingredient_aliases")
    .select("*");

  if (aliasErr) throw aliasErr;

  const aliasesMap = buildConfirmedAliasMapFromRows(allAliasRows ?? []);
  const anchoasAliasKeys = Object.entries(aliasesMap)
    .filter(([, ingredientId]) => ingredientId === ANCHOAS_ID)
    .map(([key]) => key);

  const results = OCR_VARIANTS.map((name) => {
    const normalized = normalizeInvoiceIngredientName(name);
    const aliasHit = lookupIngredientIdFromAliasMap(aliasesMap, normalized, "AVILUDO", name);
    const match = findInvoiceItemIngredientMatch(name, catalog, aliasesMap, "AVILUDO");
    const state = getInvoiceRowIngredientMatchState(match);

    return {
      name,
      normalized,
      aliasHit,
      match: match
        ? {
            id: match.ingredient.id,
            name: match.ingredient.name,
            kind: match.kind,
            reason: match.reason,
            finalPromotionScore: match.scoreBreakdown?.finalPromotionScore,
            semanticSimilarity: match.semanticSimilarity,
            operationalEquivalenceConfidence: match.operationalEquivalenceConfidence,
          }
        : null,
      displayState: state.displayState,
    };
  });

  return {
    mode,
    queried_at: new Date().toISOString(),
    total_aliases: allAliasRows?.length ?? 0,
    anchoas_alias_keys: anchoasAliasKeys,
    matcher_results: results,
  };
}

async function baselineSnapshot() {
  const anchovasItemId = await findAnchovasItemId();

  const [
    { data: ingredient, error: ingredientErr },
    { data: aliasRows, error: aliasRowsErr },
    { data: aliasSearch, error: aliasSearchErr },
    { data: items, error: itemsErr },
    { data: aviludoMatches, error: matchesErr },
    { data: history, error: historyErr },
  ] = await Promise.all([
    supabase.from("ingredients").select("*").eq("id", ANCHOAS_ID).maybeSingle(),
    supabase.from("ingredient_aliases").select("*").eq("ingredient_id", ANCHOAS_ID),
    supabase
      .from("ingredient_aliases")
      .select("*")
      .or(
        "alias_name.ilike.%anchov%,alias_name.ilike.%anchoa%,alias_name.ilike.%alconfrisa%,normalized_alias.ilike.%anchov%,normalized_alias.ilike.%anchoa%,normalized_alias.ilike.%alconfrisa%",
      ),
    supabase
      .from("invoice_items")
      .select("id,name,quantity,unit,unit_price,total,created_at")
      .eq("invoice_id", AVILUDO_APRIL)
      .order("created_at"),
    supabase
      .from("invoice_item_matches")
      .select("invoice_item_id,status,match_kind,ingredient_id")
      .eq("invoice_id", AVILUDO_APRIL),
    supabase
      .from("ingredient_price_history")
      .select("id,ingredient_id,ingredient_name,invoice_id,new_price,created_at")
      .eq("ingredient_id", ANCHOAS_ID),
  ]);

  for (const err of [ingredientErr, aliasRowsErr, aliasSearchErr, itemsErr, matchesErr, historyErr]) {
    if (err) throw err;
  }

  const anchovasItem = (items ?? []).find((i) => /anchov|anchoa/i.test(i.name ?? ""));

  let matchRow = null;
  if (anchovasItem) {
    const { data, error } = await supabase
      .from("invoice_item_matches")
      .select("*")
      .eq("invoice_item_id", anchovasItem.id)
      .maybeSingle();
    if (error) throw error;
    matchRow = data;
  }

  const confirmedCount = (aviludoMatches ?? []).filter((m) => m.status === "confirmed").length;
  const unmatchedCount = (aviludoMatches ?? []).filter((m) => m.status === "unmatched").length;
  const overrideCount = (aviludoMatches ?? []).filter(
    (m) => m.match_kind === "confirmed-override",
  ).length;

  return {
    mode,
    queried_at: new Date().toISOString(),
    aviludo_april_invoice_id: AVILUDO_APRIL,
    anchoas_ingredient_id: ANCHOAS_ID,
    known_anchovas_item_id: KNOWN_ANCHOVAS_ITEM,
    anchovas_item_id: anchovasItemId,
    anchovas_item_id_matches_known: anchovasItemId === KNOWN_ANCHOVAS_ITEM,
    ingredient,
    alias_count: aliasRows?.length ?? 0,
    alias_rows: aliasRows,
    alias_search_hits: aliasSearch,
    invoice_items_count: items?.length ?? 0,
    anchovas_item: anchovasItem,
    match_row: matchRow,
    aviludo_match_summary: {
      total: aviludoMatches?.length ?? 0,
      confirmed: confirmedCount,
      unmatched: unmatchedCount,
      confirmed_override: overrideCount,
      rows: aviludoMatches,
    },
    anchoas_price_history: history,
    all_item_names: (items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      created_at: i.created_at,
    })),
  };
}

const snapshot = mode === "matcher" ? matcherSnapshot : baselineSnapshot;
console.log(JSON.stringify(await snapshot(), null, 2));
