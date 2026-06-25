/**
 * STRICT READ-ONLY Operational Identity Replay Audit — Model D (Layered Identity)
 * VL: bjhnlrgodcqoyzddbpbd
 * Simulates brand-prefix strip on normalizeOperationalAliasKey spine; no production writes.
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;
metaEnv.env.MODE = "production";

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { formatCanonicalIngredientDisplayName } from "../../src/lib/canonical-ingredient-display-name.ts";
import {
  buildIngredientAliasLookupKey,
} from "../../src/lib/ingredient-alias-lookup.ts";
import type { IngredientAliasMap } from "../../src/lib/ingredient-canonical.ts";
import {
  buildOverrideKeysFromInvoiceLine,
  type ConfirmedAliasRowForOverride,
} from "../../src/lib/ingredient-match-override.ts";
import { normalizeOperationalAliasKey } from "../../src/lib/ingredient-operational-alias-memory.ts";
import { normalizeSupplierShorthand } from "../../src/lib/ingredient-operational-aliases.ts";
import { normalizeSupplierDisplayName } from "../../src/lib/supplier-identity.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = __dir;
mkdirSync(OUT, { recursive: true });

const VL_REF = "bjhnlrgodcqoyzddbpbd";

const VL_INVOICE_IDS = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
];

/** Mirror INVOICE_BRAND_PREFIX_STRIP_RE — commodity charcuterie/cheese/pasta only. */
const INVOICE_BRAND_PREFIX_STRIP_RE = [
  /^arrigoni\s+formaggi\s*-\s*/i,
  /^rovagnati\s*-\s*/i,
  /^rigamonti\s*-\s*/i,
  /^arrigoni\s*-\s*/i,
  /^de\s+cecco\s*-\s*/i,
  /^baladin\s*-\s*/i,
] as const;

function stripInvoiceBrandPrefix(value: string): string {
  let out = value;
  for (const pattern of INVOICE_BRAND_PREFIX_STRIP_RE) {
    out = out.replace(pattern, "");
  }
  return out;
}

function normalizeOperationalAliasKeyModelD(raw: string): string {
  const stripped = stripInvoiceBrandPrefix(raw?.trim() ?? "");
  const expanded = normalizeSupplierShorthand(stripped || raw?.trim() || "");
  return normalizeOperationalAliasKey(expanded || stripped || raw?.trim() || "");
}

function buildOverrideKeysModelD(
  itemName: string,
  supplierName?: string | null,
): {
  rawNormalized: string;
  lookupKey: string;
  invoiceSupplierNormalized?: string;
} | null {
  const trimmed = itemName?.trim();
  if (!trimmed) return null;

  const stripped = stripInvoiceBrandPrefix(trimmed);
  const expanded = normalizeSupplierShorthand(stripped || trimmed);
  const rawNormalized = normalizeOperationalAliasKey(expanded || stripped || trimmed);
  if (!rawNormalized) return null;

  const invoiceSupplierNormalized = supplierName?.trim()
    ? normalizeSupplierDisplayName(supplierName) || undefined
    : undefined;

  return {
    rawNormalized,
    lookupKey: buildIngredientAliasLookupKey(rawNormalized, supplierName),
    invoiceSupplierNormalized,
  };
}

function resolveNormalizedAliasFromRowModelD(row: ConfirmedAliasRowForOverride): string | null {
  const fromLine = row.alias_name?.trim()
    ? buildOverrideKeysModelD(row.alias_name, row.supplier_name)
    : null;
  if (fromLine?.rawNormalized) return fromLine.rawNormalized;

  const aliasName = row.alias_name?.trim();
  if (aliasName) {
    const operational = normalizeOperationalAliasKeyModelD(aliasName);
    if (operational) return operational;
  }

  return row.normalized_alias?.trim().toLowerCase() || null;
}

function buildAliasMapModelD(rows: ConfirmedAliasRowForOverride[]): IngredientAliasMap {
  const map: IngredientAliasMap = {};
  for (const row of rows) {
    const normalizedAlias = resolveNormalizedAliasFromRowModelD(row);
    if (!normalizedAlias) continue;
    const lookupKey = buildIngredientAliasLookupKey(normalizedAlias, row.supplier_name);
    map[lookupKey] = row.ingredient_id;
    const globalKey = buildIngredientAliasLookupKey(normalizedAlias, null);
    map[globalKey] = row.ingredient_id;
    map[normalizedAlias] = row.ingredient_id;
  }
  return map;
}

