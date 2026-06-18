/**
 * READ-ONLY Class C investigation — Ginger Beer + Paccheri (Emporio ab52796d)
 */
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import {
  defaultIsGenericUnit,
  operationalCostFieldsFromInvoiceLine,
  type OperationalIngredientCostFields,
} from "../src/lib/ingredient-auto-persist";
import {
  resolveInvoiceLinePurchaseUnit,
  resolveInvoicePersistedItemUnit,
  resolveInvoiceLinePurchaseFormat,
  structuredPurchaseToIngredientFields,
} from "../src/lib/invoice-purchase-format";
import { parsePurchaseStructureFromText } from "../src/lib/stock-normalization";
import { detectVolume } from "../src/lib/ingredient-unit-inference";

const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE = "ab52796d-de1d-418d-86e7-230c8f056f09";

const TARGETS = [
  {
    label: "Ginger Beer",
    itemId: "9118d9ea-4f5d-42e3-a878-c0705de19732",
    ingId: null as string | null,
  },
  {
    label: "Paccheri",
    itemId: "af42cc64-78dc-4b8a-bebc-d368f5844a3c",
    ingId: "d7fcbb41",
  },
] as const;

function projectKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!
    .api_key;
}

function catalogPersistFieldsFromInvoiceLine(
  item: { name: string; quantity: number | null; unit: string | null; unit_price: number | null; total: number | null },
  operational: OperationalIngredientCostFields,
) {
  const extractedUnit = item.unit?.trim() || null;
  const structured = resolveInvoiceLinePurchaseFormat({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  });
  const catalogFields = structuredPurchaseToIngredientFields(structured, extractedUnit, defaultIsGenericUnit);
  const preferCatalogPackFields =
    catalogFields.purchase_unit === "un" &&
    operational.cost_base_unit !== "un" &&
    operational.purchase_quantity !== catalogFields.purchase_quantity;

  if (!preferCatalogPackFields) {
    return {
      purchase_quantity: operational.purchase_quantity,
      purchase_unit: operational.cost_base_unit,
      base_unit: operational.cost_base_unit,
      unit: operational.cost_base_unit,
      preferCatalogPackFields: false,
      catalogFields,
    };
  }
  return {
    purchase_quantity: catalogFields.purchase_quantity,
    purchase_unit: catalogFields.purchase_unit,
    base_unit: catalogFields.base_unit,
    unit: catalogFields.base_unit,
    preferCatalogPackFields: true,
    catalogFields,
  };
}

function replayLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const normalized = normalizeInvoiceItemFields(raw);
  const purchaseStructure = parsePurchaseStructureFromText(normalized.name);
  const detectVol = detectVolume(normalized.name);

  const structured = resolveInvoiceLinePurchaseFormat({
    name: normalized.name,
    quantity: normalized.quantity,
    unit: normalized.unit,
  });

  const purchaseUnitRes = resolveInvoiceLinePurchaseUnit(
    { name: normalized.name, quantity: normalized.quantity, unit: normalized.unit },
    defaultIsGenericUnit,
  );
  const insertUnit = resolveInvoicePersistedItemUnit(
    { name: normalized.name, quantity: normalized.quantity, unit: normalized.unit },
    defaultIsGenericUnit,
  );

  const costSyncLine = {
    name: normalized.name,
    quantity: normalized.quantity,
    unit: insertUnit ?? normalized.unit,
    unit_price: normalized.unit_price,
    total: normalized.total,
  };
  const operational = operationalCostFieldsFromInvoiceLine(costSyncLine, { isGenericUnit: defaultIsGenericUnit });
  const catalogPersist = operational ? catalogPersistFieldsFromInvoiceLine(normalized, operational) : null;

  return {
    normalized,
    purchaseStructure: purchaseStructure
      ? {
          tier: purchaseStructure.tier,
          purchaseQuantity: purchaseStructure.purchaseQuantity,
          unitSize: purchaseStructure.unitSize,
          unitMeasurement: purchaseStructure.unitMeasurement,
          totalUsableAmount: purchaseStructure.totalUsableAmount,
          usableUnit: purchaseStructure.usableUnit,
          matchedText: purchaseStructure.matchedText,
        }
      : null,
    detectVolume: detectVol,
    structured: {
      kind: structured.kind,
      purchaseContainerCount: structured.purchaseContainerCount,
      purchaseContainerUnit: structured.purchaseContainerUnit,
      packageQuantity: structured.packageQuantity,
      packageMeasurementUnit: structured.packageMeasurementUnit,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      usableQuantityUnit: structured.usableQuantityUnit,
      confidence: structured.confidence,
      reason: structured.reason,
      inferred: {
        base_unit: structured.inferred.base_unit,
        purchase_quantity: structured.inferred.purchase_quantity,
        purchase_unit: structured.inferred.purchase_unit,
        pack_size: structured.inferred.pack_size,
        pack_size_unit: structured.inferred.pack_size_unit,
        normalized_stock_quantity: structured.inferred.normalized_stock_quantity,
        stock_unit: structured.inferred.stock_unit,
        conversion_hint: structured.inferred.conversion_hint,
        reason: structured.inferred.reason,
      },
    },
    purchaseUnitRes,
    insertUnit,
    operational,
    catalogPersist,
    invoiceMath: {
      qty_x_unit_price: normalized.quantity != null && normalized.unit_price != null
        ? Number(normalized.quantity) * Number(normalized.unit_price)
        : null,
      stored_total: normalized.total,
      matches: normalized.quantity != null && normalized.unit_price != null && normalized.total != null
        ? Math.abs(Number(normalized.quantity) * Number(normalized.unit_price) - Number(normalized.total)) < 0.02
        : null,
    },
  };
}

async function main() {
  const sb = createClient(`https://${VL}.supabase.co`, projectKey(), { auth: { persistSession: false } });

  const [{ data: invoice }, { data: items }, { data: matches }, { data: ings }] = await Promise.all([
    sb.from("invoices").select("id,supplier_name,invoice_date").eq("id", INVOICE).maybeSingle(),
    sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total,created_at").eq("invoice_id", INVOICE),
    sb.from("invoice_item_matches").select("id,status,ingredient_id,invoice_item_id").eq("invoice_id", INVOICE),
    sb.from("ingredients").select("id,name,unit,current_price,purchase_quantity,purchase_unit,base_unit"),
  ]);

  const results = [];
  for (const t of TARGETS) {
    const raw = items?.find((r) => r.id === t.itemId);
    const matchRow = matches?.find((m) => m.invoice_item_id === t.itemId);
    const ing = t.ingId
      ? ings?.find((r) => r.id.startsWith(t.ingId))
      : matchRow?.ingredient_id
        ? ings?.find((r) => r.id === matchRow.ingredient_id)
        : null;

    if (!raw) {
      results.push({ label: t.label, error: "invoice_item not found" });
      continue;
    }

    const replay = replayLine(raw);

    results.push({
      label: t.label,
      task1_db: {
        invoice: { id: invoice?.id, supplier: invoice?.supplier_name, date: invoice?.invoice_date },
        invoice_item: {
          id: raw.id,
          invoice_id: raw.invoice_id,
          supplier: invoice?.supplier_name,
          name: raw.name,
          qty: raw.quantity,
          unit: raw.unit,
          unit_price: raw.unit_price,
          total: raw.total,
        },
        match: matchRow ?? null,
        ingredient: ing ?? null,
      },
      task2_replay: replay,
    });
  }

  console.log(JSON.stringify({ invoiceId: INVOICE, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
