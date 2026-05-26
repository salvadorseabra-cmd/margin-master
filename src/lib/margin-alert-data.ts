import {
  buildIngredientOperationalSignals,
  type IngredientOperationalSignal,
} from "@/lib/buildIngredientOperationalSignals";
import { formatCurrency, formatDecimal, formatPercent } from "@/lib/display-format";
import type { MarginAlert } from "@/lib/margin-alerts";
import { scoreMarginAlertSeverity } from "@/lib/margin-alert-severity";
import {
  formatCostExposureContext,
  formatCostExposureTitle,
  formatPrepExposureContext,
  formatPrepExposureTitle,
  formatPriceDecreaseContext,
  formatPriceIncreaseContext,
  formatTemporalPriceChange,
  getSuggestedAction,
  type MarginAlertKind,
} from "@/lib/margin-alert-copy";
import {
  derivePricingFreshnessLevel,
  resolvePricingRecency,
  type PricingFreshnessLevel,
} from "@/lib/ingredient-pricing-freshness";
import {
  buildLinesByRecipeId,
  buildRecipesById,
  resolvePrepUsageLineOperationalCost,
} from "@/lib/recipe-prep-cost";
import { deriveRecipePricingSummary, type RecipePricingSummary } from "@/lib/recipe-pricing-state";
import {
  buildOperationalIngredientCostById,
  enrichRecipeLinesForOperationalCost,
  resolveRecipeLineOperationalCost,
} from "@/lib/resolve-operational-ingredient-cost";

export type MarginAlertSeverity = "critical" | "high" | "watch" | "info" | "positive";
export type MarginAlertTarget = "/ingredients" | "/recipes" | "/invoices";

export type MarginAlertSectionId =
  | "critical_margin_risks"
  | "cost_concentration"
  | "supplier_anomalies"
  | "prep_exposure"
  | "opportunities";

export type MarginAlertMeta = { label: string; value?: string; tone?: string };

export type MarginAlertItem = {
  id: string;
  kind: MarginAlertKind;
  sectionId: MarginAlertSectionId;
  severity: MarginAlertSeverity;
  title: string;
  context: string;
  temporalLine?: string;
  suggestedAction: string;
  actionLabel: string;
  target: MarginAlertTarget;
  meta: MarginAlertMeta[];
  signals: IngredientOperationalSignal[];
  priority: number;
};

export type IngredientRecord = {
  id: string;
  name: string | null;
  unit: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
  purchase_unit?: string | null;
  base_unit?: string | null;
  created_at?: string | null;
};

export type RecipeIngredientRecord = {
  id: string;
  recipe_id: string | null;
  ingredient_id: string | null;
  sub_recipe_id?: string | null;
  quantity: number | null;
  unit: string | null;
  created_at: string | null;
  ingredients: IngredientRecord | null;
};

export type RecipeRecord = {
  id: string;
  name: string;
  selling_price: number | null;
  type: string | null;
  output_quantity?: number | null;
  output_unit?: string | null;
  recipe_ingredients: RecipeIngredientRecord[] | null;
};

export type PriceHistoryRecord = {
  id: string;
  ingredient_id: string;
  invoice_id: string | null;
  ingredient_name: string | null;
  supplier_name: string | null;
  ingredient_unit: string | null;
  previous_price: number | null;
  new_price: number | null;
  delta: number | null;
  delta_percent: number | null;
  created_at: string;
};

export type InvoiceRecord = {
  id: string;
  supplier_name: string | null;
  total: number | null;
  created_at: string | null;
};

export type RecipeCostLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  lineCost: number | null;
  contribution: number;
};

export type RecipeMetric = {
  recipe: RecipeRecord;
  sellingPrice: number;
  foodCost: number;
  grossMargin: number | null;
  foodCostPercent: number | null;
  topLine: RecipeCostLine | null;
  ingredientCount: number;
  pricingSummary: RecipePricingSummary;
};

export type MarginAlertData = {
  ingredients: IngredientRecord[];
  recipes: RecipeRecord[];
  priceHistory: PriceHistoryRecord[];
  invoices: InvoiceRecord[];
};

export type OperationalHealthScore = {
  label: string;
  score: number;
  detail: string;
  level: "good" | "fair" | "poor" | "unknown";
};

