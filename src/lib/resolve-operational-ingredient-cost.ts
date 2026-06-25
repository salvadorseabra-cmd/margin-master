import {
  effectiveIngredientUnitCostEur,
  inferIngredientCostBaseUnit,
  isOperationalPricingResolved,
  MISSING_OPERATIONAL_PRICING_LABEL,
  purchaseQuantityDenom,
  resolveIngredientGramsPerMl,
  resolvedOperationalUnitCostEur,
  type OperationalIngredientCostFields,
} from "@/lib/ingredient-unit-cost";
import {
  ingredientLineCostEur,
  recipeLineOperationalUnitCostEur,
  type IngredientLineCostContext,
} from "@/lib/recipe-prep-cost";
import { catalogVsOperationalUnitCosts, logPricingAudit } from "@/lib/pricing-audit";
import { isRecipeLineCostUnresolved } from "@/lib/recipe-pricing-state";
import {
  extractEmbeddedMeasureFromIngredientName,
  repairCountableEmbeddedWeightDenominator,
} from "@/lib/ingredient-unit-integrity-audit";
import {
  logIngredientUnitAudit,
  logPriceResolutionTrace,
  logPricingResolverTrace,
  shouldLogUnitAudit,
  type IngredientUnitAuditMismatchReason,
} from "@/lib/pricing-trace";
import { normalizeToBaseUnit, unitFamilyForBaseUnit } from "@/lib/recipe-unit-normalization";
import type { OperationalInvoiceCostEntry } from "@/lib/ingredient-operational-intelligence";
import type { RecipeIngredientLineForCost } from "@/lib/recipe-prep-cost";

export type { OperationalIngredientCostFields };

export type OperationalIngredientCostSource =
  | "invoice"
  | "catalog"
  | "embed"
  | "missing";

const COST_PROP_PREFIX = "[COST_PROP]";
const COST_RESOLVE_PREFIX = "[OPERATIONAL_COST_RESOLVE]";
/** DEV alias for operational source selection (same payload as COST_RESOLVE_PREFIX). */
const OPERATIONAL_RESOLVE_PREFIX = "[OPERATIONAL_RESOLVE]";
const COST_OVERWRITE_PREFIX = "[OPERATIONAL_COST_OVERWRITE]";
/** DEV alias when async pricing overwrites embed/catalog (same payload as COST_OVERWRITE_PREFIX). */
const RECIPE_COST_OVERWRITE_PREFIX = "[RECIPE_COST_OVERWRITE]";
const RECIPE_HYDRATE_PREFIX = "[RECIPE_HYDRATE]";

export function buildOperationalIngredientCostById(
  catalog: readonly {
    id: string;
    current_price?: number | null;
    purchase_quantity?: number | null;
    cost_base_unit?: OperationalIngredientCostFields["cost_base_unit"];
    usable_weight_grams?: number | null;
    usable_volume_ml?: number | null;
    reference_weight_grams?: number | null;
    reference_volume_ml?: number | null;
    density_g_per_ml?: number | null;
    grams_per_ml?: number | null;
    gramsPerMl?: number | null;
  }[],
): Map<string, OperationalIngredientCostFields> {
  const map = new Map<string, OperationalIngredientCostFields>();
  for (const row of catalog) {
    const id = row.id?.trim();
    if (!id) continue;
    map.set(id, {
      current_price: row.current_price ?? null,
      purchase_quantity: row.purchase_quantity ?? null,
      ...(row.cost_base_unit ? { cost_base_unit: row.cost_base_unit } : {}),
      ...(row.usable_weight_grams != null ? { usable_weight_grams: row.usable_weight_grams } : {}),
      ...(row.usable_volume_ml != null ? { usable_volume_ml: row.usable_volume_ml } : {}),
      ...(row.reference_weight_grams != null
        ? { reference_weight_grams: row.reference_weight_grams }
        : {}),
      ...(row.reference_volume_ml != null ? { reference_volume_ml: row.reference_volume_ml } : {}),
      ...(row.density_g_per_ml != null ? { density_g_per_ml: row.density_g_per_ml } : {}),
      ...(row.grams_per_ml != null ? { grams_per_ml: row.grams_per_ml } : {}),
      ...(row.gramsPerMl != null ? { gramsPerMl: row.gramsPerMl } : {}),
    });
  }
  return map;
}

