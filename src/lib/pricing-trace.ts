import type { BaseUnit, UnitFamily } from "@/lib/recipe-unit-normalization";
import type { OperationalIngredientCostSource } from "@/lib/resolve-operational-ingredient-cost";

const LOG_PREFIX = "[PRICING_TRACE]";
const USABLE_CONVERSION_PREFIX = "[USABLE_CONVERSION_TRACE]";
const DENSITY_CONVERSION_PREFIX = "[DENSITY_CONVERSION_TRACE]";
const UNIT_AUDIT_PREFIX = "[INGREDIENT_UNIT_AUDIT]";
const UNIT_NORMALIZATION_PREFIX = "[UNIT_NORMALIZATION_TRACE]";
const PRICING_RESOLVER_PREFIX = "[PRICING_RESOLVER_TRACE]";
export const PRICE_RESOLUTION_TRACE_PREFIX = "[PRICE_RESOLUTION_TRACE]";
const RENDERER_PRICE_PREFIX = "[RENDERER_PRICE_TRACE]";
const SURFACE_MISMATCH_PREFIX = "[SURFACE_MISMATCH]";
const OPERATIONAL_SCALE_TRACE_PREFIX = "[OPERATIONAL_SCALE_TRACE]";
const KETCHUP_UNIT_TRACE_PREFIX = "[KETCHUP_UNIT_TRACE]";

export type PricingConfidence =
  | "invoice_direct"
  | "invoice_converted"
  | "catalog_fallback"
  | "stale_price"
  | "unit_mismatch";

export type UnitFamilyDiagnosticCode =
  | "UNIT_FAMILY_MISMATCH"
  | "COUNTABLE_TO_WEIGHTED"
  | "HYBRID_CONVERSION_MISSING"
  | "MISSING_REFERENCE_WEIGHT"
  | "NO_USABLE_YIELD";

export function shouldLogPricingTrace(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & { __MARGINLY_PRICING_TRACE__?: boolean };
  return w.__MARGINLY_PRICING_TRACE__ === true;
}

export function shouldLogUnitAudit(): boolean {
  if (shouldLogPricingTrace()) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __MARGINLY_UNIT_AUDIT__?: boolean;
    __MARGINLY_PRICING_TRACE__?: boolean;
  };
  return w.__MARGINLY_UNIT_AUDIT__ === true || w.__MARGINLY_PRICING_TRACE__ === true;
}

export type IngredientUnitAuditMismatchReason =
  | "UNIT_FAMILY_MISMATCH"
  | "HYBRID_CONVERSION_MISSING"
  | "COUNTABLE_TO_WEIGHTED"
  | "MISSING_REFERENCE_WEIGHT"
  | "INFERRED_MASS_BASE_ON_COUNTABLE"
  | "GRAM_DENOMINATOR_ON_COUNTABLE"
  | null;

export function logIngredientUnitAudit(input: {
  ingredientId?: string | null;
  ingredientName?: string | null;
  recipeUnit?: string | null;
  canonicalUnit: BaseUnit;
  unitFamily: UnitFamily;
  pricingSource: OperationalIngredientCostSource;
  referenceWeightG?: number | null;
  referenceVolumeMl?: number | null;
  purchaseQuantity?: number | null;
  purchaseUnit?: string | null;
  mismatchReason: IngredientUnitAuditMismatchReason;
  pricingResolved: boolean;
  trigger?: string;
}): void {
  if (!shouldLogUnitAudit()) return;
  console.info(UNIT_AUDIT_PREFIX, {
    ingredientId: input.ingredientId ?? null,
    ingredientName: input.ingredientName ?? null,
    recipeUnit: input.recipeUnit ?? null,
    canonicalUnit: input.canonicalUnit,
    unitFamily: input.unitFamily,
    pricingSource: input.pricingSource,
    referenceWeightG: input.referenceWeightG ?? null,
    referenceVolumeMl: input.referenceVolumeMl ?? null,
    purchaseQuantity: input.purchaseQuantity ?? null,
    purchaseUnit: input.purchaseUnit ?? null,
    mismatchReason: input.mismatchReason,
    pricingResolved: input.pricingResolved,
    trigger: input.trigger ?? null,
  });
  if (shouldLogPricingTrace()) {
    console.info(`${LOG_PREFIX} [UNIT_AUDIT]`, {
      ingredient: input.ingredientName ?? input.ingredientId ?? null,
      canonicalUnit: input.canonicalUnit,
      mismatchReason: input.mismatchReason,
      pricingSource: input.pricingSource,
      trigger: input.trigger ?? null,
    });
  }
}

