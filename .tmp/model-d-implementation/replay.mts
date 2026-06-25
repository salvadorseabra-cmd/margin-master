/**
 * Model D implementation validation replay — production code paths.
 * VL: bjhnlrgodcqoyzddbpbd
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
import { stripInvoiceBrandPrefix } from "../../src/lib/canonical-ingredient-display-name.ts";
import {
  buildConfirmedAliasMapFromRows,
  detectAliasOwnershipCollisions,
  resolveNormalizedAliasFromConfirmedRow,
  type ConfirmedIngredientAliasRow,
} from "../../src/lib/ingredient-alias-memory.ts";
import { buildIngredientAliasLookupKey, lookupIngredientIdFromAliasMap } from "../../src/lib/ingredient-alias-lookup.ts";
import { buildOverrideKeysFromInvoiceLine } from "../../src/lib/ingredient-match-override.ts";
import { buildOperationalIdentityAliasKey } from "../../src/lib/ingredient-operational-alias-memory.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(__dir, { recursive: true });

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

const KNOWN_PRODUCTS: Record<string, RegExp> = {
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

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const [{ data: items }, { data: aliases }, { data: matches }, { data: invoices }, { data: ingredients }] =
  await Promise.all([
    sb.from("invoice_items").select("id, invoice_id, name").in("invoice_id", VL_INVOICE_IDS),
    sb
      .from("ingredient_aliases")
      .select("ingredient_id, alias_name, normalized_alias, supplier_name, confirmed_by_user"),
    sb
      .from("invoice_item_matches")
      .select("invoice_item_id, ingredient_id, status, match_kind")
      .in(
        "invoice_item_id",
        (
          await sb.from("invoice_items").select("id").in("invoice_id", VL_INVOICE_IDS)
        ).data?.map((r) => r.id) ?? [],
      ),
    sb.from("invoices").select("id, supplier_name").in("id", VL_INVOICE_IDS),
    sb.from("ingredients").select("id, name"),
  ]);

const aliasRows = (aliases ?? []) as ConfirmedIngredientAliasRow[];
const aliasMap = buildConfirmedAliasMapFromRows(aliasRows);
const supplierByInvoice = new Map((invoices ?? []).map((r) => [r.id, r.supplier_name ?? null]));
const matchByItem = new Map((matches ?? []).map((m) => [m.invoice_item_id, m]));
const ingredientNameById = new Map((ingredients ?? []).map((r) => [r.id, r.name ?? r.id]));

type RowResult = {
  rawName: string;
  supplier: string | null;
  rawKey: string | null;
  operationalKey: string | null;
  aliasHit: boolean;
  ingredientId: string | null;
  persistedIngredientId: string | null;
  persistedStatus: string | null;
  ingredientIdChanged: boolean;
  prefixStripped: boolean;
};

const rowResults: RowResult[] = [];

for (const item of items ?? []) {
  const supplier = supplierByInvoice.get(item.invoice_id) ?? null;
  const rawName = item.name?.trim() ?? "";
  const keys = buildOverrideKeysFromInvoiceLine(rawName, supplier);
  const hit = lookupIngredientIdFromAliasMap(aliasMap, rawName, supplier, rawName);
  const persisted = matchByItem.get(item.id);
  const stripped = stripInvoiceBrandPrefix(rawName);

  rowResults.push({
    rawName,
    supplier,
    rawKey: keys?.rawNormalized ?? null,
    operationalKey: keys?.operationalIdentityKey ?? null,
    aliasHit: Boolean(hit),
    ingredientId: hit ?? null,
    persistedIngredientId: persisted?.ingredient_id ?? null,
    persistedStatus: persisted?.status ?? null,
    ingredientIdChanged: hit != null && persisted?.ingredient_id != null && hit !== persisted.ingredient_id,
    prefixStripped: stripped !== rawName,
  });
}

const knownProductMatrix = Object.fromEntries(
  Object.entries(KNOWN_PRODUCTS).map(([label, pattern]) => {
    const row = rowResults.find((r) => pattern.test(r.rawName));
    if (!row) return [label, null];
    const prosciuttoAuto =
      label === "Prosciutto" && row.aliasHit && row.ingredientId === row.persistedIngredientId;
    return [
      label,
      {
        rawName: row.rawName,
        aliasHit: row.aliasHit,
        ingredientId: row.ingredientId,
        persistedIngredientId: row.persistedIngredientId,
        ingredientIdUnchanged: row.ingredientId == null || !row.ingredientIdChanged,
        prefixStripped: row.prefixStripped,
        operationalDiffersFromRaw: row.operationalKey !== row.rawKey,
        prosciuttoAutoMatch: prosciuttoAuto,
      },
    ];
  }),
);

const collisions = detectAliasOwnershipCollisions(
  aliasRows.map((r, i) => ({
    id: String(i),
    ingredient_id: r.ingredient_id,
    alias_name: r.alias_name,
    normalized_alias: resolveNormalizedAliasFromConfirmedRow(r) ?? r.normalized_alias,
    supplier_name: r.supplier_name,
  })),
);

const prosciutto = knownProductMatrix.Prosciutto as {
  aliasHit: boolean;
  prosciuttoAutoMatch: boolean;
} | null;

const regressions = rowResults.filter(
  (r) => r.aliasHit && r.persistedIngredientId && r.ingredientId !== r.persistedIngredientId,
);

const validation = {
  prosciuttoAutoMatch: prosciutto?.aliasHit === true,
  knownProductsUnchanged: Object.entries(knownProductMatrix)
    .filter(([k]) => k !== "Prosciutto")
    .every(([, v]) => v && (v as { ingredientIdUnchanged: boolean }).ingredientIdUnchanged),
  noIngredientIdChanges: rowResults.every((r) => !r.ingredientIdChanged),
  noCollisions: collisions.length === 0,
  regressions: regressions.length,
  pass:
    prosciutto?.aliasHit === true &&
    regressions.length === 0 &&
    Object.entries(knownProductMatrix)
      .filter(([k]) => k !== "Prosciutto")
      .every(([, v]) => v && (v as { ingredientIdUnchanged: boolean }).ingredientIdUnchanged),
};

const results = {
  auditType: "MODEL_D_IMPLEMENTATION_VALIDATION",
  validationLab: VL_REF,
  generatedAt: new Date().toISOString(),
  implementation: {
    readPath: "buildOverrideKeysFromInvoiceLine raw + operationalIdentityKey dual lookup",
    writePath: "upsertConfirmedAliasDualIdentity (raw + operational when distinct)",
    brandStrip: "stripInvoiceBrandPrefix via buildOperationalIdentityAliasKey",
    beverageExclusion: "San Pellegrino NOT in INVOICE_BRAND_PREFIX_STRIP_RE",
  },
  filesChanged: [
    "src/lib/canonical-ingredient-display-name.ts",
    "src/lib/ingredient-operational-alias-memory.ts",
    "src/lib/ingredient-match-override.ts",
    "src/lib/ingredient-alias-lookup.ts",
    "src/lib/ingredient-alias-memory.ts",
    "src/lib/ingredient-correction-memory.ts",
    "src/lib/ingredient-match-alias-memory.ts",
    "src/lib/ingredient-model-d.test.ts",
  ],
  corpusStats: { invoiceItems: rowResults.length, aliasRows: aliasRows.length },
  validationMatrix: knownProductMatrix,
  blastRadius: validation.regressions > 0 ? "MEDIUM" : validation.prosciuttoAutoMatch ? "LOW" : "MEDIUM",
  validation,
  collisions: collisions.length,
  rowResults,
};

writeFileSync(join(__dir, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ validation, collisions: collisions.length }, null, 2));
