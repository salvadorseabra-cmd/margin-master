/**
 * READ-ONLY Phase 1 validation forensics — Ricotta + S.Pellegrino
 * VL: bjhnlrgodcqoyzddbpbd — no DB writes
 */
if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
}

import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
} from "../src/lib/invoice-purchase-price-semantics.ts";
import { buildRecentPurchases } from "../src/lib/ingredient-purchase-memory.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const BOCCONCINO_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";
const EMPORIO_ID = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";

const key = (
  JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
  ) as { name: string; api_key: string }[]
).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

function replayLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  gross_unit_price?: number | null;
  discount_pct?: number | null;
  line_total_net?: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        gross_unit_price: raw.gross_unit_price ?? null,
        discount_pct: raw.discount_pct ?? null,
        line_total_net: raw.line_total_net ?? null,
        unit_price: raw.unit_price,
        total: raw.total,
      },
    ]),
  );
  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
  };
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const operational = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const purchaseQty = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const usablePerUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effectiveCost = computeEffectiveUsableCost(
    bound.unit_price ?? 0,
    metadata,
    structured,
    bound.name,
  );
  const proc = procurementPackFieldsFromInvoiceLine(
    {
      name: bound.name,
      quantity: bound.quantity,
      unit: bound.unit,
      unit_price: bound.unit_price,
      total: bound.total,
    },
    { isGenericUnit: defaultIsGenericUnit },
  );
  return {
    bound: {
      quantity: bound.quantity,
      unit: bound.unit,
      unit_price: bound.unit_price,
      total: bound.total,
    },
    structured: {
      kind: structured.kind,
      packageQuantity: structured.packageQuantity,
      packageMeasurementUnit: structured.packageMeasurementUnit,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      usableQuantityUnit: structured.usableQuantityUnit,
      purchaseContainerCount: structured.purchaseContainerCount,
      purchaseContainerUnit: structured.purchaseContainerUnit,
    },
    purchaseQty,
    usablePerUnit,
    effectiveCost,
    operational,
    procurement: proc,
    operationalHistoryPrice: operationalUnitPriceForPriceHistory(
      proc?.current_price,
      proc?.purchase_quantity,
    ),
    presentation: {
      purchaseQuantityLine: presentation.card?.purchaseQuantityLine ?? null,
      usableStockLine: presentation.card?.usableStockLine ?? null,
      purchasePriceLine: presentation.card?.purchasePriceLine ?? null,
      usableCostLine: presentation.card?.usableCostLine ?? null,
      priceDisplay: presentation.priceDisplay,
      usableStockLabel: presentation.usableStockLabel,
      effectiveUsableCostLabel: presentation.effectiveUsableCostLabel,
    },
    rowQtyLabel: formatRowPurchaseQuantityLabel(metadata),
  };
}

function loadExtractArtifact(path: string) {
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  const items = data.items ?? data.extract?.items ?? [];
  return items as Array<Record<string, unknown>>;
}

async function traceIngredient(namePattern: string) {
  const { data: ings } = await sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,usable_weight_grams,usable_volume_ml")
    .ilike("name", `%${namePattern}%`);
  const traces = [];
  for (const ing of ings ?? []) {
    const { data: hist } = await sb
      .from("ingredient_price_history")
      .select("id,invoice_id,new_price,previous_price,created_at")
      .eq("ingredient_id", ing.id)
      .order("created_at", { ascending: false })
      .limit(3);
    const { data: matches } = await sb
      .from("invoice_item_matches")
      .select(
        "status,invoice_item_id,invoice_items(id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(supplier_name,invoice_date))",
      )
      .eq("ingredient_id", ing.id);
    const lines = [];
    for (const m of matches ?? []) {
      const item = m.invoice_items as Record<string, unknown> | null;
      if (!item) continue;
      const norm = normalizeInvoiceItemFields(item as never);
      lines.push({
        status: m.status,
        invoiceId: item.invoice_id,
        supplier: (item.invoices as { supplier_name?: string } | null)?.supplier_name,
        invoiceDate: (item.invoices as { invoice_date?: string } | null)?.invoice_date,
        persisted: {
          id: item.id,
          name: norm.name,
          quantity: norm.quantity,
          unit: norm.unit,
          unit_price: norm.unit_price,
          total: norm.total,
          created_at: item.created_at,
        },
        replay: replayLine({
          name: norm.name,
          quantity: norm.quantity,
          unit: norm.unit,
          unit_price: norm.unit_price,
          total: norm.total,
        }),
      });
    }
    traces.push({
      ingredient: ing,
      catalogOperational: resolvedOperationalUnitCostEur({
        current_price: ing.current_price,
        purchase_quantity: ing.purchase_quantity,
      }),
      priceHistory: hist,
      lines,
    });
  }
  return traces;
}

