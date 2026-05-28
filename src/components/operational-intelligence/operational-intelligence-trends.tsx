import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { operationalSectionLayout } from "@/components/operational-intelligence/operational-intelligence-tones";
import type {
  OperationalTrendItem,
  OperationalTrendsPanels,
} from "@/lib/operational-intelligence-synthesis";
import { ChevronDown, TrendingDown, TrendingUp, Minus } from "lucide-react";

type OperationalIntelligenceTrendsProps = {
  panels: OperationalTrendsPanels;
};

function TrendSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;

  const width = 56;
  const height = 18;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x},${y}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 text-muted-foreground"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
      />
    </svg>
  );
}

function TrendDirectionIcon({ item }: { item: OperationalTrendItem }) {
  if (item.temporalTrend === "accelerating") {
    return <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-destructive/80" aria-hidden />;
  }
  if (item.temporalTrend === "easing") {
    return <TrendingDown className="mt-0.5 h-3 w-3 shrink-0 text-success/80" aria-hidden />;
  }
  if (item.direction === "up") {
    return <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-destructive/70" aria-hidden />;
  }
  if (item.direction === "down") {
    return <TrendingDown className="mt-0.5 h-3 w-3 shrink-0 text-success/70" aria-hidden />;
  }
  if (item.direction === "flat") {
    return <Minus className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />;
  }
  return (
    <span
      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40"
      aria-hidden
    />
  );
}

function TrendRow({ item }: { item: OperationalTrendItem }) {
  const [open, setOpen] = useState(false);
  const hasExpandable = Boolean(item.expandable && item.expandable.bullets.length > 0);

  if (!hasExpandable) {
    return (
      <li className="flex items-start gap-2 text-xs leading-snug text-foreground/85">
        <TrendDirectionIcon item={item} />
        <div className="min-w-0 flex-1">
          <p>{item.label}</p>
          {item.detail ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</p>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="list-none">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-start gap-2 rounded-md py-0.5 text-left text-xs leading-snug text-foreground/85 hover:bg-muted/30">
          <ChevronDown
            className={`mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
          <TrendDirectionIcon item={item} />
          <div className="min-w-0 flex-1">
            <p>{item.label}</p>
            {item.detail ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
          {item.expandable?.sparklinePoints ? (
            <TrendSparkline points={item.expandable.sparklinePoints} />
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-8 mt-1 space-y-1 border-l border-border/50 pl-3 pb-1">
          {item.expandable?.sparklinePoints && item.expandable.sparklinePoints.length >= 2 ? (
            <div className="flex items-center gap-2 pb-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Invoice deltas
              </span>
              <TrendSparkline points={item.expandable.sparklinePoints} />
            </div>
          ) : null}
          <ul className="space-y-1">
            {item.expandable?.bullets.map((bullet) => (
              <li key={bullet} className="text-[11px] leading-snug text-muted-foreground">
                {bullet}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function TrendPanel({ panel }: { panel: OperationalTrendsPanels["last90Days"] }) {
  const subsections = [
    panel.supplierMovement,
    panel.marginMovement,
    panel.procurementSignals,
    panel.operationalRecommendation,
  ];

  return (
    <article className="rounded-xl border border-border/60 bg-muted/[0.03] px-4 py-4">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{panel.label}</h3>
      <div className="mt-4 space-y-4">
        {subsections.map((section, index) => (
          <div
            key={section.title}
            className={index > 0 ? "border-t border-border/40 pt-4" : undefined}
          >
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h4>
            <ul className="mt-2 space-y-1.5">
              {section.items.map((item) => (
                <TrendRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}

export function OperationalIntelligenceTrends({ panels }: OperationalIntelligenceTrendsProps) {
  return (
    <div className={`grid gap-4 lg:grid-cols-2 ${operationalSectionLayout.primaryBlocks}`}>
      <TrendPanel panel={panels.last90Days} />
      <TrendPanel panel={panels.last6Months} />
    </div>
  );
}