export type OperationalHealthPanel = {
  supplierStability?: OperationalHealthScore;
  recipeReliability?: OperationalHealthScore;
  invoiceFreshness?: OperationalHealthScore;
};

export const TARGET_MARGIN = 65;
export const RECENT_PRICE_DAYS = 7;
export const STALE_PRICE_DAYS = 45;
const MAX_ALERTS_PER_SOURCE = 16;

function numberOrNull(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function daysSince(value: string): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return STALE_PRICE_DAYS;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function isRecentDate(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  return daysSince(value) <= days;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString();
}

function ingredientDisplayUnit(ingredient: IngredientRecord | null | undefined): string {
  return (
    ingredient?.base_unit?.trim() ||
    ingredient?.unit?.trim() ||
    ingredient?.purchase_unit?.trim() ||
    "unit"
  );
}

function formatIngredientPrice(ingredient: IngredientRecord): string {
  return `${formatCurrency(Number(ingredient.current_price ?? 0))} / ${ingredientDisplayUnit(ingredient)}`;
}

function getHistoryPercent(row: PriceHistoryRecord): number {
  const explicit = numberOrNull(row.delta_percent);
  if (explicit !== null) return explicit;
  const current = numberOrNull(row.new_price);
  const previous = numberOrNull(row.previous_price);
  if (current === null || previous === null || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function severityFromLib(severity: MarginAlert["severity"]): MarginAlertSeverity {
  if (severity === "high") return "critical";
  if (severity === "medium") return "watch";
  return "info";
}

function sectionForKind(kind: MarginAlertKind): MarginAlertSectionId {
  switch (kind) {
    case "recipe_below_target":
    case "recipe_margin_deterioration":
    case "ingredient_inflation_spike":
    case "portfolio_margin_loss":
      return "critical_margin_risks";
    case "cost_concentration":
      return "cost_concentration";
    case "price_increase":
    case "supplier_trend":
    case "volatile_pricing":
    case "stale_price":
      return "supplier_anomalies";
    case "prep_cascade":
      return "prep_exposure";
    case "price_decrease":
    case "recent_update":
    case "shared_ingredient":
      return "opportunities";
    default:
      return "supplier_anomalies";
  }
}

function severityOrder(severity: MarginAlertSeverity): number {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "watch") return 2;
  if (severity === "info") return 3;
  return 4;
}

export function getRecipeMetrics(recipes: RecipeRecord[]): RecipeMetric[] {
  const catalogById = buildOperationalIngredientCostById(
    recipes.flatMap((recipe) =>
      (recipe.recipe_ingredients ?? [])
        .filter((line) => line.ingredient_id && line.ingredients)
        .map((line) => ({
          id: line.ingredient_id!,
          current_price: line.ingredients!.current_price,
          purchase_quantity: line.ingredients!.purchase_quantity,
        })),
    ),
  );
  const linesByRecipe = buildLinesByRecipeId(
    recipes.map((recipe) => ({
      id: recipe.id,
      recipe_ingredients: enrichRecipeLinesForOperationalCost(
        (recipe.recipe_ingredients ?? []).map((line) => ({
          ingredient_id: line.ingredient_id,
          sub_recipe_id: line.sub_recipe_id ?? null,
          quantity: line.quantity,
          unit: line.unit,
          ingredients: line.ingredients,
        })),
        catalogById,
      ),
    })),
  );
  const recipesById = buildRecipesById(
    recipes.map((recipe) => ({
      id: recipe.id,
      output_quantity: recipe.output_quantity ?? null,
      output_unit: recipe.output_unit ?? null,
    })),
  );

  return recipes.map((recipe) => {
    const rawLines =
      recipe.recipe_ingredients?.filter((line) => line.ingredient_id || line.sub_recipe_id) ?? [];
    const costLines: RecipeCostLine[] = rawLines.map((line) => {
      const quantity = Number(line.quantity ?? 0);
      if (line.ingredient_id && line.ingredients) {
        const enriched = linesByRecipe
          .get(recipe.id)
          ?.find(
            (row) =>
              row.ingredient_id === line.ingredient_id &&
              (row.sub_recipe_id ?? null) === (line.sub_recipe_id ?? null),
          )?.ingredients;
        const resolved = resolveRecipeLineOperationalCost(
          line.ingredient_id,
          quantity,
          catalogById,
          enriched ?? line.ingredients,
          undefined,
          {
            recipeUnit: line.unit,
            ingredientName: line.ingredients.name,
            trigger: "margin_alert.getRecipeMetrics",
          },
        );
        return {
          ingredientId: line.ingredient_id,
          ingredientName: line.ingredients.name?.trim() || "Ingredient",
          quantity,
          unit: line.unit || ingredientDisplayUnit(line.ingredients),
          lineCost: resolved.lineCostEur,
          contribution: 0,
        };
      }
      const prep = recipes.find((row) => row.id === line.sub_recipe_id);
      const prepResolved = resolvePrepUsageLineOperationalCost(
        line.sub_recipe_id!,
        quantity,
        line.unit,
        linesByRecipe,
        recipesById,
      );
      return {
        ingredientId: line.sub_recipe_id ?? "",
        ingredientName: prep?.name?.trim() || "Prep",
        quantity,
        unit: line.unit || prep?.output_unit || "unit",
        lineCost: prepResolved.lineCostEur,
        contribution: 0,
      };
    });
    const pricingSummary = deriveRecipePricingSummary(costLines);
    const foodCost = pricingSummary.resolvedFoodCostEur ?? 0;
    const linesWithContribution = costLines.map((line) => ({
      ...line,
      contribution: foodCost > 0 && line.lineCost != null ? (line.lineCost / foodCost) * 100 : 0,
    }));
    const sellingPrice = Number(recipe.selling_price ?? 0);
    const grossMargin =
      sellingPrice > 0 &&
      pricingSummary.status !== "unresolved" &&
      pricingSummary.resolvedFoodCostEur != null
        ? ((sellingPrice - pricingSummary.resolvedFoodCostEur) / sellingPrice) * 100
        : null;
    const foodCostPercent =
      sellingPrice > 0 && pricingSummary.status !== "unresolved" && foodCost > 0
        ? (foodCost / sellingPrice) * 100
        : null;

    return {
      recipe,
      sellingPrice,
      foodCost,
      grossMargin,
      foodCostPercent,
      pricingSummary,
      topLine:
        [...linesWithContribution]
          .filter((line) => line.lineCost != null)
          .sort((a, b) => (b.lineCost ?? 0) - (a.lineCost ?? 0))[0] ?? null,
      ingredientCount: rawLines.length,
    };
  });
}

export function getRecipeUsageByIngredient(recipes: RecipeRecord[]) {
  const usage = new Map<string, { count: number; recipes: string[] }>();

  for (const recipe of recipes) {
    const ingredientIds = new Set(
      (recipe.recipe_ingredients ?? [])
        .map((line) => line.ingredient_id)
        .filter((ingredientId): ingredientId is string => !!ingredientId),
    );

    for (const ingredientId of ingredientIds) {
      const current = usage.get(ingredientId) ?? { count: 0, recipes: [] };
      usage.set(ingredientId, {
        count: current.count + 1,
        recipes: [...current.recipes, recipe.name],
      });
    }
  }

  return usage;
}

export function getPrepUsageBySubRecipe(recipes: RecipeRecord[]) {
  const usage = new Map<string, { count: number; parentNames: string[] }>();
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  for (const recipe of recipes) {
    for (const line of recipe.recipe_ingredients ?? []) {
      if (!line.sub_recipe_id) continue;
      const prep = recipeById.get(line.sub_recipe_id);
      const prepName = prep?.name ?? "Prep";
      const current = usage.get(line.sub_recipe_id) ?? { count: 0, parentNames: [] };
      if (!current.parentNames.includes(recipe.name)) {
        usage.set(line.sub_recipe_id, {
          count: current.count + 1,
          parentNames: [...current.parentNames, recipe.name],
        });
      }
    }
  }

  return usage;
}

export function getLatestHistoryByIngredient(history: PriceHistoryRecord[]) {
  const latest = new Map<string, PriceHistoryRecord>();
  for (const row of history) {
    const current = latest.get(row.ingredient_id);
    if (!current || row.created_at.localeCompare(current.created_at) > 0) {
      latest.set(row.ingredient_id, row);
    }
  }
  return [...latest.values()];
}

function buildItem(
  partial: Omit<
    MarginAlertItem,
    "sectionId" | "suggestedAction" | "actionLabel" | "signals"
  > & {
    kind: MarginAlertKind;
    critical?: boolean;
    signals?: IngredientOperationalSignal[];
  },
): MarginAlertItem {
  const action = getSuggestedAction(partial.kind, { critical: partial.critical });
  const { critical: _c, signals = [], ...rest } = partial;
  return {
    ...rest,
    signals,
    sectionId: sectionForKind(partial.kind),
    suggestedAction: action.suggestedAction,
    actionLabel: action.actionLabel,
  };
}

function historyRowsForIngredient(
  history: PriceHistoryRecord[],
  ingredientId: string,
): PriceHistoryRecord[] {
  return history.filter((row) => row.ingredient_id === ingredientId);
}

function suppliersFromHistory(rows: readonly PriceHistoryRecord[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const row of rows) {
    const name = row.supplier_name?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    labels.push(name);
  }
  return labels;
}

function enrichAlertItem(
  item: MarginAlertItem,
  ctx: {
    usageByIngredient: ReturnType<typeof getRecipeUsageByIngredient>;
    latestHistoryByIngredient: Map<string, PriceHistoryRecord>;
    priceHistory: PriceHistoryRecord[];
    recipeMetrics: RecipeMetric[];
    volatileIngredientIds?: ReadonlySet<string>;
  },
): MarginAlertItem {
  let ingredientId: string | null = null;
  let maxContributionPct: number | null = null;
  let primaryRecipeName: string | null = null;
  let priceIncreasePct: number | null = null;
  let staleDays: number | null = null;
  let singleSupplier = false;
  let isVolatile = false;

  if (item.id.startsWith("price-increase-")) {
    ingredientId = item.id.slice("price-increase-".length);
    const pctMeta = item.meta.find((m) => m.label === "Movement")?.value;
    const match = pctMeta?.match(/([\d.]+)/);
    if (match) priceIncreasePct = Number(match[1]);
  } else if (item.id.startsWith("ingredient-spike-")) {
    ingredientId = item.id.slice("ingredient-spike-".length);
  } else if (item.id.startsWith("price-decrease-")) {
    ingredientId = item.id.slice("price-decrease-".length);
  } else if (item.id.startsWith("stale-price-")) {
    ingredientId = item.id.slice("stale-price-".length);
  } else if (item.id.startsWith("price-updated-")) {
    ingredientId = item.id.slice("price-updated-".length);
  } else if (item.id.startsWith("high-contribution|")) {
    const parts = item.id.split("|");
    ingredientId = parts[2] ?? null;
    const shareMeta = item.meta.find((m) => m.label === "Cost share")?.value;
    const shareMatch = shareMeta?.match(/([\d.]+)/);
    if (shareMatch) maxContributionPct = Number(shareMatch[1]);
    primaryRecipeName = item.meta.find((m) => m.label === "Recipe")?.value ?? null;
  } else if (item.id.startsWith("recipe-margin-")) {
    const recipeId = item.id.slice("recipe-margin-".length);
    const metric = ctx.recipeMetrics.find((m) => m.recipe.id === recipeId);
    if (metric?.topLine) {
      ingredientId = metric.topLine.ingredientId;
      maxContributionPct = metric.topLine.contribution;
      primaryRecipeName = metric.recipe.name;
    }
  }

  if (!ingredientId) {
    return { ...item, signals: item.signals ?? [] };
  }

  const usage = ctx.usageByIngredient.get(ingredientId);
  const latestHistory = ctx.latestHistoryByIngredient.get(ingredientId) ?? null;
  const ingredientHistory = historyRowsForIngredient(ctx.priceHistory, ingredientId);
  const suppliers = suppliersFromHistory(ingredientHistory);
  singleSupplier = suppliers.length === 1;
  isVolatile = ctx.volatileIngredientIds?.has(ingredientId) ?? false;

  const lastUpdate = latestHistory?.created_at ?? null;
  if (lastUpdate) staleDays = daysSince(lastUpdate);
  else if (item.kind === "stale_price") staleDays = STALE_PRICE_DAYS;

  const signals =
    item.signals.length > 0
      ? item.signals
      : buildIngredientOperationalSignals({
          ingredientId,
          priceHistory: ingredientHistory,
          latestHistoryRow: latestHistory,
          recipeCount: usage?.count ?? 0,
          recipeNames: usage?.recipes,
          maxContributionPct,
          primaryRecipeName,
          volatileIngredientIds: ctx.volatileIngredientIds,
          lastPriceUpdateAt: lastUpdate,
          staleThresholdDays: STALE_PRICE_DAYS,
        });

  const severity = scoreMarginAlertSeverity({
    baseSeverity: item.severity,
    contributionPct: maxContributionPct,
    priceIncreasePct,
    staleDays,
    singleSupplier,
    recipeCount: usage?.count ?? 0,
    isVolatile,
  });

  return { ...item, signals, severity };
}

function detectVolatileIngredientIds(history: PriceHistoryRecord[]): Set<string> {
  const byIngredient = new Map<string, number[]>();
  for (const row of history) {
    const price = numberOrNull(row.new_price);
    if (price == null) continue;
    const list = byIngredient.get(row.ingredient_id) ?? [];
    list.push(price);
    byIngredient.set(row.ingredient_id, list);
  }
  const volatile = new Set<string>();
  for (const [ingredientId, prices] of byIngredient) {
    if (prices.length < 3) continue;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min > 0 && (max - min) / min >= 0.15) volatile.add(ingredientId);
  }
  return volatile;
}

export function enrichOperationalAlertItems(
  items: MarginAlertItem[],
  data: MarginAlertData,
  volatileIngredientIds?: ReadonlySet<string>,
): MarginAlertItem[] {
  const volatile =
    volatileIngredientIds ?? detectVolatileIngredientIds(data.priceHistory);
  const recipeMetrics = getRecipeMetrics(data.recipes);
  const usageByIngredient = getRecipeUsageByIngredient(data.recipes);
  const latestHistory = getLatestHistoryByIngredient(data.priceHistory);
  const latestHistoryByIngredient = new Map(latestHistory.map((row) => [row.ingredient_id, row]));
  const ctx = {
    usageByIngredient,
    latestHistoryByIngredient,
    priceHistory: data.priceHistory,
    recipeMetrics,
    volatileIngredientIds: volatile,
  };
  return items.map((item) => enrichAlertItem(item, ctx));
}

export function buildOperationalAlertItems(data: MarginAlertData): MarginAlertItem[] {
  const alerts: MarginAlertItem[] = [];
  const recipeMetrics = getRecipeMetrics(data.recipes);
  const usageByIngredient = getRecipeUsageByIngredient(data.recipes);
  const prepUsage = getPrepUsageBySubRecipe(data.recipes);
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const latestHistory = getLatestHistoryByIngredient(data.priceHistory);
  const latestHistoryByIngredient = new Map(latestHistory.map((row) => [row.ingredient_id, row]));
  const invoiceById = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
  const usedAlertIds = new Set<string>();

  for (const row of latestHistory) {
    const ingredient = ingredientById.get(row.ingredient_id);
    const ingredientName = ingredient?.name?.trim() || row.ingredient_name?.trim() || "Ingredient";
    const current = numberOrNull(row.new_price);
    const previous = numberOrNull(row.previous_price);
    const percent = getHistoryPercent(row);

    if (current === null || previous === null) continue;

    const usage = usageByIngredient.get(row.ingredient_id);
    const unit = row.ingredient_unit || ingredientDisplayUnit(ingredient);
    const supplier =
      row.supplier_name?.trim() || invoiceById.get(row.invoice_id ?? "")?.supplier_name?.trim();
    const temporalLine = formatTemporalPriceChange(row.ingredient_id, data.priceHistory, 30);

    if (current > previous) {
      const id = `price-increase-${row.ingredient_id}`;
      usedAlertIds.add(id);
      alerts.push(
        buildItem({
          id,
          kind: "price_increase",
          severity: percent >= 15 ? "critical" : percent >= 5 ? "high" : "watch",
          title: `${ingredientName} cost moved up`,
          context: formatPriceIncreaseContext(ingredientName, usage?.count ?? 0, supplier),
          temporalLine,
          target: row.invoice_id ? "/invoices" : "/ingredients",
          meta: [
            {
              label: "Movement",
              value: `Up ${formatPercent(Math.abs(percent))}`,
              tone: "text-destructive",
            },
            { label: "Latest price", value: `${formatCurrency(current)} / ${unit}` },
            { label: "Previous", value: formatCurrency(previous) },
            { label: "Recipes affected", value: String(usage?.count ?? 0) },
            ...(supplier ? [{ label: "Supplier", value: supplier }] : []),
            { label: "Last invoice update", value: formatDate(row.created_at) },
          ],
          priority: 10_000 + percent * 100 + (usage?.count ?? 0),
          critical: percent >= 15,
        }),
      );
      continue;
    }

    if (current < previous) {
      alerts.push(
        buildItem({
          id: `price-decrease-${row.ingredient_id}`,
          kind: "price_decrease",
          severity: "positive",
          title: `${ingredientName} cost eased`,
          context: formatPriceDecreaseContext(ingredientName, usage?.count ?? 0),
          temporalLine,
          target: row.invoice_id ? "/invoices" : "/ingredients",
          meta: [
            {
              label: "Movement",
              value: `Down ${formatPercent(Math.abs(percent))}`,
              tone: "text-success",
            },
            { label: "Latest price", value: `${formatCurrency(current)} / ${unit}` },
            { label: "Recipes affected", value: String(usage?.count ?? 0) },
          ],
          priority: 3_000 + Math.abs(percent),
        }),
      );
    }
  }

  for (const metric of recipeMetrics) {
    if (metric.grossMargin === null || metric.grossMargin >= TARGET_MARGIN) continue;
    const belowTarget = TARGET_MARGIN - metric.grossMargin;
    const criticalMargin = metric.grossMargin < 55;
    alerts.push(
      buildItem({
        id: `recipe-margin-${metric.recipe.id}`,
        kind: "recipe_below_target",
        severity: criticalMargin ? "critical" : "watch",
        title: `${metric.recipe.name} below target margin`,
        context:
          "Food cost is running too close to the selling price. Review the recipe before the next menu update.",
        target: "/recipes",
        meta: [
          {
            label: "Gross margin",
            value: formatPercent(metric.grossMargin),
            tone: criticalMargin ? "text-destructive" : "text-warning",
          },
          { label: "Food cost", value: formatPercent(metric.foodCostPercent ?? 0) },
          { label: "Below target", value: `${formatDecimal(belowTarget)} pts` },
          ...(metric.topLine
            ? [
                { label: "Largest driver", value: metric.topLine.ingredientName },
                {
                  label: "Line cost",
                  value: formatCurrency(metric.topLine.lineCost ?? 0),
                },
              ]
            : []),
        ],
        priority: 9_000 + belowTarget * 100,
        critical: criticalMargin,
      }),
    );
  }

  for (const metric of recipeMetrics) {
    const topLine = metric.topLine;
    if (!topLine || topLine.contribution < 55) continue;
    alerts.push(
      buildItem({
        id: `high-contribution|${metric.recipe.id}|${topLine.ingredientId}`,
        kind: "cost_concentration",
        severity: topLine.contribution >= 70 ? "watch" : "info",
        title: formatCostExposureTitle(
          topLine.ingredientName,
          metric.recipe.name,
          topLine.contribution,
        ),
        context: formatCostExposureContext(
          topLine.contribution,
          metric.recipe.name,
          topLine.lineCost ?? 0,
        ),
        target: "/recipes",
        meta: [
          { label: "Cost share", value: formatPercent(topLine.contribution) },
          { label: "Line cost", value: formatCurrency(topLine.lineCost ?? 0) },
          { label: "Recipe", value: metric.recipe.name },
        ],
        priority: 5_000 + topLine.contribution,
      }),
    );
  }

  for (const [prepId, usage] of [...prepUsage.entries()].filter(([, u]) => u.count >= 2)) {
    const prep = data.recipes.find((r) => r.id === prepId);
    if (!prep?.name) continue;
    alerts.push(
      buildItem({
        id: `prep-exposure-${prepId}`,
        kind: "prep_cascade",
        severity: usage.count >= 3 ? "watch" : "info",
        title: formatPrepExposureTitle(prep.name, usage.count),
        context: formatPrepExposureContext(prep.name, usage.parentNames, usage.count),
        target: "/recipes",
        meta: [
          { label: "Parent recipes", value: String(usage.count) },
          { label: "Prep type", value: prep.type?.trim() || "sub-recipe" },
        ],
        priority: 4_000 + usage.count * 100,
      }),
    );
  }

  const staleIngredients = [...usageByIngredient.entries()]
    .map(([ingredientId, usage]) => ({
      ingredient: ingredientById.get(ingredientId),
      history: latestHistoryByIngredient.get(ingredientId),
      usage,
    }))
    .filter(({ ingredient }) => !!ingredient?.name)
    .filter(({ ingredient, history }) => {
      const latestDate = history?.created_at ?? ingredient?.created_at ?? null;
      return !latestDate || daysSince(latestDate) >= STALE_PRICE_DAYS;
    })
    .sort((a, b) => b.usage.count - a.usage.count)
    .slice(0, 4);

  for (const { ingredient, history, usage } of staleIngredients) {
    if (!ingredient?.name) continue;
    const latestDate = history?.created_at ?? ingredient.created_at ?? null;
    const age = latestDate ? daysSince(latestDate) : null;
    alerts.push(
      buildItem({
        id: `stale-price-${ingredient.id}`,
        kind: "stale_price",
        severity: "info",
        title: `${ingredient.name} pricing is stale`,
        context:
          age === null
            ? "This linked ingredient has no invoice price history yet, so recipe costs depend on catalog pricing."
            : `No invoice price update in ${age} days. Recipe costs may be using an old ingredient price.`,
        target: "/ingredients",
        meta: [
          { label: "Recipes affected", value: String(usage.count) },
          { label: "Current price", value: formatIngredientPrice(ingredient) },
          {
            label: "Last invoice update",
            value: latestDate ? formatDate(latestDate) : "No history",
          },
        ],
        priority: 1_000 + usage.count * 10 + (age ?? STALE_PRICE_DAYS),
      }),
    );
  }

  for (const row of latestHistory) {
    const id = `price-updated-${row.ingredient_id}`;
    if (
      usedAlertIds.has(`price-increase-${row.ingredient_id}`) ||
      usedAlertIds.has(`price-decrease-${row.ingredient_id}`) ||
      !isRecentDate(row.created_at, RECENT_PRICE_DAYS)
    ) {
      continue;
    }

    const ingredient = ingredientById.get(row.ingredient_id);
    const ingredientName = ingredient?.name?.trim() || row.ingredient_name?.trim() || "Ingredient";
    alerts.push(
      buildItem({
        id,
        kind: "recent_update",
        severity: "info",
        title: `${ingredientName} pricing updated recently`,
        context:
          "Latest invoice pricing is available for monitoring current recipe cost stability.",
        target: row.invoice_id ? "/invoices" : "/ingredients",
        meta: [{ label: "Last invoice update", value: formatDate(row.created_at) }],
        priority: 500,
      }),
    );
  }

  const sorted = alerts
    .sort(
      (a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.priority - a.priority,
    )
    .slice(0, MAX_ALERTS_PER_SOURCE);

  return sorted;
}

export function finalizeOperationalAlertItems(
  localItems: MarginAlertItem[],
  libItems: MarginAlertItem[],
  data: MarginAlertData,
): MarginAlertItem[] {
  return enrichOperationalAlertItems(mergeAlertItems(localItems, libItems), data);
}

export function convertLibMarginAlerts(libAlerts: MarginAlert[]): MarginAlertItem[] {
  return libAlerts.map((alert) => {
    const kind = libKindToKind(alert.type);
    const severity = severityFromLib(alert.severity);
    const action = getSuggestedAction(kind, { critical: severity === "critical" });
    const temporalLine = alert.time?.trim() || undefined;

    return {
      id: alert.id,
      kind,
      sectionId: sectionForKind(kind),
      severity,
      title: alert.title,
      context: alert.detail,
      temporalLine,
      suggestedAction: alert.recommendedAction || action.suggestedAction,
      actionLabel: action.actionLabel,
      target: targetForLibAlert(alert.type),
      meta: [
        { label: "Signal", value: alert.metricLine },
        { label: "Window", value: alert.time },
        ...(alert.affectedRecipes.length
          ? [{ label: "Recipes", value: String(alert.affectedRecipes.length) }]
          : []),
      ],
      signals: [],
      priority: severity === "critical" ? 12_000 : severity === "watch" ? 8_000 : 6_000,
    };
  });
}

function libKindToKind(type: MarginAlert["type"]): MarginAlertKind {
  switch (type) {
    case "ingredient_inflation_spike":
      return "ingredient_inflation_spike";
    case "recipe_margin_deterioration":
      return "recipe_margin_deterioration";
    case "supplier_inflation_trend":
      return "supplier_trend";
    case "monthly_margin_loss":
      return "portfolio_margin_loss";
    case "volatile_ingredient_pricing":
      return "volatile_pricing";
    default:
      return "price_increase";
  }
}

function targetForLibAlert(type: MarginAlert["type"]): MarginAlertTarget {
  if (type === "recipe_margin_deterioration" || type === "monthly_margin_loss") return "/recipes";
  if (type === "supplier_inflation_trend") return "/invoices";
  return "/ingredients";
}

export function mergeAlertItems(
  localItems: MarginAlertItem[],
  libItems: MarginAlertItem[],
): MarginAlertItem[] {
  const byId = new Map<string, MarginAlertItem>();
  for (const item of localItems) byId.set(item.id, item);
  for (const item of libItems) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort(
    (a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.priority - a.priority,
  );
}

function scoreLevel(score: number): OperationalHealthScore["level"] {
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

function freshnessToScore(level: PricingFreshnessLevel): number {
  switch (level) {
    case "fresh":
      return 90;
    case "aging":
      return 65;
    case "stale":
      return 40;
    case "critical":
      return 20;
    default:
      return 0;
  }
}

export function buildOperationalHealthPanel(
  data: MarginAlertData,
  libAlerts: MarginAlert[],
): OperationalHealthPanel {
  const panel: OperationalHealthPanel = {};
  const recipeMetrics = getRecipeMetrics(data.recipes);
  const menuRecipes = recipeMetrics.filter(
    (m) => m.recipe.type !== "prep" && m.grossMargin !== null,
  );

  if (menuRecipes.length > 0) {
    const onTarget = menuRecipes.filter((m) => (m.grossMargin ?? 0) >= TARGET_MARGIN).length;
    const score = Math.round((onTarget / menuRecipes.length) * 100);
    panel.recipeReliability = {
      label: "Recipe reliability",
      score,
      detail: `${onTarget} of ${menuRecipes.length} menu recipes at or above ${TARGET_MARGIN}% margin`,
      level: scoreLevel(score),
    };
  }

  const supplierTrendCount = libAlerts.filter((a) => a.type === "supplier_inflation_trend").length;
  const volatileCount = libAlerts.filter((a) => a.type === "volatile_ingredient_pricing").length;
  if (data.priceHistory.length > 0 || libAlerts.length > 0) {
    const penalty = supplierTrendCount * 18 + volatileCount * 12;
    const score = Math.max(0, Math.min(100, 100 - penalty));
    panel.supplierStability = {
      label: "Supplier stability",
      score,
      detail:
        supplierTrendCount > 0
          ? `${supplierTrendCount} supplier${supplierTrendCount === 1 ? "" : "s"} with rising invoice trends`
          : volatileCount > 0
            ? "Volatile SKU pricing detected in recent invoices"
            : "No supplier trend anomalies in recent invoice history",
      level: scoreLevel(score),
    };
  }

  const usageByIngredient = getRecipeUsageByIngredient(data.recipes);
  const usedIngredientIds = [...usageByIngredient.keys()];
  if (usedIngredientIds.length > 0 && data.priceHistory.length > 0) {
    const latestByIngredient = getLatestHistoryByIngredient(data.priceHistory);
    const freshnessScores = usedIngredientIds.map((id) => {
      const history = latestByIngredient.find((row) => row.ingredient_id === id);
      const recency = resolvePricingRecency({ priceRefreshAt: history?.created_at ?? null });
      return freshnessToScore(
        derivePricingFreshnessLevel(recency.daysSince, recency.recencyAt != null),
      );
    });
    const score =
      freshnessScores.length > 0
        ? Math.round(freshnessScores.reduce((a, b) => a + b, 0) / freshnessScores.length)
        : 0;
    if (score > 0) {
      panel.invoiceFreshness = {
        label: "Invoice freshness",
        score,
        detail: `Based on price-history recency for ingredients used in recipes`,
        level: scoreLevel(score),
      };
    }
  }

  return panel;
}

export function buildVisitSnapshotFromAlerts(
  items: MarginAlertItem[],
  recipesBelowTarget: number,
): {
  criticalCount: number;
  totalAlertCount: number;
  priceIncreaseCount: number;
  recipesBelowTarget: number;
} {
  return {
    criticalCount: items.filter((i) => i.severity === "critical" || i.severity === "high").length,
    totalAlertCount: items.length,
    priceIncreaseCount: items.filter(
      (i) => i.kind === "price_increase" || i.kind === "ingredient_inflation_spike",
    ).length,
    recipesBelowTarget,
  };
}
