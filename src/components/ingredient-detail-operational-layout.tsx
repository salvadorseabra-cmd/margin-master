import {
  ArrowLeftRight,
  BookOpen,
  ChevronRight,
  FileText,
  Loader2,
  Archive,
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
  buildIngredientOperationalSignals,
  deriveMarginExposureScore,
  deriveOperationalMood,
  formatIngredientOperationalHeadline,
  formatOperationalMoodLine,
  groupOperationalSignals,
  operationalMoodToneClass,
  pickOperationalSummarySignals,
} from "@/lib/buildIngredientOperationalSignals";
import {
  dismissIngredientInsight,
  readIngredientDismissedInsights,
} from "@/lib/ingredient-dismissed-insights";
import {
  appendIngredientOperationalNote,
  readIngredientOperationalNotes,
  removeIngredientOperationalNote,
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
import {
  buildOperationalInsightCards,
  operationalInsightCardClassName,
  operationalInsightIconClassName,
  type OperationalInsightCard,
  type OperationalInsightCardKind,
} from "@/lib/buildOperationalInsightCards";
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
  onArchive?: (id: string) => void;
  onDelete: (id: string) => void;
};

const sectionTitleClass = "text-xs font-medium text-muted-foreground/75";

const signalToneClass: Record<string, string> = {
  muted: "text-muted-foreground",
  caution: "text-warning-foreground/85",
  positive: "text-success/85",
  negative: "text-destructive/80",
};

const detailCardClass =
  "flex min-h-0 min-w-0 flex-col overflow-hidden border-border/50 bg-card shadow-sm lg:max-h-[min(72vh,680px)]";

