import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import { loadMatchingIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  buildRecentPurchases,
  buildRecognizedSupplierProducts,
  purchaseMemorySummary,
} from "@/lib/ingredient-purchase-memory";
import {
  filterMatchedInvoiceProductsForIngredient,
  loadIngredientMatchedInvoiceProducts,
  loadIngredientOperationalProfile,
} from "@/lib/ingredient-operational-intelligence";

type Props = {
  ingredientId: string | null;
  userId: string | undefined;
  canonicalName?: string | null;
  /** Compact right-column layout on Ingredients detail panel. */
  variant?: "section" | "compact";
};

const SECTION_TITLE = "Purchase memory";

export function PurchaseMemorySection({
  ingredientId,
  userId,
  canonicalName,
  variant = "section",
}: Props) {
  const compact = variant === "compact";
  const [open, setOpen] = useState(compact);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<
    Awaited<ReturnType<typeof loadIngredientOperationalProfile>>["aliases"]
  >([]);
  const [matchedProducts, setMatchedProducts] = useState<
    Awaited<ReturnType<typeof loadIngredientMatchedInvoiceProducts>>["products"]
  >([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    setAliases([]);
    setMatchedProducts([]);
    setTruncated(false);
    setError(null);

    if (!ingredientId || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [{ rows: catalog }, confirmedAliases, profileResult] = await Promise.all([
          loadMatchingIngredientCatalog(supabase),
          loadConfirmedIngredientAliasMap(supabase),
          loadIngredientOperationalProfile(supabase, ingredientId, userId),
        ]);
        const matchedResult = await loadIngredientMatchedInvoiceProducts(
          supabase,
          userId,
          ingredientId,
          catalog,
          confirmedAliases,
        );

        if (cancelled) return;

        const scopedAliases = profileResult.aliases.filter(
          (row) => row.ingredientId === ingredientId,
        );
        setAliases(scopedAliases);
        setMatchedProducts(
          filterMatchedInvoiceProductsForIngredient(
            matchedResult.products,
            ingredientId,
          ),
        );
        setTruncated(matchedResult.truncated);
      } catch (err) {
        if (cancelled) return;
        setAliases([]);
        setMatchedProducts([]);
        setError(
          err instanceof Error ? err.message : "Could not load purchase history.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ingredientId, userId]);

  const recognizedProducts = useMemo(
    () =>
      ingredientId
        ? buildRecognizedSupplierProducts(
            ingredientId,
            canonicalName,
            aliases,
            matchedProducts,
          )
        : [],
    [ingredientId, canonicalName, aliases, matchedProducts],
  );

  const recentPurchases = useMemo(
    () =>
      ingredientId
        ? buildRecentPurchases(ingredientId, canonicalName, matchedProducts)
        : [],
    [ingredientId, canonicalName, matchedProducts],
  );

  if (!ingredientId) return null;

  const recognizedCount = recognizedProducts.length;
  const purchaseCount = recentPurchases.length;
  const showEmpty =
    !loading && !error && recognizedCount === 0 && purchaseCount === 0;

  const summary = loading
    ? "Loading…"
    : error
      ? "Error"
      : purchaseMemorySummary(recognizedCount, purchaseCount);

  const listScrollClass = compact
    ? "max-h-36 overflow-y-auto overscroll-contain"
    : "max-h-48 overflow-y-auto overscroll-contain";

  const rowClass = compact
    ? "py-0.5 text-[10px] leading-snug"
    : "py-1 text-xs leading-snug";

  const subsectionLabelClass = compact
    ? "mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
    : "mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

  const body = (
    <>
      {loading && (
        <div
          className={
            compact
              ? "flex items-center gap-1.5 text-[10px] text-muted-foreground"
              : "flex items-center gap-2 text-xs text-muted-foreground"
          }
        >
          <Loader2 className={compact ? "h-3 w-3 animate-spin" : "h-3.5 w-3.5 animate-spin"} />
          Loading…
        </div>
      )}

      {!loading && error && (
        <p className={compact ? "text-[10px] text-destructive" : "text-xs text-destructive"}>
          {error}
        </p>
      )}

      {showEmpty && (
        <p
          className={
            compact
              ? "text-[10px] text-muted-foreground"
              : "text-xs text-muted-foreground"
          }
        >
          No supplier purchases linked to this ingredient yet.
        </p>
      )}

      {!loading && !error && recognizedCount > 0 && (
        <div className={purchaseCount > 0 ? (compact ? "mb-1.5" : "mb-2") : undefined}>
          <div className={subsectionLabelClass}>Previously matched invoice products</div>
          <ul className={`divide-y divide-border/40 ${listScrollClass}`}>
            {recognizedProducts.map((product) => (
              <li key={product.name} className={`${rowClass} break-words text-foreground/90`}>
                {product.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && !error && purchaseCount > 0 && (
        <div>
          <div className={subsectionLabelClass}>Recent purchases</div>
          <ul className={`divide-y divide-border/40 ${listScrollClass}`}>
            {recentPurchases.map((purchase) => (
              <li
                key={purchase.itemId}
                className={`${rowClass} flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 text-muted-foreground`}
              >
                <span className="min-w-0 break-words font-medium text-foreground/90">
                  {purchase.supplierLabel}
                </span>
                <span aria-hidden className="text-border">·</span>
                <span className="shrink-0 tabular-nums">{purchase.dateLabel}</span>
                <span aria-hidden className="text-border">·</span>
                <span className="shrink-0 tabular-nums font-medium text-foreground/90">
                  {purchase.priceLabel}
                </span>
              </li>
            ))}
          </ul>
          {truncated && (
            <p
              className={
                compact
                  ? "mt-0.5 text-[9px] text-muted-foreground"
                  : "mt-1 text-[10px] text-muted-foreground"
              }
            >
              Showing the most recent purchases only.
            </p>
          )}
        </div>
      )}
    </>
  );

  if (compact) {
    return (
      <section className="min-w-0 rounded-md border border-border/60 bg-muted/10">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left">
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {SECTION_TITLE}
              </div>
              <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{summary}</div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border/50 px-2 pb-2 pt-1.5">
            {body}
          </CollapsibleContent>
        </Collapsible>
      </section>
    );
  }

  return (
    <section className="mt-2 min-w-0 rounded-lg border border-border/70 bg-muted/10">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{SECTION_TITLE}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{summary}</div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/60 px-3 pb-3 pt-2">
          {body}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
