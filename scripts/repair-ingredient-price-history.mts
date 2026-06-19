/**
 * Deterministic VL price-history repair — replay from linked invoice_items.
 *
 *   npx vite-node scripts/repair-ingredient-price-history.mts          # dry-run
 *   npx vite-node scripts/repair-ingredient-price-history.mts --apply  # write + rechain
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import {
  INGREDIENT_PRICE_EQ_EPS,
  operationalUnitPriceForPriceHistory,
} from "../src/lib/ingredient-price-history";
import { reconcileIngredientPriceHistoryChain } from "../src/lib/ingredient-price-history-reconcile";
import {
  assessPriceHistoryRowRepair,
  buildPriceHistoryRepairPatch,
  buildPriceHistoryRepairPlan,
  isPriceHistoryRepairExcludedIngredient,
  type PriceHistoryRepairPlan,
} from "../src/lib/ingredient-price-history-repair";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const DELETED_EMPORIO_VL = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";
const VL_INVOICE_IDS = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
];

const IMPACT_INGREDIENT_IDS = [
  "0f30ccb3-bb47-40bb-83cc-ae2a4018066d", // Atum
  "32dbf47d-347c-45f3-bd9f-c6e90640e767", // Gema
  "c811f67f-df4d-4194-ba8b-7a15d4af38bd", // Anchoas
  "70f5a744-839c-4def-8252-52aaf7529b4b", // Peroni
  "50783e60-702f-42b2-bccd-0b6a98d7635f", // Pellegrino
  "d96e176e-7fa7-438d-beda-6b9d7fe7b41d", // Stracciatella
  "705dbbff-cd36-4dd6-9e68-bd68d350b9a6", // Guanciale
  "5e9e7f89-7141-44f7-b8d4-bc92bad9bc36", // Mozzarella Julienne
  "b924480a-91f3-4aa2-9852-a900795a6f92", // Prosciutto
  "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d", // Mozzarella Fior di Latte (report only)
] as const;

const applyMode = process.argv.includes("--apply");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(process.cwd(), ".tmp", "ingredient-price-history-repair");
mkdirSync(outDir, { recursive: true });

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const sb = createClient<Database>(
  `https://${VL_REF}.supabase.co`,
  projectKey("service_role"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type ItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

type HistoryRow = {
  id: string;
  ingredient_id: string;
  invoice_id: string | null;
  ingredient_name: string | null;
  previous_price: number | null;
  new_price: number;
  delta: number | null;
  delta_percent: number | null;
  created_at: string;
};

const invoiceIds = [...VL_INVOICE_IDS, DELETED_EMPORIO_VL];

const [{ data: historyRows }, { data: items }, { data: matches }, { data: ingredients }] =
  await Promise.all([
    sb
      .from("ingredient_price_history")
      .select(
        "id,ingredient_id,invoice_id,ingredient_name,previous_price,new_price,delta,delta_percent,created_at",
      )
      .in("invoice_id", invoiceIds)
      .not("invoice_id", "is", null)
      .order("created_at", { ascending: true }),
    sb
      .from("invoice_items")
      .select("id,invoice_id,name,quantity,unit,unit_price,total")
      .in("invoice_id", VL_INVOICE_IDS),
    sb
      .from("invoice_item_matches")
      .select("invoice_item_id,ingredient_id,status")
      .eq("status", "confirmed"),
    sb
      .from("ingredients")
      .select("id,name,current_price,purchase_quantity")
      .in("id", [...IMPACT_INGREDIENT_IDS]),
  ]);

const itemById = new Map((items ?? []).map((item) => [item.id, item as ItemRow]));
const linkedItemByIngInvoice = new Map<string, ItemRow>();
for (const match of matches ?? []) {
  const item = itemById.get(match.invoice_item_id);
  if (!item?.invoice_id || !match.ingredient_id) continue;
  linkedItemByIngInvoice.set(`${match.ingredient_id}:${item.invoice_id}`, item);
}

function validationMismatches(rows: HistoryRow[]) {
  let mismatches = 0;
  const details: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!row.invoice_id || isPriceHistoryRepairExcludedIngredient(row.ingredient_id)) continue;
    const item = linkedItemByIngInvoice.get(`${row.ingredient_id}:${row.invoice_id}`);
    if (!item) continue;
    const norm = normalizeInvoiceItemFields(item);
    const assessment = assessPriceHistoryRowRepair(row, norm);
    if (assessment?.needsNewPriceRepair) {
      mismatches += 1;
      details.push({
        historyId: row.id,
        ingredient: row.ingredient_name,
        stored: assessment.storedNewPrice,
        expected: assessment.expectedNewPrice,
      });
    }
  }
  return { mismatches, details };
}

const beforeValidation = validationMismatches((historyRows ?? []) as HistoryRow[]);

const plans: PriceHistoryRepairPlan[] = [];
const skipped: Array<Record<string, unknown>> = [];

for (const row of (historyRows ?? []) as HistoryRow[]) {
  if (!row.invoice_id) continue;
  const item = linkedItemByIngInvoice.get(`${row.ingredient_id}:${row.invoice_id}`);
  const norm = item ? normalizeInvoiceItemFields(item) : null;
  const plan = buildPriceHistoryRepairPlan(row, norm);
  if (!plan) continue;
  if (plan.skipReason) {
    skipped.push({
      historyId: plan.historyId,
      ingredientId: plan.ingredientId,
      ingredient: plan.ingredientName,
      reason: plan.skipReason,
      storedNewPrice: plan.storedNewPrice,
    });
    continue;
  }
  if (plan.needsNewPriceRepair) plans.push(plan);
}

const repaired: Array<Record<string, unknown>> = [];
const repairErrors: string[] = [];

if (applyMode) {
  for (const plan of plans) {
    const patch = buildPriceHistoryRepairPatch(plan);
    if (!patch) continue;
    const { error } = await sb
      .from("ingredient_price_history")
      .update(patch)
      .eq("id", plan.historyId);
    if (error) {
      repairErrors.push(`${plan.historyId}: ${error.message}`);
      continue;
    }
    repaired.push({
      historyId: plan.historyId,
      ingredientId: plan.ingredientId,
      ingredient: plan.ingredientName,
      before: plan.storedNewPrice,
      after: patch.new_price,
      patch,
    });
  }
}

const affectedIngredientIds = [
  ...new Set(plans.map((plan) => plan.ingredientId)),
];

const chainResults: Record<string, Awaited<ReturnType<typeof reconcileIngredientPriceHistoryChain>>> =
  {};
if (applyMode) {
  for (const ingredientId of affectedIngredientIds) {
    chainResults[ingredientId] = await reconcileIngredientPriceHistoryChain(sb, ingredientId);
  }
} else {
  for (const ingredientId of affectedIngredientIds) {
    chainResults[ingredientId] = {
      orphansDeleted: 0,
      rowsUpdated: 0,
      linkedRowCount: 0,
      errors: ["dry-run"],
    };
  }
}

const { data: historyAfter } = applyMode
  ? await sb
      .from("ingredient_price_history")
      .select(
        "id,ingredient_id,invoice_id,ingredient_name,previous_price,new_price,delta,delta_percent,created_at",
      )
      .in("invoice_id", invoiceIds)
      .not("invoice_id", "is", null)
  : { data: historyRows };

const afterValidation = validationMismatches((historyAfter ?? []) as HistoryRow[]);

const atumChain = (historyAfter ?? [])
  .filter((row) => row.ingredient_id === "0f30ccb3-bb47-40bb-83cc-ae2a4018066d")
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

const impactReport = (ingredients ?? []).map((ing) => {
  const linked = (historyAfter ?? [])
    .filter((row) => row.ingredient_id === ing.id && row.invoice_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const latest = linked[0];
  const projectedOperational =
    latest?.new_price == null
      ? null
      : Number(latest.new_price);
  const catalogOperational = operationalUnitPriceForPriceHistory(
    ing.current_price,
    ing.purchase_quantity,
  );
  return {
    ingredientId: ing.id,
    name: ing.name,
    db_current_price: ing.current_price,
    db_purchase_quantity: ing.purchase_quantity,
    db_catalog_operational: catalogOperational,
    projected_from_repaired_latest_history: projectedOperational,
    delta_catalog_vs_projected:
      catalogOperational != null && projectedOperational != null
        ? projectedOperational - catalogOperational
        : null,
    excluded_from_repair: isPriceHistoryRepairExcludedIngredient(ing.id),
  };
});

const report = {
  mode: applyMode ? "apply" : "dry-run",
  generated_at: new Date().toISOString(),
  project_ref: VL_REF,
  repair_plans: plans.map((plan) => ({
    historyId: plan.historyId,
    ingredientId: plan.ingredientId,
    ingredient: plan.ingredientName,
    storedNewPrice: plan.storedNewPrice,
    expectedNewPrice: plan.expectedNewPrice,
    patch: plan.patch,
  })),
  validation: {
    before_mismatches: beforeValidation.mismatches,
    after_mismatches: afterValidation.mismatches,
    before_details: beforeValidation.details,
    after_details: afterValidation.details,
  },
  rows_repaired: repaired,
  repair_errors: repairErrors,
  chain_reconciliation: chainResults,
  atum_chain: atumChain.map((row) => ({
    id: row.id,
    previous_price: row.previous_price,
    new_price: row.new_price,
    delta_percent: row.delta_percent,
    created_at: row.created_at,
  })),
  current_price_impact: impactReport,
  skipped,
};

const reportPath = join(outDir, `${applyMode ? "apply" : "dry-run"}-${timestamp}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      mode: report.mode,
      report_path: reportPath,
      repair_plan_count: plans.length,
      rows_repaired: repaired.length,
      skipped_count: skipped.length,
      validation_before: beforeValidation.mismatches,
      validation_after: afterValidation.mismatches,
      atum_may_previous_price: atumChain[1]?.previous_price ?? null,
      atum_april_new_price: atumChain[0]?.new_price ?? null,
      chain_ingredients: affectedIngredientIds.length,
    },
    null,
    2,
  ),
);

if (repairErrors.length > 0) process.exit(1);