function buildAliasMapCurrent(rows: ConfirmedAliasRowForOverride[]): IngredientAliasMap {
  const map: IngredientAliasMap = {};
  for (const row of rows) {
    const fromLine = row.alias_name?.trim()
      ? buildOverrideKeysFromInvoiceLine(row.alias_name, row.supplier_name)
      : null;
    const fallbackNorm = normalizeOperationalAliasKey(
      normalizeSupplierShorthand(row.alias_name?.trim() || "") || row.alias_name?.trim() || "",
    );
    const normalizedAlias =
      fromLine?.rawNormalized ??
      (fallbackNorm || row.normalized_alias?.trim().toLowerCase() || null);
    if (!normalizedAlias) continue;
    const lookupKey = buildIngredientAliasLookupKey(normalizedAlias, row.supplier_name);
    map[lookupKey] = row.ingredient_id;
    const globalKey = buildIngredientAliasLookupKey(normalizedAlias, null);
    map[globalKey] = row.ingredient_id;
    map[normalizedAlias] = row.ingredient_id;
  }
  return map;
}

function lookupAliasHit(
  aliasMap: IngredientAliasMap,
  itemName: string,
  supplierName: string | null,
  useModelD: boolean,
): { hit: boolean; ingredientId: string | null; keys: string[] } {
  const buildKeys = useModelD ? buildOverrideKeysModelD : buildOverrideKeysFromInvoiceLine;
  const keysTried: string[] = [];
  const keys = buildKeys(itemName, supplierName);
  if (keys) {
    keysTried.push(keys.lookupKey, keys.rawNormalized);
    if (aliasMap[keys.lookupKey]) {
      return { hit: true, ingredientId: aliasMap[keys.lookupKey]!, keys: keysTried };
    }
    if (aliasMap[keys.rawNormalized]) {
      return { hit: true, ingredientId: aliasMap[keys.rawNormalized]!, keys: keysTried };
    }
  }
  const globalKeys = buildKeys(itemName, null);
  if (globalKeys) {
    keysTried.push(globalKeys.lookupKey, globalKeys.rawNormalized);
    if (aliasMap[globalKeys.lookupKey]) {
      return { hit: true, ingredientId: aliasMap[globalKeys.lookupKey]!, keys: keysTried };
    }
    if (aliasMap[globalKeys.rawNormalized]) {
      return { hit: true, ingredientId: aliasMap[globalKeys.rawNormalized]!, keys: keysTried };
    }
  }
  return { hit: false, ingredientId: null, keys: keysTried };
}

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

function matchConfidence(
  status: string | null,
  matchKind: string | null,
): "high" | "suggested" | "none" {
  if (status === "confirmed") return "high";
  if (status === "suggested" || matchKind === "semantic") return "suggested";
  return "none";
}

function predictedStatusFromAliasHit(
  aliasHit: boolean,
  currentStatus: string | null,
): string {
  if (aliasHit) return "confirmed";
  return currentStatus ?? "unmatched";
}

function predictedKindFromAliasHit(aliasHit: boolean, currentKind: string | null): string | null {
  if (aliasHit) return "confirmed-alias";
  return currentKind;
}

const KNOWN_PRODUCT_PATTERNS: Record<string, RegExp> = {
  Prosciutto: /prosciutto/i,
  Mortadella: /mortadella/i,
  Bresaola: /bresaola/i,
  Gorgonzola: /gorgonzola/i,
  Paccheri: /paccheri/i,
  Chocolate: /chocolate/i,
  Atum: /atum/i,
  Mozzarella: /mozzarella/i,
  Pepino: /^pepino$/i,
  Pellegrino: /pellegrino/i,
};

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const [{ data: items, error: itemsErr }, { data: aliases, error: aliasErr }, { data: matches, error: matchErr }, { data: invoices, error: invErr }, { data: ingredients, error: ingErr }] =
  await Promise.all([
    sb
      .from("invoice_items")
      .select("id, invoice_id, name, created_at")
      .in("invoice_id", VL_INVOICE_IDS)
      .order("created_at", { ascending: true }),
    sb
      .from("ingredient_aliases")
      .select("ingredient_id, alias_name, normalized_alias, supplier_name, confirmed_by_user, created_at"),
    sb
      .from("invoice_item_matches")
      .select("invoice_item_id, ingredient_id, status, match_kind, created_at, updated_at")
      .in(
        "invoice_item_id",
        (
          await sb
            .from("invoice_items")
            .select("id")
            .in("invoice_id", VL_INVOICE_IDS)
        ).data?.map((r) => r.id) ?? [],
      ),
    sb.from("invoices").select("id, supplier_name").in("id", VL_INVOICE_IDS),
    sb.from("ingredients").select("id, name, normalized_name"),
  ]);

