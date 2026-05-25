import { Card } from "@/components/AppShell";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  countHiddenOperationalSignals,
  groupOperationalSignals,
  pickVisibleOperationalSignals,
} from "@/lib/buildIngredientOperationalSignals";
import type { MarginAlertItem } from "@/lib/margin-alert-data";
import { marginAlertSeverityLabel } from "@/lib/margin-alert-severity";
import type { MarginAlertSection } from "@/lib/margin-alert-sections";

const severityStyles: Record<
  MarginAlertItem["severity"],
  { dot: string; chip: string; card: string }
> = {
  critical: {
    dot: "bg-destructive",
    chip: "border-destructive/20 bg-destructive/10 text-destructive",
    card: "border-destructive/15 bg-destructive/[0.02]",
  },
  high: {
    dot: "bg-orange-500",
    chip: "border-orange-500/20 bg-orange-500/10 text-orange-700",
    card: "border-orange-500/15",
  },
  watch: {
    dot: "bg-warning/75",
    chip: "border-warning/20 bg-warning/10 text-warning-foreground/80",
    card: "border-border/80",
  },
  info: {
    dot: "bg-muted-foreground/60",
    chip: "border-border bg-muted/50 text-muted-foreground",
    card: "border-border/60 bg-muted/10",
  },
  positive: {
    dot: "bg-success",
    chip: "border-success/20 bg-success/10 text-success",
    card: "border-success/15 bg-success/[0.03]",
  },
};

const signalToneClass: Record<string, string> = {
  muted: "text-muted-foreground",
  caution: "text-warning-foreground/85",
  positive: "text-success/85",
  negative: "text-destructive/80",
};

type MarginAlertsSectionsProps = {
  sections: MarginAlertSection[];
};

export function MarginAlertsSections({ sections }: MarginAlertsSectionsProps) {
  if (sections.length === 0) return null;

  return (
    <div className="mt-4 space-y-6">
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`}>
          <div className="mb-2.5">
            <h2
              id={`section-${section.id}`}
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              {section.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
          </div>
          <div className="space-y-2">
            {section.items.map((alert, index) => (
              <MarginAlertCard key={alert.id} alert={alert} compact={index > 0} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MarginAlertCard({ alert, compact }: { alert: MarginAlertItem; compact?: boolean }) {
  const style = severityStyles[alert.severity];
  const [expanded, setExpanded] = useState(false);
  const visibleSignals = pickVisibleOperationalSignals(alert.signals, expanded);
  const hiddenCount = countHiddenOperationalSignals(alert.signals, expanded);
  const signalGroups = groupOperationalSignals(visibleSignals);

  return (
    <Card className={`p-3 sm:p-3.5 transition-colors hover:bg-muted/15 ${style.card}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.chip}`}
            >
              {marginAlertSeverityLabel(alert.severity)}
            </span>
            {alert.temporalLine ? (
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {alert.temporalLine}
              </span>
            ) : null}
          </div>
          <div
            className={`font-semibold leading-snug ${compact ? "text-sm" : "text-sm sm:text-base"}`}
          >
            {alert.title}
          </div>
          {alert.signals.length === 0 ? (
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{alert.context}</p>
          ) : null}

          {signalGroups.length > 0 ? (
            <div className="mt-2 space-y-2">
              {signalGroups.map((group) => (
                <div key={group.category}>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {group.title}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {group.signals.map((signal) => (
                      <li
                        key={signal.id}
                        className={`text-xs leading-snug ${signalToneClass[signal.tone] ?? "text-muted-foreground"}`}
                      >
                        <span className="font-medium text-foreground/85">{signal.label}</span>
                        {signal.detail ? (
                          <span className="text-muted-foreground"> — {signal.detail}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-xs font-medium text-primary/80 hover:text-primary"
                >
                  Show {hiddenCount} more signal{hiddenCount === 1 ? "" : "s"}
                </button>
              ) : expanded && alert.signals.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Show fewer
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="mt-2 text-xs text-foreground/75">{alert.suggestedAction}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {alert.meta.slice(0, 3).map((item) => (
              <MetaPill
                key={`${alert.id}-${item.label}`}
                label={item.label}
                value={item.value}
                tone={item.tone}
              />
            ))}
            <Link
              to={alert.target}
              className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              {alert.actionLabel}
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

function MetaPill({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value?: string;
  tone?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/80 px-1.5 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {value !== undefined && <span className={`font-semibold ${tone}`}>{value}</span>}
    </span>
  );
}
