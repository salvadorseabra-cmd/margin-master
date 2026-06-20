/**
 * Paccheri discount-aware costing investigation — READ-ONLY VL query + production replay.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist.ts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
} from "../src/lib/invoice-purchase-price-semantics.ts";
import { resolveInvoiceLinePurchaseFormat } from "../src/lib/invoice-purchase-format.ts";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const TARGETS = [
  /paccheri/i,
  /gorgonzola/i,
  /prosciutto\s+cotto/i,
  /pistachio.*mortadella|mortadella.*pistachio/i,
  /san\s+pellegrino/i,
];

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnvLocal();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const round4 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10000) / 10000;

type LineRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

function replayLine(line: LineRow) {
  const meta = {
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unit_price,
    line_total: line.total ?? undefined,
  };
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(meta);
  const operationalFields = operationalCostFieldsFromInvoiceLine({
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unit_price,
    total: line.total,
  });
  const unitPrice = line.unit_price == null ? null : Number(line.unit_price);
  const effective =
    unitPrice != null
      ? computeEffectiveUsableCost(unitPrice, meta, structured, line.name)
      : null;
  const presentation = resolveInvoiceLinePricingPresentation(meta);
  const operationalCost =
    recipeFields != null
      ? resolvedOperationalUnitCostEur({
          current_price: recipeFields.current_price,
          purchase_quantity: recipeFields.purchase_quantity,
        })
      : null;
  const historyOperational =
    recipeFields != null
      ? operationalUnitPriceForPriceHistory(
          recipeFields.current_price,
          recipeFields.purchase_quantity,
        )
      : null;

  const qty = line.quantity == null ? null : Number(line.quantity);
  const gross = line.unit_price == null ? null : Number(line.unit_price);
  const total = line.total == null ? null : Number(line.total);
  const effectivePaidUnit = qty != null && qty > 0 && total != null ? total / qty : null;
  const impliedDiscountPct =
    gross != null && effectivePaidUnit != null && gross > 0
      ? round4(((gross - effectivePaidUnit) / gross) * 100)
      : null;
  const grossMathTotal = gross != null && qty != null ? gross * qty : null;
  const netFromGross11 =
    gross != null ? round4(gross * (1 - 0.11)) : null; // sanity for Paccheri

  return {
    line,
    arithmetic: {
      gross_unit_price: round4(gross),
      quantity: qty,
      line_total: round4(total),
      qty_x_gross: round4(grossMathTotal),
      effective_paid_per_unit: round4(effectivePaidUnit),
      implied_discount_pct: impliedDiscountPct,
      net_unit_if_11pct_off_gross: netFromGross11,
      delta_total_vs_qty_x_gross:
        total != null && grossMathTotal != null ? round4(total - grossMathTotal) : null,
    },
    replay: {
      recipeOperationalCostFieldsFromInvoiceLine: recipeFields,
      operationalCostFieldsFromInvoiceLine: operationalFields,
      computeEffectiveUsableCost: effective,
      resolvedOperationalUnitCostEur: round4(operationalCost),
      operationalUnitPriceForPriceHistory: round4(historyOperational),
      presentation_usable_cost_line: presentation.card.usableCostLine,
      presentation_purchase_price_line: presentation.card.purchasePriceLine,
      structured: {
        kind: structured.kind,
        packageQuantity: structured.packageQuantity,
        packageMeasurementUnit: structured.packageMeasurementUnit,
        normalizedUsableQuantity: structured.normalizedUsableQuantity,
        usableQuantityUnit: structured.usableQuantityUnit,
      },
    },
    source_field_used: {
      current_price: "invoice_items.unit_price (via recipeOperationalCostFieldsFromInvoiceLine)",
      purchase_quantity: "derived from name/unit/qty (resolveCountablePurchaseQuantityForCost etc.)",
      operational_cost: "current_price / purchase_quantity (resolvedOperationalUnitCostEur)",
      history_new_price: "same pack current_price from operationalCostFieldsFromInvoiceLine",
      total_not_used_for_current_price: true,
    },
  };
}

async function main() {
  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("id,supplier_name,invoice_date,created_at,total,file_url")
    .eq("id", INVOICE_ID)
    .maybeSingle();
  if (invErr) throw invErr;
  if (!invoice) throw new Error(`Invoice ${INVOICE_ID} not found`);

  const { data: items, error: itemsErr } = await sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total,created_at,updated_at")
    .eq("invoice_id", INVOICE_ID)
    .order("name");
  if (itemsErr) throw itemsErr;

  const allLines = (items ?? []) as LineRow[];
  const targetLines = allLines.filter((row) => TARGETS.some((re) => re.test(row.name)));
  const discountedCandidates = allLines.filter((row) => {
    const q = Number(row.quantity);
    const p = Number(row.unit_price);
    const t = Number(row.total);
    if (!Number.isFinite(q) || !Number.isFinite(p) || !Number.isFinite(t)) return false;
    return Math.abs(q * p - t) > 0.05;
  });

  const replayed = targetLines.map(replayLine);

  // Ingredient + history for matched targets
  const ingredientAudit: Array<Record<string, unknown>> = [];
  for (const row of targetLines) {
    const { data: matches } = await sb
      .from("invoice_item_matches")
      .select("id,status,ingredient_id,invoice_item_id")
      .eq("invoice_item_id", row.id);
    const confirmed = (matches ?? []).find((m) => m.status === "confirmed") ?? matches?.[0];
    if (!confirmed?.ingredient_id) {
      ingredientAudit.push({ line: row.name, match: null });
      continue;
    }
    const { data: ing } = await sb
      .from("ingredients")
      .select(
        "id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit,usable_weight_grams,updated_at",
      )
      .eq("id", confirmed.ingredient_id)
      .maybeSingle();
    const { data: hist } = await sb
      .from("ingredient_price_history")
      .select(
        "id,invoice_id,new_price,previous_price,purchase_quantity,created_at,supplier_name",
      )
      .eq("ingredient_id", confirmed.ingredient_id)
      .eq("invoice_id", INVOICE_ID)
      .order("created_at", { ascending: false });

    const replay = replayLine(row);
    ingredientAudit.push({
      line: row.name,
      invoice_item_id: row.id,
      ingredient: ing,
      history_for_invoice: hist ?? [],
      persisted_vs_replay: {
        current_price_matches_replay:
          ing?.current_price != null &&
          replay.replay.recipeOperationalCostFieldsFromInvoiceLine?.current_price != null
            ? Math.abs(
                Number(ing.current_price) -
                  Number(replay.replay.recipeOperationalCostFieldsFromInvoiceLine.current_price),
              ) < 0.0001
            : null,
        history_new_price: hist?.[0]?.new_price ?? null,
        replay_operational_eur_per_base: replay.replay.resolvedOperationalUnitCostEur,
        persisted_operational_eur_per_base:
          ing != null
            ? round4(
                resolvedOperationalUnitCostEur({
                  current_price: ing.current_price,
                  purchase_quantity: ing.purchase_quantity,
                }),
              )
            : null,
      },
    });
  }

  const schemaNote = {
    table: "invoice_items (not invoice_products)",
    persisted_columns: ["name", "quantity", "unit", "unit_price", "total"],
    discount_columns_in_db: "none — discount_pct/gross_unit_price/line_total_net exist only in extract-invoice Pass C, bound into unit_price/total before persistence",
    extraction_binding:
      "bindMonetaryColumns: unit_price = gross*(1-discount/100) when structured cols present; total = line_total_net",
  };

  const out = {
    generated_at: new Date().toISOString(),
    vl_project: "bjhnlrgodcqoyzddbpbd",
    invoice,
    schemaNote,
    target_line_count: targetLines.length,
    discounted_line_count_on_invoice: discountedCandidates.length,
    discounted_candidates: discountedCandidates.map((r) => ({
      name: r.name,
      quantity: r.quantity,
      unit_price: r.unit_price,
      total: r.total,
      qty_x_price: round4(Number(r.quantity) * Number(r.unit_price)),
    })),
    target_replay: replayed,
    ingredient_audit: ingredientAudit,
  };

  console.log(JSON.stringify(out, null, 2));

  // Supplement: all invoice lines + ingredient catalog search
  console.log("\n--- SUPPLEMENT ---");
  console.log("ALL_LINES:");
  for (const row of allLines) {
    const q = Number(row.quantity);
    const p = Number(row.unit_price);
    const t = Number(row.total);
    const discounted = Number.isFinite(q) && Number.isFinite(p) && Number.isFinite(t) && Math.abs(q * p - t) > 0.05;
    console.log(
      JSON.stringify({
        name: row.name,
        qty: row.quantity,
        unit: row.unit,
        unit_price: row.unit_price,
        total: row.total,
        discounted,
      }),
    );
  }

  const searchTerms = ["paccheri", "mortadella", "pellegrino", "pistach", "gorgonzola", "prosciutto"];
  for (const term of searchTerms) {
    const { data: ings } = await sb
      .from("ingredients")
      .select(
        "id,name,current_price,purchase_quantity,purchase_unit,unit,usable_weight_grams,updated_at",
      )
      .ilike("name", `%${term}%`)
      .limit(8);
    for (const ing of ings ?? []) {
      const { data: hist } = await sb
        .from("ingredient_price_history")
        .select("invoice_id,new_price,previous_price,created_at,supplier_name")
        .eq("ingredient_id", ing.id)
        .order("created_at", { ascending: false })
        .limit(3);
      console.log(
        "INGREDIENT_SEARCH",
        JSON.stringify({ term, ingredient: ing, recent_history: hist }),
      );
    }
  }

  const { data: invoiceHist } = await sb
    .from("ingredient_price_history")
    .select("ingredient_name,new_price,previous_price,invoice_id,created_at,supplier_name")
    .eq("invoice_id", INVOICE_ID);
  console.log("HISTORY_FOR_INVOICE", JSON.stringify(invoiceHist));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
