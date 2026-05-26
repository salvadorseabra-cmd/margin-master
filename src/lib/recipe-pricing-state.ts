import { formatCurrency, formatUnitCostCurrency } from "@/lib/display-format";
import {
  MISSING_OPERATIONAL_PRICING_LABEL,
  UNRESOLVED_COST_CELL,
} from "@/lib/ingredient-unit-cost";
import { shouldLogPricingTrace } from "@/lib/pricing-trace";
import {
  computeRecipeLineCostEur,
  sumResolvedRecipeFoodCostEur,
  type RecipeForPrepCost,
  type RecipeIngredientLineForCost,
} from "@/lib/recipe-prep-cost";
import {
  computeGrossMarginPct,
  formatOptionalMarginPercent,
  hasRecipeSellingPrice,
} from "@/lib/recipe-selling-price";

export type RecipePricingStatus = "resolved" | "partial" | "unresolved";

export type RecipePricingSummary = {
  status: RecipePricingStatus;
  /** Sum of resolved lines only; null when no line is priced. */
  resolvedFoodCostEur: number | null;
  unresolvedLineCount: number;
  resolvedLineCount: number;
  totalActiveLineCount: number;
  /** True when at least one active line lacks operational pricing. */
  costIncomplete: boolean;
};

export type RecipeLineCostInput = { lineCost: number | null };

export type RecipeCostLineWithIdentity = RecipeLineCostInput & {
  line?: {
    ingredient_id?: string | null;
    sub_recipe_id?: string | null;
  };
};

/** Modal cost rows: same resolved rule as row display; skips blank form lines. */
export function deriveRecipePricingSummaryFromCostLines(
  costLines: readonly RecipeCostLineWithIdentity[],
): RecipePricingSummary {
  const active = costLines.filter(
    (row) =>
      row.line == null ||
      Boolean(
        (row.line.ingredient_id && row.line.ingredient_id !== "") ||
          (row.line.sub_recipe_id && row.line.sub_recipe_id !== ""),
      ),
  );
  return deriveRecipePricingSummary(active);
}

export function deriveRecipePricingSummary(
  lines: readonly RecipeLineCostInput[],
): RecipePricingSummary {
  const { resolvedTotal, hasUnresolvedLines } = sumResolvedRecipeFoodCostEur(lines);
  let resolvedLineCount = 0;
  let unresolvedLineCount = 0;
  for (const line of lines) {
    if (line.lineCost != null && Number.isFinite(line.lineCost)) {
      resolvedLineCount += 1;
    } else {
      unresolvedLineCount += 1;
    }
  }

  let status: RecipePricingStatus;
  if (resolvedLineCount === 0) {
    status = "unresolved";
  } else if (hasUnresolvedLines || unresolvedLineCount > 0) {
    status = "partial";
  } else {
    status = "resolved";
  }

  return {
    status,
    resolvedFoodCostEur: resolvedLineCount > 0 ? resolvedTotal : null,
    unresolvedLineCount,
    resolvedLineCount,
    totalActiveLineCount: lines.length,
    costIncomplete: status !== "resolved",
  };
}

/** List-card / batch pricing from enriched recipe lines (partial totals allowed). */
export function computeRecipePricingSummaryFromRecipe(
  recipeId: string,
  linesByRecipe: Map<string, RecipeIngredientLineForCost[]>,
  recipesById: Map<string, RecipeForPrepCost>,
): RecipePricingSummary {
  const recipeLines = linesByRecipe.get(recipeId) ?? [];
  const activeLines = recipeLines.filter((line) => line.ingredient_id || line.sub_recipe_id);
  const path = new Set<string>();
  const memo = new Map<string, number>();
  const lineCosts = activeLines.map((line) => ({
    lineCost: computeRecipeLineCostEur(line, linesByRecipe, recipesById, path, memo),
  }));
  return deriveRecipePricingSummary(lineCosts);
}

export function recipeFoodCostForMargin(summary: RecipePricingSummary): number | null {
  return summary.resolvedFoodCostEur;
}

export function formatRecipeFoodCostDisplay(summary: RecipePricingSummary): string {
  if (summary.status === "unresolved") {
    return MISSING_OPERATIONAL_PRICING_LABEL;
  }
  const cost = summary.resolvedFoodCostEur ?? 0;
  if (summary.status === "partial") {
    return `${formatCurrency(cost)} (partial)`;
  }
  return formatCurrency(cost);
}

export function formatRecipeMarginDisplay(
  summary: RecipePricingSummary,
  sellingPrice: number | null | undefined,
): string {
  if (!hasRecipeSellingPrice(sellingPrice)) {
    return "—";
  }
  const foodCost = recipeFoodCostForMargin(summary);
  if (foodCost == null) {
    return "—";
  }
  const marginPct = computeGrossMarginPct(sellingPrice, foodCost);
  return formatPartialMarginDisplay(marginPct, summary.status === "partial");
}

