/**
 * READ-ONLY quantity mismatch validation — VL bjhnlrgodcqoyzddbpbd
 * Uses production monetary binding + resolveCountablePurchaseQuantityForCost.
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  formatRowPurchaseQuantityLabel,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/quantity-mismatch-validation";

const GENERIC_COUNTABLE = new Set(["un", "uni", "unid", "unit", "units", "pc", "pcs"]);
const PACK_ROW_UNITS = new Set(["cx", "caixa", "caixas", "case", "cases", "pack", "packs"]);

const VL_INVOICES = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
];

const FAMILY_A_ITEM_IDS = new Set([
  "409850ab-646d-44fa-b20c-c8a4a8570064",
  "bb4bbfac-a59b-4d0b-9844-ba773c1f261e",
]);

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

function normalizeToken(unit: string | null | undefined): string | null {
  if (!unit?.trim()) return null;
  return unit.trim().toLowerCase().replace(/\./g, "");
}

function parseQuantityLabel(label: string | null | undefined): number | null {
  if (!label?.trim()) return null;
  const m = label.trim().match(/^([\d.,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function qtyMismatch(a: number | null, b: number | null, tol = 0.001): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) > tol;
}

function bindLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
        unit_price: raw.unit_price,
        total: raw.total,
      },
    ]),
  );
  return {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    total: bound.total,
  };
}

function replayBoundLine(bound: ReturnType<typeof bindLine>, matchedIngredientName?: string | null) {
  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
    matchedIngredientName: matchedIngredientName ?? null,
  };
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const operational = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const procurement = procurementPackFieldsFromInvoiceLine(
    {
      name: bound.name,
      quantity: bound.quantity,
      unit: bound.unit,
      unit_price: bound.unit_price,
      total: bound.total,
    },
    { isGenericUnit: defaultIsGenericUnit },
  );
  const purchaseQtyForCost = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const effectiveCost = computeEffectiveUsableCost(
    bound.unit_price ?? 0,
    metadata,
    structured,
    bound.name,
  );
  const lastPurchaseLabel = formatRowPurchaseQuantityLabel(metadata);

  return {
    structured,
    operational,
    procurement,
    purchaseQtyForCost,
    lastPurchaseLabel,
    lastPurchaseQtyParsed: parseQuantityLabel(lastPurchaseLabel),
    operationalCostLabel: presentation.effectiveUsableCostLabel,
    procurementCostLabel: presentation.priceDisplay,
    effectiveCost,
    purchaseContainerCount: structured.purchaseContainerCount,
    usableQuantity: structured.normalizedUsableQuantity,
    usableQuantityUnit: structured.usableQuantityUnit,
  };
}

function outerContainerCountFromStructure(
  invoiceQty: number | null,
  replay: ReturnType<typeof replayBoundLine>,
): number | null {
  const cc = replay.purchaseContainerCount;
  if (cc == null || cc <= 0) return null;
  // When structure outer count tracks invoice row qty (Family A pattern), use it.
  if (invoiceQty != null && cc === invoiceQty) return cc;
  if (
    replay.structured.kind === "unit_count" &&
    replay.usableQuantityUnit === "un" &&
    replay.usableQuantity != null
  ) {
    return replay.usableQuantity;
  }
  return null;
}

function isPackInnerCountMismatch(invoiceQty: number | null, replay: ReturnType<typeof replayBoundLine>): boolean {
  const cc = replay.purchaseContainerCount;
  if (cc == null || invoiceQty == null) return false;
  // Inner pack notation (CX 1KG*6) — containerCount reflects inner N, not invoice outer qty.
  if (cc !== invoiceQty && /\(CX|\*\s*\d|\d+\s*x\s*\d+/i.test(replay.structured.reason ?? "")) return false;
  if (/\(CX|\*\s*\d|\d+\s*x\s*\d+/i.test(String(replay.structured.packageMeasurementUnit ?? ""))) return false;
  return cc > (replay.purchaseQtyForCost ?? 0);
}

const [{ data: items }, { data: invoices }, { data: ingredients }, { data: matches }] =
  await Promise.all([
    sb
      .from("invoice_items")
      .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
      .in("invoice_id", VL_INVOICES),
    sb.from("invoices").select("id,supplier_name,invoice_date,created_at").in("id", VL_INVOICES),
    sb
      .from("ingredients")
      .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit"),
    sb
      .from("invoice_item_matches")
      .select("status,ingredient_id,invoice_item_id,invoice_id")
      .in("invoice_id", VL_INVOICES),
  ]);

const invById = new Map((invoices ?? []).map((i) => [i.id, i]));
const ingById = new Map((ingredients ?? []).map((i) => [i.id, i]));
const matchByItemId = new Map(
  (matches ?? [])
    .filter((m) => m.status === "confirmed" || m.status === "auto_confirmed")
    .map((m) => [m.invoice_item_id, m]),
);

type MismatchRow = {
  ingredientId: string | null;
  ingredient: string | null;
  invoiceId: string;
  supplier: string | null;
  invoiceDate: string | null;
  invoiceItemId: string;
  lineName: string;
  invoiceQuantity: number | null;
  invoiceUnit: string | null;
  boundUnitPrice: number | null;
  boundTotal: number | null;
  storedPurchaseQuantity: number | null;
  storedPurchaseUnit: string | null;
  catalogPurchaseQuantity: number | null;
  lastPurchaseQuantity: number | null;
  lastPurchaseLabel: string | null;
  usableQuantity: number | null;
  usableQuantityUnit: string | null;
  purchaseContainerCount: number | null;
  purchaseQtyForCost: number | null;
  operationalCost: string | null;
  procurementCost: string | null;
  mismatchTypes: string[];
  familyA: boolean;
  notes: string[];
};

const mismatches: MismatchRow[] = [];

for (const item of items ?? []) {
  const norm = normalizeInvoiceItemFields(item as never);
  const inv = invById.get(item.invoice_id);
  const match = matchByItemId.get(item.id);
  const ing = match ? ingById.get(match.ingredient_id) : null;

  const bound = bindLine({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
    unit_price: norm.unit_price,
    total: norm.total,
  });
  const replay = replayBoundLine(bound, ing?.name ?? null);

  const invoiceQty = bound.quantity == null ? null : Number(bound.quantity);
  const rowUnit = normalizeToken(bound.unit);
  const storedPurchaseQty =
    replay.operational?.purchase_quantity ?? replay.procurement?.purchase_quantity ?? null;
  const storedPurchaseUnit =
    replay.operational?.cost_base_unit ?? replay.procurement?.purchase_unit ?? null;
  const catalogPurchaseQty = ing?.purchase_quantity ?? null;
  const lastPurchaseQty = replay.lastPurchaseQtyParsed;
  const purchaseQtyForCost = replay.purchaseQtyForCost;

  const types: string[] = [];
  const notes: string[] = [];

  const sameGenericUnit =
    rowUnit != null &&
    storedPurchaseUnit != null &&
    GENERIC_COUNTABLE.has(rowUnit) &&
    GENERIC_COUNTABLE.has(normalizeToken(storedPurchaseUnit) ?? "");

  const packRowExpansion =
    rowUnit != null &&
    PACK_ROW_UNITS.has(rowUnit) &&
    normalizeToken(storedPurchaseUnit) === "un" &&
    storedPurchaseQty != null &&
    invoiceQty != null &&
    storedPurchaseQty > invoiceQty;

  // 1) invoice qty != purchase_history stored purchase_quantity (same unit semantics)
  if (sameGenericUnit && !packRowExpansion && qtyMismatch(invoiceQty, storedPurchaseQty)) {
    types.push("invoice_vs_stored_purchase_quantity");
    notes.push(
      `bound qty=${invoiceQty} ${rowUnit} vs stored purchase_quantity=${storedPurchaseQty} ${storedPurchaseUnit}`,
    );
  }

  if (ing && sameGenericUnit && !packRowExpansion && qtyMismatch(invoiceQty, catalogPurchaseQty)) {
    types.push("invoice_vs_catalog_purchase_quantity");
    notes.push(
      `bound qty=${invoiceQty} vs ingredients.purchase_quantity=${catalogPurchaseQty}`,
    );
  }

  // 2) invoice qty != Last Purchase display quantity
  if (qtyMismatch(invoiceQty, lastPurchaseQty)) {
    types.push("invoice_vs_last_purchase_display");
    notes.push(
      `bound qty=${invoiceQty} vs Last Purchase="${replay.lastPurchaseLabel}" (parsed ${lastPurchaseQty})`,
    );
  }

  if (
    ing &&
    sameGenericUnit &&
    !packRowExpansion &&
    qtyMismatch(lastPurchaseQty, catalogPurchaseQty)
  ) {
    types.push("last_purchase_display_vs_catalog_purchase_quantity");
    notes.push(
      `Last Purchase=${lastPurchaseQty} vs catalog purchase_quantity=${catalogPurchaseQty}`,
    );
  }

  // 3) usable/structure implies more outer units than purchase denominator
  const outerCount = outerContainerCountFromStructure(invoiceQty, replay);
  if (
    outerCount != null &&
    purchaseQtyForCost != null &&
    outerCount > purchaseQtyForCost + 0.001
  ) {
    types.push("usable_implies_more_units_than_purchased");
    notes.push(
      `structure outer count=${outerCount} > resolveCountablePurchaseQuantityForCost=${purchaseQtyForCost}`,
    );
  } else if (
    rowUnit &&
    GENERIC_COUNTABLE.has(rowUnit) &&
    isPackInnerCountMismatch(invoiceQty, replay) &&
    purchaseQtyForCost != null &&
    replay.purchaseContainerCount != null &&
    replay.purchaseContainerCount > purchaseQtyForCost
  ) {
    types.push("usable_implies_more_units_than_purchased");
    notes.push(
      `purchaseContainerCount=${replay.purchaseContainerCount} > purchaseQtyForCost=${purchaseQtyForCost}`,
    );
  }

  if (types.length === 0) continue;

  mismatches.push({
    ingredientId: ing?.id ?? null,
    ingredient: ing?.name ?? null,
    invoiceId: item.invoice_id,
    supplier: inv?.supplier_name ?? null,
    invoiceDate: inv?.invoice_date ?? null,
    invoiceItemId: item.id,
    lineName: norm.name,
    invoiceQuantity: invoiceQty,
    invoiceUnit: bound.unit,
    boundUnitPrice: bound.unit_price,
    boundTotal: bound.total,
    storedPurchaseQuantity: storedPurchaseQty,
    storedPurchaseUnit,
    catalogPurchaseQuantity: catalogPurchaseQty,
    lastPurchaseQuantity: lastPurchaseQty,
    lastPurchaseLabel: replay.lastPurchaseLabel,
    usableQuantity: replay.usableQuantity,
    usableQuantityUnit: replay.usableQuantityUnit,
    purchaseContainerCount: replay.purchaseContainerCount,
    purchaseQtyForCost,
    operationalCost: replay.operationalCostLabel,
    procurementCost: replay.procurementCostLabel,
    mismatchTypes: types,
    familyA: FAMILY_A_ITEM_IDS.has(item.id),
    notes,
  });
}

const matched = mismatches.filter((m) => m.ingredientId);
const familyA = mismatches.filter((m) => m.familyA);
const nonFamilyA = mismatches.filter((m) => !m.familyA);

const result = {
  generatedAt: new Date().toISOString(),
  vl: VL,
  methodology: {
    binding: "bindMonetaryColumns (production path) before replay",
    purchaseQty: "resolveCountablePurchaseQuantityForCost",
    scope: `${(items ?? []).length} invoice lines, ${(matches ?? []).filter((m) => m.status === "confirmed" || m.status === "auto_confirmed").length} confirmed matches`,
    criteriaNotes: {
      invoice_vs_stored:
        "Only when row unit and stored cost_base_unit are both generic countable (un/pcs) — excludes cx→inner-un expansion",
      usable_implies_more:
        "purchaseContainerCount tracks invoice qty but resolveCountablePurchaseQuantityForCost is lower (Family A signature)",
    },
  },
  counts: {
    totalMismatchRows: mismatches.length,
    matchedIngredientRows: matched.length,
    uniqueIngredients: new Set(matched.map((m) => m.ingredientId)).size,
    familyARows: familyA.length,
    nonFamilyARows: nonFamilyA.length,
    byMismatchType: Object.fromEntries(
      [
        "invoice_vs_stored_purchase_quantity",
        "invoice_vs_catalog_purchase_quantity",
        "invoice_vs_last_purchase_display",
        "last_purchase_display_vs_catalog_purchase_quantity",
        "usable_implies_more_units_than_purchased",
      ].map((t) => [t, mismatches.filter((m) => m.mismatchTypes.includes(t)).length]),
    ),
  },
  conclusion: {
    onlyRicottaMezziPreviouslyIdentified:
      familyA.length >= 2 && nonFamilyA.length === 0,
    familyAItemIds: [...FAMILY_A_ITEM_IDS],
    familyAFound: familyA.map((m) => m.lineName),
    additionalBeyondFamilyA: nonFamilyA.map((m) => ({
      ingredient: m.ingredient,
      lineName: m.lineName,
      types: m.mismatchTypes,
    })),
  },
  mismatches,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/mismatches.json`, JSON.stringify(result, null, 2));

console.log(
  JSON.stringify(
    {
      counts: result.counts,
      conclusion: result.conclusion,
      mismatches: mismatches.map((m) => ({
        ingredient: m.ingredient,
        line: m.lineName,
        qty: m.invoiceQuantity,
        stored: m.storedPurchaseQuantity,
        catalog: m.catalogPurchaseQuantity,
        usable: m.usableQuantity,
        types: m.mismatchTypes,
        familyA: m.familyA,
      })),
    },
    null,
    2,
  ),
);
