/**
 * Phase 4D: delete Nata orphan suggested-match history row only.
 *
 *   npx vite-node scripts/repair-nata-history.mts [--execute]
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
} from "../src/lib/ingredient-price-history";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const VL_PROJECT_REF = "bjhnlrgodcqoyzddbpbd";
const NATA_ID = "3d1af48c-be3c-494a-9e0f-be267fc9388b";
const NATA_KEEP = "2767b722-0985-45a8-9c80-9e9dae611142";
const NATA_DELETE = "14330aad-cce1-4569-aa2f-4976dd1ac336";

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
  .eq("id", NATA_ID)
  .single();

if (ingErr || !ingredient) {
  console.error(JSON.stringify({ error: ingErr?.message ?? "Ingredient not found" }));
  process.exit(1);
}

const { data: rows, error: rowsErr } = await sb
  .from("ingredient_price_history")
  .select("*")
  .eq("ingredient_id", NATA_ID)
  .order("created_at");

if (rowsErr) {
  console.error(JSON.stringify({ error: rowsErr.message }));
  process.exit(1);
}

const allRows = rows ?? [];
const keepRow = allRows.find((r) => r.id === NATA_KEEP);
const deleteRow = allRows.find((r) => r.id === NATA_DELETE);
const unexpected = allRows.filter((r) => r.id !== NATA_KEEP && r.id !== NATA_DELETE);

const scopeOk =
  keepRow != null &&
  deleteRow != null &&
  allRows.length === 2 &&
  unexpected.length === 0;

const catalogOp = operationalUnitPriceForPriceHistory(
  ingredient.current_price,
  ingredient.purchase_quantity,
);
const latestHistoryOp = await fetchLatestHistoryNewPrice(sb, NATA_ID);

const backupDir = join(process.cwd(), "scripts", "backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = join(backupDir, `nata-phase4d-pre-delete-${timestamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      timestamp,
      ingredient_id: NATA_ID,
      delete_id: NATA_DELETE,
      keep_id: NATA_KEEP,
      row: deleteRow ?? null,
    },
    null,
    2,
  ),
);

const preReport = {
  phase: "phase4d_nata_pre",
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
    delete_present: deleteRow != null,
    unexpected_ids: unexpected.map((r) => r.id),
    latest_history_operational: latestHistoryOp,
    current_price_from_latest_history:
      catalogOp != null &&
      latestHistoryOp != null &&
      Math.abs(catalogOp - latestHistoryOp) < 1e-6,
    rows: allRows.map((r) => ({
      id: r.id,
      invoice_id: r.invoice_id,
      new_price: r.new_price,
      previous_price: r.previous_price,
      created_at: r.created_at,
      action: r.id === NATA_KEEP ? "KEEP" : r.id === NATA_DELETE ? "DELETE" : "UNEXPECTED",
    })),
  },
  backup: {
    path: backupPath,
    id_hash: createHash("sha256").update(NATA_DELETE).digest("hex").slice(0, 16),
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
      message: "Dry run complete. Pass --execute to delete orphan suggested-match row.",
    }),
  );
  process.exit(0);
}

const { error, count } = await sb
  .from("ingredient_price_history")
  .delete({ count: "exact" })
  .eq("id", NATA_DELETE)
  .eq("ingredient_id", NATA_ID);

const deleteOk = !error && (count ?? 0) === 1;
if (!deleteOk) {
  console.error(
    JSON.stringify({
      phase: "delete_failed",
      id: NATA_DELETE,
      error: error?.message ?? `expected 1 delete, got ${count}`,
    }),
  );
  process.exit(1);
}

const { data: afterRows } = await sb
  .from("ingredient_price_history")
  .select("id,invoice_id,new_price,previous_price,delta,delta_percent,created_at")
  .eq("ingredient_id", NATA_ID)
  .order("created_at");

const { data: afterIngredient } = await sb
  .from("ingredients")
  .select("current_price,purchase_quantity")
  .eq("id", NATA_ID)
  .single();

const afterCatalogOp = operationalUnitPriceForPriceHistory(
  afterIngredient?.current_price ?? null,
  afterIngredient?.purchase_quantity ?? null,
);
const afterLatestHistoryOp = await fetchLatestHistoryNewPrice(sb, NATA_ID);

console.log(
  JSON.stringify(
    {
      phase: "phase4d_nata_post",
      delete_result: { id: NATA_DELETE, ok: deleteOk },
      after: {
        history_row_count: afterRows?.length ?? 0,
        history_rows: afterRows,
        catalog_operational: afterCatalogOp,
        latest_history_operational: afterLatestHistoryOp,
        current_price_from_latest_history:
          afterCatalogOp != null &&
          afterLatestHistoryOp != null &&
          Math.abs(afterCatalogOp - afterLatestHistoryOp) < 1e-6,
      },
    },
    null,
    2,
  ),
);