export type ResolveOperationalIngredientCostResult = {
  fields: OperationalIngredientCostFields;
  source: OperationalIngredientCostSource;
  chosenDate: string | null;
  latestInvoiceUnitCost: number | null;
};

function shouldLogOperationalCostResolve(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __MARGINLY_RECIPE_CANONICAL_TRACE__?: boolean;
    __MARGINLY_PRICING_TRACE__?: boolean;
  };
  return (
    w.__MARGINLY_RECIPE_CANONICAL_TRACE__ === true || w.__MARGINLY_PRICING_TRACE__ === true
  );
}

/** Temporary structured diagnostics for operational cost source selection. */
export function logOperationalCostResolve(input: {
  ingredientId: string;
  latestInvoiceUnitCost: number | null;
  operationalUnitCostEur: number;
  source: OperationalIngredientCostSource;
  chosenDate: string | null;
  resolvedPrice: number | null;
  purchaseQuantity: number | null;
  trigger?: string;
}): void {
  if (!shouldLogOperationalCostResolve()) return;
  const payload = {
    ingredientId: input.ingredientId,
    latestInvoicePrice: input.latestInvoiceUnitCost,
    operationalUnitCostEur: input.operationalUnitCostEur,
    source: input.source,
    chosenDate: input.chosenDate,
    resolvedPrice: input.resolvedPrice,
    purchaseQuantity: input.purchaseQuantity,
    trigger: input.trigger ?? null,
  };
  console.info(COST_RESOLVE_PREFIX, payload);
  console.info(OPERATIONAL_RESOLVE_PREFIX, payload);
}

/** DEV: recipes list hydrated with catalog + invoice overlay before first paint. */
export function logRecipeHydrate(input: {
  recipeCount: number;
  catalogRowCount: number;
  overlayEntryCount: number;
  trigger?: string;
}): void {
  if (!shouldLogOperationalCostResolve()) return;
  console.info(RECIPE_HYDRATE_PREFIX, {
    recipeCount: input.recipeCount,
    catalogRowCount: input.catalogRowCount,
    overlayEntryCount: input.overlayEntryCount,
    trigger: input.trigger ?? "catalog_reload",
  });
}

/** Gram pack denominators from invoice/parser produce rows — not per-piece countable mis-tags (e.g. brioche 80g). */
const LEGITIMATE_GRAM_PACK_DENOMINATORS = new Set([100, 250, 500, 750, 1000]);

/**
 * Invoice overlay sometimes carries a legacy mass `cost_base_unit` while pack size is countable (`un`).
 * Prefer countable invoice semantics without changing pack price / quantity normalization.
 */
export function preferInvoiceCountableOverlayFields(
  fields: OperationalIngredientCostFields,
): OperationalIngredientCostFields {
  if (fields.cost_base_unit !== "g" && fields.cost_base_unit !== "ml") {
    return fields;
  }
  const pq = purchaseQuantityDenom(fields.purchase_quantity);
  // Genuine mass-based overlays (herbs, salad packs) — keep explicit g denominator.
  if (fields.cost_base_unit === "g" && LEGITIMATE_GRAM_PACK_DENOMINATORS.has(pq)) {
    return fields;
  }
  // Pack-volume ml (e.g. 450 ml jar) — not legacy g/un mis-tags.
  if (fields.cost_base_unit === "ml" && pq > 1 && pq < 1000) {
    return fields;
  }
  const { cost_base_unit: _legacyBase, ...withoutExplicitBase } = fields;
  if (inferIngredientCostBaseUnit(withoutExplicitBase) === "un") {
    return { ...withoutExplicitBase, cost_base_unit: "un" };
  }
  return fields;
}

function normalizeCountableOperationalCostFields(
  fields: OperationalIngredientCostFields,
  context?: { ingredientName?: string | null },
): OperationalIngredientCostFields {
  const withCountableBase = preferInvoiceCountableOverlayFields(fields);
  return repairCountableEmbeddedWeightDenominator(withCountableBase, context);
}

/**
 * Invoice/catalog price fields win per resolve order; ingredient-specific conversion metadata
 * (density, usable per unit) is merged from catalog/embed when absent on the chosen overlay.
 */