export function formatPartialMarginDisplay(
  marginPct: number | null,
  isPartial: boolean,
): string {
  if (marginPct == null) return "—";
  const base = formatOptionalMarginPercent(marginPct);
  return isPartial ? `${base} (partial)` : base;
}

/** Footer note when contribution % is based on resolved lines only. */
export function formatContributionFooterLabel(summary: RecipePricingSummary): string | null {
  if (summary.status !== "partial") return null;
  const n = summary.unresolvedLineCount;
  const lineWord = n === 1 ? "line" : "lines";
  return `Contributions sum resolved lines only · ${summary.resolvedLineCount} of ${summary.totalActiveLineCount} priced · ${n} unresolved ${lineWord}`;
}

export function resolvedContributionSumPct(
  lines: readonly { lineCost: number | null; contribution: number }[],
): number {
  return lines
    .filter((line) => line.lineCost != null)
    .reduce((sum, line) => sum + line.contribution, 0);
}

/** Matches `sumResolvedRecipeFoodCostEur` / `deriveRecipePricingSummary` (line cost only). */
export function isRecipeLineCostUnresolved(lineCost: number | null | undefined): boolean {
  return lineCost == null || !Number.isFinite(lineCost);
}

/** Modal row / PDF cell: show em dash only when operational line cost is missing. */
export function recipeLineCostDisplayCell(lineCost: number | null | undefined): string {
  if (isRecipeLineCostUnresolved(lineCost)) return UNRESOLVED_COST_CELL;
  const value = Number(lineCost);
  if (value > 0 && value < 0.01) {
    return formatUnitCostCurrency(value);
  }
  return formatCurrency(value);
}

const PRICING_STATE_PREFIX = "[PRICING_STATE]";
const SURFACE_PRICE_STATE_PREFIX = "[SURFACE_PRICE_STATE]";

export function logRecipePricingState(input: {
  surface: string;
  recipeId?: string | null;
  summary: RecipePricingSummary;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  console.info(PRICING_STATE_PREFIX, {
    surface: input.surface,
    recipeId: input.recipeId ?? null,
    status: input.summary.status,
    resolvedTotal: input.summary.resolvedFoodCostEur,
    unresolvedCount: input.summary.unresolvedLineCount,
    resolvedCount: input.summary.resolvedLineCount,
    trigger: input.trigger ?? null,
  });
}

export function logSurfacePriceState(input: {
  recipeId?: string | null;
  lineId?: string | null;
  lineCost: number | null;
  pricingResolved?: boolean;
  displayCell: string;
  summaryStatus?: RecipePricingStatus;
  source?: string | null;
  unresolvedReason?: string | null;
  path?: "modal" | "pdf" | "card" | string | null;
  trigger?: string;
}): void {
  if (!import.meta.env.DEV) return;
  console.info(SURFACE_PRICE_STATE_PREFIX, {
    recipeId: input.recipeId ?? null,
    lineId: input.lineId ?? null,
    lineCost: input.lineCost,
    pricingResolved: input.pricingResolved ?? null,
    displayCell: input.displayCell,
    summaryStatus: input.summaryStatus ?? null,
    source: input.source ?? null,
    unresolvedReason: input.unresolvedReason ?? null,
    path: input.path ?? null,
    trigger: input.trigger ?? null,
  });
}

export function logSurfaceRecipePricingMismatch(input: {
  recipeId: string;
  surfaceA: string;
  summaryA: RecipePricingSummary;
  surfaceB: string;
  summaryB: RecipePricingSummary;
  trigger?: string;
}): void {
  if (!shouldLogPricingTrace()) return;
  const totalsMatch =
    input.summaryA.resolvedFoodCostEur === input.summaryB.resolvedFoodCostEur ||
    (input.summaryA.resolvedFoodCostEur != null &&
      input.summaryB.resolvedFoodCostEur != null &&
      Math.abs(input.summaryA.resolvedFoodCostEur - input.summaryB.resolvedFoodCostEur) < 1e-6);
  const match =
    input.summaryA.status === input.summaryB.status &&
    totalsMatch &&
    input.summaryA.unresolvedLineCount === input.summaryB.unresolvedLineCount;
  if (match) return;
  console.warn("[SURFACE_MISMATCH]", {
    recipeId: input.recipeId,
    surfaceA: input.surfaceA,
    surfaceB: input.surfaceB,
    statusA: input.summaryA.status,
    statusB: input.summaryB.status,
    resolvedTotalA: input.summaryA.resolvedFoodCostEur,
    resolvedTotalB: input.summaryB.resolvedFoodCostEur,
    unresolvedA: input.summaryA.unresolvedLineCount,
    unresolvedB: input.summaryB.unresolvedLineCount,
    trigger: input.trigger ?? null,
  });
}
