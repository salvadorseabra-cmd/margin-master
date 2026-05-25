import { effectiveIngredientUnitCostEur } from "@/lib/ingredient-unit-cost";
import type { OperationalInvoiceCostEntry } from "@/lib/ingredient-operational-intelligence";
import type { RecipeIngredientLineForCost } from "@/lib/recipe-prep-cost";

export type OperationalIngredientCostFields = {
  current_price: number | null;
  purchase_quantity: number | null;
};

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
  catalog: readonly { id: string; current_price?: number | null; purchase_quantity?: number | null }[],
): Map<string, OperationalIngredientCostFields> {
  const map = new Map<string, OperationalIngredientCostFields>();
  for (const row of catalog) {
    const id = row.id?.trim();
    if (!id) continue;
    map.set(id, {
      current_price: row.current_price ?? null,
      purchase_quantity: row.purchase_quantity ?? null,
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
  const w = window as Window & { __MARGINLY_RECIPE_CANONICAL_TRACE__?: boolean };
  return w.__MARGINLY_RECIPE_CANONICAL_TRACE__ === true;
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

/**
 * Latest matched invoice operational price wins over stale catalog / recipe embed snapshots.
 */
export function resolveOperationalIngredientCostFields(
  ingredientId: string,
  catalogById: Map<string, OperationalIngredientCostFields>,
  embed?: OperationalIngredientCostFields | null,
  invoiceById?: ReadonlyMap<string, OperationalInvoiceCostEntry>,
  logContext?: { trigger?: string },
): ResolveOperationalIngredientCostResult {
  const id = ingredientId.trim();
  const invoice = id ? invoiceById?.get(id) : undefined;
  const catalog = id ? catalogById.get(id) : undefined;

  let result: ResolveOperationalIngredientCostResult;
  if (invoice?.fields) {
    result = {
      fields: invoice.fields,
      source: "invoice",
      chosenDate: invoice.invoiceDate ?? null,
      latestInvoiceUnitCost: invoice.latestInvoiceUnitCost ?? null,
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

  if (id && logContext?.trigger) {
    logOperationalCostResolve({
      ingredientId: id,
      latestInvoiceUnitCost: result.latestInvoiceUnitCost,
      operationalUnitCostEur: effectiveIngredientUnitCostEur(result.fields),
      source: result.source,
      chosenDate: result.chosenDate,
      resolvedPrice: result.fields.current_price,
      purchaseQuantity: result.fields.purchase_quantity,
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
): number {
  const { fields } = resolveOperationalIngredientCostFields(
    ingredientId,
    catalogById,
    embed,
    invoiceById,
  );
  return effectiveIngredientUnitCostEur(fields);
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
  return { ...line, ingredients: fields };
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
  if (!import.meta.env.DEV) {
    if (typeof window === "undefined") return;
    const w = window as Window & { __MARGINLY_RECIPE_CANONICAL_TRACE__?: boolean };
    if (w.__MARGINLY_RECIPE_CANONICAL_TRACE__ !== true) return;
  }
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
