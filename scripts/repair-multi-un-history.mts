/**
 * Phase 4C: repair multi-`un` double-divide history rows (6 rows / 3 ingredients).
 *
 *   npx vite-node scripts/repair-multi-un-history.mts [--execute]
 *
 * Default: dry-run (backup + scope check, no updates).
 * Requires `.env.local` with VL Supabase credentials.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist";
import {
  computePriceHistoryDelta,
  fetchLatestHistoryNewPrice,
  operationalUnitPriceForPriceHistory,
  revertIngredientCurrentPriceFromHistory,
} from "../src/lib/ingredient-price-history";
import { reconcileIngredientPriceHistoryChain } from "../src/lib/ingredient-price-history-reconcile";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const VL_PROJECT_REF = "bjhnlrgodcqoyzddbpbd";

const REPAIR_IDS = [
  "61c51696-acd8-4a58-878f-a588c1878af0",
  "781ab1ac-39d2-4462-9106-635e5603c466",
  "952119dc-8645-4a5f-a3ff-191ae1a57ea8",
  "908de185-e61a-4f41-af4c-3b70f69bd08f",
  "e967f673-1dc5-4390-90e6-464b66ec2a4b",
  "e143080d-511b-4c37-9018-11949343aedc",
] as const;

const INGREDIENT_IDS = [
  "0f30ccb3-bb47-40bb-83cc-ae2a4018066d",
  "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
  "32dbf47d-347c-45f3-bd9f-c6e90640e767",
] as const;

/** Catalog refresh only where purchase_quantity was wrongly inflated (halved operational). */
const CATALOG_REFRESH_IDS = [
  "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
  "32dbf47d-347c-45f3-bd9f-c6e90640e767",
] as const;

const executeMode = process.argv.includes("--execute");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url || !key) {
  console.error(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }));
  process.exit(1);
}

if (!url.includes(VL_PROJECT_REF)) {
  console.error(
    JSON.stringify({
      error: `URL must target VL project ${VL_PROJECT_REF}`,
      url,
    }),
  );
  process.exit(1);
}

const sb = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: historyRows, error: histErr } = await sb
  .from("ingredient_price_history")
  .select(
    "id,ingredient_id,ingredient_name,invoice_id,new_price,previous_price,delta,delta_percent,created_at",
  )
  .in("id", [...REPAIR_IDS]);

if (histErr) {
  console.error(JSON.stringify({ error: histErr.message }));
  process.exit(1);
}

const repairRows = historyRows ?? [];
const unexpected = repairRows.filter(
  (r) => !REPAIR_IDS.includes(r.id as (typeof REPAIR_IDS)[number]),
);
const missing = REPAIR_IDS.filter((id) => !repairRows.some((r) => r.id === id));

const invoiceIds = [...new Set(repairRows.map((r) => r.invoice_id).filter(Boolean))] as string[];

const { data: invoiceItems } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total")
  .in("invoice_id", invoiceIds.length ? invoiceIds : ["00000000-0000-0000-0000-000000000000"]);

const { data: matches } = await sb
  .from("invoice_item_matches")
  .select("invoice_item_id,ingredient_id,status")
  .in("ingredient_id", [...INGREDIENT_IDS])
  .eq("status", "confirmed");

const matchByIngInvoice = new Map<string, string>();
for (const m of matches ?? []) {
  const item = (invoiceItems ?? []).find((i) => i.id === m.invoice_item_id);
  if (!item?.invoice_id || !m.ingredient_id) continue;
  matchByIngInvoice.set(`${m.ingredient_id}:${item.invoice_id}`, item.id);
}

type RepairPlan = {
  history_id: string;
  ingredient_id: string;
  invoice_id: string;
  item_id: string | null;
  old_new_price: number;
  expected_new_price: number;
  old_previous_price: number | null;
  purchase_qty: number | null;
  pack_price: number | null;
};

const plans: RepairPlan[] = [];

