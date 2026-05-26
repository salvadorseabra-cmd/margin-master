import { Link } from "@tanstack/react-router";
import type { WeeklyChangeFeedItem } from "@/lib/operational-intelligence-view";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";

type OperationalIntelligenceWeeklyChangesProps = {
  items: WeeklyChangeFeedItem[];
};

export function OperationalIntelligenceWeeklyChanges({
  items,
}: OperationalIntelligenceWeeklyChangesProps) {
  const calmOnly = items.length === 1 && items[0]?.tone === "calm";
  const displayItems = calmOnly ? items : items.filter((i) => i.tone !== "calm" || items.length === 1);

  return (
    <section aria-labelledby="weekly-changes-heading">
      <h2
        id="weekly-changes-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        What changed this week
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Meaningful invoice moves and category pressure — not raw price tables.
      </p>

      {displayItems.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No material ingredient price changes in the last 7 days.
        </p>
      ) : calmOnly ? (
        <p className="mt-3 text-sm text-muted-foreground">{displayItems[0]?.summary}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {displayItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-muted/20 px-3.5 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FeedToneIcon tone={item.tone} />
                  <span className="font-medium leading-snug">{item.summary}</span>
                </div>
                {item.impactLine ? (
                  <p className="mt-1 text-xs font-medium tabular-nums text-foreground">
                    {item.impactLine.split(" · ")[0]}
                  </p>
                ) : null}
                {item.impactLine?.includes(" · ") ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.impactLine.split(" · ").slice(1).join(" · ")}
                  </p>
                ) : null}
                {item.recipeNames.length > 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    {item.recipeNames.slice(0, 3).join(" · ")}
                    {item.recipeNames.length > 3 ? ` +${item.recipeNames.length - 3}` : ""}
                  </p>
                ) : null}
              </div>
              <Link
                to={item.target}
                className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Open
                <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedToneIcon({ tone }: { tone: WeeklyChangeFeedItem["tone"] }) {
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