export function mergeOperationalCostMetadata(
  fields: OperationalIngredientCostFields,
  ...fallbacks: (OperationalIngredientCostFields | null | undefined)[]
): OperationalIngredientCostFields {
  let merged: OperationalIngredientCostFields = { ...fields };
  for (const fallback of fallbacks) {
    if (!fallback) continue;
    if (merged.usable_weight_grams == null && fallback.usable_weight_grams != null) {
      merged = { ...merged, usable_weight_grams: fallback.usable_weight_grams };
    }
    if (merged.usable_volume_ml == null && fallback.usable_volume_ml != null) {
      merged = { ...merged, usable_volume_ml: fallback.usable_volume_ml };
    }
    if (merged.reference_weight_grams == null && fallback.reference_weight_grams != null) {
      merged = { ...merged, reference_weight_grams: fallback.reference_weight_grams };
    }
    if (merged.reference_volume_ml == null && fallback.reference_volume_ml != null) {
      merged = { ...merged, reference_volume_ml: fallback.reference_volume_ml };
    }
    if (merged.density_g_per_ml == null && fallback.density_g_per_ml != null) {
      merged = { ...merged, density_g_per_ml: fallback.density_g_per_ml };
    }
    if (merged.grams_per_ml == null && fallback.grams_per_ml != null) {
      merged = { ...merged, grams_per_ml: fallback.grams_per_ml };
    }
    if (merged.gramsPerMl == null && fallback.gramsPerMl != null) {
      merged = { ...merged, gramsPerMl: fallback.gramsPerMl };
    }
  }
  return merged;
}

function shouldPreferEmbedOverLegacyCatalogMassBase(
  catalog: OperationalIngredientCostFields,
  embed: OperationalIngredientCostFields,
): boolean {
  if (!isOperationalPricingResolved(embed)) return false;
  const catalogBase = catalog.cost_base_unit ?? inferIngredientCostBaseUnit(catalog);
  const embedBase = embed.cost_base_unit ?? inferIngredientCostBaseUnit(embed);
  if (catalogBase !== "g" && catalogBase !== "ml") return false;
  return embedBase === "un";
}

/**
 * Latest matched invoice operational price wins over stale catalog / recipe embed snapshots.
 */
export function resolveOperationalIngredientCostFields(
  ingredientId: string,
  catalogById: Map<string, OperationalIngredientCostFields>,
  embed?: OperationalIngredientCostFields | null,
  invoiceById?: ReadonlyMap<string, OperationalInvoiceCostEntry>,
  logContext?: { trigger?: string; ingredientName?: string | null },
): ResolveOperationalIngredientCostResult {
  const id = ingredientId.trim();
  const invoice = id ? invoiceById?.get(id) : undefined;
  const catalog = id ? catalogById.get(id) : undefined;

  let result: ResolveOperationalIngredientCostResult;
  if (invoice?.fields) {
    result = {
      fields: normalizeCountableOperationalCostFields(invoice.fields, {
        ingredientName: logContext?.ingredientName,
      }),
      source: "invoice",
      chosenDate: invoice.invoiceDate ?? null,
      latestInvoiceUnitCost: invoice.latestInvoiceUnitCost ?? null,
    };
  } else if (catalog && embed && shouldPreferEmbedOverLegacyCatalogMassBase(catalog, embed)) {
    result = {
      fields: embed,
      source: "embed",
      chosenDate: null,
      latestInvoiceUnitCost: null,
    };
  } else if (catalog) {
    result = {
      fields: catalog,
      source: "catalog",
      chosenDate: null,
      latestInvoiceUnitCost: null,
    };
  } else if (embed) {
    result = {
      fields: embed,
      source: "embed",
      chosenDate: null,
      latestInvoiceUnitCost: null,
    };
  } else {
    result = {
      fields: { current_price: null, purchase_quantity: null },
      source: "missing",
      chosenDate: null,
      latestInvoiceUnitCost: null,
    };
  }

  result = {
    ...result,
    fields: normalizeCountableOperationalCostFields(
      mergeOperationalCostMetadata(result.fields, catalog, embed),
      { ingredientName: logContext?.ingredientName },
    ),
  };

  if (id && logContext?.trigger) {
    const operationalUnitCostEur = effectiveIngredientUnitCostEur(result.fields);
    logOperationalCostResolve({
      ingredientId: id,
      latestInvoiceUnitCost: result.latestInvoiceUnitCost,
      operationalUnitCostEur,
      source: result.source,
      chosenDate: result.chosenDate,
      resolvedPrice: result.fields.current_price,
      purchaseQuantity: result.fields.purchase_quantity,
      trigger: logContext.trigger,
    });
    const comparison = catalog
      ? catalogVsOperationalUnitCosts({
          catalogPrice: catalog.current_price,
          catalogPurchaseQuantity: catalog.purchase_quantity,
          operationalPrice: result.fields.current_price,
          operationalPurchaseQuantity: result.fields.purchase_quantity,
        })
      : null;
    logPricingAudit({
      surface: logContext.trigger,
      ingredientId: id,
      source: result.source,
      unitPriceEur: operationalUnitCostEur,
      resolvedPrice: result.fields.current_price,
      purchaseQuantity: result.fields.purchase_quantity,
      invoiceDate: result.chosenDate,
      fallbackFromInvoice: result.source !== "invoice",
      catalogUnitPriceEur: comparison?.catalogUnitPriceEur ?? null,
      operationalUnitPriceEur: comparison?.operationalUnitPriceEur ?? operationalUnitCostEur,
      catalogVsOperationalDeltaEur: comparison?.catalogVsOperationalDeltaEur ?? null,
      trigger: logContext.trigger,
    });
  }

  return result;
}

