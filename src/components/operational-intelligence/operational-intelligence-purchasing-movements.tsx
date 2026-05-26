import { Link } from "@tanstack/react-router";
import type { PurchasingMovementItem } from "@/lib/operational-intelligence-view";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";

type OperationalIntelligencePurchasingMovementsProps = {
  items: PurchasingMovementItem[];
};

export function OperationalIntelligencePurchasingMovements({
  items,
}: OperationalIntelligencePurchasingMovementsProps) {
  const calmOnly = items.length === 1 && items[0]?.tone === "calm";

  return (
    <section aria-labelledby="purchasing-movements-heading">
      <h2
        id="purchasing-movements-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Purchasing movements
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Supplier and ingredient inflation vs recent averages — stabilization and recovery signals.
      </p>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No material purchasing moves in recent invoices.
        </p>
      ) : calmOnly ? (
        <p className="mt-3 text-sm text-muted-foreground">{items[0]?.detail}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-muted/20 px-3.5 py-2.5 text-sm"
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