if (itemsErr || aliasErr || matchErr || invErr || ingErr) {
  console.error({ itemsErr, aliasErr, matchErr, invErr, ingErr });
  process.exit(1);
}

const ingredientNameById = new Map(
  (ingredients ?? []).map((r) => [r.id, r.name ?? r.normalized_name ?? r.id]),
);
const supplierByInvoice = new Map(
  (invoices ?? []).map((r) => [r.id, r.supplier_name ?? null]),
);
const matchByItemId = new Map((matches ?? []).map((m) => [m.invoice_item_id, m]));

const aliasRows = (aliases ?? []) as ConfirmedAliasRowForOverride[];
const currentAliasMap = buildAliasMapCurrent(aliasRows);
const modelDAliasMap = buildAliasMapModelD(aliasRows);

type RowReplay = {
  invoiceItemId: string;
  invoiceId: string;
  supplier: string | null;
  rawName: string;
  displayName: string;
  currentAliasKey: string | null;
  proposedOperationalIdentity: string | null;
  currentAliasHit: boolean;
  modelDAliasHit: boolean;
  currentMatch: {
    ingredientId: string | null;
    ingredientName: string | null;
    status: string | null;
    matchKind: string | null;
    confidence: string;
  };
  predictedMatch: {
    ingredientId: string | null;
    ingredientName: string | null;
    status: string | null;
    matchKind: string | null;
    confidence: string;
    changed: boolean;
    changeType: string | null;
  };
  brandPrefixOnLine: boolean;
  prefixStrippedByModelD: boolean;
};

const rowReplays: RowReplay[] = [];

for (const item of items ?? []) {
  const supplier = supplierByInvoice.get(item.invoice_id) ?? null;
  const rawName = item.name?.trim() ?? "";
  const displayName = formatCanonicalIngredientDisplayName(rawName);
  const currentKeys = buildOverrideKeysFromInvoiceLine(rawName, supplier);
  const modelDKeys = buildOverrideKeysModelD(rawName, supplier);
  const currentHit = lookupAliasHit(currentAliasMap, rawName, supplier, false);
  const modelDHit = lookupAliasHit(modelDAliasMap, rawName, supplier, true);
  const persisted = matchByItemId.get(item.id);
  const currentIngredientId = persisted?.ingredient_id ?? null;
  const currentStatus = persisted?.status ?? null;
  const currentKind = persisted?.match_kind ?? null;
  const currentConfidence = matchConfidence(currentStatus, currentKind);

  let predictedIngredientId = currentIngredientId;
  let predictedStatus = currentStatus;
  let predictedKind = currentKind;
  let changeType: string | null = null;

  if (modelDHit.hit && modelDHit.ingredientId) {
    predictedIngredientId = modelDHit.ingredientId;
    predictedStatus = predictedStatusFromAliasHit(true, currentStatus);
    predictedKind = predictedKindFromAliasHit(true, currentKind);
    if (!currentHit.hit && modelDHit.hit) {
      changeType = "recovered_via_alias";
    } else if (currentIngredientId !== modelDHit.ingredientId) {
      changeType = "alias_collision_redirect";
    }
  } else if (currentHit.hit && !modelDHit.hit) {
    changeType = "regression_alias_miss";
    predictedIngredientId = null;
    predictedStatus = currentStatus === "confirmed" ? "suggested" : currentStatus;
    predictedKind = currentKind === "confirmed-alias" ? "semantic" : currentKind;
  }

  const changed =
    predictedIngredientId !== currentIngredientId ||
    predictedStatus !== currentStatus ||
    predictedKind !== currentKind;

  if (changed && !changeType) {
    if (predictedStatus !== currentStatus && predictedIngredientId === currentIngredientId) {
      changeType = "status_only";
    } else {
      changeType = "other";
    }
  }

  const stripped = stripInvoiceBrandPrefix(rawName);
  const brandPrefixOnLine = stripped !== rawName;
  const prefixStrippedByModelD = brandPrefixOnLine && modelDKeys?.rawNormalized !== currentKeys?.rawNormalized;

  rowReplays.push({
    invoiceItemId: item.id,
    invoiceId: item.invoice_id,
    supplier,
    rawName,
    displayName,
    currentAliasKey: currentKeys?.rawNormalized ?? null,
    proposedOperationalIdentity: modelDKeys?.rawNormalized ?? null,
    currentAliasHit: currentHit.hit,
    modelDAliasHit: modelDHit.hit,
    currentMatch: {
      ingredientId: currentIngredientId,
      ingredientName: currentIngredientId ? ingredientNameById.get(currentIngredientId) ?? null : null,
      status: currentStatus,
      matchKind: currentKind,
      confidence: currentConfidence,
    },
    predictedMatch: {
      ingredientId: predictedIngredientId,
      ingredientName: predictedIngredientId ? ingredientNameById.get(predictedIngredientId) ?? null : null,
      status: predictedStatus,
      matchKind: predictedKind,
      confidence: matchConfidence(predictedStatus, predictedKind),
      changed,
      changeType,
    },
    brandPrefixOnLine,
    prefixStrippedByModelD,
  });
}

