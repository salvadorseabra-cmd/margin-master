/**
 * Read-only Anchovas persistence paradox validation.
 *
 * Extends validate-anchoas-reread.mts with post-hardening OCR variants
 * and Pepino comparison.
 *
 *   npx vite-node scripts/validate-anchovas-persistence.mts [baseline|matcher|pepino|all]
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import { normalizeInvoiceIngredientName } from "../src/lib/ingredient-canonical";
import { getInvoiceRowIngredientMatchState } from "../src/lib/ingredient-match-explanation";
import {
  clearIngredientMatchOverridesForTests,
  hydrateIngredientMatchOverridesFromAliasRows,
} from "../src/lib/ingredient-match-override";
import { lookupIngredientIdFromAliasMap } from "../src/lib/ingredient-alias-lookup";
import { findInvoiceItemIngredientMatch } from "../src/lib/invoice-ingredient-match-propagation";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const AVILUDO_APRIL = "c2f52357-0f80-491a-ba14-c97ff4837472";
const BIDFOOD = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const ANCHOAS_ID = "c811f67f-df4d-4194-ba8b-7a15d4af38bd";
const PEPINO_ID = "635a1189-36ea-4ff2-9012-8172ab1ab81d";

/** Post-hardening stable spelling + historical variants from investigation */
const ANCHOVAS_OCR_VARIANTS = [
  "Filete de Anchoas Alconfirosa LI 495 g",
  "Filete de Anchovas Alconfrista Lt 495 g",
  "Filete de Anchovas Alconfi sta Lt 495 g",
  "Filete de Anchovas Alconfrisa Lt 495 g",
  "Filete de Anchovas Alconfirsta L1 495 g",
] as const;

const mode = process.argv[2] ?? "all";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function loadAliasContext() {
  const { rows: catalog } = await loadCanonicalIngredientCatalog(supabase);
  const { data: aliasRows, error } = await supabase
    .from("ingredient_aliases")
    .select("*")
    .eq("confirmed_by_user", true);

  if (error) throw error;

  const aliasesMap = buildConfirmedAliasMapFromRows(aliasRows ?? []);
  clearIngredientMatchOverridesForTests();
  hydrateIngredientMatchOverridesFromAliasRows(aliasRows ?? [], catalog);

  const anchoasKeys = Object.entries(aliasesMap)
    .filter(([, id]) => id === ANCHOAS_ID)
    .map(([k]) => k);

  return { catalog, aliasRows: aliasRows ?? [], aliasesMap, anchoasKeys };
}

function simulateMatch(
  name: string,
  supplier: string,
  catalog: Awaited<ReturnType<typeof loadCanonicalIngredientCatalog>>["rows"],
  aliasesMap: Record<string, string>,
) {
  const normalized = normalizeInvoiceIngredientName(name);
  const aliasHit = lookupIngredientIdFromAliasMap(aliasesMap, normalized, supplier, name);
  const match = findInvoiceItemIngredientMatch(name, catalog, aliasesMap, supplier);
  const state = getInvoiceRowIngredientMatchState(match);

  return {
    name,
    normalized,
    aliasHit,
    kind: match?.kind ?? null,
    displayState: state.displayState,
    ingredient: match?.ingredient?.name ?? null,
  };
}

async function matcherSnapshot() {
  const { catalog, aliasesMap, anchoasKeys } = await loadAliasContext();

  return {
    mode: "matcher",
    queried_at: new Date().toISOString(),
    anchoas_alias_count: anchoasKeys.length,
    anchoas_alias_keys: anchoasKeys,
    variants: ANCHOVAS_OCR_VARIANTS.map((name) =>
      simulateMatch(name, "AVILUDO", catalog, aliasesMap),
    ),
    hardening_stable_unmatched:
      simulateMatch(ANCHOVAS_OCR_VARIANTS[0], "AVILUDO", catalog, aliasesMap).displayState ===
      "unmatched",
  };
}

async function baselineSnapshot() {
  const { data: aliasRows, error: aliasErr } = await supabase
    .from("ingredient_aliases")
    .select("*")
    .eq("ingredient_id", ANCHOAS_ID);

  if (aliasErr) throw aliasErr;

  const { data: items, error: itemsErr } = await supabase
    .from("invoice_items")
    .select("id,name,created_at")
    .eq("invoice_id", AVILUDO_APRIL)
    .order("created_at");

  if (itemsErr) throw itemsErr;

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

  const { data: aviludoMatches, error: matchesErr } = await supabase
    .from("invoice_item_matches")
    .select("invoice_item_id,status,match_kind,ingredient_id")
    .eq("invoice_id", AVILUDO_APRIL);

  if (matchesErr) throw matchesErr;

  return {
    mode: "baseline",
    queried_at: new Date().toISOString(),
    aviludo_april_invoice_id: AVILUDO_APRIL,
    anchoas_alias_count: aliasRows?.length ?? 0,
    anchovas_item: anchovasItem,
    match_row: matchRow,
    aviludo_summary: {
      total: aviludoMatches?.length ?? 0,
      confirmed: (aviludoMatches ?? []).filter((m) => m.status === "confirmed").length,
      unmatched: (aviludoMatches ?? []).filter((m) => m.status === "unmatched").length,
      confirmed_override: (aviludoMatches ?? []).filter(
        (m) => m.match_kind === "confirmed-override",
      ).length,
    },
    alias_rows: (aliasRows ?? []).map((a) => ({
      supplier: a.supplier_name,
      alias_name: a.alias_name,
      normalized: a.normalized_alias,
      created_at: a.created_at,
    })),
  };
}

async function pepinoSnapshot() {
  const { catalog, aliasesMap } = await loadAliasContext();

  const [{ data: items }, { data: matches }] = await Promise.all([
    supabase.from("invoice_items").select("id,name").eq("invoice_id", BIDFOOD),
    supabase
      .from("invoice_item_matches")
      .select("invoice_item_id,status,match_kind,ingredient_id")
      .eq("invoice_id", BIDFOOD),
  ]);

  const pepinoLines = (items ?? []).filter((i) => /pepino/i.test(i.name ?? ""));

  return {
    mode: "pepino",
    queried_at: new Date().toISOString(),
    bidfood_invoice_id: BIDFOOD,
    lines: pepinoLines.map((item) => {
      const virtual = simulateMatch(item.name ?? "", "Bidfood", catalog, aliasesMap);
      const persisted = (matches ?? []).find((m) => m.invoice_item_id === item.id);
      return { line: item.name, item_id: item.id, virtual, persisted };
    }),
    bare_pepino: simulateMatch("Pepino", "Bidfood", catalog, aliasesMap),
  };
}

async function allSnapshot() {
  const [baseline, matcher, pepino] = await Promise.all([
    baselineSnapshot(),
    matcherSnapshot(),
    pepinoSnapshot(),
  ]);

  return {
    mode: "all",
    queried_at: new Date().toISOString(),
    verdict_tag: "ALIAS_KEY_GAP_AFTER_OCR_STABILIZATION",
    baseline,
    matcher,
    pepino,
  };
}

const runners: Record<string, () => Promise<unknown>> = {
  baseline: baselineSnapshot,
  matcher: matcherSnapshot,
  pepino: pepinoSnapshot,
  all: allSnapshot,
};

const runner = runners[mode];
if (!runner) {
  console.error(`Unknown mode: ${mode}. Use baseline|matcher|pepino|all`);
  process.exit(1);
}

console.log(JSON.stringify(await runner(), null, 2));
