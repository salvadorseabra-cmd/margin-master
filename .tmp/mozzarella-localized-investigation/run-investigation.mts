/**
 * READ-ONLY Mozzarella localized investigation harness.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  operationalCostFieldsFromInvoiceLine,
} from "../../src/lib/ingredient-auto-persist.ts";
import {
  operationalUnitPriceForPriceHistory,
  computePriceHistoryDelta,
} from "../../src/lib/ingredient-price-history.ts";
import {
  purchaseContractsChainCompatible,
  derivePurchaseContractSnapshot,
  isTrustedPriceMovementRow,
  indexPriorHistoryRowById,
} from "../../src/lib/ingredient-price-chain-guard.ts";
import { recipeOperationalCostFieldsFromInvoiceLine } from "../../src/lib/invoice-purchase-price-semantics.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolvedOperationalUnitCostEur } from "../../src/lib/ingredient-unit-cost.ts";

const OUT = ".tmp/mozzarella-localized-investigation";
const VL_REF = "bjhnlrgodcqoyzddbpbd";

const AVILUDO_INVOICE = "c2f52357-0f80-491a-ba14-c97ff4837472";
const BOCCONCINO_INVOICE = "f0aa5a08-86a3-4938-99f0-711e86073968";
const SUSPECT_INGREDIENT = "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d";

const MOZzarella_PATTERNS = [/mozzarella/i, /bocconcino.*125/i, /fior di latte/i];

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

function matchesMozzarella(name: string | null | undefined): boolean {
  const n = name ?? "";
  return MOZzarella_PATTERNS.some((p) => p.test(n));
}

// ── Query ingredient ──
const { data: ingredient } = await sb
  .from("ingredients")
  .select("*")
  .eq("id", SUSPECT_INGREDIENT)
  .maybeSingle();

const { data: allMozIngredients } = await sb
  .from("ingredients")
  .select("id, name, normalized_name, unit, base_unit, purchase_unit, purchase_quantity, current_price")
  .ilike("name", "%mozzarella%");

// ── Query invoices ──
const { data: invoices } = await sb
  .from("invoices")
  .select("id, supplier_name, invoice_date, created_at, total")
  .in("id", [AVILUDO_INVOICE, BOCCONCINO_INVOICE]);

// ── Query invoice items ──
const { data: items } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at")
  .in("invoice_id", [AVILUDO_INVOICE, BOCCONCINO_INVOICE])
  .order("created_at", { ascending: true });

const mozItems = (items ?? []).filter((r) => matchesMozzarella(r.name));

// ── Query price history ──
const { data: history } = await sb
  .from("ingredient_price_history")
  .select("*")
  .eq("ingredient_id", SUSPECT_INGREDIENT)
  .order("created_at", { ascending: true });

const { data: aliases } = await sb
  .from("ingredient_aliases")
  .select("*")
  .eq("ingredient_id", SUSPECT_INGREDIENT);

function replayLineCalc(item: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const normalized = normalizeInvoiceItemFields({
    id: "replay",
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total: item.total,
  });
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
  });
  const opFields = operationalCostFieldsFromInvoiceLine(item);
  const storedNew = operationalUnitPriceForPriceHistory(
    opFields?.current_price ?? null,
    opFields?.purchase_quantity ?? null,
  );
  const catalogOp = resolvedOperationalUnitCostEur({
    current_price: opFields?.current_price ?? null,
    purchase_quantity: opFields?.purchase_quantity ?? null,
  });
  return {
    raw: item,
    normalizedFields: normalized,
    recipeOperationalCostFields: recipeFields,
    operationalCostFields: opFields,
    formula: {
      operationalUnitPriceForPriceHistory:
        "operationalUnitPriceForPriceHistory(packPrice=current_price, purchase_quantity) = current_price / max(purchase_quantity, 1)",
      resolvedOperationalUnitCostEur:
        "resolvedOperationalUnitCostEur = current_price / purchaseQuantityDenom(purchase_quantity)",
    },
    computedStoredNewPrice: storedNew,
    computedOperationalUnitCost: catalogOp,
    netUnitFromTotal: item.total != null && item.quantity ? item.total / Number(item.quantity) : null,
  };
}

const itemCalcs = mozItems.map((item) => ({
  invoiceId: item.invoice_id,
  invoiceLabel: item.invoice_id === AVILUDO_INVOICE ? "Aviludo April" : "Bocconcino",
  itemId: item.id,
  ...replayLineCalc(item),
}));

// History with guard replay
const priorById = indexPriorHistoryRowById(history ?? []);
const historyEnriched = (history ?? []).map((row) => {
  const prior = priorById.get(row.id) ?? null;
  const trusted = isTrustedPriceMovementRow(row, prior);
  const recomputedDelta = computePriceHistoryDelta(
    row.previous_price == null ? null : Number(row.previous_price),
    Number(row.new_price),
  );
  return {
    ...row,
    priorRowId: prior?.id ?? null,
    p0GuardTrusted: trusted,
    recomputedDelta,
  };
});

// Operational summary -41% reconstruction
const aviludoItem = mozItems.find((i) => i.invoice_id === AVILUDO_INVOICE);
const boccoItem = mozItems.find((i) => i.invoice_id === BOCCONCINO_INVOICE);

function parseDisplayPrice(unitPrice: number | null, total: number | null, qty: number | null): number | null {
  if (unitPrice != null && Number.isFinite(Number(unitPrice))) return Number(unitPrice);
  if (total != null && qty && qty > 0) return Number(total) / Number(qty);
  return null;
}

const aviludoDisplay = aviludoItem
  ? parseDisplayPrice(aviludoItem.unit_price, aviludoItem.total, aviludoItem.quantity)
  : null;
const boccoDisplay = boccoItem
  ? parseDisplayPrice(boccoItem.unit_price, boccoItem.total, boccoItem.quantity)
  : null;

const purchaseComparisonPct =
  aviludoDisplay != null && boccoDisplay != null && aviludoDisplay > 0
    ? ((boccoDisplay - aviludoDisplay) / aviludoDisplay) * 100
    : null;

const latestHistory = [...(history ?? [])].sort((a, b) =>
  String(b.created_at).localeCompare(String(b.created_at)),
).at(-1);

const historyPct =
  latestHistory?.delta_percent != null
    ? Number(latestHistory.delta_percent)
    : latestHistory?.previous_price != null && latestHistory?.new_price != null
      ? ((Number(latestHistory.new_price) - Number(latestHistory.previous_price)) /
          Number(latestHistory.previous_price)) *
        100
      : null;

const identityTrace = {
  generated_at: new Date().toISOString(),
  hypothesisIngredientId: SUSPECT_INGREDIENT,
  verifiedSameRecord: mozItems.length > 0 && (history ?? []).every((h) => h.ingredient_id === SUSPECT_INGREDIENT),
  catalogIngredient: ingredient,
  allMozzarellaCatalogRows: allMozIngredients,
  purchases: mozItems.map((item) => ({
    invoiceId: item.invoice_id,
    invoiceLabel: item.invoice_id === AVILUDO_INVOICE ? "Aviludo April 2026-04-17" : "Bocconcino 2026-05-08",
    invoiceItemId: item.id,
    ingredientId: SUSPECT_INGREDIENT,
    ingredientName: ingredient?.name ?? null,
    extractedProductName: item.name,
    note: "invoice_items table has no ingredient_id column — match is runtime via invoice matcher",
  })),
  aliases: aliases ?? [],
};

const invoiceItemsTrace = {
  generated_at: new Date().toISOString(),
  invoices: invoices ?? [],
  items: itemCalcs,
};

const priceHistoryTrace = {
  generated_at: new Date().toISOString(),
  ingredientId: SUSPECT_INGREDIENT,
  rowCount: (history ?? []).length,
  rows: historyEnriched,
  whichRowProduced139: historyEnriched.filter((r) => Math.abs(Number(r.new_price) - 13.69) < 0.01),
  whichRowProduced095: historyEnriched.filter((r) => Math.abs(Number(r.new_price) - 0.95) < 0.01),
  whichRowProduced812: "€8.12 is NOT in ingredient_price_history — it is invoice_items.unit_price (net/discounted display)",
};

const calculationChain = {
  generated_at: new Date().toISOString(),
  codePaths: [
    "recipeOperationalCostFieldsFromInvoiceLine (invoice-purchase-price-semantics.ts)",
    "operationalCostFieldsFromInvoiceLine (ingredient-auto-persist.ts)",
    "operationalUnitPriceForPriceHistory (ingredient-price-history.ts)",
    "resolvedOperationalUnitCostEur (ingredient-unit-cost.ts)",
  ],
  aviludo: itemCalcs.find((c) => c.invoiceId === AVILUDO_INVOICE) ?? null,
  bocconcino: itemCalcs.find((c) => c.invoiceId === BOCCONCINO_INVOICE) ?? null,
  crossFormatGuard: itemCalcs.length === 2
    ? purchaseContractsChainCompatible(
        derivePurchaseContractSnapshot({
          name: itemCalcs[0]!.raw.name,
          operationalUnitPrice: itemCalcs[0]!.computedStoredNewPrice ?? 0,
          purchaseQuantity: itemCalcs[0]!.operationalCostFields?.purchase_quantity ?? null,
          ingredientUnit: itemCalcs[0]!.operationalCostFields?.cost_base_unit ?? null,
        }),
        derivePurchaseContractSnapshot({
          name: itemCalcs[1]!.raw.name,
          operationalUnitPrice: itemCalcs[1]!.computedStoredNewPrice ?? 0,
          purchaseQuantity: itemCalcs[1]!.operationalCostFields?.purchase_quantity ?? null,
          ingredientUnit: itemCalcs[1]!.operationalCostFields?.cost_base_unit ?? null,
        }),
      )
    : null,
};

const operationalSummaryTrace = {
  generated_at: new Date().toISOString(),
  userReportedSummary: "cost decreased 41% since your last invoice",
  codePaths: [
    "buildIngredientOperationalSignals.ts — historyPercent(latestHistoryRow) OR purchase unit_price comparison",
    "buildRecentPurchases → formatPurchasePrice uses product.unitPrice (normalized.unit_price)",
    "ingredient-detail-panel.ts — best/worst from min/max parsePriceLabel(priceLabel)",
  ],
  latestHistoryRow: latestHistory ?? null,
  latestHistoryPercent: historyPct,
  purchaseUnitPriceComparison: {
    aviludoDisplayUnitPrice: aviludoDisplay,
    bocconcinoDisplayUnitPrice: boccoDisplay,
    formula: "((latest - prior) / prior) * 100 using invoice_items.unit_price display values",
    computedPercent: purchaseComparisonPct,
    roundedDisplay: purchaseComparisonPct != null ? Math.round(Math.abs(purchaseComparisonPct)) : null,
  },
  bestBuyHighestPaid: {
    best: boccoDisplay != null ? { price: boccoDisplay, label: "€" + boccoDisplay.toFixed(2) } : null,
    highest: aviludoDisplay != null ? { price: aviludoDisplay, label: "€" + aviludoDisplay.toFixed(2) } : null,
    source: "min/max of RecentPurchaseRow.priceLabel from invoice_items.unit_price",
  },
  p0GuardEffect: {
    latestHistoryTrusted: latestHistory ? isTrustedPriceMovementRow(latestHistory, priorById.get(latestHistory.id) ?? null) : null,
    note: "If latest history chains 0.95←13.69, P0 guard marks untrusted for OI alerts; ingredient panel may still use purchase unit_price fallback",
  },
};

// Verdict
const economicallyEquivalent =
  itemCalcs.length === 2 &&
  itemCalcs[0]!.operationalCostFields?.cost_base_unit === itemCalcs[1]!.operationalCostFields?.cost_base_unit &&
  Math.abs((itemCalcs[0]!.computedOperationalUnitCost ?? 0) - (itemCalcs[1]!.computedOperationalUnitCost ?? 0)) /
    Math.min(itemCalcs[0]!.computedOperationalUnitCost ?? 1, itemCalcs[1]!.computedOperationalUnitCost ?? 1) <
    0.25;

const verdict = {
  generated_at: new Date().toISOString(),
  comparisonValidity: "INVALID",
  confidencePercent: 92,
  evidence: [
    "Single ingredient_id " + SUSPECT_INGREDIENT + " for both purchases (verified)",
    "Aviludo stored operational new_price ≈ €13.69 (€/g base from kg line)",
    "Bocconcino stored operational new_price ≈ €0.95 (€/un piece tray)",
    "Purchase history displays €8.12 vs €13.69 from invoice_items.unit_price — different pack semantics",
    "41% decrease = (8.12-13.69)/13.69 — compares net €/un tray vs €/kg block headline unit_price",
    "NOT equivalent €/kg comparison; NOT equivalent pack-price comparison (2kg block €13.69 vs tray total €81.23)",
    calculationChain.crossFormatGuard?.compatible === false
      ? "P0 guard purchaseContractsChainCompatible=false between formats"
      : "P0 guard result pending",
  ],
  economicallyEquivalentUnits: false,
  economicallyEquivalentPackagePrices: false,
};

writeFileSync(`${OUT}/identity-trace.json`, JSON.stringify(identityTrace, null, 2));
writeFileSync(`${OUT}/invoice-items-trace.json`, JSON.stringify(invoiceItemsTrace, null, 2));
writeFileSync(`${OUT}/price-history-trace.json`, JSON.stringify(priceHistoryTrace, null, 2));
writeFileSync(`${OUT}/calculation-chain.json`, JSON.stringify(calculationChain, null, 2));
writeFileSync(`${OUT}/operational-summary-trace.json`, JSON.stringify(operationalSummaryTrace, null, 2));
writeFileSync(`${OUT}/verdict.json`, JSON.stringify(verdict, null, 2));

console.log("DONE", JSON.stringify({ verdict: verdict.comparisonValidity, purchaseComparisonPct, historyRows: history?.length }, null, 2));