export function resolveOperationalIngredientUnitCostEur(
  ingredientId: string,
  catalogById: Map<string, OperationalIngredientCostFields>,
  embed?: OperationalIngredientCostFields | null,
  invoiceById?: ReadonlyMap<string, OperationalInvoiceCostEntry>,
  logContext?: { trigger?: string },
): number | null {
  const resolved = resolveOperationalIngredientCostFields(
    ingredientId,
    catalogById,
    embed,
    invoiceById,
    logContext,
  );
  const unitCostEur =
  resolved.fields
    ? ingredientLineCostEur(
        1,
        resolved.fields as NonNullable<RecipeIngredientLineForCost["ingredients"]>,
        {
          recipeUnit: resolved.fields.cost_base_unit ?? undefined,
          ingredientName: ingredientId,
        }
      )
    : null;
  if (logContext?.trigger) {
    logPricingResolverTrace({
      ingredientId,
      source: resolved.source,
      resolved: unitCostEur != null,
      unitCostEur,
      unresolvedReason:
        unitCostEur == null ? MISSING_OPERATIONAL_PRICING_LABEL : null,
      trigger: logContext.trigger,
    });
  }
  return unitCostEur;
}

export type ResolveRecipeLineOperationalCostResult = ResolveOperationalIngredientCostResult & {
  unitCostEur: number | null;
  lineCostEur: number | null;
  pricingResolved: boolean;
  unresolvedReason: string | null;
};

/**
 * Invoice multipack beverages often encode per-bottle volume as ml/pq while catalog stays `un`.
 * Recipe lines counted in `un` need countable fields for line costing; keep invoice overlay for display.
 */
export function recipeLineCostFieldsWhenInvoiceVolumeOverCatalogCountable(
  resolved: ResolveOperationalIngredientCostResult,
  catalog: OperationalIngredientCostFields | undefined,
  lineContext: IngredientLineCostContext,
): OperationalIngredientCostFields | null {
  if (resolved.source !== "invoice") return null;
  if (!catalog || !isOperationalPricingResolved(resolved.fields)) return null;

  const recipeNorm = lineContext.recipeUnit?.trim()
    ? normalizeToBaseUnit(1, lineContext.recipeUnit)
    : null;
  if (!recipeNorm || recipeNorm.baseUnit !== "un") return null;

  const catalogBase = catalog.cost_base_unit ?? inferIngredientCostBaseUnit(catalog);
  if (catalogBase !== "un") return null;

  const overlayBase =
    resolved.fields.cost_base_unit ?? inferIngredientCostBaseUnit(resolved.fields);
  if (overlayBase !== "ml") return null;

  const perPieceMl = purchaseQuantityDenom(resolved.fields.purchase_quantity);
  if (!(perPieceMl > 1 && perPieceMl < 1000)) return null;

  const bottleVolumeMl =
    resolved.fields.usable_volume_ml != null && resolved.fields.usable_volume_ml > 0
      ? resolved.fields.usable_volume_ml
      : perPieceMl;

  return mergeOperationalCostMetadata(
    {
      current_price: resolved.fields.current_price,
      purchase_quantity: 1,
      cost_base_unit: "un",
      usable_volume_ml: bottleVolumeMl,
    },
    catalog,
  );
}