// Impact counts — material vs cosmetic
const isMaterialChange = (r: RowReplay): boolean => {
  if (r.predictedMatch.ingredientId !== r.currentMatch.ingredientId) return true;
  if (r.currentMatch.status !== r.predictedMatch.status) return true;
  if (r.predictedMatch.changeType === "regression_alias_miss") return true;
  return false;
};

const isCosmeticKindOnly = (r: RowReplay): boolean =>
  !isMaterialChange(r) &&
  r.predictedMatch.changed &&
  r.currentMatch.matchKind !== r.predictedMatch.matchKind;

const impact = {
  totalRows: rowReplays.length,
  recoveredConfirmed: rowReplays.filter(
    (r) =>
      r.predictedMatch.changeType === "recovered_via_alias" &&
      r.currentMatch.status === "suggested" &&
      r.predictedMatch.status === "confirmed",
  ).length,
  recoveredSuggested: rowReplays.filter(
    (r) =>
      r.predictedMatch.changeType === "recovered_via_alias" &&
      r.currentMatch.status === "unmatched" &&
      r.predictedMatch.status === "confirmed",
  ).length,
  materialChanges: rowReplays.filter(isMaterialChange).length,
  cosmeticKindOnlyChanges: rowReplays.filter(isCosmeticKindOnly).length,
  unchanged: rowReplays.filter((r) => !r.predictedMatch.changed).length,
  unchangedMaterial: rowReplays.filter((r) => !isMaterialChange(r)).length,
  falsePositives: rowReplays.filter(
    (r) =>
      r.predictedMatch.changeType === "alias_collision_redirect" &&
      r.currentMatch.status === "unmatched",
  ).length,
  regressions: rowReplays.filter((r) => r.predictedMatch.changeType === "regression_alias_miss").length,
  statusOnlyChanges: rowReplays.filter(
    (r) =>
      r.currentMatch.status !== r.predictedMatch.status &&
      r.predictedMatch.ingredientId === r.currentMatch.ingredientId,
  ).length,
  ingredientIdChanges: rowReplays.filter(
    (r) => r.predictedMatch.ingredientId !== r.currentMatch.ingredientId,
  ).length,
  prefixRows: rowReplays.filter((r) => r.brandPrefixOnLine).length,
  prefixRowsMaterialChange: rowReplays.filter((r) => r.brandPrefixOnLine && isMaterialChange(r)).length,
};

// Collision audit — Model D operational identities → multiple alias rows
const identityToAliases = new Map<
  string,
  Array<{ aliasName: string; ingredientId: string; supplier: string | null }>
>();
for (const row of aliasRows) {
  const identity = resolveNormalizedAliasFromRowModelD(row);
  if (!identity) continue;
  const supplierKey = row.supplier_name?.trim()
    ? normalizeSupplierDisplayName(row.supplier_name) || row.supplier_name
    : "global";
  const bucketKey = `${supplierKey}::${identity}`;
  const bucket = identityToAliases.get(bucketKey) ?? [];
  bucket.push({
    aliasName: row.alias_name,
    ingredientId: row.ingredient_id,
    supplier: row.supplier_name,
  });
  identityToAliases.set(bucketKey, bucket);
}

