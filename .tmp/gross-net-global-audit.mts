/**
 * GROSS vs NET price contract audit — READ-ONLY VL Supabase queries.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { recipeOperationalCostFieldsFromInvoiceLine } from "../src/lib/invoice-purchase-price-semantics.ts";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const THRESHOLD = 0.02;

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const p = join(ROOT, name);
    try {
      const raw = readFileSync(p, "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

const env = loadEnvLocal();
const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const round4 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10000) / 10000;

type ItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  invoices: { supplier_name: string | null } | null;
};

function analyzeRow(row: ItemRow) {
  const qty = row.quantity == null ? null : Number(row.quantity);
  const unitPrice = row.unit_price == null ? null : Number(row.unit_price);
  const total = row.total == null ? null : Number(row.total);

  if (qty == null || unitPrice == null || total == null) {
    return { flagged: false, reason: "missing_numeric" };
  }
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice) || !Number.isFinite(total)) {
    return { flagged: false, reason: "non_finite" };
  }
  if (qty <= 0) return { flagged: false, reason: "zero_qty" };

  const expectedTotal = qty * unitPrice;
  const diff = Math.abs(total - expectedTotal);
  const denom = Math.max(Math.abs(total), Math.abs(expectedTotal), 1e-9);
  const differencePct = diff / denom;
  const effectivePaid = total / qty;

  return {
    flagged: differencePct > THRESHOLD,
    qty,
    unitPrice,
    total,
    expectedTotal: round4(expectedTotal)!,
    differencePct: round4(differencePct)!,
    effectivePaid: round4(effectivePaid)!,
    impliedDiscountPct:
      unitPrice > 0 ? round4(((unitPrice - effectivePaid) / unitPrice) * 100) : null,
    supplier: row.invoices?.supplier_name?.trim() || "Unknown",
  };
}

async function fetchAllInvoiceItems(): Promise<ItemRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const all: ItemRow[] = [];

  while (true) {
    const { data, error } = await sb
      .from("invoice_items")
      .select(
        "id,invoice_id,name,quantity,unit,unit_price,total,invoices(supplier_name)",
      )
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as ItemRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function replayOperational(row: ItemRow, effectivePaid: number) {
  const grossFields = recipeOperationalCostFieldsFromInvoiceLine({
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    unit_price: row.unit_price,
    line_total: row.total ?? undefined,
  });
  const netFields = recipeOperationalCostFieldsFromInvoiceLine({
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    unit_price: effectivePaid,
    line_total: row.total ?? undefined,
  });

  const grossOp =
    grossFields != null
      ? resolvedOperationalUnitCostEur({
          current_price: grossFields.current_price,
          purchase_quantity: grossFields.purchase_quantity,
        })
      : null;
  const netOp =
    netFields != null
      ? resolvedOperationalUnitCostEur({
          current_price: netFields.current_price,
          purchase_quantity: netFields.purchase_quantity,
        })
      : null;

  const opDeltaPct =
    grossOp != null && netOp != null && grossOp > 0
      ? round4(Math.abs(grossOp - netOp) / grossOp)
      : null;

  return { grossFields, netFields, grossOp: round4(grossOp), netOp: round4(netOp), opDeltaPct };
}

async function main() {
  const allItems = await fetchAllInvoiceItems();
  const analyzed = allItems.map((row) => ({ row, ...analyzeRow(row) }));
  const flagged = analyzed.filter((a) => a.flagged);

  // Supplier breakdown
  const supplierStats = new Map<string, { flagged: number; total: number }>();
  for (const a of analyzed) {
    const sup = a.supplier ?? a.row.invoices?.supplier_name ?? "Unknown";
    const cur = supplierStats.get(sup) ?? { flagged: 0, total: 0 };
    cur.total += 1;
    if (a.flagged) cur.flagged += 1;
    supplierStats.set(sup, cur);
  }

  const supplierBreakdown = [...supplierStats.entries()]
    .map(([supplier, s]) => ({
      supplier,
      flagged_rows: s.flagged,
      total_rows: s.total,
      pct_affected: round4(s.flagged / s.total)!,
    }))
    .sort((a, b) => b.flagged_rows - a.flagged_rows);

  const top20 = flagged
    .sort((a, b) => (b.differencePct ?? 0) - (a.differencePct ?? 0))
    .slice(0, 20)
    .map((a) => ({
      invoice_id: a.row.invoice_id,
      invoice_item_id: a.row.id,
      supplier: a.supplier,
      description: a.row.name,
      qty: a.qty,
      unit_price: a.unitPrice,
      total: a.total,
      expected_total: a.expectedTotal,
      difference_pct: a.differencePct,
      effective_paid: a.effectivePaid,
      implied_discount_pct: a.impliedDiscountPct,
    }));

  // Ingredient impact for flagged rows
  const flaggedIds = flagged.map((f) => f.row.id);
  const matchMap = new Map<
    string,
    { ingredient_id: string | null; status: string }
  >();
  for (let i = 0; i < flaggedIds.length; i += 200) {
    const chunk = flaggedIds.slice(i, i + 200);
    const { data, error } = await sb
      .from("invoice_item_matches")
      .select("invoice_item_id,ingredient_id,status")
      .in("invoice_item_id", chunk);
    if (error) throw error;
    for (const m of data ?? []) {
      matchMap.set(m.invoice_item_id, {
        ingredient_id: m.ingredient_id,
        status: m.status,
      });
    }
  }

  const ingredientIds = [
    ...new Set(
      [...matchMap.values()]
        .map((m) => m.ingredient_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const ingredientMap = new Map<
    string,
    {
      id: string;
      name: string;
      current_price: number;
      purchase_quantity: number | null;
      purchase_unit: string | null;
      base_unit: string | null;
    }
  >();
  for (let i = 0; i < ingredientIds.length; i += 200) {
    const chunk = ingredientIds.slice(i, i + 200);
    const { data, error } = await sb
      .from("ingredients")
      .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit")
      .in("id", chunk);
    if (error) throw error;
    for (const ing of data ?? []) ingredientMap.set(ing.id, ing);
  }

  const ingredientImpact: Array<Record<string, unknown>> = [];
  for (const f of flagged) {
    const match = matchMap.get(f.row.id);
    if (!match?.ingredient_id) continue;
    const ing = ingredientMap.get(match.ingredient_id);
    if (!ing) continue;

    const replay = replayOperational(f.row, f.effectivePaid!);
    const storedOp = resolvedOperationalUnitCostEur({
      current_price: ing.current_price,
      purchase_quantity: ing.purchase_quantity,
    });
    const storedHistoryOp = operationalUnitPriceForPriceHistory(
      ing.current_price,
      ing.purchase_quantity,
    );

    const currentMatchesGross =
      Math.abs(Number(ing.current_price) - Number(f.unitPrice)) < 0.0001;
    const currentMatchesEffective =
      Math.abs(Number(ing.current_price) - Number(f.effectivePaid)) < 0.0001;

    ingredientImpact.push({
      ingredient_id: ing.id,
      ingredient: ing.name,
      match_status: match.status,
      line: f.row.name,
      invoice_item_id: f.row.id,
      current_price: round4(Number(ing.current_price)),
      gross_unit_price: f.unitPrice,
      effective_paid: f.effectivePaid,
      current_price_reflects: currentMatchesEffective
        ? "effective"
        : currentMatchesGross
          ? "gross"
          : "other",
      stored_operational_eur: round4(storedOp),
      effective_operational_eur: replay.netOp,
      operational_delta_pct: replay.opDeltaPct,
      history_operational_from_current: round4(storedHistoryOp),
    });
  }

  // History impact for flagged invoice items
  const flaggedInvoiceIds = [...new Set(flagged.map((f) => f.row.invoice_id))];
  const historyImpact: Array<Record<string, unknown>> = [];
  for (const f of flagged) {
    const match = matchMap.get(f.row.id);
    if (!match?.ingredient_id) continue;
    const { data: histRows, error } = await sb
      .from("ingredient_price_history")
      .select(
        "id,ingredient_id,invoice_id,new_price,previous_price,created_at,supplier_name",
      )
      .eq("ingredient_id", match.ingredient_id)
      .eq("invoice_id", f.row.invoice_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const hist = histRows?.[0];
    if (!hist) continue;

    const replay = replayOperational(f.row, f.effectivePaid!);
    const ing = ingredientMap.get(match.ingredient_id);
    const histOp = ing
      ? operationalUnitPriceForPriceHistory(hist.new_price, ing.purchase_quantity)
      : null;
    const histMatchesGross =
      Math.abs(Number(hist.new_price) - Number(f.unitPrice)) < 0.0001;
    const histMatchesEffective =
      Math.abs(Number(hist.new_price) - Number(f.effectivePaid)) < 0.0001;

    historyImpact.push({
      ingredient_id: match.ingredient_id,
      invoice_id: f.row.invoice_id,
      line: f.row.name,
      history_new_price: round4(Number(hist.new_price)),
      gross_unit_price: f.unitPrice,
      effective_paid: f.effectivePaid,
      history_reflects: histMatchesEffective
        ? "effective"
        : histMatchesGross
          ? "gross"
          : "other",
      history_operational_eur: round4(histOp),
      effective_operational_eur: replay.netOp,
      operational_delta_pct: replay.opDeltaPct,
    });
  }

  // Recipe impact
  const affectedIngredientIds = [
    ...new Set(ingredientImpact.map((i) => i.ingredient_id as string)),
  ];
  const recipeImpact: Array<Record<string, unknown>> = [];
  if (affectedIngredientIds.length) {
    const { data: riRows, error: riErr } = await sb
      .from("recipe_ingredients")
      .select("id,recipe_id,ingredient_id,quantity,unit")
      .in("ingredient_id", affectedIngredientIds);
    if (riErr) throw riErr;

    const recipeIds = [...new Set((riRows ?? []).map((r) => r.recipe_id))];
    const recipeMap = new Map<string, { id: string; name: string }>();
    if (recipeIds.length) {
      const { data: recipes, error: rErr } = await sb
        .from("recipes")
        .select("id,name")
        .in("id", recipeIds);
      if (rErr) throw rErr;
      for (const r of recipes ?? []) recipeMap.set(r.id, r);
    }

    const ingImpactById = new Map(
      ingredientImpact.map((i) => [i.ingredient_id as string, i]),
    );

    for (const ri of riRows ?? []) {
      const ingId = ri.ingredient_id as string;
      const impact = ingImpactById.get(ingId);
      if (!impact) continue;
      const ing = ingredientMap.get(ingId);
      if (!ing) continue;

      const grossOp = impact.stored_operational_eur as number | null;
      const netOp = impact.effective_operational_eur as number | null;
      const opDeltaPct = impact.operational_delta_pct as number | null;

      recipeImpact.push({
        recipe_id: ri.recipe_id,
        recipe_name: recipeMap.get(ri.recipe_id)?.name ?? null,
        ingredient: ing.name,
        line_qty: ri.quantity,
        line_unit: ri.unit,
        current_operational_eur: grossOp,
        effective_operational_eur: netOp,
        operational_delta_pct: opDeltaPct,
        line_cost_current: grossOp != null ? round4(grossOp * Number(ri.quantity)) : null,
        line_cost_effective:
          netOp != null ? round4(netOp * Number(ri.quantity)) : null,
      });
    }
  }

  // Classification buckets
  const withDiscount = flagged.filter(
    (f) => (f.impliedDiscountPct ?? 0) > 1 && (f.impliedDiscountPct ?? 0) < 50,
  );
  const grossStored = ingredientImpact.filter((i) => i.current_price_reflects === "gross");
  const effectiveStored = ingredientImpact.filter(
    (i) => i.current_price_reflects === "effective",
  );

  const out = {
    generated_at: new Date().toISOString(),
    vl_project: "bjhnlrgodcqoyzddbpbd",
    threshold_pct: THRESHOLD,
    global_statistics: {
      total_invoice_items: allItems.length,
      flagged_rows: flagged.length,
      pct_flagged: round4(flagged.length / allItems.length),
      rows_with_valid_arithmetic: analyzed.filter((a) => !("reason" in a && a.reason)).length,
      matched_flagged_to_ingredient: ingredientImpact.length,
      flagged_with_history: historyImpact.length,
      flagged_in_recipes: recipeImpact.length,
      ingredient_current_price_gross: grossStored.length,
      ingredient_current_price_effective: effectiveStored.length,
      ingredient_current_price_other:
        ingredientImpact.length - grossStored.length - effectiveStored.length,
      history_reflects_gross: historyImpact.filter((h) => h.history_reflects === "gross").length,
      history_reflects_effective: historyImpact.filter((h) => h.history_reflects === "effective")
        .length,
      likely_discount_lines: withDiscount.length,
      unique_suppliers_with_flags: supplierBreakdown.filter((s) => s.flagged_rows > 0).length,
      unique_invoices_with_flags: new Set(flagged.map((f) => f.row.invoice_id)).size,
    },
    top_20_discrepancies: top20,
    supplier_breakdown: supplierBreakdown,
    ingredient_impact_sample: ingredientImpact.slice(0, 50),
    ingredient_impact_summary: {
      total: ingredientImpact.length,
      reflects_gross: grossStored.length,
      reflects_effective: effectiveStored.length,
      avg_operational_delta_pct:
        ingredientImpact.length > 0
          ? round4(
              ingredientImpact.reduce(
                (s, i) => s + ((i.operational_delta_pct as number) ?? 0),
                0,
              ) / ingredientImpact.length,
            )
          : null,
    },
    history_impact_sample: historyImpact.slice(0, 30),
    history_impact_summary: {
      total: historyImpact.length,
      reflects_gross: historyImpact.filter((h) => h.history_reflects === "gross").length,
      reflects_effective: historyImpact.filter((h) => h.history_reflects === "effective").length,
    },
    recipe_impact: recipeImpact,
    recipe_impact_summary: {
      recipe_lines_affected: recipeImpact.length,
      unique_recipes: new Set(recipeImpact.map((r) => r.recipe_id)).size,
      unique_ingredients: new Set(recipeImpact.map((r) => r.ingredient)).size,
    },
    flagged_invoice_ids: flaggedInvoiceIds,
  };

  const outPath = join(ROOT, ".tmp/gross-net-global-audit-result.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