/** Single bridge entry for line costing: aggregation, detail, summary, and audit paths. */
export function recipeLineCostFieldsForCosting(
  operationalFields: OperationalIngredientCostFields,
  catalog: OperationalIngredientCostFields | undefined,
  lineContext: IngredientLineCostContext,
  source: OperationalIngredientCostSource,
): OperationalIngredientCostFields {
  return (
    recipeLineCostFieldsWhenInvoiceVolumeOverCatalogCountable(
      {
        fields: operationalFields,
        source,
        chosenDate: null,
        latestInvoiceUnitCost: null,
      },
      catalog,
      lineContext,
    ) ?? operationalFields
  );
}

function priceResolutionAuditBranch(
  resolved: ResolveOperationalIngredientCostResult,
  lineContext: IngredientLineCostContext,
  pricingResolved: boolean,
  unresolvedReason: string | null,
): string {
  if (pricingResolved) return "resolved";
  if (resolved.source === "missing" || !isOperationalPricingResolved(resolved.fields)) {
    return "missing_operational_price";
  }
  if (unresolvedReason === "HYBRID_CONVERSION_MISSING") {
    const costBase = inferIngredientCostBaseUnit(resolved.fields, {
      ingredientName: lineContext.ingredientName,
    });
    const recipeNorm = normalizeToBaseUnit(1, lineContext.recipeUnit);
    if (
      recipeNorm?.baseUnit === "ml" &&
      costBase === "g" &&
      resolveIngredientGramsPerMl(resolved.fields) == null
    ) {
      return "density_missing_ml_recipe_weight_invoice";
    }
    if (recipeNorm?.baseUnit === "g" && costBase === "ml") {
      return "density_missing_g_recipe_volume_invoice";
    }
    return "hybrid_conversion_missing";
  }
  return unresolvedReason ?? "unresolved";
}

/**
 * Canonical recipe-line costing: invoice overlay → catalog → embed; never silent €0.
 */