function OperationalSummaryBlock({
  headline,
  moodLine,
  moodToneClass,
  marginExposureScore,
  signalGroups,
  lastPurchaseLabel,
  topRecipes,
  extraSignalCount,
  signalsExpanded,
  onToggleSignals,
}: {
  headline?: string;
  moodLine?: string;
  moodToneClass?: string;
  marginExposureScore: number | null;
  signalGroups: ReturnType<typeof groupOperationalSignals>;
  lastPurchaseLabel?: string;
  topRecipes?: string[];
  extraSignalCount?: number;
  signalsExpanded?: boolean;
  onToggleSignals?: () => void;
}) {
  if (!headline && signalGroups.length === 0 && marginExposureScore == null && !moodLine) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border/30 bg-muted/[0.03] px-3 py-2">
      <h3 className={sectionTitleClass}>Operational summary</h3>
      {headline ? (
        <p className="mt-1 text-sm font-medium leading-snug text-foreground/90">{headline}</p>
      ) : null}
      {moodLine ? (
        <p
          className={`mt-1 text-[11px] font-medium tracking-wide uppercase ${moodToneClass ?? "text-muted-foreground/70"}`}
        >
          {moodLine}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {marginExposureScore != null ? (
          <span className="inline-flex items-center rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            Margin exposure{" "}
            <span className="ml-1 font-semibold tabular-nums text-foreground/85">
              {marginExposureScore}/100
            </span>
          </span>
        ) : null}
        {lastPurchaseLabel ? (
          <span className="inline-flex items-center rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            Last purchase{" "}
            <span className="ml-1 font-medium text-foreground/85">{lastPurchaseLabel}</span>
          </span>
        ) : null}
        {topRecipes && topRecipes.length > 0 ? (
          <span className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            Top recipes{" "}
            <span className="ml-1 truncate font-medium text-foreground/85">
              {topRecipes.slice(0, 2).join(", ")}
              {topRecipes.length > 2 ? ` +${topRecipes.length - 2}` : ""}
            </span>
          </span>
        ) : null}
      </div>
      {signalGroups.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {signalGroups.map((group) => (
            <div key={group.category}>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {group.title}
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {group.signals.map((signal) => (
                  <li
                    key={signal.id}
                    className={`text-xs leading-snug ${signalToneClass[signal.tone] ?? "text-muted-foreground"}`}
                  >
                    {signal.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {extraSignalCount != null && extraSignalCount > 0 && onToggleSignals ? (
            <button
              type="button"
              onClick={onToggleSignals}
              className="text-[11px] text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
            >
              {signalsExpanded ? "Show fewer" : `Show ${extraSignalCount} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

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
    <div
      className={`${operationalInsightCardClassName(card.kind)} hover:[&>button]:opacity-100`}
    >
      <InsightCardIcon kind={card.kind} />
      <div className="relative z-0 min-w-0 flex-1 pr-5">
        <p className="text-xs leading-snug font-medium text-foreground/90">{card.text}</p>
        {card.detail ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/85">{card.detail}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss(card.id);
        }}
        className="absolute top-1.5 right-1.5 z-10 inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground"
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
      className={`flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 ${
        isBest ? "bg-success/[0.04]" : "bg-destructive/[0.04]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`text-[11px] font-medium ${isBest ? "text-success/90" : "text-destructive/85"}`}
        >
          {isBest ? "Best buy" : "Highest paid"}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium tabular-nums text-foreground/90">
          <span className={purchaseExtentPriceTextClassName(kind)}>
            {row.priceLabel.trim()}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground/85">
          {row.supplierLabel.trim()} · {formatPurchaseTimelineMonthDay(row.dateLabel)}
        </p>
      </div>
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 opacity-50 ${isBest ? "text-success/50" : "text-destructive/50"}`}
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
  onArchive,
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
  const [summarySignalsExpanded, setSummarySignalsExpanded] = useState(false);
  const [insightCardsExpanded, setInsightCardsExpanded] = useState(false);

  useEffect(() => {
    setSummarySignalsExpanded(false);
    setInsightCardsExpanded(false);
  }, [ingredient.id]);

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

  const operationalSummary = useMemo(() => {
    if (inListReview) {
      return {
        headline: undefined as string | undefined,
        mood: undefined as ReturnType<typeof deriveOperationalMood> | undefined,
        marginExposureScore: null as number | null,
        signalGroups: [] as ReturnType<typeof groupOperationalSignals>,
        hiddenSignalCount: 0,
        lastPurchaseLabel: undefined as string | undefined,
        topRecipes: undefined as string[] | undefined,
      };
    }

    const allSignals = buildIngredientOperationalSignals({
      ingredientId: ingredient.id,
      ingredientName: displayName,
      recentPurchases: sortedPurchases,
      priceActivity: priceActivity,
      recipeCount,
      lastPriceUpdateAt: sortedPurchases[0]?.dateLabel ?? priceActivity?.created_at ?? null,
    });
    const marginExposureScore = deriveMarginExposureScore({
      recipeCount,
    });
    const mood = deriveOperationalMood({
      signals: allSignals,
      recipeCount,
      marginExposureScore,
      recentPurchaseCount: sortedPurchases.length,
      hasStalePricing: allSignals.some((s) => s.id === "stale-invoice"),
    });
    const visibleSignals = summarySignalsExpanded
      ? allSignals
      : pickOperationalSummarySignals(allSignals, 3);
    const headline = formatIngredientOperationalHeadline(allSignals);
    const latestPurchase = sortedPurchases[0];

    return {
      headline,
      mood,
      marginExposureScore,
      signalGroups: groupOperationalSignals(visibleSignals),
      hiddenSignalCount: Math.max(0, allSignals.length - visibleSignals.length),
      lastPurchaseLabel: latestPurchase
        ? `${formatPurchaseTimelineMonthDay(latestPurchase.dateLabel)} · ${latestPurchase.supplierLabel.trim()}`
        : undefined,
      topRecipes: undefined,
    };
  }, [
    inListReview,
    ingredient.id,
    displayName,
    sortedPurchases,
    priceActivity,
    recipeCount,
    summarySignalsExpanded,
  ]);

  const insightCards = useMemo(() => {
    const cards = buildOperationalInsightCards({
      recentPurchases: inListReview ? [] : sortedPurchases,
      priceActivity: inListReview ? undefined : priceActivity,
      aliasCount: operationalProfile?.aliases.length ?? 0,
      recipeCount,
      ingredientName: displayName,
      maxCards: 6,
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
    displayName,
  ]);

  const visibleInsightCards = insightCardsExpanded ? insightCards : insightCards.slice(0, 3);
  const hiddenInsightCount = Math.max(0, insightCards.length - visibleInsightCards.length);

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

  const removeNote = (noteIndex: number) => {
    if (!userId) return;
    const next = removeIngredientOperationalNote(userId, ingredient.id, noteIndex);
    setSavedNotes(next);
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
            {onArchive ? (
              <DropdownMenuItem onClick={() => onArchive(ingredient.id)}>
                <Archive className="mr-2 h-3.5 w-3.5" />
                Archive
              </DropdownMenuItem>
            ) : null}
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
          {!inListReview ? (
            <OperationalSummaryBlock
              headline={operationalSummary.headline}
              moodLine={
                operationalSummary.mood
                  ? `${operationalSummary.mood} · ${formatOperationalMoodLine(operationalSummary.mood)}`
                  : undefined
              }
              moodToneClass={
                operationalSummary.mood
                  ? operationalMoodToneClass(operationalSummary.mood)
                  : undefined
              }
              marginExposureScore={operationalSummary.marginExposureScore}
              signalGroups={operationalSummary.signalGroups}
              lastPurchaseLabel={operationalSummary.lastPurchaseLabel}
              topRecipes={operationalSummary.topRecipes}
              extraSignalCount={operationalSummary.hiddenSignalCount}
              signalsExpanded={summarySignalsExpanded}
              onToggleSignals={() => setSummarySignalsExpanded((value) => !value)}
            />
          ) : null}

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
              <div className="grid gap-1.5 border-t border-border/20 px-3 py-2 sm:grid-cols-2">
                <PurchaseExtentCard kind="best" row={purchaseExtents.best} />
                {purchaseExtents.showWorstPurchase && purchaseExtents.worst ? (
                  <PurchaseExtentCard kind="worst" row={purchaseExtents.worst} />
                ) : (
                  <div className="hidden sm:block" aria-hidden />
                )}
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-border/30 bg-muted/[0.02] px-3 py-2">
            <h3 className={sectionTitleClass}>Notes &amp; insights</h3>
            {visibleInsightCards.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {visibleInsightCards.map((card) => (
                  <OperationalInsightCardView
                    key={card.id}
                    card={card}
                    onDismiss={dismissInsight}
                  />
                ))}
                {hiddenInsightCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setInsightCardsExpanded((value) => !value)}
                    className="text-[11px] text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {insightCardsExpanded
                      ? "Show fewer insights"
                      : `Show ${hiddenInsightCount} more`}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground/80">No insights yet.</p>
            )}
            {savedNotes.length > 0 ? (
              <ul className="mt-2.5 space-y-1 border-t border-border/20 pt-2">
                {savedNotes.map((note, noteIndex) => (
                  <li
                    key={`${noteIndex}-${note}`}
                    className="group relative flex items-start gap-1 rounded-sm py-0.5 text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="relative z-0 min-w-0 flex-1">{note}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeNote(noteIndex);
                      }}
                      className="relative z-10 inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground/60 hover:bg-muted/50 hover:text-muted-foreground"
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
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
