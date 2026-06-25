/**
 * Full VL replay using production alias map builder (read-only).
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildConfirmedAliasMapFromRows } from "../../src/lib/ingredient-alias-memory.ts";
import { resolveInvoiceTableRowIngredientMatch } from "../../src/lib/invoice-ingredient-row-display.ts";
import { isMatchLifecycleReadCutoverEnabled, isMatchLifecycleDualWriteEnabled } from "../../src/lib/match-lifecycle-flags.ts";
import { validateInvoiceLine } from "../../src/lib/invoice-validation/engine.ts";
import {
  buildCutoverContextForInvoiceItem,
  buildPersistedMatchMapFromRows,
} from "../../src/lib/invoice-item-match-read-cutover.ts";
import { loadMatchingIngredientCatalog } from "../../src/lib/ingredient-catalog-load.ts";
import {
  loadIngredientPriceFieldsById,
  mergeIngredientPriceFields,
} from "../../src/lib/invoice-operational-metadata.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const ITEM_ID = "5fab58a8-8cfc-4625-ab97-e956d07aade9";
const SUPPLIER = "Emporio Italia";

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

const [{ data: item }, { data: matchRows }, { data: aliasRows }, catalogResult, priceById] =
  await Promise.all([
    sb.from("invoice_items").select("*").eq("id", ITEM_ID).single(),
    sb.from("invoice_item_matches").select("*").eq("invoice_item_id", ITEM_ID),
    sb
      .from("ingredient_aliases")
      .select("ingredient_id, alias_name, normalized_alias, supplier_name")
      .eq("confirmed_by_user", true),
    loadMatchingIngredientCatalog(sb),
    loadIngredientPriceFieldsById(sb),
  ]);

const catalog = mergeIngredientPriceFields(catalogResult.rows, priceById);
const aliases = buildConfirmedAliasMapFromRows(aliasRows ?? []);
const matchMap = buildPersistedMatchMapFromRows(matchRows ?? []);

const virtual = resolveInvoiceTableRowIngredientMatch(
  item!.name as string,
  catalog,
  aliases,
  SUPPLIER,
);
const cutover = resolveInvoiceTableRowIngredientMatch(
  item!.name as string,
  catalog,
  aliases,
  SUPPLIER,
  undefined,
  buildCutoverContextForInvoiceItem(ITEM_ID, matchMap),
);

const line = {
  id: item!.id as string,
  name: item!.name as string,
  quantity: Number(item!.quantity),
  unit: item!.unit as string,
  unit_price: Number(item!.unit_price),
  total: Number(item!.total),
};

const validationVirtual = validateInvoiceLine({
  ...line,
  matchDisplayState: virtual.state.displayState,
  matchedIngredientName: virtual.match?.ingredient.name ?? null,
});
const validationCutover = validateInvoiceLine({
  ...line,
  matchDisplayState: cutover.state.displayState,
  matchedIngredientName: cutover.match?.ingredient.name ?? null,
});

const out = {
  queriedAt: new Date().toISOString(),
  flags: {
    readCutover: isMatchLifecycleReadCutoverEnabled(),
    dualWrite: isMatchLifecycleDualWriteEnabled(),
  },
  db: {
    item,
    match: matchRows?.[0] ?? null,
    gorgonzolaAlias: (aliasRows ?? []).filter(
      (a) => a.ingredient_id === matchRows?.[0]?.ingredient_id,
    ),
  },
  resolution: {
    virtual: {
      displayState: virtual.state.displayState,
      kind: virtual.match?.kind ?? null,
      ingredientName: virtual.match?.ingredient.name ?? null,
    },
    cutoverWithFlagOff: {
      displayState: cutover.state.displayState,
      kind: cutover.match?.kind ?? null,
      note: "cutover context passed but flag off — should equal virtual",
    },
  },
  validation: {
    virtualCodes: validationVirtual.map((f) => f.code),
    cutoverCodes: validationCutover.map((f) => f.code),
  },
};

mkdirSync(".tmp/gorgonzola-final-closure", { recursive: true });
writeFileSync(".tmp/gorgonzola-final-closure/results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