export type RecipeLinePricingTraceInput = {
  ingredientId?: string | null;
  ingredientName?: string | null;
  source: OperationalIngredientCostSource;
  invoiceDate?: string | null;
  purchaseUnit?: string | null;
  normalizedUnit?: BaseUnit | null;
  unitFamily?: UnitFamily | null;
  resolvedUnitCostEur: number;
  recipeQuantity: number;
  recipeUnit?: string | null;
  lineContributionEur: number;
  confidence: PricingConfidence;
  fallbackReason?: string | null;
  trigger?: string;
};

export function logRecipeLinePricingTrace(input: RecipeLinePricingTraceInput): void {
  if (!shouldLogPricingTrace()) return;
  console.info(LOG_PREFIX, {
    ingredient: input.ingredientName ?? input.ingredientId ?? null,
    invoiceSource: input.source,
    purchaseUnit: input.purchaseUnit ?? null,
    normalizedUnit: input.normalizedUnit ?? null,
    unitFamily: input.unitFamily ?? null,
    resolvedUnitCost: input.resolvedUnitCostEur,
    recipeQty: input.recipeQuantity,
    recipeUnit: input.recipeUnit ?? null,
    contribution: input.lineContributionEur,
    confidence: input.confidence,
    fallbackReason: input.fallbackReason ?? null,
    invoiceDate: input.invoiceDate ?? null,
    trigger: input.trigger ?? null,
  });
}

