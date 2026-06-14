/**
 * Read-only repair scope inventory for Historical Pricing Repair Phase 3.
 *
 * Reports affected row IDs for created_at corruption, Mozzarella contamination,
 * multi-`un` denominator bugs, duplicates, and suggested-match poison rows.
 *
 *   npx vite-node scripts/validate-repair-scope.mts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INVOICE_CREATED_AT = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const MOZZARELLA_ID = "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d";
const ATUM_ID = "0f30ccb3-bb47-40bb-83cc-ae2a4018066d";

const MOZZARELLA_KEEP = "3c508a43-68bd-4b69-9205-61ddbbfb26a7";
const MOZZARELLA_DELETE = [
  "9ee1b793-974d-4a6b-b656-c7b5e8febfaa",
  "18bdb0c5-0370-4bc7-878d-85957b8ba946",
];

const CREATED_AT_REPAIR_IDS = [
  "edc6c627-d934-40de-8eb8-cc0a25d36755",
  "14330aad-cce1-4569-aa2f-4976dd1ac336",
  "908de185-e61a-4f41-af4c-3b70f69bd08f",
  "1d9d5133-724b-461c-b141-605392f2b64d",
  "781ab1ac-39d2-4462-9106-635e5603c466",
  "e143080d-511b-4c37-9018-11949343aedc",
  "bf250ee4-388a-480f-96d7-e8c0e8e8dfb2",
];

const ATUM_APRIL_HISTORY = "61c51696-acd8-4a58-878f-a588c1878af0";

const COUNTABLE_UNITS = new Set(["un", "uni", "unid", "unit", "units"]);

// --- Fix #1: created_at corruption on invoice 3b4cb21f ---

const { data: invHist } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_id,ingredient_name,created_at, invoices(invoice_date)")
  .eq("invoice_id", INVOICE_CREATED_AT);

const createdAtCorrupted = (invHist ?? []).filter((r) => {
  const invYear = r.invoices?.invoice_date?.slice(0, 4);
  const createdYear = r.created_at?.slice(0, 4);
  return invYear && createdYear && invYear !== createdYear;
});

const { data: allHist } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_id,invoice_id,created_at, invoices(invoice_date)")
  .not("invoice_id", "is", null);

const globalCorrupted = (allHist ?? []).filter((r) => {
  const invYear = r.invoices?.invoice_date?.slice(0, 4);
  const createdYear = r.created_at?.slice(0, 4);
  return invYear && createdYear && invYear !== createdYear;
});

// --- Fix #2: Mozzarella rows ---

const { data: mozRows } = await sb
  .from("ingredient_price_history")
  .select("id,invoice_id,new_price,created_at, invoices(invoice_date)")
  .eq("ingredient_id", MOZZARELLA_ID)
  .order("created_at");

const { data: mozMatches } = await sb
  .from("invoice_item_matches")
  .select("invoice_item_id,status,match_kind, invoice_items(invoice_id,name)")
  .eq("ingredient_id", MOZZARELLA_ID);

// --- Fix #3: multi-`un` confirmed lines ---

const { data: confirmedItems } = await sb
  .from("invoice_item_matches")
  .select(
    "ingredient_id,status, invoice_items(id,invoice_id,name,quantity,unit,unit_price,total)",
  )
  .eq("status", "confirmed");

const ingredientIds = [
  ...new Set((confirmedItems ?? []).map((m) => m.ingredient_id).filter(Boolean)),
] as string[];
const { data: ingredients } = await sb
  .from("ingredients")
  .select("id,name")
  .in("id", ingredientIds.length ? ingredientIds : ["00000000-0000-0000-0000-000000000000"]);
const ingMap = new Map((ingredients ?? []).map((i) => [i.id, i.name]));

const multiUn: unknown[] = [];
for (const m of confirmedItems ?? []) {
  const item = m.invoice_items;
  if (!item || !m.ingredient_id) continue;
  const norm = normalizeInvoiceItemFields(item);
  const qty = norm.quantity == null ? null : Number(norm.quantity);
  const unit = (norm.unit ?? "").toLowerCase();
  if (qty == null || qty <= 1 || !COUNTABLE_UNITS.has(unit)) continue;

  const fields = operationalCostFieldsFromInvoiceLine(norm);
  const op = fields
    ? operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity)
    : null;
  const up = norm.unit_price == null ? null : Number(norm.unit_price);
  const suspectDivide =
    up != null && op != null && Math.abs(up / qty - op) < 0.001;

  const { data: h } = await sb
    .from("ingredient_price_history")
    .select("id,new_price,previous_price,delta_percent,created_at")
    .eq("ingredient_id", m.ingredient_id)
    .eq("invoice_id", item.invoice_id)
    .maybeSingle();

  multiUn.push({
    ingredient_id: m.ingredient_id,
    ingredient_name: ingMap.get(m.ingredient_id) ?? null,
    invoice_id: item.invoice_id,
    item_id: item.id,
    line: norm.name,
    qty,
    unit: norm.unit,
    unit_price: up,
    purchase_qty: fields?.purchase_quantity,
    operational: op,
    suspect_double_divide: suspectDivide,
    history_id: h?.id ?? null,
    history_new_price: h?.new_price ?? null,
  });
}

// --- Duplicate (invoice_id, ingredient_id) groups ---

const groups = new Map<string, string[]>();
for (const h of allHist ?? []) {
  if (!h.invoice_id) continue;
  const k = `${h.invoice_id}:${h.ingredient_id ?? "?"}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k)!.push(h.id);
}
const duplicates = [...groups.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([key, ids]) => ({ key, ids, count: ids.length }));

// --- Suggested-match history rows ---

const { data: allMatches } = await sb
  .from("invoice_item_matches")
  .select("ingredient_id,status, invoice_items(invoice_id)");

const matchByInvIng = new Map<string, string>();
for (const m of allMatches ?? []) {
  const invId = m.invoice_items?.invoice_id;
  if (invId && m.ingredient_id) matchByInvIng.set(`${invId}:${m.ingredient_id}`, m.status);
}

const { data: fullHistory } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_id,ingredient_name,invoice_id,new_price,created_at");

const suggestedHistory = (fullHistory ?? []).filter((h) => {
  if (!h.invoice_id || !h.ingredient_id) return false;
  return matchByInvIng.get(`${h.invoice_id}:${h.ingredient_id}`) === "suggested";
});

// --- Scope reconciliation ---

const foundCreatedAtIds = new Set(createdAtCorrupted.map((r) => r.id));
const expectedCreatedAtPresent = CREATED_AT_REPAIR_IDS.every((id) => foundCreatedAtIds.has(id));
const mozDeletePresent = MOZZARELLA_DELETE.every((id) =>
  (mozRows ?? []).some((r) => r.id === id),
);
const mozKeepPresent = (mozRows ?? []).some((r) => r.id === MOZZARELLA_KEEP);
const atumAprilPresent = multiUn.some(
  (r) => (r as { history_id?: string }).history_id === ATUM_APRIL_HISTORY,
);

console.log(
  JSON.stringify(
    {
      queried_at: new Date().toISOString(),
      project: new URL(url).hostname.split(".")[0],
      fix_1_created_at: {
        invoice_id: INVOICE_CREATED_AT,
        expected_repair_ids: CREATED_AT_REPAIR_IDS,
        found_corrupted: createdAtCorrupted,
        total_on_invoice: invHist?.length ?? 0,
        global_corrupted_count: globalCorrupted.length,
        all_expected_present: expectedCreatedAtPresent,
      },
      fix_2_mozzarella: {
        ingredient_id: MOZZARELLA_ID,
        keep_id: MOZZARELLA_KEEP,
        delete_ids: MOZZARELLA_DELETE,
        rows: mozRows,
        matches: mozMatches,
        keep_present: mozKeepPresent,
        delete_present: mozDeletePresent,
        row_count: mozRows?.length ?? 0,
      },
      fix_3_multi_un: {
        atum_april_history_id: ATUM_APRIL_HISTORY,
        atum_april_in_audit: atumAprilPresent,
        confirmed_multi_un_count: multiUn.length,
        lines: multiUn,
      },
      other: {
        duplicate_groups_count: duplicates.length,
        duplicate_groups: duplicates,
        suggested_match_history_count: suggestedHistory.length,
        suggested_match_history: suggestedHistory,
      },
    },
    null,
    2,
  ),
);