async function traceInvoiceLines(invoiceId: string, namePatterns: string[]) {
  const { data: invoice } = await sb
    .from("invoices")
    .select("id,supplier_name,invoice_date,total")
    .eq("id", invoiceId)
    .single();
  const { data: items } = await sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total,created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  const matched = (items ?? []).filter((item) =>
    namePatterns.some((p) => item.name.toLowerCase().includes(p.toLowerCase())),
  );

  return {
    invoice,
    lines: matched.map((item) => {
      const norm = normalizeInvoiceItemFields(item as never);
      return {
        persisted: norm,
        replay: replayLine({
          name: norm.name,
          quantity: norm.quantity,
          unit: norm.unit,
          unit_price: norm.unit_price,
          total: norm.total,
        }),
      };
    }),
  };
}

// --- Ricotta ---
const ricottaDb = await traceInvoiceLines(BOCCONCINO_ID, ["RICOTTA"]);
const ricottaIng = await traceIngredient("ricotta");

// Replay OCR variants from artifacts
const ricottaArtifacts: Record<string, unknown> = {};
for (const [label, path] of [
  ["bocconcino-extract-response", ".tmp/bocconcino-investigation/extract-invoice-response.json"],
  ["final-residual-extract", ".tmp/final-residual-error-audit/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json"],
  ["vl-final-state-extract", ".tmp/vl-final-state-audit/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json"],
  ["discount-binding-persisted", null],
] as const) {
  if (path) {
    const items = loadExtractArtifact(path);
    const row = items?.find((i) => String(i.name).includes("RICOTTA"));
    if (row) {
      ricottaArtifacts[label] = {
        raw: row,
        replay: replayLine({
          name: String(row.name),
          quantity: typeof row.quantity === "number" ? row.quantity : null,
          unit: typeof row.unit === "string" ? row.unit : null,
          unit_price: typeof row.unit_price === "number" ? row.unit_price : null,
          total: typeof row.total === "number" ? row.total : null,
        }),
      };
    }
  }
}

// qty=1 vs qty=2 binding comparison
ricottaArtifacts["binding_qty1_vs_qty2"] = {
  qty1: replayLine({
    name: "RICOTTA TREVIGIANA 1,5KG",
    quantity: 1,
    unit: "un",
    unit_price: 7.967,
    total: 7.97,
  }),
  qty2: replayLine({
    name: "RICOTTA TREVIGIANA 1,5KG",
    quantity: 2,
    unit: "un",
    unit_price: 7.967,
    total: 7.97,
  }),
};

// --- S.Pellegrino ---
const spellegrinoBoc = await traceInvoiceLines(BOCCONCINO_ID, ["PELLEGRINO"]);
const spellegrinoEmp = await traceInvoiceLines(EMPORIO_ID, ["Pellegrino", "PELLEGRINO"]);
const spellegrinoIng = await traceIngredient("pellegrino");

const spArtifacts: Record<string, unknown> = {};
for (const [label, path] of [
  ["bocconcino-extract", ".tmp/bocconcino-investigation/extract-invoice-response.json"],
  ["emporio-db-record", ".tmp/emporio-footer-audit/emporio/db-record.json"],
  ["emporio-invoice-items", ".tmp/emporio-italia-investigation/invoice-items.json"],
] as const) {
  if (!existsSync(path)) continue;
  const data = JSON.parse(readFileSync(path, "utf8"));
  const items = data.items ?? data.invoice_items ?? [];
  const row = (items as Array<Record<string, unknown>>).find((i) =>
    String(i.name).toLowerCase().includes("pellegrino"),
  );
  if (row) {
    spArtifacts[label] = {
      raw: row,
      replay: replayLine({
        name: String(row.name),
        quantity: typeof row.quantity === "number" ? row.quantity : null,
        unit: typeof row.unit === "string" ? row.unit : null,
        unit_price: typeof row.unit_price === "number" ? row.unit_price : null,
        total: typeof row.total === "number" ? row.total : null,
      }),
    };
  }
}

// --- Additional items (document only) ---
const additionalPatterns = [
  "mozzarella fior",
  "stracciatella",
  "paccheri",
  "pomodori pelati",
  "rolo de cabra",
  "rolo de carne",
];
const additional: Record<string, unknown> = {};
for (const p of additionalPatterns) {
  const t = await traceInvoiceLines(BOCCONCINO_ID, [p]);
  if (t.lines.length > 0) additional[p] = t;
}

const output = {
  generatedAt: new Date().toISOString(),
  vl: VL,
  ricotta: { db: ricottaDb, ingredients: ricottaIng, artifacts: ricottaArtifacts },
  spellegrino: {
    bocconcino: spellegrinoBoc,
    emporio: spellegrinoEmp,
    ingredients: spellegrinoIng,
    artifacts: spArtifacts,
  },
  additional,
};

writeFileSync(".tmp/phase1-validation-forensics-result.json", JSON.stringify(output, null, 2));
console.log("wrote .tmp/phase1-validation-forensics-result.json");
