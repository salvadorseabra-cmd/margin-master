import type { OperationalIngredientCostSource } from "@/lib/resolve-operational-ingredient-cost";
import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";

const LOG_PREFIX = "[PRICING_AUDIT]";

export function shouldLogPricingAudit(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & { __MARGINLY_PRICING_AUDIT__?: boolean };
  return w.__MARGINLY_PRICING_AUDIT__ === true;
}

export type PricingAuditLogInput = {
  surface: string;
  ingredientId: string;
  ingredientName?: string | null;
  source: OperationalIngredientCostSource;
  unitPriceEur: number;
  resolvedPrice: number | null;
  purchaseQuantity: number | null;
  invoiceDate: string | null;
  /** True when source is not invoice though invoice overlay exists for another id. */
  fallbackFromInvoice?: boolean;
  catalogUnitPriceEur?: number | null;
  operationalUnitPriceEur?: number | null;
  catalogVsOperationalDeltaEur?: number | null;
  trigger?: string;
};

/** Gated diagnostics: DEV or `window.__MARGINLY_PRICING_AUDIT__ = true`. */
export function logPricingAudit(input: PricingAuditLogInput): void {
  if (!shouldLogPricingAudit()) return;
  console.info(LOG_PREFIX, {
    ...input,
    fallbackFromInvoice: input.fallbackFromInvoice ?? input.source !== "invoice",
  });
}

export function catalogVsOperationalUnitCosts(input: {
  catalogPrice: number | null;
  catalogPurchaseQuantity: number | null;
  operationalPrice: number | null;
  operationalPurchaseQuantity: number | null;
}): {
  catalogUnitPriceEur: number;
  operationalUnitPriceEur: number;
  catalogVsOperationalDeltaEur: number;
} {
  const catalogUnitPriceEur = effectiveIngredientUnitCostEur({
    current_price: input.catalogPrice,
    purchase_quantity: input.catalogPurchaseQuantity,
  });
  const operationalUnitPriceEur = effectiveIngredientUnitCostEur({
    current_price: input.operationalPrice,
    purchase_quantity: input.operationalPurchaseQuantity,
  });
  return {
    catalogUnitPriceEur,
    operationalUnitPriceEur,
    catalogVsOperationalDeltaEur: operationalUnitPriceEur - catalogUnitPriceEur,
  };
}
