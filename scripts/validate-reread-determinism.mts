/**
 * Read-only re-read determinism validation queries.
 *
 * Audits Anchovas (Aviludo) and Pepino (Bidfood) match state across
 * persisted vs virtual layers, plus OCR variant matcher simulation.
 *
 *   npx vite-node scripts/validate-reread-determinism.mts [baseline|matcher|flags]
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import { normalizeInvoiceIngredientName } from "../src/lib/ingredient-canonical";
import { getInvoiceRowIngredientMatchState } from "../src/lib/ingredient-match-explanation";
import { lookupIngredientIdFromAliasMap } from "../src/lib/ingredient-alias-lookup";
import { findInvoiceItemIngredientMatch } from "../src/lib/invoice-ingredient-match-propagation";
import { resolvePersistedMatchStatusFromMatcher } from "../src/lib/invoice-item-match-helpers";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const AVILUDO = "c2f52357-0f80-491a-ba14-c97ff4837472";
const BIDFOOD = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const ANCHOAS_ID = "c811f67f-df4d-4194-ba8b-7a15d4af38bd";
const PEPINO_CONSERVA_ID = "635a1189-36ea-4ff2-9012-8172ab1ab81d";

const ANCHOVAS_OCR_VARIANTS = [
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

function lifecycleFlags() {
  return {
    VITE_MATCH_LIFECYCLE_SHADOW_SEED: process.env.VITE_MATCH_LIFECYCLE_SHADOW_SEED === "true",
    VITE_MATCH_LIFECYCLE_DUAL_WRITE: process.env.VITE_MATCH_LIFECYCLE_DUAL_WRITE === "true",
    VITE_MATCH_LIFECYCLE_READ_CUTOVER: process.env.VITE_MATCH_LIFECYCLE_READ_CUTOVER === "true",
  };
}

async function auditTargetLine(
  invoiceId: string,
  supplier: string,
  linePattern: RegExp,
) {
  const { data: items, error: itemsErr } = await supabase
    .from("invoice_items")
    .select("id,name,created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at");

  if (itemsErr) throw itemsErr;

  const targetItem = (items ?? []).find((i) => linePattern.test(i.name ?? ""));

  let persistedMatch = null;
  let virtualMatch = null;

  if (targetItem) {
    const { data: match, error: matchErr } = await supabase
      .from("invoice_item_matches")
      .select("*")
      .eq("invoice_item_id", targetItem.id)
      .maybeSingle();
    if (matchErr) throw matchErr;
    persistedMatch = match;

    const { rows: catalog } = await loadCanonicalIngredientCatalog(supabase);
    const { data: aliasRows, error: aliasErr } = await supabase
      .from("ingredient_aliases")
      .select("*");
    if (aliasErr) throw aliasErr;

    const aliasesMap = buildConfirmedAliasMapFromRows(aliasRows ?? []);
    const matchResult = findInvoiceItemIngredientMatch(
      targetItem.name ?? "",
      catalog,
      aliasesMap,
      supplier,
    );
    const state = getInvoiceRowIngredientMatchState(matchResult);
    virtualMatch = {
      kind: matchResult?.kind ?? null,
      ingredient_id: matchResult?.ingredient?.id ?? null,
      displayState: state.displayState,
      persistedFromMatcher: resolvePersistedMatchStatusFromMatcher(matchResult),
    };
  }

  return {
    invoice_id: invoiceId,
    supplier,
    batch_created_at: items?.[0]?.created_at ?? null,
    item_count: items?.length ?? 0,
    target_item: targetItem ?? null,
    persisted_match: persistedMatch,
    virtual_match: virtualMatch,
    virtual_persisted_drift:
      virtualMatch && persistedMatch
        ? virtualMatch.displayState !== persistedMatch.status
        : null,
  };
}

async function matcherSimulation() {
  const { rows: catalog } = await loadCanonicalIngredientCatalog(supabase);
  const { data: aliasRows, error: aliasErr } = await supabase
    .from("ingredient_aliases")
    .select("*");
  if (aliasErr) throw aliasErr;

  const aliasesMap = buildConfirmedAliasMapFromRows(aliasRows ?? []);

  const anchovasResults = ANCHOVAS_OCR_VARIANTS.map((name) => {
    const normalized = normalizeInvoiceIngredientName(name);
    const aliasHit = lookupIngredientIdFromAliasMap(aliasesMap, normalized, "AVILUDO", name);
    const match = findInvoiceItemIngredientMatch(name, catalog, aliasesMap, "AVILUDO");
    const state = getInvoiceRowIngredientMatchState(match);

    return {
      name,
      normalized,
      aliasHit,
      match_kind: match?.kind ?? null,
      displayState: state.displayState,
      persistedStatus: resolvePersistedMatchStatusFromMatcher(match),
    };
  });

  const pepinoMatch = findInvoiceItemIngredientMatch("Pepino", catalog, aliasesMap, "Bidfood Portugal");
  const pepinoState = getInvoiceRowIngredientMatchState(pepinoMatch);

  return {
    mode,
    queried_at: new Date().toISOString(),
    flags: lifecycleFlags(),
    anchovas_ocr_variants: anchovasResults,
    pepino_exact: {
      name: "Pepino",
      match_kind: pepinoMatch?.kind ?? null,
      ingredient_id: pepinoMatch?.ingredient?.id ?? null,
      displayState: pepinoState.displayState,
      persistedStatus: resolvePersistedMatchStatusFromMatcher(pepinoMatch),
      virtual_persisted_drift: pepinoState.displayState !== resolvePersistedMatchStatusFromMatcher(pepinoMatch),
    },
  };
}

async function baselineSnapshot() {
  const [anchovas, pepino] = await Promise.all([
    auditTargetLine(AVILUDO, "AVILUDO", /anchov|anchoa/i),
    auditTargetLine(BIDFOOD, "Bidfood Portugal", /^pepino/i),
  ]);

  return {
    mode,
    queried_at: new Date().toISOString(),
    flags: lifecycleFlags(),
    anchovas,
    pepino,
    ingredient_ids: {
      anchoas: ANCHOAS_ID,
      pepino_conserva: PEPINO_CONSERVA_ID,
    },
  };
}

async function flagsSnapshot() {
  return {
    mode,
    queried_at: new Date().toISOString(),
    flags: lifecycleFlags(),
    note: "READ_CUTOVER=false causes virtual/persisted display drift for bare exact matches (e.g. Pepino)",
  };
}

const runners: Record<string, () => Promise<unknown>> = {
  baseline: baselineSnapshot,
  matcher: matcherSimulation,
  flags: flagsSnapshot,
};

const runner = runners[mode];
if (!runner) {
  console.error(`Unknown mode: ${mode}. Use baseline|matcher|flags`);
  process.exit(1);
}

console.log(JSON.stringify(await runner(), null, 2));
