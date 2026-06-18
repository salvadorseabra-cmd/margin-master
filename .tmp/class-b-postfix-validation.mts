/**
 * READ-ONLY Class B post-fix validation — no DB writes.
 */
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  defaultIsGenericUnit,
  operationalCostFieldsFromInvoiceLine,
  persistOperationalIngredientCostFromInvoiceLine,
} from "../src/lib/ingredient-auto-persist";
import {
  resolveInvoiceLinePurchaseFormat,
  structuredPurchaseToIngredientFields,
} from "../src/lib/invoice-purchase-format";
import { isExtractCostSyncAuthorizedMatch } from "../src/lib/ingredient-match-explanation";
import {
  isMatchLifecycleAliasAutoConfirmEnabled,
} from "../src/lib/match-lifecycle-flags";
import { resolveInvoiceTableRowIngredientMatch } from "../src/lib/invoice-ingredient-row-display";
import { buildInvoiceMatchCatalog } from "../src/lib/ingredient-canonical-synthesis";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";

const VL = "bjhnlrgodcqoyzddbpbd";
const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";
const SUPPLIER = "Aviludo";

const TARGETS = [
  { label: "Atum em óleo", id: "0f30ccb3-bb47-40bb-83cc-ae2a4018066d", nameHints: ["atum"] },
  { label: "Gema líquida", id: "32dbf47d-347c-45f3-bd9f-c6e90640e767", nameHints: ["gema", "ovo liquido", "ovo líquido"] },
  { label: "Anchoas", id: "c811f67f-df4d-4194-ba8b-7a15d4af38bd", nameHints: ["ancho", "anchov"] },
] as const;

function projectKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!
    .api_key;
}

/** Mirror of private catalogPersistFieldsFromInvoiceLine in ingredient-auto-persist.ts */
function catalogPersistFieldsFromInvoiceLine(
  item: { name: string; quantity: number | null; unit: string | null; unit_price: number | null; total?: number | null },
  operational: NonNullable<ReturnType<typeof operationalCostFieldsFromInvoiceLine>>,
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
      preferCatalogPackFields: false as const,
    };
  }
  return {
    purchase_quantity: catalogFields.purchase_quantity,
    purchase_unit: catalogFields.purchase_unit,
    base_unit: catalogFields.base_unit,
    unit: catalogFields.base_unit,
    preferCatalogPackFields: true as const,
  };
}

function createCaptureMockClient(ingredient: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => {
      if (table === "ingredients") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: ingredient, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(payload);
              return { error: null };
            },
          }),
        };
      }
      return {};
    },
  };
  return { client, updates };
}

async function simulatePersistUpdate(
  ingredientId: string,
  line: { name: string; quantity: number | null; unit: string | null; unit_price: number | null; total?: number | null },
  dbIng: Record<string, unknown>,
) {
  const { client, updates } = createCaptureMockClient({ ...dbIng });
  const result = await persistOperationalIngredientCostFromInvoiceLine(client as never, ingredientId, line, {
    isGenericUnit: defaultIsGenericUnit,
  });
  return { result, updatePayload: updates[0] ?? null };
}

