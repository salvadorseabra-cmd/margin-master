import { Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/AppShell";
import { CanonicalIngredientNamingReviewSection } from "@/components/canonical-ingredient-naming-review-section";
import { CanonicalIngredientSuggestionsSection } from "@/components/canonical-ingredient-suggestions-section";
import { IngredientFamilySection } from "@/components/ingredient-family-section";
import { PurchaseMemorySection } from "@/components/purchase-memory-section";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { ActionableCanonicalNamingQueueEntry } from "@/lib/canonical-ingredient-naming-queue";
import {
  effectiveIngredientUnitCostEur,
  ingredientDisplayBaseUnit,
} from "@/lib/ingredient-unit-cost";
import {
  formatCurrency,
  formatPercent,
  formatQuantityWithUnit,
  formatUnitCostCurrency,
} from "@/lib/display-format";
import { inferPurchaseUnitsFromLineItemName } from "@/lib/ingredient-unit-inference";
import {
  getIngredientPriceTrend,
  type IngredientPriceHistoryRow,
} from "@/lib/ingredient-price-history";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Row = Tables<"ingredients">;

type PriceActivity = Pick<
  Tables<"ingredient_price_history">,
  "created_at" | "delta" | "delta_percent" | "ingredient_id"
>;

type RecipeLinkActivity = {
  count: number;
  recentlyLinked: boolean;
};

export type IngredientDetailPanelProps = {
  ingredient: Row | null;
  userId: string | undefined;
  catalog: Row[];
  priceActivity: PriceActivity | undefined;
  recipeLinkActivity: RecipeLinkActivity | undefined;
  namingReviewActive: boolean;
  namingReviewQueue: ActionableCanonicalNamingQueueEntry[];
  namingReviewIndex: number;
  onNamingReviewIndexChange: (index: number) => void;
  onExitNamingReview: () => void;
  onNamingReviewQueueChanged: () => void;
  onClose: () => void;
  onSelectRelated: (ingredientId: string) => void;
  onRename: (id: string, suggestedName?: string | null) => void;
  onDelete: (id: string) => void;
};

export function IngredientDetailOperationalLayout(props: IngredientDetailPanelProps) {
  const { ingredient } = props;

  if (!ingredient) {
    return (
      <Card className="h-fit border-dashed bg-card/70 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ingredient details
        </div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Select a row for pack cost, supplier links, and recipe exposure.
        </p>
      </Card>
    );
  }

  return <IngredientDetailContent {...props} ingredient={ingredient} />;
}

function IngredientDetailContent({
  ingredient,
  userId,
  catalog,
  priceActivity,
  recipeLinkActivity,
  namingReviewActive,
  namingReviewQueue,
  namingReviewIndex,
  onNamingReviewIndexChange,
  onExitNamingReview,
  onNamingReviewQueueChanged,
  onClose,
  onSelectRelated,
  onRename,
  onDelete,
}: IngredientDetailPanelProps & { ingredient: Row }) {
  const base = ingredientDisplayBaseUnit(ingredient);
  const pq = Number(ingredient.purchase_quantity);
  const denom = Number.isFinite(pq) && pq > 0 ? pq : 1;
  const eff = effectiveIngredientUnitCostEur(ingredient);
  const usageCount = recipeLinkActivity?.count ?? 0;
  const packLabel = ingredient.purchase_unit?.trim() || ingredient.unit;
  const inferred = inferPurchaseUnitsFromLineItemName(ingredient.name);
  const conversionHint = denom > 1 ? null : inferred.conversion_hint;
  const stockQuantityLabel =
    denom > 1
      ? formatQuantityWithUnit(denom, ingredient.purchase_unit || base)
      : formatQuantityWithUnit(1, ingredient.unit);
  const purchasePackLabel =
    denom > 1
      ? `1 pack → ${stockQuantityLabel}`
      : conversionHint
        ? `1 ${conversionHint.purchase_unit}`
        : `1 ${ingredient.unit || base}`;
  const recipeUsageUnit = conversionHint ? `${conversionHint.recipe_usage_unit} (hint)` : base;
  const yieldLabel = conversionHint
    ? `${formatQuantityWithUnit(conversionHint.estimated_quantity, conversionHint.stock_unit)} / ${conversionHint.purchase_unit}`
    : denom > 1
      ? stockQuantityLabel
      : "—";
  const recentlyUpdated = priceActivity && isRecentDate(priceActivity.created_at);
  const recipeStatus =
    usageCount > 0
      ? `In ${formatRecipeCount(usageCount)}${recipeLinkActivity?.recentlyLinked ? " · recent link" : ""}`
      : "Not in recipes";

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
      <header className="flex items-start justify-between gap-2 border-b border-border/60 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight tracking-tight">
            {formatCanonicalIngredientDisplayName(ingredient.name)}
          </h2>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{recipeStatus}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onRename(ingredient.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Rename catalog ingredient"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(ingredient.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive"
            aria-label="Delete ingredient"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Close ingredient details"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-1 border-b border-border/50 px-2.5 py-1.5 sm:grid-cols-4">
        <DetailMetric
          label="Pack price"
          value={formatCurrency(Number(ingredient.current_price))}
          helper={denom > 1 ? formatQuantityWithUnit(denom, packLabel) : `per ${base}`}
        />
        <DetailMetric
          label="Unit cost"
          value={formatUnitCostCurrency(eff)}
          helper={`per ${base}`}
        />
        <DetailMetric label="Stock qty" value={stockQuantityLabel} helper={denom > 1 ? "Per pack" : "Unit"} />
        <DetailMetric label="Recipes" value={String(usageCount)} helper="Linked" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="space-y-2 min-w-0">
            <CompactPanel title="Operational status">
              <div className="mb-1 flex justify-end">
                <span className="rounded border border-border/60 bg-background/50 px-1.5 py-px text-[9px] font-medium text-muted-foreground">
                  {recentlyUpdated ? "Recently updated" : "In cost library"}
                </span>
              </div>
              <CompactRow label="Purchase pack" value={purchasePackValue(ingredient, denom, packLabel, base)} />
              <CompactRow label="Purchase unit" value={purchasePackLabel} />
              <CompactRow label="Recipe usage unit" value={recipeUsageUnit} />
              <CompactRow label="Yield / usable" value={yieldLabel} />
              <CompactRow label="Linked recipes" value={formatRecipeCount(usageCount)} />
            </CompactPanel>

            {namingReviewActive ? (
              <CanonicalIngredientNamingReviewSection
                queue={namingReviewQueue}
                index={namingReviewIndex}
                userId={userId}
                onIndexChange={onNamingReviewIndexChange}
                onExit={onExitNamingReview}
                onRename={(id, suggestedName) => onRename(id, suggestedName)}
                onQueueChanged={onNamingReviewQueueChanged}
              />
            ) : (
              <CanonicalIngredientSuggestionsSection
                ingredient={ingredient}
                userId={userId}
                catalog={catalog}
                onRename={(id, suggestedName) => onRename(id, suggestedName)}
              />
            )}

            <IngredientFamilySection
              ingredient={ingredient}
              userId={userId}
              catalog={catalog}
              onSelectRelated={onSelectRelated}
            />
          </div>

          <div className="space-y-2 min-w-0">
            <PurchaseMemorySection
              ingredientId={ingredient.id}
              userId={userId}
              canonicalName={formatCanonicalIngredientDisplayName(ingredient.name)}
              variant="compact"
            />

            <CompactPanel title="Price movement">
              {priceActivity ? (
                <>
                  <CompactRow
                    label="Latest"
                    value={formatActivityChange(priceActivity)}
                    valueClassName={getActivityTone(priceActivity)}
                  />
                  <CompactRow
                    label="Recency"
                    value={
                      recentlyUpdated ? "Changed in last 14 days" : "Stable in last 14 days"
                    }
                  />
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground">No logged price changes.</p>
              )}
            </CompactPanel>
          </div>
        </div>

        <IngredientPriceHistoryCompact ingredientId={ingredient.id} />
      </div>
    </Card>
  );
}

function IngredientPriceHistoryCompact({ ingredientId }: { ingredientId: string }) {
  const [rows, setRows] = useState<IngredientPriceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getIngredientPriceTrend(supabase, ingredientId, { limit: 8 }).then((data) => {
      if (cancelled) return;
      setRows([...data].slice(-6).reverse());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ingredientId]);

  return (
    <CompactPanel title="Price history" className="mt-2">
      {loading ? (
        <p className="text-[10px] text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded border border-dashed border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
          No price history yet.
        </p>
      ) : (
        <ul className="max-h-24 space-y-0.5 overflow-y-auto overscroll-contain">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 text-[10px] leading-tight"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {formatHistoryDate(row.created_at)}
                {row.supplier_name ? ` · ${row.supplier_name}` : ""}
              </span>
              <span className={`shrink-0 tabular-nums font-medium ${historyDeltaTone(row)}`}>
                {formatHistoryDelta(row)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CompactPanel>
  );
}

function CompactPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 ${className}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 space-y-0.5">{children}</div>
    </section>
  );
}

function CompactRow({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-px">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-[11px] font-medium ${valueClassName}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function DetailMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="min-w-0 rounded border border-border/60 bg-background/30 px-1.5 py-1">
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{helper}</div>
    </div>
  );
}

function purchasePackValue(
  ingredient: Row,
  denom: number,
  packLabel: string,
  base: string,
): string {
  if (denom > 1) {
    return `${formatCurrency(Number(ingredient.current_price))} / ${formatQuantityWithUnit(denom, packLabel)}`;
  }
  return `${formatCurrency(Number(ingredient.current_price))} per ${base}`;
}

function formatRecipeCount(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

function formatActivityChange(activity: PriceActivity) {
  const deltaPercent = activity.delta_percent;
  if (typeof deltaPercent === "number" && deltaPercent !== 0) {
    return formatPercent(deltaPercent, { signDisplay: "always" });
  }
  const delta = activity.delta;
  if (typeof delta === "number" && delta !== 0) {
    return `${delta > 0 ? "+" : ""}${formatCurrency(delta)}`;
  }
  return "Updated";
}

function getActivityTone(activity: PriceActivity) {
  const deltaPercent = activity.delta_percent;
  if (typeof deltaPercent === "number" && deltaPercent > 0) return "text-destructive";
  if (typeof deltaPercent === "number" && deltaPercent < 0) return "text-success";
  const delta = activity.delta;
  if (typeof delta === "number" && delta > 0) return "text-destructive";
  if (typeof delta === "number" && delta < 0) return "text-success";
  return "text-foreground";
}

function formatHistoryDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

function formatHistoryDelta(row: IngredientPriceHistoryRow) {
  const pct = row.delta_percent;
  if (typeof pct === "number" && pct !== 0) {
    return formatPercent(pct, { signDisplay: "always" });
  }
  const delta = row.delta;
  if (typeof delta === "number" && delta !== 0) {
    return `${delta > 0 ? "+" : ""}${formatCurrency(delta)}`;
  }
  return formatCurrency(Number(row.new_price));
}

function historyDeltaTone(row: IngredientPriceHistoryRow) {
  const pct = row.delta_percent;
  if (typeof pct === "number" && pct > 0) return "text-destructive";
  if (typeof pct === "number" && pct < 0) return "text-success";
  const delta = row.delta;
  if (typeof delta === "number" && delta > 0) return "text-destructive";
  if (typeof delta === "number" && delta < 0) return "text-success";
  return "text-foreground";
}

function isRecentDate(value: string | null | undefined, days = 14) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}
