/**
 * Phase 4A: delete Mozzarella DUPLICATE + POISON history rows only.
 *
 *   npx vite-node scripts/repair-mozzarella-history.mts [--execute]
 *
 * Default: dry-run (backup + scope check, no deletes).
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
  revertIngredientCurrentPriceFromHistory,
} from "../src/lib/ingredient-price-history";
import { reconcileIngredientPriceHistoryChain } from "../src/lib/ingredient-price-history-reconcile";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const VL_PROJECT_REF = "bjhnlrgodcqoyzddbpbd";
const MOZZARELLA_ID = "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d";
const MOZZARELLA_KEEP = "3c508a43-68bd-4b69-9205-61ddbbfb26a7";
const MOZZARELLA_DELETE = [
  "9ee1b793-974d-4a6b-b656-c7b5e8febfaa",
  "18bdb0c5-0370-4bc7-878d-85957b8ba946",
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

const { data: ingredient, error: ingErr } = await sb
  .from("ingredients")
  .select("id,name,current_price,purchase_quantity,unit")
  .eq("id", MOZZARELLA_ID)
  .single();

if (ingErr || !ingredient) {
  console.error(JSON.stringify({ error: ingErr?.message ?? "Ingredient not found" }));
  process.exit(1);
}

const { data: rows, error: rowsErr } = await sb
  .from("ingredient_price_history")
  .select("*")
  .eq("ingredient_id", MOZZARELLA_ID)
  .order("created_at");

if (rowsErr) {
  console.error(JSON.stringify({ error: rowsErr.message }));
  process.exit(1);
}

const allRows = rows ?? [];
const keepRow = allRows.find((r) => r.id === MOZZARELLA_KEEP);
const deleteRows = allRows.filter((r) => MOZZARELLA_DELETE.includes(r.id as (typeof MOZZARELLA_DELETE)[number]));
const unexpected = allRows.filter(
  (r) => r.id !== MOZZARELLA_KEEP && !MOZZARELLA_DELETE.includes(r.id as (typeof MOZZARELLA_DELETE)[number]),
);

const scopeOk =
  keepRow != null &&
  deleteRows.length === MOZZARELLA_DELETE.length &&
  allRows.length === 3 &&
  unexpected.length === 0;

const catalogOp = operationalUnitPriceForPriceHistory(
  ingredient.current_price,
  ingredient.purchase_quantity,
);
const latestHistoryOp = await fetchLatestHistoryNewPrice(sb, MOZZARELLA_ID);

const backupDir = join(process.cwd(), "scripts", "backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = join(backupDir, `mozzarella-phase4a-pre-delete-${timestamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      timestamp,
      ingredient_id: MOZZARELLA_ID,
      delete_ids: MOZZARELLA_DELETE,
      keep_id: MOZZARELLA_KEEP,
      rows: deleteRows,
    },
    null,
    2,
  ),
);

const preReport = {
  phase: "phase4a_mozzarella_pre",
  execute_mode: executeMode,
  project: VL_PROJECT_REF,
  scope_ok: scopeOk,
  ingredient: {
    id: ingredient.id,
    name: ingredient.name,
    current_price: ingredient.current_price,
    purchase_quantity: ingredient.purchase_quantity,
    catalog_operational: catalogOp,
  },
  history: {
    row_count: allRows.length,
    keep_present: keepRow != null,
    delete_present: deleteRows.length === MOZZARELLA_DELETE.length,
    unexpected_ids: unexpected.map((r) => r.id),
    latest_history_operational: latestHistoryOp,
    rows: allRows.map((r) => ({
      id: r.id,
      invoice_id: r.invoice_id,
      new_price: r.new_price,
      previous_price: r.previous_price,
      created_at: r.created_at,
      action:
        r.id === MOZZARELLA_KEEP
          ? "KEEP"
          : MOZZARELLA_DELETE.includes(r.id as (typeof MOZZARELLA_DELETE)[number])
            ? "DELETE"
            : "UNEXPECTED",
    })),
  },
  backup: {
    path: backupPath,
    delete_row_count: deleteRows.length,
    id_hash: createHash("sha256")
      .update(deleteRows.map((r) => r.id).sort().join(","))
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
      message: "Dry run complete. Pass --execute to delete DUPLICATE + POISON rows.",
    }),
  );
  process.exit(0);
}

const deleteResults: Array<{ id: string; ok: boolean; error?: string }> = [];
for (const id of MOZZARELLA_DELETE) {
  const { error, count } = await sb
    .from("ingredient_price_history")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("ingredient_id", MOZZARELLA_ID);
  deleteResults.push({
    id,
    ok: !error && (count ?? 0) === 1,
    error: error?.message ?? ((count ?? 0) !== 1 ? `expected 1 delete, got ${count}` : undefined),
  });
}

const deleteFailed = deleteResults.filter((r) => !r.ok);
if (deleteFailed.length > 0) {
  console.error(JSON.stringify({ phase: "delete_failed", deleteFailed }));
  process.exit(1);
}

const reconcileResult = await reconcileIngredientPriceHistoryChain(sb, MOZZARELLA_ID);

const { data: afterRows } = await sb
  .from("ingredient_price_history")
  .select("id,invoice_id,new_price,previous_price,delta,delta_percent,created_at")
  .eq("ingredient_id", MOZZARELLA_ID)
  .order("created_at");

const { data: afterIngredient } = await sb
  .from("ingredients")
  .select("current_price,purchase_quantity")
  .eq("id", MOZZARELLA_ID)
  .single();

const afterCatalogOp = operationalUnitPriceForPriceHistory(
  afterIngredient?.current_price ?? null,
  afterIngredient?.purchase_quantity ?? null,
);
const afterLatestHistoryOp = await fetchLatestHistoryNewPrice(sb, MOZZARELLA_ID);

let revertResult: Awaited<ReturnType<typeof revertIngredientCurrentPriceFromHistory>> | null = null;
if (
  afterCatalogOp != null &&
  afterLatestHistoryOp != null &&
  Math.abs(afterCatalogOp - afterLatestHistoryOp) > 1e-6
) {
  revertResult = await revertIngredientCurrentPriceFromHistory(sb, MOZZARELLA_ID);
}

console.log(
  JSON.stringify(
    {
      phase: "phase4a_mozzarella_post",
      delete_results: deleteResults,
      reconcile: reconcileResult,
      revert: revertResult,
      after: {
        history_row_count: afterRows?.length ?? 0,
        history_rows: afterRows,
        catalog_operational: afterCatalogOp,
        latest_history_operational: afterLatestHistoryOp,
        current_price_matches_history:
          afterCatalogOp != null &&
          afterLatestHistoryOp != null &&
          Math.abs(afterCatalogOp - afterLatestHistoryOp) < 1e-6,
      },
    },
    null,
    2,
  ),
);
