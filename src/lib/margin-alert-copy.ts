import { formatCurrency, formatPercent } from "@/lib/display-format";

export type MarginAlertKind =
  | "recipe_below_target"
  | "recipe_margin_deterioration"
  | "ingredient_inflation_spike"
  | "price_increase"
  | "supplier_trend"
  | "cost_concentration"
  | "prep_cascade"
  | "price_decrease"
  | "volatile_pricing"
  | "stale_price"
  | "shared_ingredient"
  | "recent_update"
  | "portfolio_margin_loss";

export type MarginAlertAction = {
  suggestedAction: string;
  actionLabel: string;
};

export type PriceHistoryRowForTemporal = {
  ingredient_id: string;
  previous_price: number | null;
  new_price: number | null;
  delta_percent: number | null;
  created_at: string;
};

function numberOrNull(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Exposure copy — replaces "dominates recipe" framing. */
export function formatCostExposureTitle(
  ingredientName: string,
  recipeName: string,
  contributionPct: number,
): string {
  if (contributionPct >= 70) {
    return `${ingredientName} drives ${formatPercent(contributionPct)} of ${recipeName} cost`;
  }
  return `${ingredientName} is ${formatPercent(contributionPct)} of ${recipeName} food cost`;
}

export function formatCostExposureContext(
  contributionPct: number,
  recipeName: string,
  lineCost: number,
): string {
  return `This line accounts for ${formatPercent(contributionPct)} of ${recipeName}'s food cost (${formatCurrency(lineCost)} per portion). A price or yield shift here moves margin quickly.`;
}

export function formatPrepExposureTitle(prepName: string, parentCount: number): string {
  return `${prepName} feeds ${parentCount} menu ${parentCount === 1 ? "recipe" : "recipes"}`;
}

export function formatPrepExposureContext(
  prepName: string,
  parentNames: string[],
  parentCount: number,
): string {
  const sample = parentNames.slice(0, 3).join(", ");
  const suffix = parentCount > 3 ? ` and ${parentCount - 3} more` : "";
  return `Sub-recipe "${prepName}" is embedded in ${parentCount} costing${parentCount === 1 ? "" : "s"}${sample ? ` (${sample}${suffix})` : ""}. Ingredient moves inside this prep cascade to every parent dish.`;
}

export function formatPriceIncreaseContext(
  ingredientName: string,
  recipeCount: number,
  supplier?: string | null,
): string {
  const supplierBit = supplier ? ` from ${supplier}` : "";
  const recipeBit =
    recipeCount > 0 ? ` Used in ${recipeCount} recipe${recipeCount === 1 ? "" : "s"}.` : "";
  return `Latest invoice pricing${supplierBit} is above the prior recorded unit cost for ${ingredientName}.${recipeBit}`;
}

export function formatPriceDecreaseContext(ingredientName: string, recipeCount: number): string {
  const recipeBit =
    recipeCount > 0
      ? ` ${recipeCount} linked recipe${recipeCount === 1 ? "" : "s"} may see margin relief.`
      : "";
  return `Invoice sync recorded a lower unit cost for ${ingredientName}.${recipeBit}`;
}

/**
 * Temporal line such as "+8% this month" — only when two or more history rows
 * exist within the window and prices can be compared.
 */
export function formatTemporalPriceChange(
  ingredientId: string,
  history: readonly PriceHistoryRowForTemporal[],
  windowDays = 30,
): string | undefined {
  const sinceMs = Date.now() - windowDays * 86_400_000;
  const rows = history
    .filter(
      (row) => row.ingredient_id === ingredientId && new Date(row.created_at).getTime() >= sinceMs,
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (rows.length < 2) return undefined;

  const firstRow = rows[0]!;
  const lastRow = rows[rows.length - 1]!;
  const baseline = numberOrNull(firstRow.previous_price) ?? numberOrNull(firstRow.new_price);
  const latest = numberOrNull(lastRow.new_price);
  if (baseline == null || latest == null || baseline <= 0) return undefined;

  const pct = ((latest - baseline) / baseline) * 100;
  if (Math.abs(pct) < 0.5) return undefined;

  const period =
    windowDays <= 7 ? "this week" : windowDays <= 31 ? "this month" : `last ${windowDays} days`;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}% ${period}`;
}

export function getSuggestedAction(
  kind: MarginAlertKind,
  ctx?: { critical?: boolean },
): MarginAlertAction {
  switch (kind) {
    case "recipe_below_target":
      return ctx?.critical
        ? {
            suggestedAction: "Reprice or reformulate before the next menu cycle.",
            actionLabel: "Review menu pricing",
          }
        : {
            suggestedAction: "Check portions and substitute lines before repricing.",
            actionLabel: "Review portion size",
          };
    case "recipe_margin_deterioration":
      return {
        suggestedAction: "Adjust portions, substitute SKUs, or update the menu price.",
        actionLabel: "Review recipe costing",
      };
    case "ingredient_inflation_spike":
      return {
        suggestedAction: "Re-quote the supplier line and rebalance recipes that over-use this SKU.",
        actionLabel: "Compare suppliers",
      };
    case "price_increase":
      return {
        suggestedAction: "Compare supplier pricing and check linked recipe margins.",
        actionLabel: "Compare suppliers",
      };
    case "supplier_trend":
      return {
        suggestedAction:
          "Review basket pricing with alternate suppliers and pass selective menu updates.",
        actionLabel: "Review supplier basket",
      };
    case "cost_concentration":
      return {
        suggestedAction: "Validate yield and portion weight on the dominant cost line.",
        actionLabel: "Review portion",
      };
    case "prep_cascade":
      return {
        suggestedAction:
          "Review prep batch yield and ingredient lines — changes propagate to parent dishes.",
        actionLabel: "Review prep recipe",
      };
    case "price_decrease":
      return {
        suggestedAction: "Confirm the lower price is locked in and refresh recipe margins.",
        actionLabel: "Review ingredient",
      };
    case "volatile_pricing":
      return {
        suggestedAction: "Lock contracted prices or add buffer on dependent menu items.",
        actionLabel: "Review volatile SKUs",
      };
    case "stale_price":
      return {
        suggestedAction: "Upload or sync the next invoice to refresh catalog pricing.",
        actionLabel: "Monitor next invoice",
      };
    case "shared_ingredient":
      return {
        suggestedAction: "Track invoice moves on this SKU — one change affects multiple costings.",
        actionLabel: "Review ingredient usage",
      };
    case "recent_update":
      return {
        suggestedAction: "Spot-check linked recipes after the latest price sync.",
        actionLabel: "Review recipes",
      };
    case "portfolio_margin_loss":
      return {
        suggestedAction:
          "Prioritize repricing or reformulating the largest per-portion hits first.",
        actionLabel: "Review portfolio",
      };
    default:
      return {
        suggestedAction: "Review the linked costing or supplier line.",
        actionLabel: "Review",
      };
  }
}

export function formatVisitDeltaLine(
  kind: "critical" | "price_increases" | "below_target" | "total",
  delta: number,
): string | null {
  if (delta === 0) return null;
  const abs = Math.abs(delta);
  const noun =
    kind === "critical"
      ? `critical risk${abs === 1 ? "" : "s"}`
      : kind === "price_increases"
        ? `price increase${abs === 1 ? "" : "s"}`
        : kind === "below_target"
          ? `recipe${abs === 1 ? "" : "s"} below target`
          : `active signal${abs === 1 ? "" : "s"}`;
  if (delta > 0) return `${abs} new ${noun}`;
  return `${abs} fewer ${noun}`;
}
