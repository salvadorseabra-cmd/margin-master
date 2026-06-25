import { buildConfirmedAliasMapFromRows } from "../../src/lib/ingredient-alias-memory.ts";
import { resolveInvoiceTableRowIngredientMatch } from "../../src/lib/invoice-ingredient-row-display.ts";
import { isMatchLifecycleReadCutoverEnabled } from "../../src/lib/match-lifecycle-flags.ts";
import { validateInvoiceLine } from "../../src/lib/invoice-validation/engine.ts";
import {
  buildCutoverContextForInvoiceItem,
  buildPersistedMatchMapFromRows,
} from "../../src/lib/invoice-item-match-read-cutover.ts";

const itemName =
  "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg";
const supplier = "Emporio Italia";
const itemId = "5fab58a8-8cfc-4625-ab97-e956d07aade9";
const ingredient = {
  id: "1526106c-7bac-4b70-bd51-7b0fd5cc89ed",
  name: "Gorgonzola DOP dolce",
  normalized_name: "gorgonzola dop dolce",
};
const aliasRows = [
  {
    ingredient_id: ingredient.id,
    alias_name: itemName,
    normalized_alias: "arrigoni formaggi gorgonzoladop dolce linea castelfrigo",
    supplier_name: supplier,
    confirmed_by_user: true,
  },
];
const aliases = buildConfirmedAliasMapFromRows(aliasRows);
const matchRow = {
  invoice_item_id: itemId,
  ingredient_id: ingredient.id,
  status: "confirmed" as const,
  match_kind: "confirmed-override",
};
const map = buildPersistedMatchMapFromRows([matchRow]);

const virtual = resolveInvoiceTableRowIngredientMatch(
  itemName,
  [ingredient],
  aliases,
  supplier,
);
const cutover = resolveInvoiceTableRowIngredientMatch(
  itemName,
  [ingredient],
  aliases,
  supplier,
  undefined,
  buildCutoverContextForInvoiceItem(itemId, map),
);

const line = {
  id: itemId,
  name: itemName,
  quantity: 1.35,
  unit: "kg",
  unit_price: 9.95,
  total: 13.44,
};
const valVirtual = validateInvoiceLine({
  ...line,
  matchDisplayState: virtual.state.displayState,
});
const valCutover = validateInvoiceLine({
  ...line,
  matchDisplayState: cutover.state.displayState,
  matchedIngredientName: ingredient.name,
});

console.log(
  JSON.stringify(
    {
      readCutoverEnabled: isMatchLifecycleReadCutoverEnabled(),
      aliasKeys: Object.keys(aliases),
      virtual: {
        displayState: virtual.state.displayState,
        kind: virtual.match?.kind ?? null,
      },
      cutover: {
        displayState: cutover.state.displayState,
        kind: cutover.match?.kind ?? null,
      },
      valVirtualCodes: valVirtual.map((v) => v.code),
      valCutoverCodes: valCutover.map((v) => v.code),
    },
    null,
    2,
  ),
);