for (const row of repairRows) {
  const itemId = matchByIngInvoice.get(`${row.ingredient_id}:${row.invoice_id}`);
  const item = (invoiceItems ?? []).find((i) => i.id === itemId);
  if (!item) {
    console.error(JSON.stringify({ error: "Missing invoice item for history row", row_id: row.id }));
    process.exit(1);
  }

  const norm = normalizeInvoiceItemFields(item);
  const fields = operationalCostFieldsFromInvoiceLine(norm);
  if (!fields) {
    console.error(JSON.stringify({ error: "Could not derive operational fields", row_id: row.id }));
    process.exit(1);
  }

  const expectedNew =
    operationalUnitPriceForPriceHistory(fields.current_price, fields.purchase_quantity) ??
    fields.current_price;

  plans.push({
    history_id: row.id,
    ingredient_id: row.ingredient_id,
    invoice_id: row.invoice_id!,
    item_id: item.id,
    old_new_price: Number(row.new_price),
    expected_new_price: expectedNew,
    old_previous_price: row.previous_price == null ? null : Number(row.previous_price),
    purchase_qty: fields.purchase_quantity ?? null,
    pack_price: fields.current_price ?? null,
  });
}

const wrongNewPricePlans = plans.filter(
  (p) => Math.abs(p.old_new_price - p.expected_new_price) > 1e-6,
);

const scopeOk =
  repairRows.length === REPAIR_IDS.length &&
  missing.length === 0 &&
  unexpected.length === 0 &&
  plans.every((p) => INGREDIENT_IDS.includes(p.ingredient_id as (typeof INGREDIENT_IDS)[number])) &&
  wrongNewPricePlans.length >= 5;

const { data: ingredientsBefore } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity")
  .in("id", [...INGREDIENT_IDS]);

const catalogBefore = Object.fromEntries(
  (ingredientsBefore ?? []).map((i) => [
    i.id,
    {
      name: i.name,
      current_price: i.current_price,
      purchase_quantity: i.purchase_quantity,
      catalog_operational: operationalUnitPriceForPriceHistory(
        i.current_price,
        i.purchase_quantity,
      ),
    },
  ]),
);

const latestHistoryBefore: Record<string, number | null> = {};
for (const ingId of INGREDIENT_IDS) {
  latestHistoryBefore[ingId] = await fetchLatestHistoryNewPrice(sb, ingId);
}

const backupDir = join(process.cwd(), "scripts", "backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = join(backupDir, `multi-un-phase4c-pre-update-${timestamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      timestamp,
      repair_ids: REPAIR_IDS,
      ingredient_ids: INGREDIENT_IDS,
      rows: repairRows,
      plans,
      catalog_before: catalogBefore,
      latest_history_before: latestHistoryBefore,
    },
    null,
    2,
  ),
);

const preReport = {
  phase: "phase4c_multi_un_pre",
  execute_mode: executeMode,
  project: VL_PROJECT_REF,
  scope_ok: scopeOk,
  plans: plans.map((p) => ({
    history_id: p.history_id,
    ingredient_id: p.ingredient_id,
    old_new_price: p.old_new_price,
    expected_new_price: p.expected_new_price,
    purchase_qty: p.purchase_qty,
    pack_price: p.pack_price,
  })),
  catalog_before: catalogBefore,
  latest_history_before: latestHistoryBefore,
  backup: {
    path: backupPath,
    row_count: repairRows.length,
    id_hash: createHash("sha256")
      .update(REPAIR_IDS.slice().sort().join(","))
      .digest("hex")
      .slice(0, 16),
  },
};

console.log(JSON.stringify(preReport, null, 2));

if (!scopeOk) {
  console.error(JSON.stringify({ error: "Scope mismatch — aborting", preReport }));
  process.exit(1);
}

if (!executeMode) {
  console.log(
    JSON.stringify({
      message: "Dry run complete. Pass --execute to repair 6 history rows + reconcile chains.",
    }),
  );
  process.exit(0);
}

const updateResults: Array<{ id: string; ok: boolean; skipped?: boolean; error?: string }> = [];
for (const plan of plans) {
  if (Math.abs(plan.old_new_price - plan.expected_new_price) <= 1e-6) {
    updateResults.push({ id: plan.history_id, ok: true, skipped: true });
    continue;
  }
  const { error, count } = await sb
    .from("ingredient_price_history")
    .update({ new_price: plan.expected_new_price }, { count: "exact" })
    .eq("id", plan.history_id)
    .eq("ingredient_id", plan.ingredient_id);
  updateResults.push({
    id: plan.history_id,
    ok: !error && (count ?? 0) === 1,
    error: error?.message ?? ((count ?? 0) !== 1 ? `expected 1 update, got ${count}` : undefined),
  });
}

