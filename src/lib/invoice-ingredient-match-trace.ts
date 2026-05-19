import type { IngredientCanonicalMatch } from "@/lib/ingredient-canonical";
import type { InvoiceRowIngredientMatchState } from "@/lib/ingredient-match-explanation";

declare global {
  interface Window {
    __MARGINLY_TRACE_INGREDIENT_MATCH__?: boolean;
  }
}

const TRACE_ROW_NAMES = new Set([
  "BATATA PALHA 2KG SERVICE",
  "PALHA SNACK FOOD SERVICE 2KG",
  "QUEIJO CHEDDAR AUCHAN 1KG",
]);

export function isInvoiceIngredientMatchTraceEnabled(): boolean {
  if (typeof window !== "undefined" && window.__MARGINLY_TRACE_INGREDIENT_MATCH__ === true) {
    return true;
  }
  return import.meta.env.DEV;
}

function shouldTraceRowName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  for (const sample of TRACE_ROW_NAMES) {
    if (upper.includes(sample)) return true;
  }
  return false;
}

export type InvoiceIngredientMatchTracePayload = {
  stage: string;
  rowId?: string;
  rawName?: string | null;
  resolvedName?: string | null;
  nameChanged?: boolean;
  ingredientCatalogLength?: number;
  match?: {
    kind: IngredientCanonicalMatch["kind"] | null;
    ingredientId: string | null;
    ingredientName: string | null;
    scoreBreakdown?: IngredientCanonicalMatch["scoreBreakdown"];
  } | null;
  display?: Pick<
    InvoiceRowIngredientMatchState,
    "displayState" | "possibleMatch" | "unmatched" | "showMatchTargetLine" | "badgeLabel"
  >;
};

export function traceInvoiceIngredientMatchPipeline(payload: InvoiceIngredientMatchTracePayload) {
  if (!isInvoiceIngredientMatchTraceEnabled()) return;

  const name = payload.resolvedName ?? payload.rawName;
  if (!shouldTraceRowName(name)) return;

  console.debug("[invoice-ingredient-pipeline]", payload);
}
