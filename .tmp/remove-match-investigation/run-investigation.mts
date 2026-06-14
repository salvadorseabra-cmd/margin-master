/**
 * Remove Match / No Match — READ-ONLY investigation harness.
 * Queries VL Supabase and runs live matcher for unmatched/matched examples.
 */
import "./env-bootstrap.mts";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildConfirmedAliasMapFromRows } from "../../src/lib/ingredient-alias-memory.ts";
import { buildInvoiceMatchCatalog } from "../../src/lib/ingredient-canonical-synthesis.ts";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "../../src/lib/invoice-ingredient-row-display.ts";
import {
  isConfirmedIngredientMatch,
  resolveInvoiceIngredientDisplayState,
} from "../../src/lib/ingredient-match-explanation.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { isEligibleInvoiceIngredientRow } from "../../src/lib/invoice-unresolved-ingredient-count.ts";

const OUT = ".tmp/remove-match-investigation";
const VL_REF = "bjhnlrgodcqoyzddbpbd";

const VL_INVOICES = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino" },
  { id: "ab52796d-de1d-418d-86e7-230c8f056f09", label: "Emporio (live)" },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore" },
];

const PEPINO_INGREDIENT_ID = "635a1189-36ea-4ff2-9012-8172ab1ab81d";
const BIDFOOD_PEPINO_ITEM_ID = "8e9e727a-1d02-41f7-88e7-8eeea59c8b57";
const BIDFOOD_INVOICE_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"), {
  auth: { persistSession: false },
});

mkdirSync(OUT, { recursive: true });

const invoiceIds = VL_INVOICES.map((i) => i.id);

const [
  { data: items },
  { data: invoices },
  { data: ingredients },
  { data: aliasRows },
  { data: priceHistory },
] = await Promise.all([
  sb
    .from("invoice_items")
    .select("id, invoice_id, user_id, name, quantity, unit, unit_price, total, created_at, updated_at")
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: true }),
  sb.from("invoices").select("id, supplier_name, invoice_date, created_at").in("id", invoiceIds),
  sb
    .from("ingredients")
    .select(
      "id, name, normalized_name, current_price, purchase_quantity, purchase_unit, base_unit, unit, ingredient_kind, is_archived",
    ),
  sb
    .from("ingredient_aliases")
    .select(
      "id, ingredient_id, alias_name, normalized_alias, supplier_name, confidence, confirmed_by_user, created_at",
    ),
  sb
    .from("ingredient_price_history")
    .select(
      "id, ingredient_id, invoice_id, ingredient_name, supplier_name, previous_price, new_price, delta, delta_percent, created_at",
    )
    .in("invoice_id", invoiceIds),
]);

const invoiceById = new Map((invoices ?? []).map((row) => [row.id, row]));
const confirmedAliases = buildConfirmedAliasMapFromRows(aliasRows ?? []);
const catalog = (ingredients ?? []).filter((row) => !row.is_archived);

const eligibleItems = (items ?? [])
  .map((row) =>
    normalizeInvoiceItemFields({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      unit_price: row.unit_price,
      total: row.total,
    }),
  )
  .filter(isEligibleInvoiceIngredientRow);

const matchCatalog = buildInvoiceMatchCatalog(
  catalog,
  eligibleItems.map((row) => ({ name: row.name })),
);

type MatchRow = {
  invoiceItemId: string;
  invoiceId: string;
  invoiceLabel: string;
  supplier: string | null;
  productName: string;
  displayState: string;
  summaryBucket: string;
  matchKind: string | null;
  ingredientId: string | null;
  ingredientName: string | null;
  wouldSyncOnExtract: boolean;
};

const matchRows: MatchRow[] = [];
const unmatchedExamples: MatchRow[] = [];
const matchedExamples: MatchRow[] = [];

for (const item of eligibleItems) {
  const source = (items ?? []).find((row) => row.id === item.id);
  if (!source) continue;
  const inv = invoiceById.get(source.invoice_id);
  const supplier = inv?.supplier_name?.trim() || null;
  const { match, state } = resolveInvoiceTableRowIngredientMatch(
    item.name,
    matchCatalog,
    confirmedAliases,
    supplier,
  );
  const displayState = resolveInvoiceIngredientDisplayState(match);
  const bucket = invoiceRowMatchSummaryBucket(state.displayState);
  const row: MatchRow = {
    invoiceItemId: item.id,
    invoiceId: source.invoice_id,
    invoiceLabel: VL_INVOICES.find((i) => i.id === source.invoice_id)?.label ?? source.invoice_id,
    supplier,
    productName: item.name,
    displayState,
    summaryBucket: bucket,
    matchKind: match?.kind ?? null,
    ingredientId: match?.ingredient.id ?? null,
    ingredientName: match?.ingredient.name ?? match?.ingredient.normalized_name ?? null,
    wouldSyncOnExtract: bucket !== "unmatched",
  };
  matchRows.push(row);
  if (displayState === "unmatched") {
    if (unmatchedExamples.length < 8) unmatchedExamples.push(row);
  } else if (matchedExamples.length < 8) {
    matchedExamples.push(row);
  }
}

