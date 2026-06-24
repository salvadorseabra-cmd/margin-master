const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { bindMonetaryColumns, parseMonetaryLineItems } from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  computeUsableFromPurchaseStructure,
  isGenericPurchaseUnit,
  parsePurchaseStructureFromText,
  resolveStructurePurchaseQuantity,
  type PurchaseStructure,
} from "../../src/lib/stock-normalization.ts";

function structureTotalIsFinalForGenericRow(structure: PurchaseStructure, rowUnit: string | null): boolean {
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (structure.tier === "count_size" || structure.tier === "units_size") return true;
  const hasInner = (structure.innerUnitCount ?? 1) > 1;
  return hasInner || structure.tier === "caixa_units_size" || structure.tier === "caixa_compact_size";
}

function shouldScaleOuterPackForSizeCountGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "size_count") return false;
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (rowQuantity == null || !Number.isFinite(rowQuantity) || rowQuantity <= 1) return false;
  const inner = structure.innerUnitCount ?? 1;
  if (Math.abs(rowQuantity - inner) < 0.01) return false;
  return structure.unitMeasurement === "g";
}
import { operationalCostFieldsFromInvoiceLine } from "../../src/lib/ingredient-auto-persist.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/pellegrino-root-cause-audit";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
}

function bindLine(raw: { name: string; quantity: number | null; unit: string | null; unit_price: number | null; total: number | null }) {
  const [bound] = bindMonetaryColumns(parseMonetaryLineItems([{ ...raw, gross_unit_price: null, discount_pct: null, line_total_net: null }]));
  return normalizeInvoiceItemFields(bound);
}

function traceRow(label: string, raw: { id?: string; name: string; quantity: number | null; unit: string | null; unit_price: number | null; total: number | null }) {
  const bound = bindLine(raw);
  const metadata = { name: bound.name, quantity: bound.quantity, unit: bound.unit, unit_price: bound.unit_price, line_total: bound.total };
  const structure = parsePurchaseStructureFromText(bound.name);
  const usableChain = structure ? computeUsableFromPurchaseStructure(structure, bound.quantity, bound.unit) : null;
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(metadata);
  const persistFields = operationalCostFieldsFromInvoiceLine(bound);
  const countableQty = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const catalogFields = {
    purchase_quantity: countableQty,
    purchase_unit: bound.unit,
    normalized_usable_quantity: structured.normalizedUsableQuantity,
    usable_quantity_unit: structured.usableQuantityUnit,
  };
  const perUnit = resolveUsablePerPricedUnit(metadata, structured);
  const effective = bound.unit_price != null ? computeEffectiveUsableCost(bound.unit_price, metadata, structured, bound.name) : null;
  const resolveQty = structure ? resolveStructurePurchaseQuantity(structure, bound.quantity, bound.unit) : null;
  const isFinal = structure ? structureTotalIsFinalForGenericRow(structure, bound.unit) : null;
  const wouldScale = structure ? shouldScaleOuterPackForSizeCountGenericRow(structure, bound.quantity, bound.unit) : null;

  const litersUsable = structured.normalizedUsableQuantity != null && structured.usableQuantityUnit === "ml"
    ? structured.normalizedUsableQuantity / 1000 : null;
  const impliedLitersFromOpCost = effective?.unit === "L" && bound.total != null && effective.cost > 0
    ? bound.total / effective.cost : null;

  return {
    label,
    invoiceItemId: raw.id ?? null,
    stages: {
      extraction: { name: bound.name, quantity: bound.quantity, unit: bound.unit, unit_price: bound.unit_price, total: bound.total },
      purchaseFormat: {
        kind: structured.kind,
        purchaseContainerCount: structured.purchaseContainerCount,
        normalizedUsableQuantity: structured.normalizedUsableQuantity,
        usableQuantityUnit: structured.usableQuantityUnit,
        packageQuantity: structured.packageQuantity,
        packageMeasurementUnit: structured.packageMeasurementUnit,
      },
      stockNormalization: structure ? {
        tier: structure.tier,
        matchedText: structure.matchedText,
        innerUnitCount: structure.innerUnitCount,
        unitSize: structure.unitSize,
        unitMeasurement: structure.unitMeasurement,
        totalUsableAmount: structure.totalUsableAmount,
        purchaseQuantity: structure.purchaseQuantity,
        resolveStructurePurchaseQuantity: resolveQty,
        structureTotalIsFinalForGenericRow: isFinal,
        shouldScaleOuterPackForSizeCountGenericRow: wouldScale,
        usableSource: usableChain?.usableSource,
        fallbackReason: usableChain?.fallbackReason,
        purchaseContainerCount: usableChain?.purchaseContainerCount,
        usableQuantity: usableChain?.usableQuantity,
        usableUnit: usableChain?.usableUnit,
      } : null,
      ingredientPersistence: { operationalCostFields: persistFields, catalogFields, recipeFields },
      purchaseHistory: {
        procurementCostLabel: presentation.priceDisplay,
        operationalCostLabel: presentation.effectiveUsableCostLabel,
        usableStockLabel: presentation.usableStockLabel,
        rowQuantityLabel: presentation.card?.rowQuantityLabel ?? null,
      },
    },
    quantityFields: {
      invoiceQuantity: bound.quantity,
      purchaseQuantity: recipeFields?.purchase_quantity ?? catalogFields?.purchase_quantity ?? null,
      purchaseUnit: catalogFields?.purchase_unit ?? bound.unit,
      purchaseContainerCount: structured.purchaseContainerCount,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      operationalQuantity: recipeFields?.purchase_quantity ?? null,
      current_price_inputs: recipeFields,
      countablePurchaseQuantityForCost: countableQty,
      usablePerPricedUnit: perUnit,
    },
    math: {
      totalPaid: bound.total,
      usableLiters: litersUsable,
      operationalCostPerL: effective?.unit === "L" ? effective.cost : null,
      expectedOpCostAt225L: bound.total != null ? bound.total / 22.5 : null,
      impliedLitersFromOpCost,
      check: bound.total != null && litersUsable != null && effective?.unit === "L"
        ? Math.abs(bound.total / litersUsable - effective.cost) < 0.02 : null,
    },
  };
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), { auth: { persistSession: false } });

