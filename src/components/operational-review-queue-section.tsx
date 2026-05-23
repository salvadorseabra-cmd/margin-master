import { AlertCircle, ChevronRight, Copy, FolderOpen, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOperationalPriorityTiers,
  buildOperationalReviewQueue,
  countDuplicateCanonicalRisk,
  INGREDIENTS_PAGE_LIST_FILTERS,
  operationalHygieneCardSubtext,
  operationalListFilterLabel,
  operationalListFilterQueueCardActiveClass,
  queueCardCount,
  type OperationalListFilter,
  type OperationalPriorityTierGroup,
  type OperationalReviewCtaTarget,
} from "@/lib/operational-review-queue";
import type { Tables } from "@/integrations/supabase/types";

type IngredientRow = Pick<
  Tables<"ingredients">,
  "id" | "name" | "normalized_name" | "current_price" | "updated_at"
>;

const PAGE_QUEUE_LABELS: Record<(typeof INGREDIENTS_PAGE_LIST_FILTERS)[number], string> = {
  duplicates: "Possible duplicates",
  unused: "Unused catalog entries",
};

type Props = {
  userId: string | undefined;
  catalog: IngredientRow[];
  activeListFilter?: OperationalListFilter | null;
  onSelectIngredient: (ingredientId: string) => void;
  onEnterNamingReview?: () => void;
  onApplyListFilter?: (filter: OperationalListFilter | null) => void;
};

export function OperationalReviewQueueSection({
  userId,
  catalog,
  activeListFilter = null,
  onSelectIngredient,
  onEnterNamingReview,
  onApplyListFilter,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tierGroups, setTierGroups] = useState<OperationalPriorityTierGroup[]>([]);

  const duplicateRisk = useMemo(
    () =>
      countDuplicateCanonicalRisk(
        catalog.map((row) => ({
          id: row.id,
          name: row.name,
          normalized_name: row.normalized_name,
        })),
      ),
    [catalog],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await buildOperationalReviewQueue({
      userId,
      supabase,
      catalog,
      includeInvoiceUnmatched: false,
    });
    setTierGroups(buildOperationalPriorityTiers(result.items, catalog.length));
    setError(result.error);
    setLoading(false);
  }, [userId, catalog]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCta = useCallback(
    (target: OperationalReviewCtaTarget) => {
      if (target.kind === "naming_review") {
        onApplyListFilter?.(null);
        onEnterNamingReview?.();
        return;
      }
      if (target.kind === "catalog_review" || target.kind === "informational") {
        return;
      }
      if (target.kind === "list_filter") {
        const next = activeListFilter === target.filter ? null : target.filter;
        onApplyListFilter?.(next);
        if (next) {
          const id = target.ingredientId?.trim();
          if (id) onSelectIngredient(id);
        }
        return;
      }
      if (target.kind === "ingredient_suggestions" || target.kind === "ingredient_family") {
        onApplyListFilter?.(null);
        onSelectIngredient(target.ingredientId);
      }
    },
    [onEnterNamingReview, onSelectIngredient, onApplyListFilter, activeListFilter],
  );

  const hygieneCards = useMemo(() => {
    return INGREDIENTS_PAGE_LIST_FILTERS.map((filter) => ({
      filter,
      label: PAGE_QUEUE_LABELS[filter],
      count: queueCardCount(tierGroups, filter),
      subtext: operationalHygieneCardSubtext(filter, {
        clusterCount: duplicateRisk.clusterCount,
        entryCount: queueCardCount(tierGroups, filter),
      }),
    }));
  }, [tierGroups, duplicateRisk.clusterCount]);

  if (loading) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2.5 text-xs text-muted-foreground shadow-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading catalog hygiene…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs text-destructive shadow-sm">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Catalog hygiene unavailable</span>
      </div>
    );
  }

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      {hygieneCards.map((card) => {
        const interactive = card.count > 0;
        const active = activeListFilter === card.filter;
        const shellClass = [
          "group flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-colors duration-150 ease-out",
          card.filter === "duplicates" ? "border-border/60" : "border-border/60",
          active ? operationalListFilterQueueCardActiveClass(card.filter) : "hover:bg-muted/20",
          interactive ? "cursor-pointer" : "cursor-default opacity-70",
        ].join(" ");

        const body = (
          <>
            {card.filter === "duplicates" ? (
              <div className="flex shrink-0 items-center gap-2 border-l-2 border-destructive/70 pl-2.5">
                <Copy className="h-4 w-4 text-destructive/75" aria-hidden />
              </div>
            ) : (
              <div className="flex shrink-0 items-center pl-0.5">
                <FolderOpen className="h-4 w-4 text-muted-foreground/70" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{card.label}</span>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums leading-none ${
                    card.filter === "duplicates" && card.count > 0
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted/50 text-foreground"
                  }`}
                >
                  {card.count}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.subtext}</p>
            </div>
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform ${
                interactive ? "group-hover:translate-x-0.5" : ""
              }`}
              aria-hidden
            />
          </>
        );

        if (!interactive) {
          return (
            <div
              key={card.filter}
              className={shellClass}
              title={operationalListFilterLabel(card.filter)}
            >
              {body}
            </div>
          );
        }

        return (
          <button
            key={card.filter}
            type="button"
            onClick={() => {
              if (active) {
                onApplyListFilter?.(null);
              } else {
                handleCta({ kind: "list_filter", filter: card.filter });
              }
            }}
            className={shellClass}
            aria-pressed={active}
            title={operationalListFilterLabel(card.filter)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
