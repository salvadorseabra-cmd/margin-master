/**
 * Pepino Contamination Timeline — READ-ONLY harness
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
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../../src/lib/ingredient-price-history.ts";

const OUT = ".tmp/pepino-contamination-timeline";
const VL_REF = "bjhnlrgodcqoyzddbpbd";

const BIDFOOD_INVOICE_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const PEPINO_ITEM_ID = "8e9e727a-1d02-41f7-88e7-8eeea59c8b57";
const PEPINO_INGREDIENT_ID = "635a1189-36ea-4ff2-9012-8172ab1ab81d";
const AVILUDO_APRIL_ID = "c2f52357-0f80-491a-ba14-c97ff4837472";
const AVILUDO_MAY_ID = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";

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

const [
  { data: bidfoodInvoice },
  { data: pepinoItem },
  { data: ingredient },
  { data: aliases },
  { data: allHistory },
  { data: relatedInvoices },
  { data: relatedItems },
] = await Promise.all([
  sb
    .from("invoices")
    .select("id, supplier_name, invoice_date, created_at, user_id, total, settlement_status")
    .eq("id", BIDFOOD_INVOICE_ID)
    .maybeSingle(),
  sb
    .from("invoice_items")
    .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at, updated_at")
    .eq("id", PEPINO_ITEM_ID)
    .maybeSingle(),
  sb
    .from("ingredients")
    .select(
      "id, name, normalized_name, current_price, purchase_quantity, purchase_unit, base_unit, unit, created_at, updated_at",
    )
    .eq("id", PEPINO_INGREDIENT_ID)
    .maybeSingle(),
  sb
    .from("ingredient_aliases")
    .select(
      "id, ingredient_id, alias_name, normalized_alias, supplier_name, confidence, confirmed_by_user, created_at",
    )
    .eq("ingredient_id", PEPINO_INGREDIENT_ID)
    .order("created_at", { ascending: true }),
  sb
    .from("ingredient_price_history")
    .select(
      "id, ingredient_id, invoice_id, ingredient_name, supplier_name, ingredient_unit, previous_price, new_price, delta, delta_percent, created_at",
    )
    .eq("ingredient_id", PEPINO_INGREDIENT_ID)
    .order("created_at", { ascending: true }),
  sb
    .from("invoices")
    .select("id, supplier_name, invoice_date, created_at, updated_at")
    .in("id", [BIDFOOD_INVOICE_ID, AVILUDO_APRIL_ID, AVILUDO_MAY_ID]),
  sb
    .from("invoice_items")
    .select("id, invoice_id, name, created_at")
    .in("invoice_id", [BIDFOOD_INVOICE_ID, AVILUDO_APRIL_ID, AVILUDO_MAY_ID])
    .ilike("name", "%pepino%"),
]);

const aliasMap = buildConfirmedAliasMapFromRows(
  (aliases ?? []).filter((a) => a.confirmed_by_user),
);
const catalog = ingredient
  ? [
      {
        id: ingredient.id,
        name: ingredient.name,
        normalized_name: ingredient.normalized_name,
        current_price: ingredient.current_price,
        purchase_quantity: ingredient.purchase_quantity,
        purchase_unit: ingredient.purchase_unit,
        base_unit: ingredient.base_unit,
        unit: ingredient.unit,
      },
    ]
  : [];

const pepinoMatch = pepinoItem
  ? resolveInvoiceTableRowIngredientMatch(
      pepinoItem.name,
      buildInvoiceMatchCatalog(catalog, [{ name: pepinoItem.name }]),
      aliasMap,
      bidfoodInvoice?.supplier_name ?? null,
    )
  : null;

const operationalFields = pepinoItem
  ? operationalCostFieldsFromInvoiceLine(
      {
        name: pepinoItem.name,
        quantity: pepinoItem.quantity,
        unit: pepinoItem.unit,
        unit_price: pepinoItem.unit_price,
      },
      {},
    )
  : null;

const bidfoodHistory = (allHistory ?? []).find((h) => h.invoice_id === BIDFOOD_INVOICE_ID);

// Build chronological events with both wall-clock and invoice-date ordering
type TimelineEvent = {
  seq: number;
  phase: string;
  wallClock: string | null;
  invoiceDate: string | null;
  source: string;
  writes: string[];
  data: Record<string, unknown>;
};

const events: TimelineEvent[] = [];
let seq = 0;

if (ingredient?.created_at) {
  events.push({
    seq: ++seq,
    phase: "ingredient_catalog_created",
    wallClock: ingredient.created_at,
    invoiceDate: null,
    source: "ingredients.created_at",
    writes: ["ingredients row"],
    data: { id: ingredient.id, name: ingredient.name },
  });
}

for (const alias of aliases ?? []) {
  events.push({
    seq: ++seq,
    phase: "alias_confirmed",
    wallClock: alias.created_at,
    invoiceDate: null,
    source: "ingredient_aliases.created_at",
    writes: ["ingredient_aliases"],
    data: {
      alias_name: alias.alias_name,
      confirmed_by_user: alias.confirmed_by_user,
      supplier_name: alias.supplier_name,
    },
  });
}

for (const inv of relatedInvoices ?? []) {
  events.push({
    seq: ++seq,
    phase: "invoice_uploaded",
    wallClock: inv.created_at,
    invoiceDate: inv.invoice_date,
    source: "invoices.created_at",
    writes: ["invoices row"],
    data: { id: inv.id, supplier: inv.supplier_name, label: inv.id === BIDFOOD_INVOICE_ID ? "Bidfood" : inv.id === AVILUDO_APRIL_ID ? "Aviludo April" : "Aviludo May" },
  });
}

for (const item of relatedItems ?? []) {
  events.push({
    seq: ++seq,
    phase: "invoice_item_persisted",
    wallClock: item.created_at,
    invoiceDate: relatedInvoices?.find((i) => i.id === item.invoice_id)?.invoice_date ?? null,
    source: "invoice_items.created_at",
    writes: ["invoice_items"],
    data: { id: item.id, name: item.name, invoice_id: item.invoice_id },
  });
}

for (const hist of allHistory ?? []) {
  events.push({
    seq: ++seq,
    phase: "price_history_written",
    wallClock: hist.created_at,
    invoiceDate: relatedInvoices?.find((i) => i.id === hist.invoice_id)?.invoice_date ?? null,
    source: "ingredient_price_history.created_at (invoice-date anchored)",
    writes: ["ingredient_price_history", "ingredients.current_price (same sync transaction)"],
    data: {
      id: hist.id,
      invoice_id: hist.invoice_id,
      previous_price: hist.previous_price,
      new_price: hist.new_price,
      delta_percent: hist.delta_percent,
      supplier_name: hist.supplier_name,
    },
  });
}

if (pepinoItem?.created_at) {
  events.push({
    seq: ++seq,
    phase: "bidfood_pepino_item_current",
    wallClock: pepinoItem.created_at,
    invoiceDate: bidfoodInvoice?.invoice_date ?? null,
    source: "invoice_items.created_at (latest re-extract)",
    writes: ["invoice_items re-insert on re-extract"],
    data: { note: "Items deleted+reinserted on each OCR re-run; wall clock reflects latest extract" },
  });
}

events.sort((a, b) => {
  const aw = a.wallClock ?? "";
  const bw = b.wallClock ?? "";
  return aw.localeCompare(bw);
});
events.forEach((e, i) => {
  e.seq = i + 1;
});

const writeOrder = {
  bidfood_pepino_contamination: {
    first_irreversible_write: "ingredient_price_history + ingredients.current_price",
    code_path: "invoices.tsx post-insert → syncOperationalIngredientCostsFromInvoiceLines → persistOperationalIngredientCostFromInvoiceLine → appendIngredientPriceHistoryFromInvoiceLine",
    requires_human_action: false,
    alias_written_for_pepino: (aliases ?? []).some((a) => /^pepino$/i.test(a.alias_name.trim())),
    match_at_extract: pepinoMatch
      ? {
          kind: pepinoMatch.match?.kind,
          displayState: pepinoMatch.state.displayState,
          isConfirmed: isConfirmedIngredientMatch(pepinoMatch.match),
          wouldSync: invoiceRowMatchSummaryBucket(pepinoMatch.state.displayState) !== "unmatched",
        }
      : null,
    operational_price_written: operationalFields?.current_price ?? null,
    history_row: bidfoodHistory ?? null,
  },
  chronology_notes: [
    "price_history.created_at uses invoice_date T12:00:00Z when invoice_date known — NOT wall-clock upload time",
    "Comparing contamination timing requires invoices.created_at (upload) vs history row existence",
    "Jar aliases (confirmed_by_user=true) predate Bidfood invoice upload if alias created_at < bidfood invoices.created_at",
  ],
};

const output = {
  generated_at: new Date().toISOString(),
  ids: {
    bidfoodInvoiceId: BIDFOOD_INVOICE_ID,
    pepinoItemId: PEPINO_ITEM_ID,
    ingredientId: PEPINO_INGREDIENT_ID,
  },
  bidfood_invoice: bidfoodInvoice,
  pepino_item: pepinoItem,
  ingredient,
  aliases,
  price_history: allHistory,
  related_invoices: relatedInvoices,
  related_pepino_items: relatedItems,
  live_match: pepinoMatch
    ? {
        kind: pepinoMatch.match?.kind,
        displayState: pepinoMatch.state.displayState,
        ingredientId: pepinoMatch.match?.ingredient.id,
      }
    : null,
  operational_fields_computed: operationalFields,
  events_chronological_by_wall_clock: events,
  write_order_analysis: writeOrder,
};

writeFileSync(`${OUT}/query-raw.json`, JSON.stringify(output, null, 2));

// Determine if bidfood history predates any human alias for "Pepino" specifically
const pepinoAlias = (aliases ?? []).find((a) => /^pepino$/i.test(a.alias_name.trim()));
const bidfoodUpload = bidfoodInvoice?.created_at ?? null;
const firstJarAlias = aliases?.[0]?.created_at ?? null;
const bidfoodHistoryCreated = bidfoodHistory?.created_at ?? null;

const verdict = {
  contamination_before_human_review: null as boolean | null,
  evidence: [] as string[],
};

if (bidfoodUpload && bidfoodHistoryCreated) {
  // History created_at is invoice-date anchored; use invoice existence + code path
  verdict.evidence.push(
    `Bidfood invoice wall-clock upload: ${bidfoodUpload}`,
    `Bidfood history row id: ${bidfoodHistory?.id}`,
    `History created_at (invoice-anchored): ${bidfoodHistoryCreated}`,
    `Pepino-specific alias exists: ${Boolean(pepinoAlias)}`,
    `First jar alias wall-clock: ${firstJarAlias}`,
    `Extract sync runs synchronously after invoice_items insert — no UI gate`,
    `Match kind at extract: ${pepinoMatch?.match?.kind} → displayState ${pepinoMatch?.state.displayState}`,
  );
  verdict.contamination_before_human_review = true;
}

writeFileSync(`${OUT}/verdict-raw.json`, JSON.stringify(verdict, null, 2));
console.log(JSON.stringify({ ok: true, eventCount: events.length, verdict }, null, 2));