const pepinoItem = (items ?? []).find((row) => row.id === BIDFOOD_PEPINO_ITEM_ID);
const pepinoInvoice = invoiceById.get(BIDFOOD_INVOICE_ID);
const pepinoSupplier = pepinoInvoice?.supplier_name ?? null;
const pepinoMatch = pepinoItem
  ? resolveInvoiceTableRowIngredientMatch(
      pepinoItem.name,
      matchCatalog,
      confirmedAliases,
      pepinoSupplier,
    )
  : null;

const pepinoAliases = (aliasRows ?? []).filter(
  (row) =>
    row.ingredient_id === PEPINO_INGREDIENT_ID ||
    /pepino/i.test(row.alias_name ?? "") ||
    /pepino/i.test(row.normalized_alias ?? ""),
);

const pepinoHistory = (priceHistory ?? []).filter(
  (row) => row.ingredient_id === PEPINO_INGREDIENT_ID,
);

const bidfoodPepinoHistory = pepinoHistory.find((row) => row.invoice_id === BIDFOOD_INVOICE_ID);

const summary = {
  generated_at: new Date().toISOString(),
  invoice_item_count: items?.length ?? 0,
  eligible_line_count: eligibleItems.length,
  display_state_counts: {
    confirmed: matchRows.filter((r) => r.displayState === "confirmed").length,
    suggested: matchRows.filter((r) => r.displayState === "suggested").length,
    unmatched: matchRows.filter((r) => r.displayState === "unmatched").length,
  },
  extract_sync_would_run: matchRows.filter((r) => r.wouldSyncOnExtract).length,
  ingredient_alias_count: aliasRows?.length ?? 0,
  confirmed_alias_count: (aliasRows ?? []).filter((r) => r.confirmed_by_user).length,
  price_history_rows_on_vl_invoices: priceHistory?.length ?? 0,
};

const schemaTrace = {
  generated_at: new Date().toISOString(),
  invoice_items: {
    has_ingredient_id_column: false,
    columns: [
      "id",
      "invoice_id",
      "user_id",
      "name",
      "quantity",
      "unit",
      "unit_price",
      "total",
      "created_at",
      "updated_at",
    ],
    migration: "supabase/migrations/20260511115814_625d8b2b-28d8-4400-b815-d2e6173f063e.sql",
    match_persistence: "none — match resolved at read time via alias map + canonical matcher",
  },
  ingredient_aliases: {
    columns: [
      "id",
      "ingredient_id",
      "alias_name",
      "normalized_alias",
      "supplier_name",
      "confidence",
      "confirmed_by_user",
      "created_at",
    ],
    migration: "supabase/migrations/20260519130000_ingredient_aliases.sql",
    role: "persists invoice wording → ingredient_id for confirmed/manual matches",
  },
  ingredient_price_history: {
    columns: [
      "id",
      "ingredient_id",
      "invoice_id",
      "ingredient_name",
      "supplier_name",
      "ingredient_unit",
      "previous_price",
      "new_price",
      "delta",
      "delta_percent",
      "created_at",
    ],
    migration: "supabase/migrations/20260513231000_ingredient_price_history.sql",
    invoice_id_on_delete: "set null",
    role: "append-only audit trail when cost sync runs for matched lines",
  },
  unmatched_state: {
    persisted_on_invoice_items: false,
    runtime_definition: "matcher returns null OR displayState unmatched",
    session_rejection: "rejectedMatchItemIds Set in invoices.tsx — suppresses presentation only",
    pair_rejection: "localStorage marginly:rejected-ingredient-matches:{userId} — blocks re-match for pair",
    no_delete_alias_api: true,
  },
  vl_live_summary: summary,
  unmatched_examples: unmatchedExamples,
  matched_examples: matchedExamples,
  pepino_case: {
    invoiceItemId: BIDFOOD_PEPINO_ITEM_ID,
    invoiceId: BIDFOOD_INVOICE_ID,
    productName: pepinoItem?.name ?? null,
    raw_item: pepinoItem ?? null,
    live_match: pepinoMatch
      ? {
          kind: pepinoMatch.match?.kind ?? null,
          displayState: pepinoMatch.state.displayState,
          ingredientId: pepinoMatch.match?.ingredient.id ?? null,
          ingredientName: pepinoMatch.match?.ingredient.name ?? null,
          isConfirmed: isConfirmedIngredientMatch(pepinoMatch.match),
          wouldSyncOnExtract: invoiceRowMatchSummaryBucket(pepinoMatch.state.displayState) !== "unmatched",
        }
      : null,
    aliases: pepinoAliases,
    price_history: pepinoHistory,
    bidfood_history_row: bidfoodPepinoHistory ?? null,
  },
};

writeFileSync(`${OUT}/schema-trace.json`, JSON.stringify(schemaTrace, null, 2));
writeFileSync(`${OUT}/query-summary.json`, JSON.stringify(summary, null, 2));

console.log(JSON.stringify({ ok: true, summary, unmatchedCount: unmatchedExamples.length }, null, 2));
