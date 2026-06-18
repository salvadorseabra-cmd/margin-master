import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields";
import {
  defaultIsGenericUnit,
  operationalCostFieldsFromInvoiceLine,
} from "../src/lib/ingredient-auto-persist";
import {
  resolveInvoiceLinePurchaseUnit,
  resolveInvoicePersistedItemUnit,
  resolveInvoiceLinePurchaseFormat,
  structuredPurchaseToIngredientFields,
} from "../src/lib/invoice-purchase-format";
import { isExtractCostSyncAuthorizedMatch } from "../src/lib/ingredient-match-explanation";
import {
  isMatchLifecycleAliasAutoConfirmEnabled,
  isMatchLifecycleExtractGateEnabled,
} from "../src/lib/match-lifecycle-flags";
import { resolveInvoiceTableRowIngredientMatch } from "../src/lib/invoice-ingredient-row-display";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";

const VL = "bjhnlrgodcqoyzddbpbd";
const SUPPLIER = "Aviludo";
const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const APR = "c2f52357-0f80-491a-ba14-c97ff4837472";

const TARGETS = [
  { label: "Atum em óleo", id: "0f30ccb3-bb47-40bb-83cc-ae2a4018066d", nameHints: ["atum"] },
  { label: "Gema líquida", id: "32dbf47d-347c-45f3-bd9f-c6e90640e767", nameHints: ["gema", "ovo liquido"] },
  { label: "Anchoas", id: "c811f67f-df4d-4194-ba8b-7a15d4af38bd", nameHints: ["ancho", "anchov"] },
] as const;

function projectKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!
    .api_key;
}

function catalogPersistFieldsFromInvoiceLine(item: any, operational: any) {
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
      preferCatalogPackFields: false,
      catalogFields,
    };
  }
  return {
    purchase_quantity: catalogFields.purchase_quantity,
    purchase_unit: catalogFields.purchase_unit,
    preferCatalogPackFields: true,
    catalogFields,
  };
}

function replayLine(raw: any) {
  const normalized = normalizeInvoiceItemFields(raw);
  const insertUnit = resolveInvoicePersistedItemUnit(
    { name: normalized.name, unit: normalized.unit },
    defaultIsGenericUnit,
  );
  const purchaseUnitRes = resolveInvoiceLinePurchaseUnit(
    { name: normalized.name, quantity: normalized.quantity, unit: normalized.unit },
    defaultIsGenericUnit,
  );
  const structured = resolveInvoiceLinePurchaseFormat({
    name: normalized.name,
    quantity: normalized.quantity,
    unit: normalized.unit,
  });
  const operational = operationalCostFieldsFromInvoiceLine(normalized, { isGenericUnit: defaultIsGenericUnit });
  const catalogPersist = operational ? catalogPersistFieldsFromInvoiceLine(normalized, operational) : null;
  const persistPayload = operational
    ? {
        current_price: operational.current_price,
        purchase_quantity: catalogPersist!.purchase_quantity,
        purchase_unit: catalogPersist!.purchase_unit,
      }
    : null;
  return {
    raw,
    normalized,
    insertUnit,
    purchaseUnitRes,
    structured: {
      kind: structured.kind,
      purchaseContainerCount: structured.purchaseContainerCount,
      purchaseContainerUnit: structured.purchaseContainerUnit,
      packageQuantity: structured.packageQuantity,
      packageMeasurementUnit: structured.packageMeasurementUnit,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      usableQuantityUnit: structured.usableQuantityUnit,
      inferredBase: structured.inferred.base_unit,
      inferredPurchaseQty: structured.inferred.purchase_quantity,
      inferredPurchaseUnit: structured.inferred.purchase_unit,
      reason: structured.reason,
    },
    operational,
    catalogPersist,
    persistPayload,
    pq1PuUn: persistPayload?.purchase_quantity === 1 && persistPayload?.purchase_unit === "un",
  };
}

async function main() {
  const sb = createClient(`https://${VL}.supabase.co`, projectKey(), { auth: { persistSession: false } });
  const extractGate = isMatchLifecycleExtractGateEnabled();
  const aliasAuto = isMatchLifecycleAliasAutoConfirmEnabled();

  const [{ data: items }, { data: ings }, { data: aliases }, { data: invs }] = await Promise.all([
    sb.from("invoice_items").select("*").in("invoice_id", [MAY, APR]),
    sb.from("ingredients").select("id,name,unit,current_price,purchase_quantity,purchase_unit,base_unit"),
    sb.from("ingredient_aliases").select("ingredient_id,alias_name,normalized_alias,supplier_name,confirmed_by_user").eq("confirmed_by_user", true),
    sb.from("invoices").select("id,supplier_name,invoice_date").in("id", [MAY, APR]),
  ]);

  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select("status,ingredient_id,invoice_item_id,invoice_id")
    .in("invoice_id", [MAY, APR]);

  const confirmedAliases = buildConfirmedAliasMapFromRows(aliases ?? []);
  const invById = Object.fromEntries((invs ?? []).map((i) => [i.id, i]));

  const out: any[] = [];
  for (const t of TARGETS) {
    const ing = ings?.find((i) => i.id === t.id);
    const ingAliases = (aliases ?? []).filter((a) => a.ingredient_id === t.id);
    const ingMatches = (matches ?? []).filter((m) => m.ingredient_id === t.id);

    const candidateItems = (items ?? []).filter((it) =>
      t.nameHints.some((h) => it.name?.toLowerCase().includes(h)),
    );

    const replays = candidateItems.map((it) => {
      const inv = invById[it.invoice_id];
      const matchRow = ingMatches.find((m) => m.invoice_item_id === it.id);
      const matchCatalog = buildInvoiceMatchCatalog(ings ?? [], [{ name: it.name }]);
      const { match, state } = resolveInvoiceTableRowIngredientMatch(it.name, matchCatalog, confirmedAliases, SUPPLIER);
      const gatePass = Boolean(match) && isExtractCostSyncAuthorizedMatch(match!, { aliasAutoConfirm: aliasAuto });
      return {
        invoice_date: inv?.invoice_date,
        invoice_id: it.invoice_id,
        invoice_item_id: it.id,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        total: it.total,
        name: it.name,
        matchRow,
        matchInfo: {
          kind: match?.kind,
          ingredientId: match?.ingredient.id,
          correct: match?.ingredient.id === t.id,
          displayState: state.displayState,
          gatePass,
        },
        replay: replayLine({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          total: it.total,
        }),
      };
    });

    const latest = [...replays].sort((a, b) => (b.invoice_date ?? "").localeCompare(a.invoice_date ?? ""))[0];

    out.push({
      label: t.label,
      ingredientId: t.id,
      db: ing,
      aliases: ingAliases,
      allMatches: ingMatches,
      lines: replays,
      latest,
      headWouldCreatePq1PuUn: latest?.replay.pq1PuUn ?? false,
    });
  }

  console.log(JSON.stringify({ extractGate, aliasAuto, out }, null, 2));
}

main();
