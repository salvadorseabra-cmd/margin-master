import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  getInvoiceRowIngredientMatchState,
  type InvoiceRowIngredientMatchState,
} from "@/lib/ingredient-match-explanation";
import { resolveInvoiceRowIngredientMatch } from "@/lib/invoice-ingredient-match-propagation";
import {
  resolveReadCutoverMatch,
  type InvoiceTableRowMatchCutoverContext,
} from "@/lib/invoice-item-match-read-cutover";

export type { InvoiceTableRowMatchCutoverContext };

/**
 * Single entry for ItemsTable row + summary: canonical lookup + presentation flags.
 * When read cutover is enabled and `cutover.persistedMatch` is supplied, persisted
 * invoice_item_matches wins over the virtual matcher.
 */
export function resolveInvoiceTableRowIngredientMatch(
  itemName: string,
  ingredientCatalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierName?: string | null,
  trace?: Parameters<typeof resolveInvoiceRowIngredientMatch>[4],
  cutover?: InvoiceTableRowMatchCutoverContext,
): {
  match: ReturnType<typeof resolveInvoiceRowIngredientMatch>["match"];
  state: InvoiceRowIngredientMatchState;
} {
  const virtual = resolveInvoiceRowIngredientMatch(
    itemName,
    ingredientCatalog,
    confirmedAliases,
    supplierName,
    trace,
  );

  const cutoverResult = resolveReadCutoverMatch({
    itemName,
    ingredientCatalog,
    virtualMatch: virtual.match,
    virtualState: virtual.state,
    cutover,
  });

  return {
    match: cutoverResult.match,
    state: cutoverResult.state,
  };
}

/** Maps display state to operational summary counters (ItemsTable header). */
export function invoiceRowMatchSummaryBucket(
  displayState: InvoiceRowIngredientMatchState["displayState"],
): "matched" | "suggested" | "unmatched" {
  if (displayState === "confirmed") return "matched";
  if (displayState === "suggested") return "suggested";
  return "unmatched";
}

export { getInvoiceRowIngredientMatchState, resolveInvoiceRowIngredientMatch };
