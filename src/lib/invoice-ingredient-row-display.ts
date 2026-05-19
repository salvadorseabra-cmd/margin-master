import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import {
  getInvoiceRowIngredientMatchState,
  type InvoiceRowIngredientMatchState,
} from "@/lib/ingredient-match-explanation";
import { resolveInvoiceRowIngredientMatch } from "@/lib/invoice-ingredient-match-propagation";

/**
 * Single entry for ItemsTable row + summary: canonical lookup + presentation flags.
 */
export function resolveInvoiceTableRowIngredientMatch(
  itemName: string,
  ingredientCatalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierName?: string | null,
  trace?: Parameters<typeof resolveInvoiceRowIngredientMatch>[4],
): {
  match: ReturnType<typeof resolveInvoiceRowIngredientMatch>["match"];
  state: InvoiceRowIngredientMatchState;
} {
  return resolveInvoiceRowIngredientMatch(
    itemName,
    ingredientCatalog,
    confirmedAliases,
    supplierName,
    trace,
  );
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
