/**
 * Read-only brand-token normalization validation.
 *
 * Quantifies OCR variant families across VL aliases and simulates
 * recovery rates for space-collapse + fuzzy brand-stem matching.
 *
 *   npx vite-node scripts/validate-brand-token-variants.mts [scan|anchoas|recovery|all]
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows, resolveNormalizedAliasFromConfirmedRow } from "../src/lib/ingredient-alias-memory";
import {
  extractBrandFingerprint,
  levenshteinDistance,
} from "../src/lib/ingredient-alias-fuzzy-lookup";
import { lookupIngredientIdFromAliasMap } from "../src/lib/ingredient-alias-lookup";
import { normalizeOperationalAliasKey } from "../src/lib/ingredient-operational-alias-memory";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const ANCHOAS_ID = "c811f67f-df4d-4194-ba8b-7a15d4af38bd";

const ANCHOVAS_OCR_VARIANTS = [
  "Filete de Anchoas Alconfirosa LI 495 g",
  "Filete de Anchovas Alconfrista Lt 495 g",
  "Filete de Anchovas Alconfi sta Lt 495 g",
  "Filete de Anchovas Alconfrisa Lt 495 g",
  "Filete de Anchovas Alconfirsta L1 495 g",
  "Filete de Anchovas Alconfi osa LI 495 g",
  "Filete de Anchovas Alcofiorisa Lt 495 g",
] as const;

const FALSE_POSITIVE_LINES = [
  { line: "Pepino", supplier: "BIDFOOD", mustNotMatchIngredient: "pepino conserva" },
  { line: "Pepinos Extra ULI", supplier: "BIDFOOD", mustNotMatchIngredient: "pepino" },
  { line: "Atum", supplier: "NAU", mustNotMatchIngredient: "atum em oleo" },
  { line: "Arroz", supplier: "METRO", mustNotMatchIngredient: "arroz agulha" },
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

function levenshtein(a: string, b: string): number {
  return levenshteinDistance(a, b);
}

function extractBrandFingerprintFromKey(normalizedKey: string): string {
  return extractBrandFingerprint(normalizedKey);
}

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, "");
}

type AliasRow = Database["public"]["Tables"]["ingredient_aliases"]["Row"];

async function loadAliases(): Promise<AliasRow[]> {
  const { data, error } = await supabase
    .from("ingredient_aliases")
    .select("*")
    .eq("confirmed_by_user", true);
  if (error) throw error;
  return data ?? [];
}

async function loadIngredientNames(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("ingredients").select("id,name");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.id, r.name]));
}

async function scanSnapshot() {
  const rows = await loadAliases();
  const names = await loadIngredientNames();

  const byIngredient = new Map<string, AliasRow[]>();
  for (const r of rows) {
    const list = byIngredient.get(r.ingredient_id) ?? [];
    list.push(r);
    byIngredient.set(r.ingredient_id, list);
  }

  const families: Array<{
    ingredient: string;
    ingredient_id: string;
    alias_count: number;
    unique_normalized: number;
    ocr_noise: boolean;
    min_brand_edit: number | null;
    collapsible_to: number;
    aliases: Array<{ supplier: string | null; alias_name: string; normalized: string }>;
  }> = [];

  for (const [ingId, aliases] of byIngredient) {
    if (aliases.length < 2) continue;
    const norms = [...new Set(aliases.map((a) => a.normalized_alias))];
    if (norms.length < 2) continue;

    const fps = norms.map(extractBrandFingerprintFromKey);
    let minEd = 99;
    for (let i = 0; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        minEd = Math.min(minEd, levenshtein(fps[i], fps[j]));
      }
    }

    // Cluster brand fingerprints by edit-distance ≤2 for collapse estimate
    const clustered = new Set<string>();
    const used = new Set<number>();
    for (let i = 0; i < fps.length; i++) {
      if (used.has(i)) continue;
      clustered.add(fps[i]);
      used.add(i);
      for (let j = i + 1; j < fps.length; j++) {
        if (used.has(j)) continue;
        if (levenshtein(fps[i], fps[j]) <= 2) {
          used.add(j);
        }
      }
    }

    const collapsed = norms.map(collapseSpaces);
    const ocrNoise =
      new Set(collapsed).size < norms.length ||
      clustered.size < norms.length ||
      (minEd <= 3 && minEd < 99);

    families.push({
      ingredient: names[ingId] ?? ingId,
      ingredient_id: ingId,
      alias_count: aliases.length,
      unique_normalized: norms.length,
      ocr_noise: ocrNoise,
      min_brand_edit: minEd < 99 ? minEd : null,
      collapsible_to: clustered.size,
      aliases: aliases.map((a) => ({
        supplier: a.supplier_name,
        alias_name: a.alias_name,
        normalized: a.normalized_alias,
      })),
    });
  }

  families.sort((a, b) => b.unique_normalized - a.unique_normalized);

  const ocrFamilies = families.filter((f) => f.ocr_noise);
  const redundant = ocrFamilies.reduce((sum, f) => sum + f.alias_count - f.collapsible_to, 0);

  return {
    mode: "scan",
    queried_at: new Date().toISOString(),
    summary: {
      total_aliases: rows.length,
      unique_ingredients: byIngredient.size,
      ingredients_with_2plus_aliases: [...byIngredient.values()].filter((a) => a.length >= 2)
        .length,
      ingredients_multi_norm: families.length,
      ocr_noise_families: ocrFamilies.length,
      ocr_noise_pct: Math.round((ocrFamilies.length / families.length) * 100),
      redundant_alias_rows_estimate: redundant,
    },
    families,
  };
}

async function anchoasSnapshot() {
  const rows = await loadAliases();
  const anchoas = rows.filter((r) => r.ingredient_id === ANCHOAS_ID);
  const aliasesMap = buildConfirmedAliasMapFromRows(rows);

  const bySupplier = new Map<string, typeof anchoas>();
  for (const r of anchoas) {
    const sup = (r.supplier_name ?? "").toUpperCase();
    const list = bySupplier.get(sup) ?? [];
    list.push(r);
    bySupplier.set(sup, list);
  }

  const supplierGroups = [...bySupplier.entries()].map(([supplier, aliases]) => {
    const fps = aliases.map((a) => extractBrandFingerprintFromKey(a.normalized_alias));
    return {
      supplier,
      alias_count: aliases.length,
      unique_normalized: new Set(aliases.map((a) => a.normalized_alias)).size,
      unique_brand_fps: new Set(fps).size,
      rows: aliases.map((a) => ({
        alias_name: a.alias_name,
        normalized: a.normalized_alias,
        brand_fp: extractBrandFingerprintFromKey(a.normalized_alias),
      })),
    };
  });

  const matcherResults = ANCHOVAS_OCR_VARIANTS.map((name) => {
    const hit = lookupIngredientIdFromAliasMap(aliasesMap, name, "AVILUDO", name);
    const opKey = normalizeOperationalAliasKey(name);
    return {
      variant: name,
      exact_hit: !!hit,
      ingredient_id: hit ?? null,
      op_key: opKey,
    };
  });

  return {
    mode: "anchoas",
    queried_at: new Date().toISOString(),
    ingredient_id: ANCHOAS_ID,
    total_aliases: anchoas.length,
    supplier_groups: supplierGroups,
    matcher: {
      tested: ANCHOVAS_OCR_VARIANTS.length,
      exact_hits: matcherResults.filter((r) => r.exact_hit).length,
      exact_hit_rate: `${matcherResults.filter((r) => r.exact_hit).length}/${ANCHOVAS_OCR_VARIANTS.length}`,
      results: matcherResults,
    },
  };
}

function simulateRecovery(
  variant: string,
  supplier: string,
  storedAliases: Array<{ normalized: string; supplier: string | null; alias_name: string }>,
) {
  const supplierAliases = storedAliases.filter(
    (a) => (a.supplier ?? "").toUpperCase() === supplier.toUpperCase(),
  );
  const storedNorms = supplierAliases.map((a) =>
    resolveNormalizedAliasFromConfirmedRow({
      ingredient_id: "",
      alias_name: a.alias_name,
      normalized_alias: a.normalized,
      supplier_name: a.supplier,
    }),
  ).filter(Boolean) as string[];

  const opKey = normalizeOperationalAliasKey(variant);

  const exact = storedNorms.some(
    (a) =>
      a === opKey ||
      a.replace(/anchovas/g, "anchoas") === opKey.replace(/anchovas/g, "anchoas"),
  );

  const legacyExact = supplierAliases.some(
    (a) =>
      a.normalized === opKey ||
      a.normalized.replace(/anchovas/g, "anchoas") === opKey.replace(/anchovas/g, "anchoas"),
  );

  const spaceCollapse = storedNorms.some(
    (a) => collapseSpaces(a) === collapseSpaces(opKey),
  );

  const queryFp = extractBrandFingerprintFromKey(opKey);
  const fuzzy = storedNorms.some(
    (a) => levenshtein(extractBrandFingerprintFromKey(a), queryFp) <= 2,
  );

  return { exact, legacy_exact: legacyExact, space_collapse: spaceCollapse, fuzzy_ed2: fuzzy, op_key: opKey };
}

async function recoverySnapshot() {
  const rows = await loadAliases();
  const anchoas = rows
    .filter((r) => r.ingredient_id === ANCHOAS_ID)
    .map((r) => ({
      normalized: r.normalized_alias,
      supplier: r.supplier_name,
      alias_name: r.alias_name,
    }));

  const results = ANCHOVAS_OCR_VARIANTS.map((variant) => ({
    variant,
    ...simulateRecovery(variant, "AVILUDO", anchoas),
  }));

  const count = (key: "exact" | "legacy_exact" | "space_collapse" | "fuzzy_ed2") =>
    results.filter((r) => r[key]).length;

  return {
    mode: "recovery",
    queried_at: new Date().toISOString(),
    supplier: "AVILUDO",
    tested: ANCHOVAS_OCR_VARIANTS.length,
    recovery_rates: {
      phase1_exact: `${count("exact")}/${ANCHOVAS_OCR_VARIANTS.length}`,
      prior_db_exact: `${count("legacy_exact")}/${ANCHOVAS_OCR_VARIANTS.length}`,
      space_collapse: `${count("space_collapse")}/${ANCHOVAS_OCR_VARIANTS.length}`,
      fuzzy_ed2: `${count("fuzzy_ed2")}/${ANCHOVAS_OCR_VARIANTS.length}`,
    },
    results,
    recommendation: "Phase 1b — supplier-scoped fuzzy brand fingerprint alias recovery (production lookup)",
  };
}

async function phase1bSnapshot() {
  const [anchoas, falsePositives, crossCollisions] = await Promise.all([
    anchoasSnapshot(),
    falsePositiveAuditSnapshot(),
    crossIngredientCollisionSnapshot(),
  ]);

  return {
    mode: "phase1b",
    queried_at: new Date().toISOString(),
    anchoas: anchoas.matcher,
    false_positives: falsePositives,
    cross_ingredient_collisions: crossCollisions,
  };
}

async function aliasCollapseSnapshot() {
  const rows = await loadAliases();
  const names = await loadIngredientNames();

  let collapsePairs = 0;
  const collapsedExamples: Array<{
    ingredient: string;
    before: string;
    after: string;
    alias_name: string;
  }> = [];

  for (const row of rows) {
    const before = row.normalized_alias;
    const after =
      resolveNormalizedAliasFromConfirmedRow({
        ingredient_id: row.ingredient_id,
        alias_name: row.alias_name,
        normalized_alias: row.normalized_alias,
        supplier_name: row.supplier_name,
      }) ?? before;
    if (before !== after) {
      collapsePairs += 1;
      collapsedExamples.push({
        ingredient: names[row.ingredient_id] ?? row.ingredient_id,
        before,
        after,
        alias_name: row.alias_name,
      });
    }
  }

  const uniqueBefore = new Set(rows.map((r) => r.normalized_alias));
  const uniqueAfter = new Set(
    rows.map(
      (r) =>
        resolveNormalizedAliasFromConfirmedRow({
          ingredient_id: r.ingredient_id,
          alias_name: r.alias_name,
          normalized_alias: r.normalized_alias,
          supplier_name: r.supplier_name,
        }) ?? r.normalized_alias,
    ),
  );

  return {
    mode: "alias_collapse",
    alias_rows: rows.length,
    keys_changed: collapsePairs,
    unique_keys_before: uniqueBefore.size,
    unique_keys_after: uniqueAfter.size,
    collapse_delta: uniqueBefore.size - uniqueAfter.size,
    examples: collapsedExamples.slice(0, 15),
  };
}

async function pepinoImpactSnapshot() {
  const rows = await loadAliases();
  const names = await loadIngredientNames();
  const pepinoRows = rows.filter((r) => (names[r.ingredient_id] ?? "").toLowerCase().includes("pepino"));
  const aliasesMap = buildConfirmedAliasMapFromRows(rows);

  const pepinoLines = [
    "Pepinos Extra VII",
    "Pepinos Extra ULI",
    "Pepino",
    "Pepinoso",
  ];

  const results = pepinoLines.map((line) => {
    const hit = lookupIngredientIdFromAliasMap(aliasesMap, line, "BIDFOOD", line);
    const opKey = normalizeOperationalAliasKey(line);
    return { line, op_key: opKey, exact_hit: !!hit, ingredient_id: hit ?? null };
  });

  const keyChanges = pepinoRows.filter((r) => {
    const before = r.normalized_alias;
    const after =
      resolveNormalizedAliasFromConfirmedRow({
        ingredient_id: r.ingredient_id,
        alias_name: r.alias_name,
        normalized_alias: r.normalized_alias,
        supplier_name: r.supplier_name,
      }) ?? before;
    return before !== after;
  });

  return {
    mode: "pepino_impact",
    alias_rows: pepinoRows.length,
    keys_changed: keyChanges.length,
    matcher: {
      tested: pepinoLines.length,
      exact_hits: results.filter((r) => r.exact_hit).length,
      results,
    },
    key_changes: keyChanges.map((r) => ({
      alias_name: r.alias_name,
      before: r.normalized_alias,
      after:
        resolveNormalizedAliasFromConfirmedRow({
          ingredient_id: r.ingredient_id,
          alias_name: r.alias_name,
          normalized_alias: r.normalized_alias,
          supplier_name: r.supplier_name,
        }) ?? r.normalized_alias,
    })),
  };
}

async function regressionAuditSnapshot() {
  const rows = await loadAliases();
  const aliasesMap = buildConfirmedAliasMapFromRows(rows);

  const regressions: Array<{ alias_name: string; before: string; after: string }> = [];
  let stable = 0;

  for (const row of rows) {
    const before = row.normalized_alias;
    const after =
      resolveNormalizedAliasFromConfirmedRow({
        ingredient_id: row.ingredient_id,
        alias_name: row.alias_name,
        normalized_alias: row.normalized_alias,
        supplier_name: row.supplier_name,
      }) ?? before;

    const priorHit = aliasesMap[
      row.supplier_name
        ? `${row.supplier_name.toUpperCase()}::${before}`
        : before
    ] ?? aliasesMap[before];

    if (before === after) {
      stable += 1;
      continue;
    }

    // Key changed — ensure re-resolved key still maps to same ingredient
    const newLookupKey = row.supplier_name
      ? `${row.supplier_name.toUpperCase()}::${after}`
      : after;
    const newHit = aliasesMap[newLookupKey] ?? aliasesMap[after];
    if (priorHit && newHit && priorHit !== newHit) {
      regressions.push({ alias_name: row.alias_name, before, after });
    }
  }

  return {
    mode: "regression_audit",
    total_aliases: rows.length,
    stable_keys: stable,
    changed_keys: rows.length - stable,
    cross_ingredient_regressions: regressions.length,
    regressions: regressions.slice(0, 10),
  };
}

async function falsePositiveAuditSnapshot() {
  const rows = await loadAliases();
  const names = await loadIngredientNames();
  const aliasesMap = buildConfirmedAliasMapFromRows(rows);

  const ingredientNameToId = Object.fromEntries(
    Object.entries(names).map(([id, name]) => [name.toLowerCase(), id]),
  );

  const results = FALSE_POSITIVE_LINES.map(({ line, supplier, mustNotMatchIngredient }) => {
    const hit = lookupIngredientIdFromAliasMap(aliasesMap, line, supplier, line);
    const forbiddenId = ingredientNameToId[mustNotMatchIngredient.toLowerCase()] ?? null;
    const falsePositive = Boolean(hit && forbiddenId && hit === forbiddenId);
    return {
      line,
      supplier,
      mustNotMatchIngredient,
      hit: hit ?? null,
      false_positive: falsePositive,
    };
  });

  return {
    mode: "false_positive_audit",
    tested: results.length,
    false_positives: results.filter((r) => r.false_positive).length,
    results,
  };
}

async function crossIngredientCollisionSnapshot() {
  const rows = await loadAliases();
  const aliasesMap = buildConfirmedAliasMapFromRows(rows);
  const names = await loadIngredientNames();

  const collisions: Array<{
    query: string;
    supplier: string;
    matched_ingredient: string;
    expected_ingredient: string;
    matched_id: string;
    expected_id: string;
  }> = [];

  for (const row of rows) {
    const supplier = row.supplier_name ?? "";
    const hit = lookupIngredientIdFromAliasMap(
      aliasesMap,
      row.alias_name,
      supplier,
      row.alias_name,
    );
    if (!hit) continue;
    if (hit !== row.ingredient_id) {
      collisions.push({
        query: row.alias_name,
        supplier,
        matched_ingredient: names[hit] ?? hit,
        expected_ingredient: names[row.ingredient_id] ?? row.ingredient_id,
        matched_id: hit,
        expected_id: row.ingredient_id,
      });
    }
  }

  return {
    mode: "cross_ingredient_collisions",
    total_aliases: rows.length,
    collisions: collisions.length,
    results: collisions.slice(0, 20),
  };
}

async function allSnapshot() {
  const [scan, anchoas, recovery, aliasCollapse, pepino, regression, falsePositives, crossCollisions] =
    await Promise.all([
    scanSnapshot(),
    anchoasSnapshot(),
    recoverySnapshot(),
    aliasCollapseSnapshot(),
    pepinoImpactSnapshot(),
    regressionAuditSnapshot(),
    falsePositiveAuditSnapshot(),
    crossIngredientCollisionSnapshot(),
  ]);

  const anchoasHits = anchoas.matcher.exact_hits;
  const crossCollisionCount = crossCollisions.collisions;
  const falsePositiveCount = falsePositives.false_positives;

  let verdict: "SUCCESS" | "PARTIAL" | "ROLLBACK" = "SUCCESS";
  if (crossCollisionCount > 0) verdict = "ROLLBACK";
  else if (anchoasHits < 6 || falsePositiveCount > 0) verdict = "PARTIAL";

  return {
    mode: "all",
    queried_at: new Date().toISOString(),
    verdict_tag: "PHASE1B_FUZZY_ALIAS_RECOVERY",
    verdict,
    scan: scan.summary,
    anchoas: {
      total_aliases: anchoas.total_aliases,
      exact_hit_rate: anchoas.matcher.exact_hit_rate,
      results: anchoas.matcher.results,
    },
    recovery: recovery.recovery_rates,
    alias_collapse: {
      keys_changed: aliasCollapse.keys_changed,
      unique_before: aliasCollapse.unique_keys_before,
      unique_after: aliasCollapse.unique_keys_after,
      collapse_delta: aliasCollapse.unique_keys_before - aliasCollapse.unique_keys_after,
    },
    pepino: {
      alias_rows: pepino.alias_rows,
      keys_changed: pepino.keys_changed,
      exact_hits: `${pepino.matcher.exact_hits}/${pepino.matcher.tested}`,
    },
    regression: {
      stable_keys: regression.stable_keys,
      changed_keys: regression.changed_keys,
      cross_ingredient_regressions: regression.cross_ingredient_regressions,
    },
    false_positives: {
      tested: falsePositives.tested,
      count: falsePositiveCount,
      results: falsePositives.results,
    },
    cross_ingredient_collisions: {
      count: crossCollisionCount,
      results: crossCollisions.results,
    },
    recommendation:
      crossCollisionCount > 0
        ? "ROLLBACK — cross-ingredient fuzzy collisions detected"
        : "Phase 1b — supplier-scoped fuzzy brand fingerprint alias recovery",
  };
}

const runners: Record<string, () => Promise<unknown>> = {
  scan: scanSnapshot,
  anchoas: anchoasSnapshot,
  recovery: recoverySnapshot,
  alias_collapse: aliasCollapseSnapshot,
  pepino: pepinoImpactSnapshot,
  regression: regressionAuditSnapshot,
  false_positives: falsePositiveAuditSnapshot,
  cross_collisions: crossIngredientCollisionSnapshot,
  phase1b: phase1bSnapshot,
  all: allSnapshot,
};

const runner = runners[mode];
if (!runner) {
  console.error(`Unknown mode: ${mode}. Use scan|anchoas|recovery|phase1b|all`);
  process.exit(1);
}

console.log(JSON.stringify(await runner(), null, 2));