async function main() {
  const sb = createClient(`https://${VL}.supabase.co`, projectKey(), { auth: { persistSession: false } });
  const aliasAuto = isMatchLifecycleAliasAutoConfirmEnabled();

  const [{ data: mayItems }, { data: ings }, { data: aliases }, { data: matches }] = await Promise.all([
    sb.from("invoice_items").select("*").eq("invoice_id", MAY),
    sb
      .from("ingredients")
      .select("id,name,unit,current_price,purchase_quantity,purchase_unit,base_unit")
      .in(
        "id",
        TARGETS.map((t) => t.id),
      ),
    sb.from("ingredient_aliases").select("ingredient_id,alias_name,normalized_alias,supplier_name,confirmed_by_user").eq("confirmed_by_user", true),
    sb
      .from("invoice_item_matches")
      .select("id,status,ingredient_id,invoice_item_id,invoice_id")
      .eq("invoice_id", MAY),
  ]);

  const confirmedAliases = buildConfirmedAliasMapFromRows(aliases ?? []);
  const catalog = buildInvoiceMatchCatalog(ings ?? [], (mayItems ?? []).map((i) => ({ name: i.name })));

  const report: Record<string, unknown> = { invoiceId: MAY, aliasAutoConfirm: aliasAuto, ingredients: [] as unknown[] };

  for (const t of TARGETS) {
    const dbIng = ings?.find((i) => i.id === t.id) ?? null;
    const candidateItems = (mayItems ?? []).filter((it) =>
      t.nameHints.some((h) => it.name?.toLowerCase().includes(h.toLowerCase())),
    );

    if (candidateItems.length === 0) {
      report.ingredients.push({ label: t.label, error: "no May invoice line found" });
      continue;
    }

    const item = candidateItems[0];
    const line = {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      total: item.total,
    };

    const operational = operationalCostFieldsFromInvoiceLine(line, { isGenericUnit: defaultIsGenericUnit });
    const catalogPersist = operational ? catalogPersistFieldsFromInvoiceLine(line, operational) : null;
    const includeCatalogUnitFields =
      catalogPersist?.preferCatalogPackFields || operational?.cost_base_unit === "un";

    const { result, updatePayload } = await simulatePersistUpdate(t.id, line, dbIng ?? {});

    const matchRow = (matches ?? []).find((m) => m.ingredient_id === t.id && m.invoice_item_id === item.id);
    const { match, state } = resolveInvoiceTableRowIngredientMatch(item.name, catalog, confirmedAliases, SUPPLIER);
    const gatePass = Boolean(match) && isExtractCostSyncAuthorizedMatch(match!, { aliasAutoConfirm: aliasAuto });
    const matchCorrect = match?.ingredient.id === t.id;

    const task2Pass =
      updatePayload &&
      updatePayload.purchase_quantity === 1 &&
      updatePayload.purchase_unit === "un" &&
      updatePayload.base_unit === "un" &&
      updatePayload.unit === "un";

    const stalePuG = dbIng?.purchase_unit === "g";
    const wouldRepair =
      stalePuG &&
      matchCorrect &&
      gatePass &&
      result.updated === true &&
      task2Pass === true &&
      (updatePayload as { purchase_unit?: string })?.purchase_unit === "un";

    report.ingredients.push({
      label: t.label,
      ingredientId: t.id,
      mayLine: {
        invoice_item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total: item.total,
      },
      pipeline: {
        step1_operationalCostFieldsFromInvoiceLine: operational
          ? {
              purchase_quantity: operational.purchase_quantity,
              cost_base_unit: operational.cost_base_unit,
              current_price: operational.current_price,
            }
          : null,
        step2_catalogPersistFieldsFromInvoiceLine: catalogPersist
          ? {
              purchase_quantity: catalogPersist.purchase_quantity,
              purchase_unit: catalogPersist.purchase_unit,
              base_unit: catalogPersist.base_unit,
              unit: catalogPersist.unit,
              preferCatalogPackFields: catalogPersist.preferCatalogPackFields,
            }
          : null,
        step3_includeCatalogUnitFields: includeCatalogUnitFields,
      },
      finalUpdatePayload: updatePayload,
      task2_allUnFields: task2Pass,
      currentDb: dbIng,
      comparison: {
        current_price: { db: dbIng?.current_price, replay: updatePayload?.current_price },
        purchase_quantity: { db: dbIng?.purchase_quantity, replay: updatePayload?.purchase_quantity },
        purchase_unit: { db: dbIng?.purchase_unit, replay: updatePayload?.purchase_unit },
        base_unit: { db: dbIng?.base_unit, replay: updatePayload?.base_unit },
        unit: { db: dbIng?.unit, replay: updatePayload?.unit },
      },
      reconfirmTrace: {
        matchRow: matchRow ?? null,
        matchKind: match?.kind ?? null,
        matchIngredientId: match?.ingredient.id ?? null,
        matchCorrect,
        displayState: state.displayState,
        extractGatePass: gatePass,
        persistIngredientCorrectionForItem_would_call: "persistOperationalIngredientCostFromInvoiceLine",
        wouldRepairStalePuG: wouldRepair,
      },
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