export function logUnitFamilyDiagnostic(input: {
  ingredientName?: string | null;
  purchaseUnitFamily: UnitFamily;
  recipeUnitFamily: UnitFamily;
  normalizedUnit?: BaseUnit | null;
  recipeUnit?: string | null;
  code: UnitFamilyDiagnosticCode;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  console.info(`${LOG_PREFIX} [UNIT_FAMILY]`, {
    ingredient: input.ingredientName ?? null,
    purchaseUnitFamily: input.purchaseUnitFamily,
    recipeUnitFamily: input.recipeUnitFamily,
    normalizedUnit: input.normalizedUnit ?? null,
    recipeUnit: input.recipeUnit ?? null,
    code: input.code,
    trigger: input.trigger ?? null,
  });
}

/** DEV guardrail: countable €/base below one cent often means g/un confusion. */
export function warnCountableUnitCostSuspiciouslyLow(input: {
  ingredientName?: string | null;
  unitFamily: UnitFamily;
  resolvedUnitCostEur: number;
  normalizedUnit?: BaseUnit | null;
}): void {
  if (!shouldLogPricingTrace()) return;
  if (input.unitFamily !== "countable") return;
  if (input.resolvedUnitCostEur >= 0.01) return;
  console.warn(`${LOG_PREFIX} countable unit cost below €0.01`, {
    ingredient: input.ingredientName ?? null,
    resolvedUnitCost: input.resolvedUnitCostEur,
    normalizedUnit: input.normalizedUnit ?? null,
  });
}

export function pricingConfidenceFromResolve(input: {
  source: OperationalIngredientCostSource;
  unitMismatch?: boolean;
  pricingResolved?: boolean;
  invoiceConverted?: boolean;
}): PricingConfidence {
  if (input.pricingResolved === false) return "catalog_fallback";
  if (input.unitMismatch) return "unit_mismatch";
  if (input.invoiceConverted && input.source === "invoice") return "invoice_converted";
  if (input.invoiceConverted) return "invoice_converted";
  if (input.source === "invoice") return "invoice_direct";
  if (input.source === "catalog") return "catalog_fallback";
  if (input.source === "embed") return "stale_price";
  return "catalog_fallback";
}

export function logDensityConversionTrace(input: {
  ingredientName?: string | null;
  recipeQuantity: number;
  recipeUnit?: string | null;
  operationalBaseUnit?: BaseUnit | null;
  gramsPerMl: number;
  recipeMassGrams?: number | null;
  recipeVolumeMl?: number | null;
  lineCostEur?: number | null;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  console.info(DENSITY_CONVERSION_PREFIX, {
    ingredient: input.ingredientName ?? null,
    recipeQty: input.recipeQuantity,
    recipeUnit: input.recipeUnit ?? null,
    operationalBaseUnit: input.operationalBaseUnit ?? null,
    gramsPerMl: input.gramsPerMl,
    recipeMassGrams: input.recipeMassGrams ?? null,
    recipeVolumeMl: input.recipeVolumeMl ?? null,
    lineCostEur: input.lineCostEur ?? null,
    trigger: input.trigger ?? null,
  });
}

export function logUsableConversionTrace(input: {
  ingredientName?: string | null;
  purchaseUnit?: string | null;
  operationalBaseUnit?: BaseUnit | null;
  recipeQuantity: number;
  recipeUnit?: string | null;
  usableWeightGrams?: number | null;
  usableVolumeMl?: number | null;
  conversionKind?: string | null;
  lineCostEur?: number | null;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  console.info(USABLE_CONVERSION_PREFIX, {
    ingredient: input.ingredientName ?? null,
    purchaseUnit: input.purchaseUnit ?? null,
    operationalBaseUnit: input.operationalBaseUnit ?? null,
    recipeQty: input.recipeQuantity,
    recipeUnit: input.recipeUnit ?? null,
    usableWeightGrams: input.usableWeightGrams ?? null,
    usableVolumeMl: input.usableVolumeMl ?? null,
    conversion: input.conversionKind ?? null,
    lineCostEur: input.lineCostEur ?? null,
    trigger: input.trigger ?? null,
  });
}

export function logUnitNormalizationTrace(input: {
  inputQuantity: number;
  inputUnit: string | null | undefined;
  baseQuantity: number;
  baseUnit: BaseUnit;
  reason: string;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  console.info(UNIT_NORMALIZATION_PREFIX, input);
}

/** DEV: per-line multiply/divide steps for operational unit scaling audits. */
export function logOperationalScaleTrace(input: {
  ingredientName?: string | null;
  packPriceEur?: number;
  purchaseQuantity?: number;
  costBaseUnit?: BaseUnit;
  resolvedOperationalUnitCostEur?: number | null;
  recipeQuantity?: number;
  recipeUnit?: string | null;
  recipeNormalizedQuantity?: number | null;
  recipeNormalizedUnit?: BaseUnit | null;
  path: string;
  lineCostEur: number | null;
  /** Prep propagation: batch € ÷ output ml × usage ml */
  batchTotalEur?: number | null;
  outputQuantityRaw?: number | null;
  outputUnitRaw?: string | null;
  outputNormalizedMl?: number | null;
  usageNormalizedMl?: number | null;
  divideBatchByOutputMl?: number | null;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  const pack = input.packPriceEur;
  const pq = input.purchaseQuantity;
  const unitCost = input.resolvedOperationalUnitCostEur;
  const normQty = input.recipeNormalizedQuantity;
  const lineCost = input.lineCostEur;
  const batch = input.batchTotalEur;
  const outputMl = input.outputNormalizedMl;
  const usageMl = input.usageNormalizedMl;
  console.info(OPERATIONAL_SCALE_TRACE_PREFIX, {
    ingredient: input.ingredientName ?? null,
    packPriceEur: pack ?? null,
    purchaseQuantity: pq ?? null,
    costBaseUnit: input.costBaseUnit ?? null,
    dividePackByPurchaseQty:
      pack != null && pq != null && Number.isFinite(pack) && Number.isFinite(pq) && pq > 0
        ? pack / pq
        : null,
    resolvedOperationalUnitCostEur: unitCost ?? null,
    recipeQuantity: input.recipeQuantity ?? null,
    recipeUnit: input.recipeUnit ?? null,
    recipeNormalizedQuantity: normQty ?? null,
    recipeNormalizedUnit: input.recipeNormalizedUnit ?? null,
    multiplyUnitCostByRecipeQty:
      unitCost != null && normQty != null ? unitCost * normQty : null,
    batchTotalEur: batch ?? null,
    outputQuantityRaw: input.outputQuantityRaw ?? null,
    outputUnitRaw: input.outputUnitRaw ?? null,
    outputNormalizedMl: outputMl ?? null,
    usageNormalizedMl: usageMl ?? null,
    divideBatchByOutputMl:
      batch != null &&
      outputMl != null &&
      Number.isFinite(batch) &&
      Number.isFinite(outputMl) &&
      outputMl > 0
        ? batch / outputMl
        : input.divideBatchByOutputMl ?? null,
    multiplyUsageByBatchPerMl:
      usageMl != null &&
      batch != null &&
      outputMl != null &&
      outputMl > 0 &&
      Number.isFinite(usageMl)
        ? usageMl * (batch / outputMl)
        : null,
    path: input.path,
    lineCostEur: lineCost,
    trigger: input.trigger ?? null,
  });
}

export function logPricingResolverTrace(input: {
  ingredientId?: string | null;
  ingredientName?: string | null;
  source: OperationalIngredientCostSource;
  resolved: boolean;
  unitCostEur: number | null;
  unresolvedReason?: string | null;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  console.info(PRICING_RESOLVER_PREFIX, input);
}

/** DEV: strict audit targets (Ketchup, Molho BBQ) — grep-friendly resolution trace. */
export function isPriceResolutionAuditTarget(input: {
  ingredientId?: string | null;
  ingredientName?: string | null;
  prepId?: string | null;
  prepName?: string | null;
}): boolean {
  const id = `${input.ingredientId ?? ""} ${input.prepId ?? ""}`.toLowerCase();
  const name = `${input.ingredientName ?? ""} ${input.prepName ?? ""}`.toLowerCase();
  if (/\bketchup\b|\bketch\b/.test(name) || /\bketchup\b/.test(id)) return true;
  if (/\bmolho\s*bbq\b|\bbarbecue\b/.test(name) || /\b(molho[-_]?)?bbq\b/.test(id)) return true;
  return false;
}

export type PriceResolutionTracePayload = {
  kind: "ingredient_line" | "prep_usage";
  ingredientId?: string | null;
  ingredientName?: string | null;
  prepId?: string | null;
  prepName?: string | null;
  source?: OperationalIngredientCostSource | null;
  pricingResolved: boolean;
  unresolvedReason: string | null;
  resolutionBranch: string;
  recipeQuantity?: number | null;
  recipeUnit?: string | null;
  current_price?: number | null;
  purchase_quantity?: number | null;
  cost_base_unit?: string | null;
  grams_per_ml?: number | null;
  usable_volume_ml?: number | null;
  unitCostEur?: number | null;
  lineCostEur?: number | null;
  batchTotalEur?: number | null;
  prepOutputQuantity?: number | null;
  prepOutputUnit?: string | null;
  trigger?: string | null;
};

export function logPriceResolutionTrace(input: PriceResolutionTracePayload): void {
  if (!shouldLogPricingTrace()) return;
  if (
    !isPriceResolutionAuditTarget({
      ingredientId: input.ingredientId,
      ingredientName: input.ingredientName,
      prepId: input.prepId,
      prepName: input.prepName,
    })
  ) {
    return;
  }
  console.info(PRICE_RESOLUTION_TRACE_PREFIX, input);
}

/** DEV: ketchup quantity chain — original, repaired, normalized, lineCost inputs. */
export function logKetchupUnitTrace(input: {
  ingredientName?: string | null;
  originalQuantity: number;
  recipeUnit?: string | null;
  normalizedQuantity?: number | null;
  normalizedUnit?: BaseUnit | null;
  displayQuantity?: number | null;
  lineCostInputs?: {
    quantity: number;
    recipeUnit: string | null;
    unitCostEur: number | null;
  };
  lineCostEur?: number | null;
  trigger?: string | null;
}): void {
  if (!import.meta.env.DEV) return;
  const name = `${input.ingredientName ?? ""}`.toLowerCase();
  if (!/\bketchup\b/.test(name)) return;
  console.info(KETCHUP_UNIT_TRACE_PREFIX, input);
}

export function logRendererPriceTrace(input: {
  surface: string;
  ingredientName?: string | null;
  unitCostEur: number | null;
  lineCostEur: number | null;
  unresolved: boolean;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  console.info(RENDERER_PRICE_PREFIX, input);
}

/** DEV: modal vs PDF (or other surfaces) must share the same resolved line costs. */
export function logSurfacePricingMismatch(input: {
  recipeId?: string | null;
  lineKey?: string | null;
  surfaceA: string;
  surfaceB: string;
  modalLineCost: number | null;
  pdfLineCost: number | null;
  modalUnitCost: number | null;
  pdfUnitCost: number | null;
  resolver: string;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  const lineCostMatch =
    input.modalLineCost === input.pdfLineCost ||
    (input.modalLineCost != null &&
      input.pdfLineCost != null &&
      Math.abs(input.modalLineCost - input.pdfLineCost) < 1e-6);
  const unitCostMatch =
    input.modalUnitCost === input.pdfUnitCost ||
    (input.modalUnitCost != null &&
      input.pdfUnitCost != null &&
      Math.abs(input.modalUnitCost - input.pdfUnitCost) < 1e-9);
  if (lineCostMatch && unitCostMatch) return;
  console.warn(SURFACE_MISMATCH_PREFIX, {
    recipeId: input.recipeId ?? null,
    lineKey: input.lineKey ?? null,
    surfaceA: input.surfaceA,
    surfaceB: input.surfaceB,
    modalLineCost: input.modalLineCost,
    pdfLineCost: input.pdfLineCost,
    modalUnitCost: input.modalUnitCost,
    pdfUnitCost: input.pdfUnitCost,
    resolver: input.resolver,
    trigger: input.trigger ?? null,
  });
  console.info(PRICING_RESOLVER_PREFIX, {
    recipeId: input.recipeId ?? null,
    lineKey: input.lineKey ?? null,
    resolver: input.resolver,
    trigger: input.trigger ?? "surface_mismatch",
  });
}
