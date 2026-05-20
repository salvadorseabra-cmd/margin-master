import {
  findCanonicalIngredientMatch,
  type IngredientAliasMap,
  type IngredientCanonicalInput,
  type IngredientCanonicalMatch,
} from "@/lib/ingredient-canonical";
import { normalizeSupplierShorthand } from "@/lib/ingredient-operational-aliases";
import {
  getInvoiceRowIngredientMatchState,
  type InvoiceRowIngredientMatchState,
} from "@/lib/ingredient-match-explanation";
import {
  traceInvoiceIngredientMatchPipeline,
  type InvoiceIngredientMatchTracePayload,
} from "@/lib/invoice-ingredient-match-trace";
import {
  normalizeInvoiceItemFields,
  type InvoiceItemRow,
} from "@/lib/invoice-item-fields";

/** Mirrors `getItemIngredientMatch` in invoices.tsx (canonical lookup only). */
export function findInvoiceItemIngredientMatch(
  itemName: string,
  ingredientCatalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierName?: string | null,
): IngredientCanonicalMatch | null {
  const operationalName = normalizeSupplierShorthand(itemName);
  return findCanonicalIngredientMatch(
    operationalName,
    ingredientCatalog,
    confirmedAliases,
    supplierName,
  );
}

/**
 * End-to-end invoice row match resolution: canonical lookup + presentation state.
 * Mirrors the ItemsTable render pipeline after `normalizeInvoiceItemFields`.
 */
export function resolveInvoiceRowIngredientMatch(
  itemName: string,
  ingredientCatalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierName?: string | null,
  trace?: Pick<InvoiceIngredientMatchTracePayload, "stage" | "rowId" | "rawName">,
): {
  match: IngredientCanonicalMatch | null;
  state: InvoiceRowIngredientMatchState;
} {
  const match = findInvoiceItemIngredientMatch(
    itemName,
    ingredientCatalog,
    confirmedAliases,
    supplierName,
  );
  const state = getInvoiceRowIngredientMatchState(match);

  if (trace) {
    traceInvoiceIngredientMatchPipeline({
      ...trace,
      resolvedName: itemName,
      ingredientCatalogLength: ingredientCatalog.length,
      match: match
        ? {
            kind: match.kind,
            ingredientId: match.ingredient.id ?? null,
            ingredientName: match.ingredient.name ?? null,
            scoreBreakdown: match.scoreBreakdown,
          }
        : null,
      display: {
        displayState: state.displayState,
        possibleMatch: state.possibleMatch,
        unmatched: state.unmatched,
        showMatchTargetLine: state.showMatchTargetLine,
        badgeLabel: state.badgeLabel,
      },
    });
  }

  return { match, state };
}

/** Full ItemsTable pipeline: normalize row fields, then canonical lookup + display state. */
export function resolveInvoiceTableRowFromItem(
  item: Partial<InvoiceItemRow> & Pick<InvoiceItemRow, "id">,
  ingredientCatalog: IngredientCanonicalInput[],
  confirmedAliases: IngredientAliasMap = {},
  supplierName?: string | null,
  traceStage = "resolve-from-item",
) {
  const rawName = item.name ?? "";
  const rowItem = normalizeInvoiceItemFields(item);
  traceInvoiceIngredientMatchPipeline({
    stage: `${traceStage}:after-normalize`,
    rowId: rowItem.id,
    rawName,
    resolvedName: rowItem.name,
    nameChanged: rawName !== rowItem.name,
    ingredientCatalogLength: ingredientCatalog.length,
  });
  return resolveInvoiceRowIngredientMatch(
    rowItem.name,
    ingredientCatalog,
    confirmedAliases,
    supplierName,
    {
      stage: `${traceStage}:after-canonical`,
      rowId: rowItem.id,
      rawName,
    },
  );
}

/** Pre-fix invoices.tsx treated only semantic matches as possible suggestions. */
export function legacyInvoiceRowPossibleMatch(
  match: IngredientCanonicalMatch | null,
): IngredientCanonicalMatch | null {
  return match?.kind === "semantic" ? match : null;
}
