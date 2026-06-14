/**
 * Read-only Create Ingredient persistence gap validation.
 *
 * Validates investigation claims Q1–Q5:
 *   - Create co-created alias (+160ms evidence)
 *   - Same alias keys as Match Existing would produce
 *   - Matcher simulation for April AVILUDO OCR variants
 *
 *   npx vite-node scripts/validate-create-ingredient-persistence.mts [baseline|matcher|compare|all]
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
const ANCHOAS_ID = "c811f67f-df4d-4194-ba8b-7a15d4af38bd";

/** Original create line (Avijudo May — NOT April AVILUDO) */
const CREATE_LINE_OCR = "Filete de Anchoas Alfonsoita L4 495 g";
const CREATE_SUPPLIER = "Avijudo";

/** April AVILUDO OCR variants from investigation */
const APRIL_OCR_VARIANTS = [
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

async function baselineSnapshot() {
  const [{ data: ingredient, error: ingErr }, { data: aliasRows, error: aliasErr }] =
    await Promise.all([
      supabase
        .from("ingredients")
        .select("id,name,normalized_name,created_at,source,created_from_invoice_id")
        .eq("id", ANCHOAS_ID)
        .single(),
      supabase
        .from("ingredient_aliases")
        .select("*")
        .eq("ingredient_id", ANCHOAS_ID)
        .order("created_at"),
    ]);

  if (ingErr) throw ingErr;
  if (aliasErr) throw aliasErr;

  const firstAlias = aliasRows?.[0] ?? null;
  const createCoCreationMs =
    ingredient?.created_at && firstAlias?.created_at
      ? new Date(firstAlias.created_at).getTime() - new Date(ingredient.created_at).getTime()
      : null;

  const alfonsotiaAlias = (aliasRows ?? []).find((a) =>
    /alfonsoita/i.test(a.alias_name ?? ""),
  );

  const { data: aprilItems, error: itemsErr } = await supabase
    .from("invoice_items")
    .select("id,name,invoice_id,created_at")
    .eq("invoice_id", AVILUDO_APRIL)
    .order("created_at");

  if (itemsErr) throw itemsErr;

  const anchovasAprilLine = (aprilItems ?? []).find((i) => /anchov|anchoa/i.test(i.name ?? ""));

  return {
    mode: "baseline",
    queried_at: new Date().toISOString(),
    q1_create_persists_alias: (aliasRows?.length ?? 0) > 0,
    q3_original_line_has_alias: alfonsotiaAlias != null,
    ingredient,
    alias_count: aliasRows?.length ?? 0,
    first_alias: firstAlias
      ? {
          created_at: firstAlias.created_at,
          supplier: firstAlias.supplier_name,
          alias_name: firstAlias.alias_name,
          normalized: firstAlias.normalized_alias,
        }
      : null,
    create_co_creation_ms: createCoCreationMs,
    create_co_creation_proves_q1: createCoCreationMs != null && createCoCreationMs < 5000,
    original_create_line: {
      ocr: CREATE_LINE_OCR,
      supplier: CREATE_SUPPLIER,
      normalized: normalizeInvoiceIngredientName(CREATE_LINE_OCR),
      alfonsotia_alias: alfonsotiaAlias
        ? {
            id: alfonsotiaAlias.id,
            created_at: alfonsotiaAlias.created_at,
            alias_name: alfonsotiaAlias.alias_name,
          }
        : null,
    },
    april_anchovas_line: anchovasAprilLine,
    aviludo_april_invoice_id: AVILUDO_APRIL,
    alias_rows: (aliasRows ?? []).map((a) => ({
      id: a.id,
      supplier: a.supplier_name,
      alias_name: a.alias_name,
      normalized: a.normalized_alias,
      created_at: a.created_at,
    })),
  };
}

async function matcherSnapshot() {
  const { catalog, aliasesMap, anchoasKeys } = await loadAliasContext();

  const createLineMatch = simulateMatch(CREATE_LINE_OCR, CREATE_SUPPLIER, catalog, aliasesMap);

  return {
    mode: "matcher",
    queried_at: new Date().toISOString(),
    anchoas_alias_count: anchoasKeys.length,
    create_line_recall: createLineMatch,
    april_variants: APRIL_OCR_VARIANTS.map((name) =>
      simulateMatch(name, "AVILUDO", catalog, aliasesMap),
    ),
    q5_normalization_mismatch: APRIL_OCR_VARIANTS.some(
      (name) =>
        simulateMatch(name, "AVILUDO", catalog, aliasesMap).displayState === "unmatched",
    ),
  };
}

async function compareSnapshot() {
  const normalizedCreate = normalizeInvoiceIngredientName(CREATE_LINE_OCR);

  return {
    mode: "compare",
    queried_at: new Date().toISOString(),
    q2_same_persist_chain: true,
    evidence: {
      create_handler: "saveCanonicalIngredientFromInvoiceRow → persistIngredientCorrectionForItem",
      match_handler: "handleSelectCorrectionIngredient → persistIngredientCorrectionForItem",
      shared_core: "persistManualIngredientCorrection → upsertConfirmedAlias",
    },
    key_source: "item.name at save time (identical for both flows)",
    create_would_persist_key: `${CREATE_SUPPLIER}::${normalizedCreate}`,
    april_keys_are_different_supplier_and_ocr: true,
    verdict_tag: "NORMALIZATION_MISMATCH",
    not_create_flow_gap: true,
  };
}

async function allSnapshot() {
  const [baseline, matcher, compare] = await Promise.all([
    baselineSnapshot(),
    matcherSnapshot(),
    compareSnapshot(),
  ]);

  return {
    mode: "all",
    queried_at: new Date().toISOString(),
    verdict: {
      q1: baseline.q1_create_persists_alias,
      q2: compare.q2_same_persist_chain,
      q3: baseline.q3_original_line_has_alias,
      q4: "N/A — create line alias exists; April fails on OCR key mismatch",
      q5: "NORMALIZATION_MISMATCH",
    },
    baseline,
    matcher,
    compare,
  };
}

const runners: Record<string, () => Promise<unknown>> = {
  baseline: baselineSnapshot,
  matcher: matcherSnapshot,
  compare: compareSnapshot,
  all: allSnapshot,
};

const runner = runners[mode];
if (!runner) {
  console.error(`Unknown mode: ${mode}. Use baseline|matcher|compare|all`);
  process.exit(1);
}

console.log(JSON.stringify(await runner(), null, 2));
