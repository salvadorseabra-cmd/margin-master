import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOperationalReviewQueue,
  type OperationalReviewCtaTarget,
  type OperationalReviewItem,
  type OperationalReviewSeverity,
} from "@/lib/operational-review-queue";
import type { Tables } from "@/integrations/supabase/types";

type IngredientRow = Pick<Tables<"ingredients">, "id" | "name" | "normalized_name">;

type Props = {
  userId: string | undefined;
  catalog: IngredientRow[];
  onSelectIngredient: (ingredientId: string) => void;
  onEnterNamingReview?: () => void;
};

function severityBadgeClass(severity: OperationalReviewSeverity): string {
  if (severity === "high") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (severity === "medium") return "border-warning/30 bg-warning/10 text-warning";
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function ReviewQueueStripItem({
  item,
  onCta,
}: {
  item: OperationalReviewItem;
  onCta: (target: OperationalReviewCtaTarget) => void;
}) {
  return (
    <div className="flex min-w-[200px] max-w-[280px] shrink-0 items-center gap-2 rounded-md border border-border/60 bg-card/90 px-2 py-1">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[11px] font-semibold leading-none">{item.title}</span>
          <span
            className={`shrink-0 rounded border px-1 py-px text-[9px] font-bold tabular-nums leading-none ${severityBadgeClass(item.severity)}`}
          >
            {item.count}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground" title={item.explanation}>
          {item.explanation}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onCta(item.ctaTarget)}
        className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 text-[10px] font-medium text-foreground hover:opacity-80"
      >
        {item.ctaLabel}
        <ArrowRight className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

export function OperationalReviewQueueSection({
  userId,
  catalog,
  onSelectIngredient,
  onEnterNamingReview,
}: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<OperationalReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await buildOperationalReviewQueue({
      userId,
      supabase,
      catalog,
      includeInvoiceUnmatched: false,
    });
    setItems(result.items);
    setError(result.error);
    setLoading(false);
  }, [userId, catalog]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCta = useCallback(
    (target: OperationalReviewCtaTarget) => {
      if (target.kind === "route") {
        void navigate({ to: target.path });
        return;
      }
      if (target.kind === "naming_review") {
        onEnterNamingReview?.();
        requestAnimationFrame(() => {
          document
            .getElementById("canonical-ingredient-naming-review")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }
      if (target.kind === "catalog_review") {
        void navigate({ to: "/ingredients/review" });
        return;
      }
      if (target.kind === "ingredient_suggestions" || target.kind === "ingredient_family") {
        onSelectIngredient(target.ingredientId);
        const scrollId =
          target.kind === "ingredient_suggestions"
            ? "canonical-ingredient-suggestions"
            : "ingredient-family-section";
        requestAnimationFrame(() => {
          document.getElementById(scrollId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    },
    [navigate, onEnterNamingReview, onSelectIngredient],
  );

  if (loading) {
    return (
      <section className="mb-2 shrink-0 rounded-md border border-border/60 bg-muted/10 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking catalog review queue…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mb-2 shrink-0 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">Could not load review queue. {error}</span>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mb-2 shrink-0 rounded-md border border-border/60 bg-muted/10 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-success" />
          <span>Catalog review queue is clear.</span>
        </div>
      </section>
    );
  }

  const headline =
    items.length === 1 ? "1 catalog item needs review" : `${items.length} catalog items need review`;

  return (
    <section className="mb-2 shrink-0 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 shrink-0">
          <h2 className="text-[11px] font-semibold leading-none tracking-tight">{headline}</h2>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex gap-1.5 pb-px">
            {items.map((item) => (
              <ReviewQueueStripItem key={item.id} item={item} onCta={handleCta} />
            ))}
          </div>
        </div>
        <Link
          to="/ingredients/review"
          className="shrink-0 text-[10px] font-medium text-muted-foreground hover:text-foreground"
        >
          Full review
        </Link>
      </div>
    </section>
  );
}
