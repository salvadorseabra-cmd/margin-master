import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  operationalExposureRiskTones,
  operationalSectionLayout,
  operationalTrendBadgeTones,
} from "@/components/operational-intelligence/operational-intelligence-tones";
import { formatCurrency } from "@/lib/display-format";
import type {
  OperationalTrendBadge,
  OperationalTrendMetricRow,
  OperationalTrendMetricSection,
  OperationalTrendPanel,
  OperationalTrendsPanels,
} from "@/lib/operational-intelligence-synthesis";
import { ChevronDown } from "lucide-react";

type OperationalIntelligenceTrendsProps = {
  panels: OperationalTrendsPanels;
};

function trendRowLinkTarget(
  row: OperationalTrendMetricRow,
): { to: "/ingredients" | "/recipes" | "/invoices"; search: Record<string, string> } | null {
  if (row.ingredientId) {
    return { to: "/ingredients", search: { ingredient: row.ingredientId } };
  }
  if (row.recipeId) {
    return { to: "/recipes", search: { recipe: row.recipeId } };
  }
  if (row.supplierName) {
    return { to: "/invoices", search: { supplier: row.supplierName } };
  }
  return null;
}

function TrendBadges({ badges }: { badges: OperationalTrendBadge[] }) {
  if (!badges.length) return null;
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className={`rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wide ${
            operationalTrendBadgeTones[badge] ?? operationalTrendBadgeTones["HIGH EXPOSURE"]
          }`}
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

function ExposureDetailBlock({ row }: { row: OperationalTrendMetricRow }) {
  const detail = row.exposure;
  if (!detail) return null;
  const riskTone = operationalExposureRiskTones[detail.riskLevel];

  return (
    <dl className="mt-1.5 space-y-1 rounded-md border border-border/40 bg-muted/[0.04] px-2.5 py-2 text-[11px]">
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Recipes affected</dt>
        <dd className="font-medium text-foreground">
          {detail.recipesAffected} recipe{detail.recipesAffected === 1 ? "" : "s"}
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Largest recipe</dt>
        <dd className="truncate font-medium text-foreground">{detail.largestRecipeName}</dd>
      </div>
      {detail.currentSupplierName ? (
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Current supplier</dt>
          <dd className="truncate font-medium text-foreground">{detail.currentSupplierName}</dd>
        </div>
      ) : null}
      {detail.latestInvoiceDateLabel ? (
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Latest invoice</dt>
          <dd className="font-medium text-foreground">{detail.latestInvoiceDateLabel}</dd>
        </div>
      ) : null}
      {detail.latestUnitPriceLabel ? (
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Latest known price</dt>
          <dd className="font-medium text-foreground">{detail.latestUnitPriceLabel}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Monthly exposure</dt>
        <dd className="font-medium text-foreground">
          {formatCurrency(detail.monthlyExposureEur)}/mo
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">10% supplier increase</dt>
        <dd className="font-medium text-foreground">
          +{formatCurrency(detail.tenPercentImpactEur)}/mo
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Risk level</dt>
        <dd className={`font-semibold uppercase tracking-wide ${riskTone}`}>{detail.riskLevel}</dd>
      </div>
    </dl>
  );
}

function TrendRowName({ row }: { row: OperationalTrendMetricRow }) {
  const target = trendRowLinkTarget(row);
  if (!target) {
    return <span className="min-w-0 truncate font-medium text-foreground/90">{row.name}</span>;
  }
  return (
    <Link
      to={target.to}
      search={target.search}
      className="min-w-0 truncate font-medium text-foreground/90 underline-offset-2 hover:text-foreground hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {row.name}
    </Link>
  );
}

function MetricRow({ row }: { row: OperationalTrendMetricRow }) {
  const [open, setOpen] = useState(false);
  const hasExpandable = Boolean(row.expandable && row.expandable.bullets.length > 0);

  const header = (
    <>
      <div className="flex items-baseline justify-between gap-3 text-xs leading-snug">
        <TrendRowName row={row} />
        <span className="shrink-0 text-right text-foreground">{row.value}</span>
      </div>
      {row.secondary && !row.exposure ? (
        <p className="mt-0.5 text-right text-[11px] text-muted-foreground">{row.secondary}</p>
      ) : null}
      <TrendBadges badges={row.badges ?? []} />
      <ExposureDetailBlock row={row} />
    </>
  );

  if (!hasExpandable) {
    return <li>{header}</li>;
  }

  return (
    <li className="list-none">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex w-full items-start gap-1.5 rounded-md py-0.5 hover:bg-muted/30">
          <button
            type="button"
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted/50"
            aria-expanded={open}
            aria-label={open ? "Collapse details" : "Expand details"}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((current) => !current);
            }}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <div className="min-w-0 flex-1">{header}</div>
        </div>
        <CollapsibleContent className="ml-4 mt-1 space-y-1 border-l border-border/50 pl-3 pb-1">
          <ul className="space-y-1">
            {row.expandable?.bullets.map((bullet) => (
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

function MetricSection({ section }: { section: OperationalTrendMetricSection }) {
  return (
    <div>
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {section.title}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {section.rows.map((row) => (
          <MetricRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

function TrendPanel({ panel }: { panel: OperationalTrendPanel }) {
  const sections = [
    panel.metrics.supplierMovement,
    panel.metrics.ingredientMovement,
    panel.metrics.recipeMarginMovement,
    panel.metrics.exposureConcentration,
  ];

  return (
    <article className="rounded-xl border border-border/60 bg-muted/[0.03] px-4 py-4">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{panel.label}</h3>
      <div className="mt-4 space-y-4">
        {sections.map((section, index) => (
          <div
            key={section.title}
            className={index > 0 ? "border-t border-border/40 pt-4" : undefined}
          >
            <MetricSection section={section} />
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