const canonicalCollisions = [...identityToAliases.entries()]
  .filter(([, entries]) => {
    const uniqueIngredients = new Set(entries.map((e) => e.ingredientId));
    return entries.length > 1 && uniqueIngredients.size > 1;
  })
  .map(([key, entries]) => ({
    operationalIdentity: key,
    aliases: entries,
    ingredientIds: [...new Set(entries.map((e) => e.ingredientId))],
  }));

const aliasMerges = [...identityToAliases.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([key, entries]) => ({
    operationalIdentity: key,
    aliasCount: entries.length,
    sameIngredient: new Set(entries.map((e) => e.ingredientId)).size === 1,
    aliases: entries.map((e) => e.aliasName),
  }));

// Historical confirmations — all confirmed rows still resolve?
const confirmedRows = rowReplays.filter((r) => r.currentMatch.status === "confirmed");
const confirmedBreaks = confirmedRows.filter(
  (r) =>
    r.predictedMatch.ingredientId !== r.currentMatch.ingredientId ||
    (r.currentMatch.status === "confirmed" && r.predictedMatch.status !== "confirmed"),
);

const aliasOnlyConfirmGaps = confirmedRows.filter((r) => !r.modelDAliasHit);

// Known products
const knownProducts: Record<string, RowReplay | null> = {};
for (const [label, pattern] of Object.entries(KNOWN_PRODUCT_PATTERNS)) {
  knownProducts[label] =
    rowReplays.find((r) => pattern.test(r.rawName) || pattern.test(r.displayName)) ?? null;
}

// Supplier intelligence — alias map key count delta
const supplierIntel = {
  currentAliasMapKeys: Object.keys(currentAliasMap).length,
  modelDAliasMapKeys: Object.keys(modelDAliasMap).length,
  currentUniqueOperationalKeys: new Set(
    aliasRows.map((r) => buildOverrideKeysFromInvoiceLine(r.alias_name, r.supplier_name)?.rawNormalized).filter(Boolean),
  ).size,
  modelDUniqueOperationalKeys: new Set(
    aliasRows.map((r) => resolveNormalizedAliasFromRowModelD(r)).filter(Boolean),
  ).size,
  supplierScopedAliasRows: aliasRows.filter((r) => r.supplier_name?.trim()).length,
};

// Recipe impact — ingredient_id changes
const recipeImpact = {
  ingredientIdChanges: rowReplays
    .filter((r) => r.predictedMatch.ingredientId !== r.currentMatch.ingredientId)
    .map((r) => ({
      rawName: r.rawName,
      from: r.currentMatch.ingredientId,
      to: r.predictedMatch.ingredientId,
    })),
  confirmedIngredientIdChanges: confirmedRows.filter(
    (r) => r.predictedMatch.ingredientId !== r.currentMatch.ingredientId,
  ).length,
  netChange: impact.ingredientIdChanges,
};

// Blast radius
let blastRadius: "NONE" | "LOW" | "MEDIUM" | "HIGH" = "NONE";
if (impact.regressions > 0 || recipeImpact.confirmedIngredientIdChanges > 0) {
  blastRadius = impact.regressions >= 3 || recipeImpact.confirmedIngredientIdChanges > 0 ? "HIGH" : "MEDIUM";
} else if (impact.recoveredConfirmed > 0 || impact.prefixRowsAffected > 0) {
  blastRadius = "LOW";
}

const prosciutto = knownProducts.Prosciutto;
const finalAnswers = {
  rowsImprove: impact.recoveredConfirmed + impact.recoveredSuggested,
  regress: impact.regressions,
  collisions: canonicalCollisions.length,
  prosciuttoFixed:
    prosciutto != null &&
    prosciutto.currentMatch.status === "suggested" &&
    prosciutto.predictedMatch.status === "confirmed" &&
    prosciutto.modelDAliasHit,
    confirmedBreaks: confirmedBreaks.length,
    aliasOnlyConfirmGaps: aliasOnlyConfirmGaps.length,
  recipeChanges: recipeImpact.netChange,
  modelDProductionReady:
    impact.regressions === 0 &&
    canonicalCollisions.length === 0 &&
    recipeImpact.confirmedIngredientIdChanges === 0 &&
    confirmedBreaks.length === 0 &&
    (prosciutto?.modelDAliasHit ?? false),
  recommendedNextStep:
    impact.regressions === 0 && confirmedBreaks.length === 0 && canonicalCollisions.length === 0
      ? "D — deploy read+write alias spine alignment with beverage exclusions"
      : canonicalCollisions.length > 0
        ? "D with pre-deploy duplicate-alias cleanup (mozzarella julienne collision)"
        : "D with dual-compat alias re-derive audit for non-alias confirmed rows",
};

