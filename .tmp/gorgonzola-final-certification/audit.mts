/**
 * Gorgonzola Final Certification Audit — read-only VL replay.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { bindMonetaryColumns, parseMonetaryLineItems } from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { parsePurchaseStructureFromText } from "../../src/lib/stock-normalization.ts";
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";
import { validateInvoiceLine } from "../../src/lib/invoice-validation/engine.ts";
import { resolveInvoiceTableRowIngredientMatch } from "../../src/lib/invoice-ingredient-row-display.ts";

function buildConfirmedAliasMap(
  rows: Array<{
    ingredient_id: string;
    alias_name: string;
    normalized_alias: string;
    supplier_name: string | null;
    confirmed_by_user: boolean;
  }>,
) {
  const map: Record<string, { ingredientId: string; aliasName: string }> = {};
  for (const row of rows) {
    if (!row.confirmed_by_user) continue;
    const key = `${row.normalized_alias}::${(row.supplier_name ?? "").toLowerCase().trim()}`;
    map[key] = { ingredientId: row.ingredient_id, aliasName: row.alias_name };
  }
  return map;
}

const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const ITEM_ID = "5fab58a8-8cfc-4625-ab97-e956d07aade9";
const OUT = ".tmp/gorgonzola-final-certification";

const PDF = {
  product: "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg",
  qty: 1.35,
  unit: "kg",
  grossUnitPrice: 12.9,
  discountPct: 22.85,
  netUnitPrice: 9.95,
  total: 13.44,
};

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

mkdirSync(OUT, { recursive: true });

const { data: items, error: itemsErr } = await sb
  .from("invoice_items")
  .select("*")
  .eq("invoice_id", INVOICE_ID)
  .ilike("name", "%gorgonzola%")
  .order("created_at", { ascending: false });

const current = items?.find((i) => i.id === ITEM_ID) ?? items?.[0];

let ingredient = null;
let history: Record<string, unknown>[] = [];
let match: Record<string, unknown> | null = null;
let aliases: Record<string, unknown>[] = [];
let allMatches: Record<string, unknown>[] = [];
let allIngredients: Record<string, unknown>[] = [];
let allAliasRows: Record<string, unknown>[] = [];

if (current) {
  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select("*")
    .eq("invoice_item_id", current.id);
  allMatches = matches ?? [];
  match = (matches?.[0] as Record<string, unknown>) ?? null;
  const ingId = match?.ingredient_id as string | undefined;
  if (ingId) {
    const { data: ing } = await sb.from("ingredients").select("*").eq("id", ingId).single();
    ingredient = ing;
  }
}

const { data: gorgIng } = await sb
  .from("ingredients")
  .select("*")
  .ilike("normalized_name", "%gorgonzola%");
const { data: ingredientsAll } = await sb
  .from("ingredients")
  .select("id, name, current_price, purchase_quantity, purchase_unit, base_unit, normalized_name, supplier");
const { data: aliasRowsAll } = await sb
  .from("ingredient_aliases")
  .select("ingredient_id, alias_name, normalized_alias, supplier_name, confirmed_by_user");
allIngredients = ingredientsAll ?? [];
allAliasRows = aliasRowsAll ?? [];
const catalogIngredient = ingredient ?? gorgIng?.[0] ?? null;

if (catalogIngredient) {
  const { data: hist } = await sb
    .from("ingredient_price_history")
    .select("*")
    .eq("ingredient_id", catalogIngredient.id)
    .order("created_at", { ascending: false });
  history = hist ?? [];
  const { data: als } = await sb
    .from("ingredient_aliases")
    .select("*")
    .eq("ingredient_id", catalogIngredient.id);
  aliases = als ?? [];
}

const line = current
  ? {
      id: current.id as string,
      name: current.name as string,
      quantity: Number(current.quantity),
      unit: current.unit as string,
      unit_price: Number(current.unit_price),
      total: Number(current.total),
    }
  : null;

let validation: ReturnType<typeof validateInvoiceLine> = [];
let presentation = null;
let operational = null;
let lastPurchase = null;
let recipeFields = null;
let catalogFields = null;
let structure = null;
let rowMatch = null;

if (line) {
  presentation = resolveInvoiceLinePricingPresentation(line);
  operational = computeEffectiveUsableCost(line.unit_price, line.unit, line.name);
  structure = parsePurchaseStructureFromText(line.name);
  catalogFields = operationalCostFieldsFromInvoiceLine(line);
  recipeFields = recipeOperationalCostFieldsFromInvoiceLine(line);
  const persisted = match
    ? {
        ingredient_id: match.ingredient_id as string,
        status: match.status as string,
        confidence: null,
      }
    : null;
  rowMatch = resolveInvoiceTableRowIngredientMatch(
    line.name,
    (allIngredients ?? []) as never,
    buildConfirmedAliasMap((allAliasRows ?? []) as never),
    "Emporio Italia",
    undefined,
    persisted
      ? {
          persistedMatch: {
            ingredientId: persisted.ingredient_id,
            matchState: persisted.status,
            confidence: persisted.confidence,
          },
        }
      : undefined,
  );
  validation = validateInvoiceLine({
    id: line.id,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unit_price,
    total: line.total,
    matchedIngredientName: catalogIngredient?.name ?? null,
    matchDisplayState: rowMatch.state.displayState,
    ocrMeta: null,
  });
}

const pdfBound = bindMonetaryColumns(
  parseMonetaryLineItems([
    {
      name: current?.name ?? PDF.product,
      quantity: PDF.qty,
      unit: PDF.unit,
      gross_unit_price: PDF.grossUnitPrice,
      discount_pct: PDF.discountPct,
      line_total_net: PDF.total,
      unit_price: null,
      total: null,
    },
  ]),
)[0];

const dbBound = line
  ? bindMonetaryColumns(
      parseMonetaryLineItems([
        {
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          gross_unit_price: null,
          discount_pct: null,
          line_total_net: line.total,
          unit_price: line.unit_price,
          total: line.total,
        },
      ]),
    )[0]
  : null;

const qtyMatch = current && Math.abs(Number(current.quantity) - PDF.qty) < 0.001;
const priceMatch = current && Math.abs(Number(current.unit_price) - PDF.netUnitPrice) < 0.02;
const totalMatch = current && Math.abs(Number(current.total) - PDF.total) < 0.02;
const mathOk =
  current &&
  Math.abs(Number(current.quantity) * Number(current.unit_price) - Number(current.total)) < 0.05;
const catalogSync =
  catalogIngredient &&
  catalogFields &&
  Math.abs(Number(catalogIngredient.current_price) - catalogFields.current_price) < 0.001;

const out = {
  queriedAt: new Date().toISOString(),
  vl: VL,
  invoiceId: INVOICE_ID,
  targetItemId: ITEM_ID,
  itemsErr,
  pdfGroundTruth: PDF,
  gorgonzolaItems: items,
  currentItem: current,
  match,
  allMatches,
  catalogIngredient,
  priceHistory: history,
  aliases,
  pipeline: { pdfBound, dbBound },
  economics: {
    presentation,
    operational,
    structure,
    catalogFields,
    recipeFields,
    lastPurchase,
    purchaseQtyLabel: line
      ? formatRowPurchaseQuantityLabel({
          quantity: line.quantity,
          unit: line.unit,
          name: line.name,
        })
      : null,
  },
  validation,
  rowMatch,
  checks: {
    qtyMatchPdf: qtyMatch,
    priceMatchPdf: priceMatch,
    totalMatchPdf: totalMatch,
    mathReconciles: mathOk,
    catalogPriceSync: catalogSync,
    recipeMatchesCatalog:
      recipeFields && catalogIngredient
        ? recipeFields.current_price === catalogIngredient.current_price &&
          recipeFields.purchase_quantity === catalogIngredient.purchase_quantity
        : null,
    historyLatestPrice: history[0]?.new_price ?? null,
    historyLatestInvoice: history[0]?.invoice_id ?? null,
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      ok: true,
      itemId: current?.id,
      qty: current?.quantity,
      unit_price: current?.unit_price,
      total: current?.total,
      validationCount: validation.length,
      validationCodes: validation.map((v) => v.code),
      ingredientPrice: catalogIngredient?.current_price,
      matchStatus: match?.status ?? "none",
      checks: out.checks,
    },
    null,
    2,
  ),
);
