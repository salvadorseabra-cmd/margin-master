/**
 * READ-ONLY Class A re-read repair feasibility validation — HEAD replay on live VL lines.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history";
import { isExtractCostSyncAuthorizedMatch } from "../src/lib/ingredient-match-explanation";
import {
  isMatchLifecycleAliasAutoConfirmEnabled,
  isMatchLifecycleExtractGateEnabled,
} from "../src/lib/match-lifecycle-flags";
import { resolveInvoiceTableRowIngredientMatch } from "../src/lib/invoice-ingredient-row-display";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import type { AutoPersistInvoiceItem } from "../src/lib/ingredient-auto-persist";

const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE = "ab52796d-de1d-418d-86e7-230c8f056f09";
const SUPPLIER = "Emporio Italia";

const TARGETS = [
  { label: "Prosciutto", ing: "b924480a", item: "70aaad81" },
  { label: "Bresaola", ing: "31d6da3f", item: "7e03e308" },
  { label: "Mortadella", ing: "9c853a47", item: "cf863733" },
  { label: "Ventricina", ing: "06cc0c4d", item: "ffa8e7ac" },
  { label: "Gorgonzola", ing: "1526106c", item: "56afc5b8" },
] as const;

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

function catalogPersistFieldsFromInvoiceLine(
  item: Pick<AutoPersistInvoiceItem, "name" | "quantity" | "unit" | "unit_price" | "total">,
  operational: OperationalIngredientCostFields,
) {
  const extractedUnit = item.unit?.trim() || null;
  const structured = resolveInvoiceLinePurchaseFormat({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  });
  const catalogFields = structuredPurchaseToIngredientFields(
    structured,
    extractedUnit,
    defaultIsGenericUnit,
  );
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
    };
  }
  return {
    purchase_quantity: catalogFields.purchase_quantity,
    purchase_unit: catalogFields.purchase_unit,
    base_unit: catalogFields.base_unit,
    unit: catalogFields.base_unit,
    preferCatalogPackFields: true,
  };
}

async function main() {
  // Suppress alias reload trace noise in harness output
  if (import.meta.env) import.meta.env.DEV = false;
  const sb = createClient(`https://${VL}.supabase.co`, projectKey("service_role"), {
    auth: { persistSession: false },
  });

  const [
    { data: items },
    { data: ings },
    { data: matches },
    { data: aliases },
    { data: history },
  ] = await Promise.all([
    sb
      .from("invoice_items")
      .select("id,name,quantity,unit,unit_price,total")
      .eq("invoice_id", INVOICE),
    sb
      .from("ingredients")
      .select("id,name,unit,current_price,purchase_quantity,purchase_unit,base_unit"),
    sb.from("invoice_item_matches").select("*").eq("invoice_id", INVOICE),
    sb.from("ingredient_aliases").select("ingredient_id,alias_name,normalized_alias,supplier_name,confirmed_by_user").eq("confirmed_by_user", true),
    sb
      .from("ingredient_price_history")
      .select("id,ingredient_id,invoice_id,new_price,new_purchase_quantity,created_at")
      .eq("invoice_id", INVOICE),
  ]);

  const confirmedAliases = buildConfirmedAliasMapFromRows(aliases ?? []);

  const matchCatalog = buildInvoiceMatchCatalog(
    ings ?? [],
    (items ?? []).map((r) => ({ name: r.name })),
  );
  const extractGate = isMatchLifecycleExtractGateEnabled();
  const aliasAuto = isMatchLifecycleAliasAutoConfirmEnabled();

  const results = [];
  for (const t of TARGETS) {
    const raw = items?.find((r) => r.id.startsWith(t.item));
    const ing = ings?.find((r) => r.id.startsWith(t.ing));
    const matchRow = matches?.find((m) => m.invoice_item_id?.startsWith(t.item));
    const histRows = (history ?? []).filter((h) => h.ingredient_id?.startsWith(t.ing));

    if (!raw || !ing) {
      results.push({ label: t.label, error: "missing row" });
      continue;
    }

    const ocrRaw = {
      name: raw.name,
      quantity: raw.quantity,
      unit: raw.unit,
      unit_price: raw.unit_price,
      total: raw.total,
    };
    const normalized = normalizeInvoiceItemFields(ocrRaw);
    const insertUnit = resolveInvoicePersistedItemUnit(
      { name: normalized.name, unit: normalized.unit },
      defaultIsGenericUnit,
    );
    const purchaseUnitRes = resolveInvoiceLinePurchaseUnit(
      { name: normalized.name, quantity: normalized.quantity, unit: normalized.unit },
      defaultIsGenericUnit,
    );

    const costSyncLine = {
      name: normalized.name,
      quantity: normalized.quantity,
      unit: insertUnit,
      unit_price: normalized.unit_price,
      total: normalized.total,
    };
    const operational = operationalCostFieldsFromInvoiceLine(costSyncLine, {
      isGenericUnit: defaultIsGenericUnit,
    });
    const catalogPersist = operational
      ? catalogPersistFieldsFromInvoiceLine({ ...normalized, unit: normalized.unit }, operational)
      : null;

    const { match, state } = resolveInvoiceTableRowIngredientMatch(
      normalized.name,
      matchCatalog,
      confirmedAliases,
      SUPPLIER,
    );
    const gatePass =
      Boolean(match) &&
      isExtractCostSyncAuthorizedMatch(match!, { aliasAutoConfirm: aliasAuto });

    const historyNewPrice = operational
      ? operationalUnitPriceForPriceHistory(
          operational.current_price,
          operational.purchase_quantity,
        )
      : null;

    const expectedFixed =
      insertUnit === "kg" &&
      operational?.purchase_quantity === 1000 &&
      operational?.cost_base_unit === "g";

    results.push({
      label: t.label,
      itemId: raw.id,
      ingId: ing.id,
      current: {
        invoice_items: { unit: raw.unit, quantity: raw.quantity, unit_price: raw.unit_price },
        ingredients: {
          unit: ing.unit,
          current_price: ing.current_price,
          purchase_quantity: ing.purchase_quantity,
          purchase_unit: ing.purchase_unit,
          base_unit: ing.base_unit,
        },
      },
      pipeline: {
        "1_ocrRaw": ocrRaw,
        "2_normalizeInvoiceItemFields": {
          quantity: normalized.quantity,
          unit: normalized.unit,
          unit_price: normalized.unit_price,
          total: normalized.total,
        },
        "3_resolveInvoicePersistedItemUnit": { unit: insertUnit, note: "insert path — no quantity passed" },
        "4_resolveInvoiceLinePurchaseUnit": purchaseUnitRes,
        "5_invoice_items_insert": {
          quantity: normalized.quantity,
          unit: insertUnit,
          unit_price: normalized.unit_price,
          total: normalized.total,
        },
        "6_operationalCostFieldsFromInvoiceLine": operational,
        "7_catalogPersistFieldsFromInvoiceLine": catalogPersist,
      },
      replay: {
        invoice_items: { unit: insertUnit },
        ingredients: catalogPersist
          ? {
              current_price: operational?.current_price,
              purchase_quantity: catalogPersist.purchase_quantity,
              purchase_unit: catalogPersist.purchase_unit,
              base_unit: catalogPersist.base_unit,
              preferCatalogPackFields: catalogPersist.preferCatalogPackFields,
            }
          : null,
        ingredient_price_history: { new_price: historyNewPrice },
      },
      costSync: {
        matchKind: match?.kind ?? null,
        matchedIngredientId: match?.ingredient.id ?? null,
        correctIngredient: match?.ingredient.id?.startsWith(t.ing) ?? false,
        displayState: state.displayState,
        extractGate,
        gatePass,
        wouldUpdateIngredient: gatePass && Boolean(operational),
      },
      blockers: {
        matchRow,
        matchCascadeOnReExtract: "invoice_item_matches CASCADE deleted on invoice_items DELETE — re-seeded via shadowSeedInvoiceItemMatchesAfterExtract",
        existingHistoryForInvoice: histRows,
        confirmedAliasesForIng: (aliases ?? []).filter(
          (a) => a.ingredient_id?.startsWith(t.ing) && a.confirmed_by_user,
        ),
      },
      verdict: {
        invoice_items: insertUnit === "kg" ? "YES" : "NO",
        ingredients: expectedFixed ? "YES" : "NO",
        fullyFixed: expectedFixed ? "YES" : "NO",
      },
    });
  }

  writeFileSync("/tmp/class-a-reread-results.json", JSON.stringify({ invoiceId: INVOICE, extractGate, aliasAuto, results }, null, 2));
  console.error(`Wrote /tmp/class-a-reread-results.json (${results.length} targets)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
