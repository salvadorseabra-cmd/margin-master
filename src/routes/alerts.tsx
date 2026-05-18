import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Margin Alerts — Marginly" },
      {
        name: "description",
        content: "Operational alerts on ingredient prices and margin shifts.",
      },
    ],
  }),
  component: AlertsPage,
});

type Severity = "high" | "medium" | "low";
type AlertTarget = "/ingredients" | "/recipes" | "/invoices";

type IngredientRecord = {
  id: string;
  name: string | null;
  unit: string | null;
  current_price: number | null;
  purchase_quantity: number | null;
  purchase_unit?: string | null;
  base_unit?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RecipeIngredientRecord = {
  id: string;
  recipe_id: string | null;
  ingredient_id: string | null;
  quantity: number | null;
  unit: string | null;
  created_at: string | null;
  ingredients: IngredientRecord | null;
};

type RecipeRecord = {
  id: string;
  name: string;
  selling_price: number | null;
  type: string | null;
  recipe_ingredients: RecipeIngredientRecord[] | null;
};

type PriceHistoryRecord = {
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

type InvoiceRecord = {
  id: string;
  supplier_name: string | null;
  total: number | null;
  created_at: string | null;
};

type RecipeCostLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  lineCost: number;
  contribution: number;
};

type RecipeMetric = {
  recipe: RecipeRecord;
  sellingPrice: number;
  foodCost: number;
  grossMargin: number | null;
  foodCostPercent: number | null;
  topLine: RecipeCostLine | null;
  ingredientCount: number;
};

type OperationalAlert = {
  id: string;
  severity: Severity;
  title: string;
  context: string;
  meta: Array<{ label: string; value?: string; tone?: string }>;
  actionLabel: string;
  target: AlertTarget;
  priority: number;
};

type AlertData = {
  ingredients: IngredientRecord[];
  recipes: RecipeRecord[];
  priceHistory: PriceHistoryRecord[];
  invoices: InvoiceRecord[];
};

type RecipeIngredientRow = Omit<RecipeIngredientRecord, "ingredients">;

const sevStyles: Record<Severity, { dot: string; chip: string; label: string; card: string }> = {
  high: {
    dot: "bg-destructive",
    chip: "border-destructive/20 bg-destructive/10 text-destructive",
    label: "High",
    card: "border-destructive/20",
  },
  medium: {
    dot: "bg-warning/75",
    chip: "border-warning/20 bg-warning/10 text-warning-foreground/80",
    label: "Watch",
    card: "border-border",
  },
  low: {
    dot: "bg-success",
    chip: "border-success/20 bg-success/10 text-success",
    label: "Low",
    card: "border-success/20",
  },
};

const TARGET_MARGIN = 65;
const RECENT_PRICE_DAYS = 7;
const STALE_PRICE_DAYS = 45;
const MAX_ALERTS = 12;

function AlertsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AlertData>({
    ingredients: [],
    recipes: [],
    priceHistory: [],
    invoices: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        ingredientsResult,
        recipesResult,
        recipeIngredientsResult,
        historyResult,
        invoicesResult,
      ] = await Promise.all([
        supabase
          .from("ingredients")
          .select(
            "id, name, unit, current_price, purchase_quantity, purchase_unit, base_unit, created_at",
          )
          .order("name", { ascending: true }),
        supabase
          .from("recipes")
          .select("id, name, selling_price, type")
          .order("name", { ascending: true }),
        supabase
          .from("recipe_ingredients")
          .select("id, recipe_id, ingredient_id, quantity, unit, created_at"),
        supabase
          .from("ingredient_price_history")
          .select(
            "id, ingredient_id, invoice_id, ingredient_name, supplier_name, ingredient_unit, previous_price, new_price, delta, delta_percent, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("invoices")
          .select("id, supplier_name, total, created_at")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

      if (ingredientsResult.error) throw ingredientsResult.error;
      if (recipesResult.error) throw recipesResult.error;
      if (recipeIngredientsResult.error) throw recipeIngredientsResult.error;

      const ingredients = (ingredientsResult.data ?? []) as IngredientRecord[];
      const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
      const recipeIngredients = (recipeIngredientsResult.data ?? []) as RecipeIngredientRow[];
      const recipeLinesByRecipeId = new Map<string, RecipeIngredientRecord[]>();

      for (const line of recipeIngredients) {
        if (!line.recipe_id) continue;

        const recipeLines = recipeLinesByRecipeId.get(line.recipe_id) ?? [];
        recipeLines.push({
          ...line,
          ingredients: line.ingredient_id ? (ingredientById.get(line.ingredient_id) ?? null) : null,
        });
        recipeLinesByRecipeId.set(line.recipe_id, recipeLines);
      }

      const recipes = (
        (recipesResult.data ?? []) as Omit<RecipeRecord, "recipe_ingredients">[]
      ).map((recipe) => ({
        ...recipe,
        recipe_ingredients: recipeLinesByRecipeId.get(recipe.id) ?? [],
      }));

      setData({
        ingredients,
        recipes,
        priceHistory: historyResult.error
          ? []
          : ((historyResult.data ?? []) as PriceHistoryRecord[]),
        invoices: invoicesResult.error ? [] : ((invoicesResult.data ?? []) as InvoiceRecord[]),
      });
    } catch (err) {
      setData({ ingredients: [], recipes: [], priceHistory: [], invoices: [] });
      setError(err instanceof Error ? err.message : "Could not load alert data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      load();
      return;
    }

    setData({ ingredients: [], recipes: [], priceHistory: [], invoices: [] });
    setLoading(false);
  }, [load, user]);

  const alerts = useMemo(() => buildOperationalAlerts(data), [data]);
  const recipeMetrics = useMemo(() => getRecipeMetrics(data.recipes), [data.recipes]);
  const highCount = alerts.filter((alert) => alert.severity === "high").length;
  const recipeMarginCount = recipeMetrics.filter(
    (metric) => metric.grossMargin !== null && metric.grossMargin < TARGET_MARGIN,
  ).length;
  const recentPriceUpdates = getLatestHistoryByIngredient(data.priceHistory).filter((row) =>
    isRecentDate(row.created_at, RECENT_PRICE_DAYS),
  ).length;

  return (
    <AppShell
      title="Margin alerts"
      subtitle="Operational checks from invoices, ingredient prices and recipe costings."
    >
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {highCount} high priority
          </span>
          <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/40 sm:block" />
          <span className="text-muted-foreground">{recipeMarginCount} recipes below target</span>
          <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/40 sm:block" />
          <span className="text-muted-foreground">
            {recentPriceUpdates} prices updated this week
          </span>
        </div>
      </Card>

      <div className="mt-3 space-y-1.5">
        {loading && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Loading margin alerts
          </Card>
        )}

        {!loading && error && (
          <Card className="border-destructive/20 p-4 text-sm text-destructive">{error}</Card>
        )}

        {!loading && !error && alerts.length === 0 && (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <div className="mt-3 text-sm font-medium">No alerts from current data</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Add invoices, ingredients and recipe links to monitor margin changes.
            </div>
          </Card>
        )}

        {!loading &&
          !error &&
          alerts.map((alert) => {
            const s = sevStyles[alert.severity];
            return (
              <Card
                key={alert.id}
                className={`p-2.5 transition-colors hover:bg-muted/20 ${s.card}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span
                        className={`rounded-full border px-1.5 py-0.5 font-semibold uppercase tracking-wider ${s.chip}`}
                      >
                        {s.label}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {alert.target.replace("/", "")}
                      </span>
                    </div>
                    <div className="mt-0.5 font-semibold leading-snug">{alert.title}</div>
                    <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                      {alert.context}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {alert.meta.map((item) => (
                        <MetaPill
                          key={`${alert.id}-${item.label}`}
                          label={item.label}
                          value={item.value}
                          tone={item.tone}
                        />
                      ))}
                      <Link
                        to={alert.target}
                        className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        {alert.actionLabel}
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
      </div>
    </AppShell>
  );
}

function buildOperationalAlerts(data: AlertData): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const recipeMetrics = getRecipeMetrics(data.recipes);
  const usageByIngredient = getRecipeUsageByIngredient(data.recipes);
  const ingredientById = new Map(data.ingredients.map((ingredient) => [ingredient.id, ingredient]));
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

    if (current === null || previous === null || current <= previous) continue;

    const usage = usageByIngredient.get(row.ingredient_id);
    const unit = row.ingredient_unit || ingredientDisplayUnit(ingredient);
    const supplier =
      row.supplier_name?.trim() || invoiceById.get(row.invoice_id ?? "")?.supplier_name?.trim();
    const id = `price-increase-${row.ingredient_id}`;
    usedAlertIds.add(id);

    alerts.push({
      id,
      severity: percent >= 15 ? "high" : percent >= 5 ? "medium" : "low",
      title: `${ingredientName}: cost increased since previous invoice`,
      context: `Latest invoice price ${formatCurrency(current)}${unit ? ` per ${unit}` : ""}; previous ${formatCurrency(previous)}.`,
      meta: [
        { label: "Change", value: formatPercent(percent), tone: "text-destructive" },
        { label: "Linked recipes", value: String(usage?.count ?? 0) },
        ...(supplier ? [{ label: "Supplier", value: supplier }] : []),
        { label: "Updated", value: formatDate(row.created_at) },
      ],
      actionLabel: row.invoice_id ? "Review invoices" : "Review ingredient",
      target: row.invoice_id ? "/invoices" : "/ingredients",
      priority: 10_000 + percent * 100 + (usage?.count ?? 0),
    });
  }

  for (const metric of recipeMetrics) {
    if (metric.grossMargin === null || metric.grossMargin >= TARGET_MARGIN) continue;

    const belowTarget = TARGET_MARGIN - metric.grossMargin;
    const high = metric.grossMargin < 55;
    alerts.push({
      id: `recipe-margin-${metric.recipe.id}`,
      severity: high ? "high" : "medium",
      title: high
        ? `${metric.recipe.name}: recipe margin below target`
        : `${metric.recipe.name}: recipe close to margin threshold`,
      context: `Current food cost is ${formatCurrency(metric.foodCost)} against selling price ${formatCurrency(metric.sellingPrice)}.`,
      meta: [
        {
          label: "Gross margin",
          value: `${metric.grossMargin.toFixed(1)}%`,
          tone: high ? "text-destructive" : "text-warning",
        },
        { label: "Food cost", value: `${metric.foodCostPercent?.toFixed(1) ?? "0.0"}%` },
        { label: "Below target", value: `${belowTarget.toFixed(1)} pts` },
        ...(metric.topLine ? [{ label: "Top input", value: metric.topLine.ingredientName }] : []),
      ],
      actionLabel: "Review recipe",
      target: "/recipes",
      priority: 9_000 + belowTarget * 100,
    });
  }

  for (const metric of recipeMetrics) {
    const topLine = metric.topLine;
    if (!topLine || topLine.contribution < 55) continue;

    alerts.push({
      id: `high-contribution-${metric.recipe.id}-${topLine.ingredientId}`,
      severity: topLine.contribution >= 70 ? "medium" : "low",
      title: `${topLine.ingredientName}: high cost contribution`,
      context: `${topLine.ingredientName} is the largest cost in ${metric.recipe.name}.`,
      meta: [
        { label: "Contribution", value: `${topLine.contribution.toFixed(1)}%` },
        { label: "Line cost", value: formatCurrency(topLine.lineCost) },
        { label: "Recipe", value: metric.recipe.name },
      ],
      actionLabel: "Review recipe",
      target: "/recipes",
      priority: 5_000 + topLine.contribution,
    });
  }

  const sharedIngredients = [...usageByIngredient.entries()]
    .filter(([, usage]) => usage.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4);

  for (const [ingredientId, usage] of sharedIngredients) {
    const ingredient = ingredientById.get(ingredientId);
    if (!ingredient?.name) continue;

    alerts.push({
      id: `shared-ingredient-${ingredientId}`,
      severity: usage.count >= 4 ? "medium" : "low",
      title: `${ingredient.name}: used across multiple recipes`,
      context: "Price changes on this ingredient affect more than one recipe costing.",
      meta: [
        { label: "Linked recipes", value: String(usage.count) },
        { label: "Current price", value: formatIngredientPrice(ingredient) },
      ],
      actionLabel: "Review ingredient",
      target: "/ingredients",
      priority: 2_000 + usage.count,
    });
  }

  const staleIngredients = [...usageByIngredient.entries()]
    .map(([ingredientId, usage]) => ({
      ingredient: ingredientById.get(ingredientId),
      history: latestHistoryByIngredient.get(ingredientId),
      usage,
    }))
    .filter(({ ingredient }) => !!ingredient?.name)
    .filter(({ ingredient, history }) => {
      const latestDate =
        history?.created_at ?? ingredient?.updated_at ?? ingredient?.created_at ?? null;
      return !latestDate || daysSince(latestDate) >= STALE_PRICE_DAYS;
    })
    .sort((a, b) => b.usage.count - a.usage.count)
    .slice(0, 4);

  for (const { ingredient, history, usage } of staleIngredients) {
    if (!ingredient?.name) continue;

    const latestDate =
      history?.created_at ?? ingredient.updated_at ?? ingredient.created_at ?? null;
    const age = latestDate ? daysSince(latestDate) : null;
    alerts.push({
      id: `stale-price-${ingredient.id}`,
      severity: usage.count >= 3 || (age !== null && age >= 90) ? "medium" : "low",
      title: `${ingredient.name}: no recent pricing update`,
      context:
        age === null
          ? "This linked ingredient has no invoice price history yet."
          : `No invoice price update in ${age} days.`,
      meta: [
        { label: "Linked recipes", value: String(usage.count) },
        { label: "Current price", value: formatIngredientPrice(ingredient) },
      ],
      actionLabel: "Review ingredient",
      target: "/ingredients",
      priority: 1_000 + usage.count * 10 + (age ?? STALE_PRICE_DAYS),
    });
  }

  for (const row of latestHistory) {
    const id = `price-updated-${row.ingredient_id}`;
    if (
      usedAlertIds.has(`price-increase-${row.ingredient_id}`) ||
      !isRecentDate(row.created_at, RECENT_PRICE_DAYS)
    ) {
      continue;
    }

    const ingredient = ingredientById.get(row.ingredient_id);
    const ingredientName = ingredient?.name?.trim() || row.ingredient_name?.trim() || "Ingredient";
    alerts.push({
      id,
      severity: "low",
      title: `${ingredientName}: price updated this week`,
      context: "Latest invoice pricing has been recorded for this ingredient.",
      meta: [
        { label: "Price", value: formatCurrency(numberOrNull(row.new_price) ?? 0) },
        { label: "Updated", value: formatDate(row.created_at) },
      ],
      actionLabel: row.invoice_id ? "Review invoices" : "Review ingredient",
      target: row.invoice_id ? "/invoices" : "/ingredients",
      priority: 500,
    });
  }

  return alerts
    .sort(
      (a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.priority - a.priority,
    )
    .slice(0, MAX_ALERTS);
}

function getRecipeMetrics(recipes: RecipeRecord[]): RecipeMetric[] {
  return recipes.map((recipe) => {
    const rawLines = recipe.recipe_ingredients?.filter((line) => line.ingredient_id) ?? [];
    const costLines = rawLines.map((line) => {
      const ingredient = line.ingredients;
      const quantity = Number(line.quantity ?? 0);
      const lineCost = quantity * effectiveUnitCost(ingredient);
      return {
        ingredientId: line.ingredient_id ?? "",
        ingredientName: ingredient?.name?.trim() || "Ingredient",
        quantity,
        unit: line.unit || ingredientDisplayUnit(ingredient),
        lineCost,
        contribution: 0,
      };
    });
    const foodCost = costLines.reduce((sum, line) => sum + line.lineCost, 0);
    const linesWithContribution = costLines.map((line) => ({
      ...line,
      contribution: foodCost > 0 ? (line.lineCost / foodCost) * 100 : 0,
    }));
    const sellingPrice = Number(recipe.selling_price ?? 0);
    const grossMargin = sellingPrice > 0 ? ((sellingPrice - foodCost) / sellingPrice) * 100 : null;
    const foodCostPercent = sellingPrice > 0 ? (foodCost / sellingPrice) * 100 : null;

    return {
      recipe,
      sellingPrice,
      foodCost,
      grossMargin,
      foodCostPercent,
      topLine: [...linesWithContribution].sort((a, b) => b.lineCost - a.lineCost)[0] ?? null,
      ingredientCount: rawLines.length,
    };
  });
}

function getRecipeUsageByIngredient(recipes: RecipeRecord[]) {
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

function getLatestHistoryByIngredient(history: PriceHistoryRecord[]) {
  const latest = new Map<string, PriceHistoryRecord>();

  for (const row of history) {
    const current = latest.get(row.ingredient_id);
    if (!current || row.created_at.localeCompare(current.created_at) > 0) {
      latest.set(row.ingredient_id, row);
    }
  }

  return [...latest.values()];
}

function effectiveUnitCost(ingredient: IngredientRecord | null) {
  const price = Number(ingredient?.current_price ?? 0);
  const purchaseQuantity = Number(ingredient?.purchase_quantity ?? 1);
  return (
    (Number.isFinite(price) ? price : 0) /
    (Number.isFinite(purchaseQuantity) && purchaseQuantity > 0 ? purchaseQuantity : 1)
  );
}

function ingredientDisplayUnit(ingredient: IngredientRecord | null | undefined) {
  return (
    ingredient?.base_unit?.trim() ||
    ingredient?.unit?.trim() ||
    ingredient?.purchase_unit?.trim() ||
    "unit"
  );
}

function formatIngredientPrice(ingredient: IngredientRecord) {
  return `${formatCurrency(Number(ingredient.current_price ?? 0))} / ${ingredientDisplayUnit(ingredient)}`;
}

function getHistoryPercent(row: PriceHistoryRecord) {
  const explicit = numberOrNull(row.delta_percent);
  if (explicit !== null) return explicit;

  const current = numberOrNull(row.new_price);
  const previous = numberOrNull(row.previous_price);
  if (current === null || previous === null || previous <= 0) return 0;

  return ((current - previous) / previous) * 100;
}

function numberOrNull(value: number | null | undefined) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function daysSince(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return STALE_PRICE_DAYS;

  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function isRecentDate(value: string | null | undefined, days: number) {
  if (!value) return false;
  return daysSince(value) <= days;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString();
}

function formatCurrency(value: number) {
  return `€${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function severityOrder(severity: Severity) {
  if (severity === "high") return 0;
  if (severity === "medium") return 1;
  return 2;
}

function MetaPill({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value?: string;
  tone?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {value !== undefined && <span className={`font-semibold ${tone}`}>{value}</span>}
    </span>
  );
}
