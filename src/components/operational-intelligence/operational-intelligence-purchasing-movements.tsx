import { Link } from "@tanstack/react-router";
import type { PurchasingMovementItem } from "@/lib/operational-intelligence-view";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";

type OperationalIntelligencePurchasingMovementsProps = {
  items: PurchasingMovementItem[];
  compact?: boolean;
};

export function OperationalIntelligencePurchasingMovements({
  items,
  compact = false,
}: OperationalIntelligencePurchasingMovementsProps) {
  const calmOnly = items.length === 1 && items[0]?.tone === "calm";
  const displayItems = compact
    ? items.filter((item) => item.tone !== "calm" && item.tone !== "stable").slice(0, 3)
    : items;

  if (compact && displayItems.length === 0) return null;

  return (
    <section aria-labelledby="purchasing-movements-heading">
      <h2
        id="purchasing-movements-heading"
        className={
          compact
            ? "text-xs font-semibold tracking-tight text-foreground/90"
            : "text-sm font-semibold tracking-tight text-foreground"
        }
      >
        Purchasing movements
      </h2>
      {!compact ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Supplier and ingredient inflation vs recent averages — stabilization and recovery signals.
        </p>
      ) : null}

      {displayItems.length === 0 ? (
        !compact ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No material purchasing moves in recent invoices.
          </p>
        ) : null
      ) : calmOnly && !compact ? (
        <p className="mt-3 text-sm text-muted-foreground">{items[0]?.detail}</p>
      ) : (
        <ul className={`${compact ? "mt-2" : "mt-4"} space-y-1.5`}>
          {displayItems.map((item) => (
            <li
              key={item.id}
              className={`flex flex-wrap items-start justify-between gap-2 rounded-lg bg-muted/15 px-3 py-2 ${compact ? "text-xs" : "text-sm"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <MovementToneIcon tone={item.tone} />
                  <span className="font-medium leading-snug">{item.headline}</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{item.detail}</p>
                {item.impactLine ? (
                  <p className="mt-1 text-xs font-medium tabular-nums text-foreground/90">
                    {item.impactLine}
                  </p>
                ) : null}
              </div>
              <Link
                to={item.target}
                className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Review
                <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MovementToneIcon({ tone }: { tone: PurchasingMovementItem["tone"] }) {
  if (tone === "calm") {
    return <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />;
  }
  if (tone === "up") {
    return <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />;
  }
  if (tone === "down") {
    return <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />;
  }
  return <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}
