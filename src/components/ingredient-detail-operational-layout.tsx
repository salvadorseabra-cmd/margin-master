import { LineChart, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/AppShell";
import { CanonicalIngredientNamingReviewSection } from "@/components/canonical-ingredient-naming-review-section";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { ActionableCanonicalNamingQueueEntry } from "@/lib/canonical-ingredient-naming-queue";
import {
  buildOperationalInsights,
  buildIngredientDetailKpis,
  buildIngredientDetailSections,
  buildRecipeImpactLabel,
  findCheapestPurchaseItemId,
  findMostExpensivePurchaseItemId,
  formatLastPurchaseAgo,
  purchasePriceExtentsDiffer,
  purchaseRowDotClassName,
  formatPurchaseTimelineDate,
  formatPurchaseProductHint,
  insightChipClassName,
  insightChipDotClassName,
  type IngredientDetailInsightChip,
  sortRecentPurchasesByDate,
} from "@/lib/ingredient-detail-panel";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import { loadMatchingIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  buildRecentPurchases,
  type RecentPurchaseRow,
} from "@/lib/ingredient-purchase-memory";
import { detectAffectedRecipes } from "@/lib/recipe-impact";
import { loadIngredientMatchedInvoiceProducts } from "@/lib/ingredient-operational-intelligence";
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

const sectionTitleClass =
  "text-[11px] font-semibold uppercase tracking-wide text-foreground/65";

const sectionShellClass = "rounded-lg bg-muted/[0.07] px-2 py-1.5";

export function IngredientDetailOperationalLayout(props: IngredientDetailPanelProps) {
  const { ingredient } = props;

  if (!ingredient) {
    return (
      <Card className="flex min-h-[188px] min-w-0 flex-col items-center justify-center gap-2 self-stretch border-dashed border-border/40 bg-muted/[0.03] px-5 py-6 lg:max-h-[min(70vh,640px)]">
        <LineChart
          className="h-5 w-5 text-muted-foreground/35"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="max-w-[18rem] text-center text-sm leading-relaxed text-muted-foreground/90">
          Select an ingredient to view purchasing intelligence and recipe impact.
        </p>
      </Card>
    );
  }

  return <IngredientDetailContent {...props} ingredient={ingredient} />;
}

function IngredientDetailContent({
  ingredient,
  userId,
  recipeLinkActivity,
  namingReviewActive,
  namingReviewQueue,
  namingReviewIndex,
  onNamingReviewIndexChange,
  onExitNamingReview,
  onNamingReviewQueueChanged,
  onClose,
  onRename,
  onDelete,
}: IngredientDetailPanelProps & { ingredient: Row }) {
  const displayName = formatCanonicalIngredientDisplayName(ingredient.name);
  const recipeCount = recipeLinkActivity?.count ?? 0;

  const [recentPurchases, setRecentPurchases] = useState<RecentPurchaseRow[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [recipeNames, setRecipeNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setRecentPurchases([]);
    setPurchasesLoading(Boolean(userId));

    if (!userId) {
      setPurchasesLoading(false);
      return;
    }

    void (async () => {
      try {
        const [{ rows: catalog }, confirmedAliases] = await Promise.all([
          loadMatchingIngredientCatalog(supabase),
          loadConfirmedIngredientAliasMap(supabase),
        ]);
        const matched = await loadIngredientMatchedInvoiceProducts(
          supabase,
          userId,
          ingredient.id,
          catalog,
          confirmedAliases,
        );
        if (cancelled) return;
        const built = buildRecentPurchases(ingredient.id, displayName, matched.products);
        setRecentPurchases(sortRecentPurchasesByDate(built).slice(0, 6));
      } catch {
        if (!cancelled) setRecentPurchases([]);
      } finally {
        if (!cancelled) setPurchasesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ingredient.id, userId, displayName]);

  useEffect(() => {
    let cancelled = false;
    setRecipeNames([]);
    void detectAffectedRecipes(supabase, ingredient.id).then((rows) => {
      if (cancelled) return;
      setRecipeNames(rows.map((row) => row.recipeName));
    });
    return () => {
      cancelled = true;
    };
  }, [ingredient.id]);

  const sortedPurchases = useMemo(
    () => sortRecentPurchasesByDate(recentPurchases),
    [recentPurchases],
  );

  const insightChips = useMemo(
    () =>
      buildOperationalInsights({
        recentPurchases: sortedPurchases,
        recipeCount,
      }),
    [sortedPurchases, recipeCount],
  );

  const sections = buildIngredientDetailSections({
    recentPurchaseCount: sortedPurchases.length,
    recipeCount,
    priceHistoryReady: false,
    priceHistoryCount: 0,
    insightCount: insightChips.length,
    purchaseInsightReady: false,
    summaryNoteCount: 0,
  });

  const kpis = useMemo(
    () =>
      buildIngredientDetailKpis({
        ingredient,
        recipeCount,
        recentPurchases: sortedPurchases,
      }),
    [ingredient, recipeCount, sortedPurchases],
  );

  const recipeImpact = buildRecipeImpactLabel(recipeCount, recipeNames);
  const cheapestPurchaseId = findCheapestPurchaseItemId(sortedPurchases);
  const mostExpensivePurchaseId = findMostExpensivePurchaseItemId(sortedPurchases);
  const showPurchasePriceExtents = purchasePriceExtentsDiffer(sortedPurchases);
  const lastPurchaseAgo = formatLastPurchaseAgo(sortedPurchases);

  return (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border/80 bg-card/95 p-0 shadow-sm lg:max-h-[min(70vh,640px)]">
      <header className="flex items-start justify-between gap-2 border-b border-border/45 px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground">
            {displayName}
          </h2>
          {lastPurchaseAgo && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{lastPurchaseAgo}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onRename(ingredient.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Rename ingredient"
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

      <div className={`border-b border-border/45 px-2.5 py-1.5 ${sectionShellClass}`}>
        <div className="mx-auto grid w-full max-w-lg grid-cols-2 gap-1 sm:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-md border border-border/50 bg-card/80 px-1.5 py-1"
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold tabular-nums tracking-tight text-foreground">
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1.5">
        <div className="mx-auto w-full max-w-lg space-y-2">
          {sections.showInsights && (
            <section className={sectionShellClass}>
              <div className="flex flex-wrap gap-1">
                {insightChips.map((chip) => (
                  <OperationalInsightChip key={chip.id} chip={chip} />
                ))}
              </div>
            </section>
          )}

          {sections.showRecipeImpact && recipeImpact && (
            <section className="rounded-lg border border-primary/15 bg-primary/[0.04] px-2 py-1.5">
              <h3 className={sectionTitleClass}>Recipe impact</h3>
              <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">
                {recipeImpact}
              </p>
            </section>
          )}

          {namingReviewActive && (
            <CanonicalIngredientNamingReviewSection
              queue={namingReviewQueue}
              index={namingReviewIndex}
              userId={userId}
              onIndexChange={onNamingReviewIndexChange}
              onExit={onExitNamingReview}
              onRename={(id, suggestedName) => onRename(id, suggestedName)}
              onQueueChanged={onNamingReviewQueueChanged}
            />
          )}

          {sections.showRecentPurchases && (
            <section className={sectionShellClass}>
              <h3 className={sectionTitleClass}>Recent purchases</h3>
              <ul className="mt-1 divide-y divide-border/35">
                {sortedPurchases.map((purchase, index) => {
                  const isCheapest =
                    showPurchasePriceExtents && purchase.itemId === cheapestPurchaseId;
                  const isMostExpensive =
                    showPurchasePriceExtents &&
                    purchase.itemId === mostExpensivePurchaseId;
                  const isLatest = index === 0;
                  const productHint = formatPurchaseProductHint(purchase);
                  return (
                    <li
                      key={purchase.itemId}
                      className={`relative py-1.5 pl-3 ${isLatest ? "rounded-md bg-card/70" : ""}`}
                    >
                      <span
                        className={`absolute left-0 top-2.5 h-1.5 w-1.5 rounded-full ${purchaseRowDotClassName(
                          purchase.itemId,
                          sortedPurchases,
                        )}`}
                        aria-hidden
                      />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {purchase.supplierLabel}
                        </span>
                        <span className="shrink-0 text-sm font-extrabold tabular-nums tracking-tight text-foreground">
                          {purchase.priceLabel}
                        </span>
                      </div>
                      {productHint && (
                        <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground/85">
                          {productHint}
                        </p>
                      )}
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground/45">
                          {formatPurchaseTimelineDate(purchase)}
                        </span>
                        {(isCheapest || isMostExpensive) && (
                          <span className="flex shrink-0 items-center gap-1.5">
                            {isCheapest && (
                              <span className="text-[10px] font-medium text-success/90">
                                Lowest
                              </span>
                            )}
                            {isMostExpensive && (
                              <span className="text-[10px] font-medium text-destructive/85">
                                Highest
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {purchasesLoading && (
                <p className="mt-1 text-xs text-muted-foreground">Loading purchases…</p>
              )}
            </section>
          )}
        </div>
      </div>
    </Card>
  );
}

function OperationalInsightChip({ chip }: { chip: IngredientDetailInsightChip }) {
  return (
    <span
      className={`inline-flex min-h-[20px] items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-snug ${insightChipClassName(chip.tone)}`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${insightChipDotClassName(chip.tone)}`}
        aria-hidden
      />
      {chip.label}
    </span>
  );
}