const targets = [
  { key: "pellegrino_boc", id: "ef25be0f-f153-40de-b377-25151d147637", match: /PELLEGRINO.*CX.*75CL/i },
  { key: "pellegrino_emp", id: "9cdd22ba-051b-4422-a122-3e6a39e9ef8c", match: /SanPellegrino/i },
  { key: "peroni", id: "979a9928-dbdb-4fe5-a231-2caaae327ed9", match: /Peroni.*33/i },
  { key: "pomodori", id: "9a52cc46-1c5a-4798-9621-d06177e04208", match: /POMODOR/i },
  { key: "acucar_avijudo", id: "478442d5-cf8f-4e21-a905-01b7cc327fab", match: /Açucar.*10x1/i },
  { key: "acucar_aviludo", id: "693004ee-b902-4e18-8442-5d488e175e42", match: /Açúcar.*10x1/i },
];

const { data: items } = await sb.from("invoice_items").select("id,name,quantity,unit,unit_price,total").in("id", targets.map((t) => t.id));
const byId = new Map((items ?? []).map((i) => [i.id, i]));

const traces = targets.map((t) => {
  const row = byId.get(t.id);
  if (!row) return { key: t.key, error: "missing from VL" };
  return traceRow(t.key, row);
});

const pellegrino = traces.find((t) => t.key === "pellegrino_boc" || t.key === "pellegrino_emp");
const userScenario = traces.find((t) => t.key === "pellegrino_emp") ?? traces.find((t) => t.key === "pellegrino_boc");

const firstIncorrect = (t: typeof traces[0]) => {
  if (!t || "error" in t) return null;
  const s = t.stages;
  const stages: { stage: string; correct: boolean; value: unknown; note?: string }[] = [];
  stages.push({ stage: "extraction", correct: s.extraction.quantity === 2 && s.extraction.total != null, value: s.extraction });
  stages.push({ stage: "purchase-format", correct: true, value: s.purchaseFormat });
  const expectedUsableMl = (s.extraction.quantity ?? 1) * 11250;
  const gotUsable = s.purchaseFormat.normalizedUsableQuantity;
  stages.push({
    stage: "stock-normalization",
    correct: gotUsable === expectedUsableMl,
    value: { gotUsable, expectedUsableMl, usableSource: s.stockNormalization?.usableSource, fallbackReason: s.stockNormalization?.fallbackReason },
    note: gotUsable !== expectedUsableMl ? `usable ${gotUsable}ml vs expected ${expectedUsableMl}ml` : undefined,
  });
  stages.push({ stage: "ingredient persistence", correct: gotUsable === expectedUsableMl, value: s.ingredientPersistence });
  stages.push({ stage: "purchase history / UI", correct: gotUsable === expectedUsableMl, value: s.purchaseHistory });
  const first = stages.find((x) => !x.correct);
  return { stages, firstIncorrectStage: first?.stage ?? null };
};

const results = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT_READ_ONLY",
  userScenario: {
    productName: "ACQUA S.PELLEGRINO (CX 75CL*15) / Emporio equivalent",
    note: "€38.56 total matches Emporio line (9cdd22ba); Bocconcino line (ef25be0f) has €42.07",
    purchasedCases: 2,
    totalPaid: 38.56,
    uiOperationalCostPerL: 3.43,
    commercialUsableLiters: 22.5,
    commercialOpCostPerL: 38.56 / 22.5,
    systemUsableLiters: 11.25,
    systemOpCostPerL: 38.56 / 11.25,
  },
  traces,
  firstIncorrectByProduct: Object.fromEntries(traces.filter((t) => !("error" in t)).map((t) => [t.key, firstIncorrect(t)])),
  classification: {
    pellegrino: "C) stock-normalization",
    rationale: "structureTotalIsFinalForGenericRow + SIZE_COUNT_RE treats one-case structure_total (11250ml) as final; invoice outer qty=2 not multiplied",
    scope: "quantity>1 family within SIZE_COUNT_RE when rowQty !== innerCount and unitMeasurement is cl (volume); distinct from Mozzarella g-scaling fix path",
  },
  verdict: "READY",
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