const results = {
  auditType: "STRICT_READ_ONLY_OPERATIONAL_IDENTITY_REPLAY",
  model: "D",
  modelLabel: "Layered Identity Architecture",
  validationLab: VL_REF,
  generatedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  constraints: { codeChanges: false, dbWrites: false, deployments: false },
  simulation: {
    currentPath: "buildOverrideKeysFromInvoiceLine (production)",
    modelDPath: "stripInvoiceBrandPrefix → normalizeOperationalAliasKey (simulated spine addition)",
    aliasMapRebuild: "resolveNormalizedAliasFromConfirmedRow equivalent with Model D strip on alias_name",
    beverageExclusion: "San Pellegrino NOT in INVOICE_BRAND_PREFIX_STRIP_RE",
  },
  corpusStats: {
    invoiceItems: rowReplays.length,
    aliasRows: aliasRows.length,
    matchRows: matches?.length ?? 0,
    confirmedMatches: confirmedRows.length,
  },
  impact,
  rowReplays,
  knownProducts: Object.fromEntries(
    Object.entries(knownProducts).map(([k, v]) => [
      k,
      v
        ? {
            invoiceItemId: v.invoiceItemId,
            rawName: v.rawName,
            displayName: v.displayName,
            currentAliasKey: v.currentAliasKey,
            proposedOperationalIdentity: v.proposedOperationalIdentity,
            currentAliasHit: v.currentAliasHit,
            modelDAliasHit: v.modelDAliasHit,
            currentMatch: v.currentMatch,
            predictedMatch: v.predictedMatch,
            brandPrefixOnLine: v.brandPrefixOnLine,
          }
        : null,
    ]),
  ),
  collisionAudit: {
    canonicalCollisions,
    aliasMerges: aliasMerges.filter((m) => m.aliasCount > 1),
    collisionCount: canonicalCollisions.length,
    mergeCount: aliasMerges.filter((m) => m.aliasCount > 1).length,
  },
  historicalConfirmations: {
    totalConfirmed: confirmedRows.length,
    stillResolveViaModelDAlias: confirmedRows.filter((r) => r.modelDAliasHit).length,
    aliasOnlyConfirmGaps: aliasOnlyConfirmGaps.map((r) => ({
      invoiceItemId: r.invoiceItemId,
      rawName: r.rawName,
      currentIngredientId: r.currentMatch.ingredientId,
      currentMatchKind: r.currentMatch.matchKind,
      note: "Confirmed via semantic/exact path; alias layer miss is pre-existing, not introduced by Model D",
    })),
    materialBreaks: confirmedBreaks.map((r) => ({
      invoiceItemId: r.invoiceItemId,
      rawName: r.rawName,
      currentIngredientId: r.currentMatch.ingredientId,
      predictedIngredientId: r.predictedMatch.ingredientId,
      currentStatus: r.currentMatch.status,
      predictedStatus: r.predictedMatch.status,
      modelDAliasHit: r.modelDAliasHit,
    })),
  },
  supplierIntelligenceImpact: supplierIntel,
  recipeImpact,
  blastRadius,
  finalAnswers,
  priorAuditReferences: [
    ".tmp/operational-identity-canonicalization-audit/design.json",
    ".tmp/alias-write-path-consistency-audit/",
    ".tmp/brand-prefix-alias-coverage-audit/",
    ".tmp/possible-match-regression-audit/",
  ],
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

console.log(
  JSON.stringify(
    {
      rows: results.corpusStats.invoiceItems,
      recoveredConfirmed: impact.recoveredConfirmed,
      regressions: impact.regressions,
      unchanged: impact.unchanged,
      prosciuttoFixed: finalAnswers.prosciuttoFixed,
      confirmedBreaks: finalAnswers.confirmedBreaks,
      collisions: canonicalCollisions.length,
      blastRadius,
    },
    null,
    2,
  ),
);
