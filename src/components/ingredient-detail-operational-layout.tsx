import {
  ArrowLeftRight,
  BookOpen,
  ChevronRight,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Tags,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/AppShell";
import { CanonicalIngredientNamingReviewSection } from "@/components/canonical-ingredient-naming-review-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCanonicalIngredientDisplayName } from "@/lib/canonical-ingredient-display-name";
import type { ActionableCanonicalNamingQueueEntry } from "@/lib/canonical-ingredient-naming-queue";
import {
  buildOperationalInsightCards,
  operationalInsightCardClassName,
  operationalInsightIconClassName,
  type OperationalInsightCard,
  type OperationalInsightCardKind,
} from "@/lib/buildOperationalInsightCards";
import {
  dismissIngredientInsight,
  readIngredientDismissedInsights,
} from "@/lib/ingredient-dismissed-insights";
import {
  appendIngredientOperationalNote,
  readIngredientOperationalNotes,
} from "@/lib/ingredient-operational-notes";
import {
  buildDuplicateReviewDetail,
  buildIngredientPurchaseInsights,
  buildUnusedEntryReviewDetail,
  formatPurchaseHistoryCatalogLine,
  formatPurchaseHistoryEntryDate,
  formatPurchaseHistoryEntryPrice,
  formatPurchaseHistorySupplierLine,
  formatPurchaseTimelineMonthDay,
  purchaseExtentPriceTextClassName,
  purchaseHistoryPriceTextClassName,
  sortRecentPurchasesByDate,
  type IngredientReviewDetailSection,
} from "@/lib/ingredient-detail-panel";
import { ingredientDisplayBaseUnit } from "@/lib/ingredient-unit-cost";
import {
  detectOrphanCanonicalIngredients,
  emptyOrphanReport,
  type IngredientOrphanReport,
} from "@/lib/ingredient-orphan-detection";
import type { IngredientMergeCluster } from "@/lib/ingredient-merge-hooks";
import type { InitialOperationalBrief } from "@/lib/buildInitialOperationalBrief";
import type { OperationalListFilter } from "@/lib/operational-review-queue";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import { loadMatchingIngredientCatalog } from "@/lib/ingredient-catalog-load";
import { buildRecentPurchases, type RecentPurchaseRow } from "@/lib/ingredient-purchase-memory";
import {
  loadIngredientMatchedInvoiceProducts,
  loadIngredientOperationalProfile,
  type IngredientOperationalProfile,
} from "@/lib/ingredient-operational-intelligence";
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
  initialOperationalBrief?: InitialOperationalBrief | null;
  listReviewMode?: OperationalListFilter | null;
  duplicateCluster?: IngredientMergeCluster | null;
  recipeCountById?: Readonly<Record<string, number>>;
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
  onExitListReview?: () => void;
  onApplyListFilter?: (filter: OperationalListFilter | null) => void;
  onSelectIngredient?: (ingredientId: string) => void;
  onRename: (id: string, suggestedName?: string | null) => void;
  onDelete: (id: string) => void;
};

const sectionTitleClass = "text-xs font-medium text-muted-foreground/75";

const detailCardClass =
  "flex min-h-0 min-w-0 flex-col overflow-hidden border-border/50 bg-card shadow-sm lg:max-h-[min(72vh,680px)]";

function InsightCardIcon({ kind }: { kind: OperationalInsightCardKind }) {
  const className = `mt-0.5 h-3.5 w-3.5 shrink-0 ${operationalInsightIconClassName(kind)}`;
  switch (kind) {
    case "supplier-changed":
      return <ArrowLeftRight className={className} aria-hidden />;
    case "supplier-price-up":
    case "price-spread":
    case "lower-historical-price":
    case "no-longer-cheapest":
      return <TrendingUp className={className} aria-hidden />;
    case "recipe-usage":
      return <BookOpen className={className} aria-hidden />;
    case "multiple-aliases":
      return <Tags className={className} aria-hidden />;
    case "pack-size-changed":
    case "catalog-mapping-changed":
      return <FileText className={className} aria-hidden />;
    default:
      return <TrendingUp className={className} aria-hidden />;
  }
}