export function resolveRecipeLineOperationalCost(
  ingredientId: string,
  quantity: number | null | undefined,
  catalogById: Map<string, OperationalIngredientCostFields>,
  embed?: OperationalIngredientCostFields | null,
  invoiceById?: ReadonlyMap<string, OperationalInvoiceCostEntry>,
  lineContext: IngredientLineCostContext & { trigger?: string } = {},
): ResolveRecipeLineOperationalCostResult {
  const resolved = resolveOperationalIngredientCostFields(
    ingredientId,
    catalogById,
    embed,
    invoiceById,
    {
      trigger: lineContext.trigger,
      ingredientName: lineContext.ingredientName,
    },
  );
  const catalog = ingredientId.trim() ? catalogById.get(ingredientId.trim()) : undefined;
  const lineCostFields = recipeLineCostFieldsForCosting(
    resolved.fields,
    catalog,
    lineContext,
    resolved.source,
  );
  const lineCostEur = ingredientLineCostEur(quantity, lineCostFields, {
    ...lineContext,
    source: resolved.source,
    invoiceDate: resolved.chosenDate,
  });
  const unitCostEur =
    recipeLineOperationalUnitCostEur(lineCostEur, quantity, lineContext.recipeUnit) ??
    resolvedOperationalUnitCostEur(resolved.fields);
  const pricingResolved = !isRecipeLineCostUnresolved(lineCostEur);
  const unresolvedReason = pricingResolved
    ? null
    : resolved.source === "missing" || !isOperationalPricingResolved(resolved.fields)
      ? MISSING_OPERATIONAL_PRICING_LABEL
      : lineCostEur == null && unitCostEur != null
        ? "HYBRID_CONVERSION_MISSING"
        : MISSING_OPERATIONAL_PRICING_LABEL;
  if (lineContext.trigger) {
    logPricingResolverTrace({
      ingredientId,
      ingredientName: lineContext.ingredientName,
      source: resolved.source,
      resolved: pricingResolved,
      unitCostEur,
      unresolvedReason,
      trigger: lineContext.trigger,
    });
  }

  logPriceResolutionTrace({
    kind: "ingredient_line",
    ingredientId,
    ingredientName: lineContext.ingredientName,
    source: resolved.source,
    pricingResolved,
    unresolvedReason,
    resolutionBranch: priceResolutionAuditBranch(
      resolved,
      lineContext,
      pricingResolved,
      unresolvedReason,
    ),
    recipeQuantity: quantity ?? null,
    recipeUnit: lineContext.recipeUnit ?? null,
    current_price: resolved.fields.current_price,
    purchase_quantity: resolved.fields.purchase_quantity,
    cost_base_unit: resolved.fields.cost_base_unit ?? inferIngredientCostBaseUnit(resolved.fields),
    grams_per_ml: resolveIngredientGramsPerMl(resolved.fields),
    usable_volume_ml: resolved.fields.usable_volume_ml ?? null,
    unitCostEur,
    lineCostEur,
    trigger: lineContext.trigger ?? null,
  });

  if (shouldLogUnitAudit()) {
    const canonicalUnit = inferIngredientCostBaseUnit(resolved.fields);
    const embedded = extractEmbeddedMeasureFromIngredientName(lineContext.ingredientName ?? "");
    const pq = Number(resolved.fields.purchase_quantity);
    let mismatchReason: IngredientUnitAuditMismatchReason = null;
    if (!pricingResolved) {
      if (unresolvedReason === "HYBRID_CONVERSION_MISSING") {
        mismatchReason = "HYBRID_CONVERSION_MISSING";
      } else if (unresolvedReason === MISSING_OPERATIONAL_PRICING_LABEL) {
        mismatchReason = null;
      } else {
        mismatchReason = "UNIT_FAMILY_MISMATCH";
      }
    }
    if (
      embedded.referenceWeightG != null &&
      Number.isFinite(pq) &&
      Math.abs(pq - embedded.referenceWeightG) < 0.01 &&
      canonicalUnit === "un"
    ) {
      mismatchReason = "GRAM_DENOMINATOR_ON_COUNTABLE";
    } else if (
      canonicalUnit === "g" &&
      unitFamilyForBaseUnit(canonicalUnit) === "weight" &&
      /\b(bun|brioche|pão|pao|lata)\b/i.test(lineContext.ingredientName ?? "")
    ) {
      mismatchReason = "INFERRED_MASS_BASE_ON_COUNTABLE";
    }
    if (!pricingResolved || mismatchReason != null) {
      logIngredientUnitAudit({
        ingredientId,
        ingredientName: lineContext.ingredientName,
        recipeUnit: lineContext.recipeUnit,
        canonicalUnit,
        unitFamily: unitFamilyForBaseUnit(canonicalUnit),
        pricingSource: resolved.source,
        referenceWeightG: embedded.referenceWeightG,
        referenceVolumeMl: embedded.referenceVolumeMl,
        purchaseQuantity: resolved.fields.purchase_quantity,
        purchaseUnit: lineContext.purchaseUnit ?? null,
        mismatchReason,
        pricingResolved,
        trigger: lineContext.trigger,
      });
    }
  }

  return {
    ...resolved,
    unitCostEur,
    lineCostEur,
    pricingResolved,
    unresolvedReason,
  };
}

/** DEV/trace: log when async operational pricing overwrites embed/catalog line cost. */
export function logOperationalCostOverwrite(input: {
  ingredientId: string;
  source: OperationalIngredientCostSource;
  beforeUnitCost: number;
  afterUnitCost: number;
  resolvedPrice: number | null;
  purchaseQuantity: number | null;
  lineQuantity: number | null | undefined;
  lineUnit?: string | null;
  beforeLineCost: number;
  afterLineCost: number;
  trigger?: string;
}): void {
  if (!shouldLogOperationalCostResolve()) return;
  const payload = {
    ingredientId: input.ingredientId,
    source: input.source,
    beforeUnitCost: input.beforeUnitCost,
    afterUnitCost: input.afterUnitCost,
    resolvedPrice: input.resolvedPrice,
    purchaseQuantity: input.purchaseQuantity,
    lineQuantity: input.lineQuantity ?? null,
    lineUnit: input.lineUnit ?? null,
    beforeLineCost: input.beforeLineCost,
    afterLineCost: input.afterLineCost,
    trigger: input.trigger ?? null,
  };
  console.info(COST_OVERWRITE_PREFIX, payload);
  console.info(RECIPE_COST_OVERWRITE_PREFIX, payload);
}

