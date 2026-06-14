/**
 * Phase 4B: repair created_at corruption on invoice 3b4cb21f (7 rows only).
 *
 *   npx vite-node scripts/repair-created-at-history.mts [--execute]
 *
 * Default: dry-run (backup + scope check, no updates).
 * Requires `.env.local` with VL Supabase credentials.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  fetchLatestHistoryNewPrice,
  operationalUnitPriceForPriceHistory,
} from "../src/lib/ingredient-price-history";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const VL_PROJECT_REF = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const TARGET_CREATED_AT = "2026-05-19T12:00:00.000Z";
const WRONG_CREATED_AT_PREFIX = "2023-05-19";
const PEPINO_KEEP_ID = "5bd9a4e1-713f-4474-9985-f46bdb1b36b0";

const REPAIR_IDS = [
  "edc6c627-d934-40de-8eb8-cc0a25d36755",
  "14330aad-cce1-4569-aa2f-4976dd1ac336",
  "908de185-e61a-4f41-af4c-3b70f69bd08f",
  "1d9d5133-724b-461c-b141-605392f2b64d",
  "781ab1ac-39d2-4462-9106-635e5603c466",
  "e143080d-511b-4c37-9018-11949343aedc",
  "bf250ee4-388a-480f-96d7-e8c0e8e8dfb2",
] as const;

const INGREDIENT_IDS = [
  "07a55cf5-b98d-4aae-b330-b4944882e4d3",
  "3d1af48c-be3c-494a-9e0f-be267fc9388b",
  "c811f67f-df4d-4194-ba8b-7a15d4af38bd",
  "c46db69a-e4ae-4be8-abb8-d7708de12f3d",
  "0f30ccb3-bb47-40bb-83cc-ae2a4018066d",
  "32dbf47d-347c-45f3-bd9f-c6e90640e767",
  "43cba6b0-880e-4760-ab78-8d9a9c1b6f86",
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

const { data: invoiceHist, error: invErr } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_id,ingredient_name,created_at,new_price,previous_price,delta,delta_percent, invoices(invoice_date)")
  .eq("invoice_id", INVOICE_ID);

if (invErr) {
  console.error(JSON.stringify({ error: invErr.message }));
  process.exit(1);
}

const allInvoiceRows = invoiceHist ?? [];
const repairRows = allInvoiceRows.filter((r) =>
  REPAIR_IDS.includes(r.id as (typeof REPAIR_IDS)[number]),
);
const pepinoRow = allInvoiceRows.find((r) => r.id === PEPINO_KEEP_ID);

const corruptedOnInvoice = allInvoiceRows.filter((r) => {
  const invYear = r.invoices?.invoice_date?.slice(0, 4);
  const createdYear = r.created_at?.slice(0, 4);
  return invYear && createdYear && invYear !== createdYear;
});

const { data: globalHist } = await sb
  .from("ingredient_price_history")
  .select("id,invoice_id,created_at, invoices(invoice_date)")
  .not("invoice_id", "is", null);

const globalCorrupted = (globalHist ?? []).filter((r) => {
  const invYear = r.invoices?.invoice_date?.slice(0, 4);
  const createdYear = r.created_at?.slice(0, 4);
  return invYear && createdYear && invYear !== createdYear;
});

const scopeOk =
  repairRows.length === REPAIR_IDS.length &&
  corruptedOnInvoice.length === 7 &&
  globalCorrupted.length === 7 &&
  allInvoiceRows.length === 8 &&
  pepinoRow?.created_at?.startsWith("2026-05-19") === true &&
  repairRows.every((r) => r.created_at?.startsWith(WRONG_CREATED_AT_PREFIX)) &&
  REPAIR_IDS.every((id) => repairRows.some((r) => r.id === id));

const { data: ingredientsBefore } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity")
  .in("id", [...INGREDIENT_IDS]);

const catalogBefore = new Map(
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
const backupPath = join(backupDir, `created-at-phase4b-pre-update-${timestamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      timestamp,
      invoice_id: INVOICE_ID,
      repair_ids: REPAIR_IDS,
      target_created_at: TARGET_CREATED_AT,
      rows: repairRows,
      pepino_untouched: pepinoRow,
      catalog_before: Object.fromEntries(catalogBefore),
      latest_history_before: latestHistoryBefore,
    },
    null,
    2,
  ),
);

const preReport = {
  phase: "phase4b_created_at_pre",
  execute_mode: executeMode,
  project: VL_PROJECT_REF,
  scope_ok: scopeOk,
  invoice: {
    id: INVOICE_ID,
    total_rows: allInvoiceRows.length,
    corrupted_count: corruptedOnInvoice.length,
    global_corrupted_count: globalCorrupted.length,
    pepino_created_at: pepinoRow?.created_at ?? null,
  },
  repair_rows: repairRows.map((r) => ({
    id: r.id,
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredient_name,
    created_at: r.created_at,
    new_price: r.new_price,
    previous_price: r.previous_price,
    delta_percent: r.delta_percent,
    action: "UPDATE_CREATED_AT",
  })),
  catalog_before: Object.fromEntries(catalogBefore),
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
      message: "Dry run complete. Pass --execute to update created_at on 7 rows.",
    }),
  );
  process.exit(0);
}

const updateResults: Array<{ id: string; ok: boolean; error?: string }> = [];
for (const id of REPAIR_IDS) {
  const { error, count } = await sb
    .from("ingredient_price_history")
    .update({ created_at: TARGET_CREATED_AT }, { count: "exact" })
    .eq("id", id)
    .eq("invoice_id", INVOICE_ID);
  updateResults.push({
    id,
    ok: !error && (count ?? 0) === 1,
    error: error?.message ?? ((count ?? 0) !== 1 ? `expected 1 update, got ${count}` : undefined),
  });
}

const updateFailed = updateResults.filter((r) => !r.ok);
if (updateFailed.length > 0) {
  console.error(JSON.stringify({ phase: "update_failed", updateFailed }));
  process.exit(1);
}

const { data: afterRows } = await sb
  .from("ingredient_price_history")
  .select("id,ingredient_id,ingredient_name,created_at,new_price,previous_price,delta,delta_percent, invoices(invoice_date)")
  .eq("invoice_id", INVOICE_ID)
  .order("created_at");

const { data: ingredientsAfter } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity")
  .in("id", [...INGREDIENT_IDS]);

const catalogAfter = new Map(
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

const remaining2023 = (afterRows ?? []).filter((r) => r.created_at?.startsWith("2023"));
const globalAfterCorrupted = (afterRows ?? []).filter((r) => {
  const invYear = r.invoices?.invoice_date?.slice(0, 4);
  const createdYear = r.created_at?.slice(0, 4);
  return invYear && createdYear && invYear !== createdYear;
});

console.log(
  JSON.stringify(
    {
      phase: "phase4b_created_at_post",
      update_results: updateResults,
      after: {
        invoice_rows: afterRows,
        remaining_2023_on_invoice: remaining2023,
        year_mismatch_on_invoice: globalAfterCorrupted,
        catalog_after: Object.fromEntries(catalogAfter),
        latest_history_after: latestHistoryAfter,
        catalog_unchanged: [...INGREDIENT_IDS].every((id) => {
          const b = catalogBefore.get(id);
          const a = catalogAfter.get(id);
          return b?.current_price === a?.current_price;
        }),
        atum_latest_history:
          latestHistoryAfter["0f30ccb3-bb47-40bb-83cc-ae2a4018066d"],
      },
    },
    null,
    2,
  ),
);