const updateFailed = updateResults.filter((r) => !r.ok);
if (updateFailed.length > 0) {
  console.error(JSON.stringify({ phase: "update_failed", updateFailed }));
  process.exit(1);
}

const reconcileResults: Record<string, Awaited<ReturnType<typeof reconcileIngredientPriceHistoryChain>>> =
  {};
for (const ingId of INGREDIENT_IDS) {
  reconcileResults[ingId] = await reconcileIngredientPriceHistoryChain(sb, ingId);
}

const catalogUpdates: Array<{ id: string; ok: boolean; error?: string }> = [];
for (const ingId of CATALOG_REFRESH_IDS) {
  const mayPlan = plans.find(
    (p) => p.ingredient_id === ingId && p.history_id === "908de185-e61a-4f41-af4c-3b70f69bd08f",
  ) ??
    plans.find(
      (p) => p.ingredient_id === ingId && p.history_id === "e143080d-511b-4c37-9018-11949343aedc",
    );
  if (!mayPlan?.pack_price || mayPlan.purchase_qty == null) {
    catalogUpdates.push({ id: ingId, ok: false, error: "missing May plan fields" });
    continue;
  }
  const { error, count } = await sb
    .from("ingredients")
    .update(
      {
        current_price: mayPlan.pack_price,
        purchase_quantity: mayPlan.purchase_qty,
      },
      { count: "exact" },
    )
    .eq("id", ingId);
  catalogUpdates.push({
    id: ingId,
    ok: !error && (count ?? 0) === 1,
    error: error?.message ?? ((count ?? 0) !== 1 ? `expected 1 update, got ${count}` : undefined),
  });
}

const catalogFailed = catalogUpdates.filter((r) => !r.ok);
if (catalogFailed.length > 0) {
  console.error(JSON.stringify({ phase: "catalog_update_failed", catalogFailed }));
  process.exit(1);
}

const revertResults: Record<string, Awaited<ReturnType<typeof revertIngredientCurrentPriceFromHistory>>> =
  {};
for (const ingId of INGREDIENT_IDS) {
  const afterOp = await fetchLatestHistoryNewPrice(sb, ingId);
  const { data: ing } = await sb
    .from("ingredients")
    .select("current_price,purchase_quantity")
    .eq("id", ingId)
    .single();
  const catalogOp = operationalUnitPriceForPriceHistory(
    ing?.current_price ?? null,
    ing?.purchase_quantity ?? null,
  );
  if (
    afterOp != null &&
    catalogOp != null &&
    Math.abs(afterOp - catalogOp) > 1e-6 &&
    ingId === "0f30ccb3-bb47-40bb-83cc-ae2a4018066d"
  ) {
    revertResults[ingId] = await revertIngredientCurrentPriceFromHistory(sb, ingId);
  }
}

const { data: afterRows } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_id,new_price,previous_price,delta,delta_percent,created_at")
  .in("id", [...REPAIR_IDS])
  .order("created_at");

const { data: ingredientsAfter } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity")
  .in("id", [...INGREDIENT_IDS]);

const catalogAfter = Object.fromEntries(
  (ingredientsAfter ?? []).map((i) => [
    i.id,
    {
      name: i.name,
      current_price: i.current_price,
      purchase_quantity: i.purchase_quantity,
      catalog_operational: operationalUnitPriceForPriceHistory(
        i.current_price,
        i.purchase_quantity,
      ),
    },
  ]),
);

const latestHistoryAfter: Record<string, number | null> = {};
for (const ingId of INGREDIENT_IDS) {
  latestHistoryAfter[ingId] = await fetchLatestHistoryNewPrice(sb, ingId);
}

console.log(
  JSON.stringify(
    {
      phase: "phase4c_multi_un_post",
      update_results: updateResults,
      reconcile: reconcileResults,
      catalog_updates: catalogUpdates,
      revert: revertResults,
      after: {
        history_rows: afterRows,
        catalog_after: catalogAfter,
        latest_history_after: latestHistoryAfter,
        atum_may_delta_percent: afterRows?.find((r) => r.id === "781ab1ac-39d2-4462-9106-635e5603c466")
          ?.delta_percent,
      },
    },
    null,
    2,
  ),
);