function OperationalInsightCardView({
  card,
  onDismiss,
}: {
  card: OperationalInsightCard;
  onDismiss: (insightId: string) => void;
}) {
  return (
    <div className={operationalInsightCardClassName(card.kind)}>
      <InsightCardIcon kind={card.kind} />
      <div className="min-w-0 flex-1 pr-5">
        <p className="text-xs leading-snug font-medium text-foreground/90">{card.text}</p>
        {card.detail ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/85">{card.detail}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(card.id)}
        className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground"
        aria-label="Dismiss insight"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

function EmptyWorkspacePanel() {
  return (
    <div className="flex min-h-[12rem] flex-1 flex-col justify-center px-5 py-8">
      <p className="text-sm font-medium text-foreground/85">Select an ingredient</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        Purchase history and notes appear here.
      </p>
    </div>
  );
}

function PurchaseExtentCard({
  kind,
  row,
}: {
  kind: "best" | "worst";
  row: {
    supplierLabel: string;
    priceLabel: string;
    dateLabel: string;
  };
}) {
  const isBest = kind === "best";
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${
        isBest ? "bg-success/5" : "bg-destructive/5"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs font-semibold ${isBest ? "text-success" : "text-destructive"}`}
        >
          {isBest ? "Best purchase" : "Most expensive"}
        </p>
        <p className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground">
          <span className={purchaseExtentPriceTextClassName(kind)}>
            {row.priceLabel.trim()}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {row.supplierLabel.trim()} · {formatPurchaseTimelineMonthDay(row.dateLabel)}
        </p>
      </div>
      <ChevronRight
        className={`h-4 w-4 shrink-0 ${isBest ? "text-success/60" : "text-destructive/60"}`}
        aria-hidden
      />
    </div>
  );
}

export function IngredientDetailOperationalLayout(props: IngredientDetailPanelProps) {
  const { ingredient } = props;

  if (!ingredient) {
    return (
      <Card className={`${detailCardClass} p-0`}>
        <EmptyWorkspacePanel />
      </Card>
    );
  }

  return <IngredientDetailContent {...props} ingredient={ingredient} />;
}

function IngredientDetailContent({
  ingredient,
  userId,
  catalog,
  listReviewMode = null,
  duplicateCluster = null,
  recipeCountById = {},
  priceActivity,
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
  const stockUnit = ingredientDisplayBaseUnit(ingredient);
  const purchaseUnit = ingredient.purchase_unit?.trim();
  const headerSubtitle =
    purchaseUnit && purchaseUnit.toLowerCase() !== stockUnit.toLowerCase()
      ? purchaseUnit
      : stockUnit
        ? `${stockUnit} unit`
        : null;
  const recipeCount = recipeLinkActivity?.count ?? 0;
  const inListReview = listReviewMode != null && !namingReviewActive;

  const [recentPurchases, setRecentPurchases] = useState<RecentPurchaseRow[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [operationalProfile, setOperationalProfile] = useState<IngredientOperationalProfile | null>(
    null,
  );
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [dismissedInsightIds, setDismissedInsightIds] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [orphanReport, setOrphanReport] = useState<IngredientOrphanReport | null>(null);

  const catalogCanonicalInput = useMemo(
    () =>
      catalog.map((row) => ({
        id: row.id,
        name: row.name,
        normalized_name: row.normalized_name,
        created_at: row.created_at,
      })),
    [catalog],
  );

  useEffect(() => {
    if (!userId) {
      setSavedNotes([]);
      setDismissedInsightIds([]);
      return;
    }
    setSavedNotes(readIngredientOperationalNotes(userId)[ingredient.id] ?? []);
    setDismissedInsightIds(
      readIngredientDismissedInsights(userId)[ingredient.id] ?? [],
    );
    setNoteDraft("");
  }, [userId, ingredient.id]);

  useEffect(() => {
    let cancelled = false;
    setRecentPurchases([]);
    setOperationalProfile(null);
    setPurchasesLoading(Boolean(userId));

    if (!userId) {
      setPurchasesLoading(false);
      return;
    }

    void (async () => {
      try {
        const [{ rows: matchCatalog }, confirmedAliases, profile] = await Promise.all([
          loadMatchingIngredientCatalog(supabase),
          loadConfirmedIngredientAliasMap(supabase),
          loadIngredientOperationalProfile(supabase, ingredient.id, userId),
        ]);
        const matched = await loadIngredientMatchedInvoiceProducts(
          supabase,
          userId,
          ingredient.id,
          matchCatalog,
          confirmedAliases,
        );
        if (cancelled) return;
        const built = buildRecentPurchases(ingredient.id, displayName, matched.products);
        setRecentPurchases(sortRecentPurchasesByDate(built).slice(0, 8));
        setOperationalProfile(profile);
      } catch {
        if (!cancelled) {
          setRecentPurchases([]);
          setOperationalProfile(null);
        }
      } finally {
        if (!cancelled) setPurchasesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ingredient.id, userId, displayName]);

  useEffect(() => {
    if (listReviewMode !== "unused") {
      setOrphanReport(null);
      return;
    }
    let cancelled = false;
    const catalogInput = catalog.map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: row.normalized_name,
    }));
    void detectOrphanCanonicalIngredients(supabase, catalogInput).then(({ reports }) => {
      if (cancelled) return;
      setOrphanReport(reports.get(ingredient.id) ?? emptyOrphanReport(ingredient.id));
    });
    return () => {
      cancelled = true;
    };
  }, [listReviewMode, ingredient.id, catalog]);

  const reviewSection = useMemo((): IngredientReviewDetailSection | null => {
    if (!inListReview || !listReviewMode) return null;
    if (listReviewMode === "duplicates" && duplicateCluster) {
      return buildDuplicateReviewDetail({
        cluster: duplicateCluster,
        catalog,
        recipeCountById,
      });
    }
    if (listReviewMode === "unused" && orphanReport) {
      return buildUnusedEntryReviewDetail(orphanReport);
    }
    return null;
  }, [inListReview, listReviewMode, duplicateCluster, catalog, recipeCountById, orphanReport]);

  const sortedPurchases = useMemo(
    () => sortRecentPurchasesByDate(recentPurchases),
    [recentPurchases],
  );

  const purchaseExtents = useMemo(
    () => buildIngredientPurchaseInsights(sortedPurchases),
    [sortedPurchases],
  );

  const insightCards = useMemo(() => {
    const cards = buildOperationalInsightCards({
      recentPurchases: inListReview ? [] : sortedPurchases,
      priceActivity: inListReview ? undefined : priceActivity,
      aliasCount: operationalProfile?.aliases.length ?? 0,
      recipeCount,
    });
    const dismissed = new Set(dismissedInsightIds);
    return cards.filter((card) => !dismissed.has(card.id));
  }, [
    sortedPurchases,
    priceActivity,
    operationalProfile,
    recipeCount,
    inListReview,
    dismissedInsightIds,
  ]);

  const dismissInsight = (insightId: string) => {
    if (!userId) return;
    const next = dismissIngredientInsight(userId, ingredient.id, insightId);
    setDismissedInsightIds(next);
  };

  const saveNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed || !userId) return;
    setNoteSaving(true);
    const next = appendIngredientOperationalNote(userId, ingredient.id, trimmed);
    setSavedNotes(next);
    setNoteDraft("");
    setNoteSaving(false);
  };

  return (
    <Card className={`${detailCardClass} p-0`}>
      <header className="flex items-start justify-between gap-3 border-b border-border/25 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="truncate text-xl font-semibold leading-tight tracking-tight text-foreground">
            {displayName}
          </h2>
          {headerSubtitle ? (
            <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              aria-label="Ingredient actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onRename(ingredient.id)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(ingredient.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onClose}>Close panel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-3">
          <section className="overflow-hidden rounded-lg border border-border/30 bg-muted/[0.02]">
            <h3 className={`border-b border-border/20 px-3 py-2 ${sectionTitleClass}`}>
              Purchase history
            </h3>
            {purchasesLoading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading purchases…
              </div>
            ) : sortedPurchases.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/20 text-left text-xs font-medium text-muted-foreground/70">
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
                      <th className="px-3 py-2 font-medium">Supplier</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                        Price / unit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/25">
                    {sortedPurchases.map((purchase) => {
                      const catalogLine = formatPurchaseHistoryCatalogLine(purchase);
                      const priceClass = purchaseHistoryPriceTextClassName(
                        purchase.itemId,
                        sortedPurchases,
                      );
                      return (
                        <tr key={purchase.itemId} className="align-top">
                          <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                            {formatPurchaseHistoryEntryDate(purchase)}
                          </td>
                          <td className="min-w-0 px-3 py-2.5">
                            <p className="truncate text-sm font-medium text-foreground">
                              {formatPurchaseHistorySupplierLine(purchase)}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-right align-top tabular-nums whitespace-nowrap">
                            <span className={`text-sm font-medium ${priceClass}`}>
                              {formatPurchaseHistoryEntryPrice(purchase)}
                            </span>
                            {catalogLine ? (
                              <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground/70">
                                {catalogLine}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No confirmed purchases on file
              </p>
            )}

            {purchaseExtents.best ? (
              <div className="grid gap-2 border-t border-border/20 p-3 sm:grid-cols-2">
                <PurchaseExtentCard kind="best" row={purchaseExtents.best} />
                {purchaseExtents.showWorstPurchase && purchaseExtents.worst ? (
                  <PurchaseExtentCard kind="worst" row={purchaseExtents.worst} />
                ) : (
                  <div className="hidden sm:block" aria-hidden />
                )}
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-border/30 bg-muted/[0.02] px-3 py-2.5">
            <h3 className={sectionTitleClass}>Notes &amp; insights</h3>
            {insightCards.length > 0 ? (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {insightCards.map((card) => (
                  <OperationalInsightCardView
                    key={card.id}
                    card={card}
                    onDismiss={dismissInsight}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground/80">No insights yet.</p>
            )}
            {savedNotes.length > 0 ? (
              <ul className="mt-2.5 space-y-1 border-t border-border/20 pt-2">
                {savedNotes.map((note) => (
                  <li key={note} className="text-xs leading-relaxed text-muted-foreground">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveNote();
                  }
                }}
                placeholder="Add a note..."
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="button"
                disabled={noteSaving || !noteDraft.trim() || !userId}
                onClick={saveNote}
                className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save note
              </button>
            </div>
          </section>

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
        </div>
      </div>
    </Card>
  );
}