export function enrichRecipeIngredientLineForCost(
  line: RecipeIngredientLineForCost,
  catalogById: Map<string, OperationalIngredientCostFields>,
  invoiceById?: ReadonlyMap<string, OperationalInvoiceCostEntry>,
  logContext?: { trigger?: string },
): RecipeIngredientLineForCost {
  if (!line.ingredient_id) return line;
  const embed = line.ingredients;
  const resolved = resolveOperationalIngredientCostFields(
    line.ingredient_id,
    catalogById,
    embed,
    invoiceById,
    logContext,
  );
  const { fields, source } = resolved;
  const catalog = line.ingredient_id.trim()
    ? catalogById.get(line.ingredient_id.trim())
    : undefined;
  const lineCostFields = recipeLineCostFieldsForCosting(
    fields,
    catalog,
    { recipeUnit: line.unit },
    source,
  );
  if (embed && shouldLogOperationalCostResolve()) {
    const beforeUnitCost = effectiveIngredientUnitCostEur(embed);
    const afterUnitCost = effectiveIngredientUnitCostEur(fields);
    const qty = Number(line.quantity);
    const safeQty = Number.isFinite(qty) ? qty : 0;
    const beforeLineCost = safeQty * beforeUnitCost;
    const afterLineCost = safeQty * afterUnitCost;
    if (
      source !== "embed" &&
      (Math.abs(beforeUnitCost - afterUnitCost) > 1e-9 ||
        Math.abs(beforeLineCost - afterLineCost) > 0.01)
    ) {
      logOperationalCostOverwrite({
        ingredientId: line.ingredient_id,
        source,
        beforeUnitCost,
        afterUnitCost,
        resolvedPrice: fields.current_price,
        purchaseQuantity: fields.purchase_quantity,
        lineQuantity: line.quantity,
        lineUnit: line.unit,
        beforeLineCost,
        afterLineCost,
        trigger: logContext?.trigger,
      });
    }
  }
  return { ...line, ingredients: fields, lineCostFields };
}

export function enrichRecipeLinesForOperationalCost(
  lines: RecipeIngredientLineForCost[] | null | undefined,
  catalogById: Map<string, OperationalIngredientCostFields>,
  invoiceById?: ReadonlyMap<string, OperationalInvoiceCostEntry>,
  logContext?: { trigger?: string },
): RecipeIngredientLineForCost[] {
  return (lines ?? []).map((line) =>
    enrichRecipeIngredientLineForCost(line, catalogById, invoiceById, logContext),
  );
}

/** Live operational price fields for a recipe line (invoice → catalog → embed). */
export function operationalIngredientCostFieldsForLine(
  ingredientId: string,
  catalogById: Map<string, OperationalIngredientCostFields>,
  embed?: OperationalIngredientCostFields | null,
  invoiceById?: ReadonlyMap<string, OperationalInvoiceCostEntry>,
  logContext?: { trigger?: string },
): OperationalIngredientCostFields {
  return resolveOperationalIngredientCostFields(
    ingredientId,
    catalogById,
    embed,
    invoiceById,
    logContext,
  ).fields;
}

export const OPERATIONAL_INGREDIENT_COST_CHANGED_EVENT =
  "margin:operational-ingredient-cost-changed";

export function dispatchOperationalIngredientCostChanged(detail?: {
  ingredientId?: string;
  trigger?: string;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPERATIONAL_INGREDIENT_COST_CHANGED_EVENT, { detail }),
  );
}

export type CostPropLogInput = {
  trigger: string;
  ingredientId?: string | null;
  prepId?: string | null;
  lineCost?: number | null;
  totalFoodCost?: number | null;
  unitCostEur?: number | null;
  resolvedPrice?: number | null;
  purchaseQuantity?: number | null;
  source?: OperationalIngredientCostSource;
  chosenDate?: string | null;
  latestInvoiceUnitCost?: number | null;
  recipeId?: string | null;
};

/** Temporary structured diagnostics for cost propagation (DEV / trace flag). */
export function logCostProp(input: CostPropLogInput): void {
  if (!shouldLogOperationalCostResolve()) return;
  console.info(COST_PROP_PREFIX, {
    trigger: input.trigger,
    ingredientId: input.ingredientId ?? null,
    prepId: input.prepId ?? null,
    lineCost: input.lineCost ?? null,
    totalFoodCost: input.totalFoodCost ?? null,
    unitCostEur: input.unitCostEur ?? null,
    resolvedPrice: input.resolvedPrice ?? null,
    purchaseQuantity: input.purchaseQuantity ?? null,
    source: input.source ?? null,
    chosenDate: input.chosenDate ?? null,
    latestInvoiceUnitCost: input.latestInvoiceUnitCost ?? null,
    recipeId: input.recipeId ?? null,
  });
}
