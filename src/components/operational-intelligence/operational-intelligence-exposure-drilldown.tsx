import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPercent } from "@/lib/display-format";
import type {
  ExposureDrillDownModel,
  ExposureDrillDownRecommendation,
  ExposureDrillDownSignal,
  ExposureRecipeRow,
  ExposureSupplierMovement,
  PriceWindowStats,
} from "@/lib/exposure-drill-down";
import { marginAlertSeverityLabel } from "@/lib/margin-alert-severity";
import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

type OperationalIntelligenceExposureDrilldownProps = {
  model: ExposureDrillDownModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OperationalIntelligenceExposureDrilldown({
  model,
  open,
  onOpenChange,
}: OperationalIntelligenceExposureDrilldownProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-md md:max-w-lg"
      >
        {model ? (
          <>
            <SheetHeader className="text-left pr-8">
              <SheetTitle className="text-base font-semibold tracking-tight">
                {model.kind === "category" ? model.label : model.ingredientName}
              </SheetTitle>
              <SheetDescription className="text-xs leading-relaxed">
                {model.kind === "category"
                  ? [
                      model.monthlyExposureLabel,
                      model.sensitivityLine,
                      `${formatPercent(Math.round(model.sharePct))} of menu food cost`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : [
                      model.estimatedMonthlyImpact,
                      model.marginSensitivityLine,
                      `${model.recipeCount} recipe${model.recipeCount === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-8 pb-6">
              {model.kind === "category" ? (
                <CategoryDrillDownBody model={model} />
              ) : (
                <IngredientDrillDownBody model={model} />
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CategoryDrillDownBody({
  model,
}: {
  model: Extract<ExposureDrillDownModel, { kind: "category" }>;
}) {
  return (
    <>
      {(model.monthlyExposureLabel || model.sensitivityLine) && (
        <DrillSection title="Financial exposure">
          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 text-xs space-y-1">
            {model.monthlyExposureLabel ? (
              <p className="font-semibold tabular-nums text-foreground">{model.monthlyExposureLabel}</p>
            ) : null}
            {model.sensitivityLine ? (
              <p className="text-muted-foreground">{model.sensitivityLine}</p>
            ) : null}
          </div>
        </DrillSection>
      )}

      {model.topIngredients.length > 0 ? (
        <DrillSection title="Top ingredients in category">
          <ul className="space-y-2.5">
            {model.topIngredients.map((row) => (
              <li
                key={row.ingredientId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.recipeCount} recipe{row.recipeCount === 1 ? "" : "s"}
                    {row.trendLabel ? ` · ${row.trendLabel}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatPercent(row.sharePct)}
                </span>
              </li>
            ))}
          </ul>
        </DrillSection>
      ) : null}

      {model.dependentRecipes.length > 0 ? (
        <DrillSection title="Recipes most exposed">
          <RecipeExposureList rows={model.dependentRecipes} />
        </DrillSection>
      ) : null}

      {model.supplierMovements.length > 0 ? (
        <DrillSection title="Recent supplier pricing">
          <SupplierMovementList rows={model.supplierMovements} />
        </DrillSection>
      ) : null}

      {model.marginSignals.length > 0 ? (
        <DrillSection title="Margin signals">
          <SignalList signals={model.marginSignals} />
        </DrillSection>
      ) : null}

      {model.supplierComparisons.length > 0 ? (
        <DrillSection title="Current vs recent lowest">
          <ul className="space-y-2.5">
            {model.supplierComparisons.map((row) => (
              <li
                key={row.ingredientId}
                className="rounded-lg border border-border/50 px-3 py-2.5 text-xs"
              >
                <p className="font-medium text-foreground">{row.ingredientName}</p>
                <p className="mt-1 text-muted-foreground">
                  Now {row.currentPriceLabel}
                  {row.currentSupplier ? ` · ${row.currentSupplier}` : ""}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Low {row.cheapestPriceLabel}
                  {row.cheapestSupplier ? ` · ${row.cheapestSupplier}` : ""}
                </p>
                {row.gapLabel ? (
                  <p className="mt-1 font-medium text-destructive">{row.gapLabel}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </DrillSection>
      ) : null}

      {model.recommendations.length > 0 ? (
        <DrillSection title="Recommended next steps">
          <RecommendationList items={model.recommendations} />
        </DrillSection>
      ) : null}
    </>
  );
}

function IngredientDrillDownBody({
  model,
}: {
  model: Extract<ExposureDrillDownModel, { kind: "ingredient" }>;
}) {
  return (
    <>
      {(model.currentPriceLabel || model.recentMovement) && (
        <DrillSection title="Pricing snapshot">
          <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-3 text-xs">
            {model.currentPriceLabel ? (
              <p>
                <span className="text-muted-foreground">Catalog · </span>
                <span className="font-medium">{model.currentPriceLabel}</span>
                {model.currentSupplier ? (
                  <span className="text-muted-foreground"> · {model.currentSupplier}</span>
                ) : null}
              </p>
            ) : null}
            {model.recentMovement ? (
              <p className="flex items-center gap-1">
                <span className="text-muted-foreground">Last invoice · </span>
                <MovementBadge changePct={model.recentMovement.changePct} />
                <span className="font-medium">{model.recentMovement.latestPriceLabel}</span>
                <span className="text-muted-foreground"> · {model.recentMovement.dateLabel}</span>
              </p>
            ) : null}
            {model.estimatedMonthlyImpact ? (
              <p className="font-semibold tabular-nums text-foreground">
                {model.estimatedMonthlyImpact}
              </p>
            ) : null}
            {model.marginSensitivityLine ? (
              <p className="text-muted-foreground">{model.marginSensitivityLine}</p>
            ) : null}
            {model.competitivenessCopy ? (
              <p className="font-medium text-destructive">{model.competitivenessCopy}</p>
            ) : null}
            {model.betterSupplierLine ? (
              <p className="text-muted-foreground">{model.betterSupplierLine}</p>
            ) : null}
            {model.supplierStabilityLine ? (
              <p className="font-medium text-emerald-700">{model.supplierStabilityLine}</p>
            ) : null}
          </div>
        </DrillSection>
      )}

      {(model.supplierLow || model.supplierHigh) && (
        <DrillSection title="Supplier range (invoice history)">
          <div className="grid gap-2 sm:grid-cols-2">
            {model.supplierLow ? (
              <SupplierExtremeCard kind="low" {...model.supplierLow} />
            ) : null}
            {model.supplierHigh ? (
              <SupplierExtremeCard kind="high" {...model.supplierHigh} />
            ) : null}
          </div>
        </DrillSection>
      )}

      {(model.currentPriceLabel || model.stats90d.sampleCount > 0 || model.stats180d.sampleCount > 0) && (
        <DrillSection title="Historical invoice prices">
          <div className="grid gap-2 sm:grid-cols-3">
            {model.currentPriceLabel ? (
              <div className="rounded-lg border border-border/50 px-3 py-2.5 text-xs">
                <p className="font-medium text-foreground">Current</p>
                <p className="mt-1 font-semibold tabular-nums text-foreground">
                  {model.currentPriceLabel}
                </p>
                {model.currentSupplier ? (
                  <p className="mt-0.5 text-muted-foreground">{model.currentSupplier}</p>
                ) : null}
              </div>
            ) : null}
            <PriceWindowCard stats={model.stats90d} />
            <PriceWindowCard stats={model.stats180d} />
          </div>
        </DrillSection>
      )}

      {model.affectedRecipes.length > 0 ? (
        <DrillSection title="Recipes affected">
          <RecipeExposureList rows={model.affectedRecipes} />
        </DrillSection>
      ) : null}

      {model.marginSignals.length > 0 ? (
        <DrillSection title="Margin signals">
          <SignalList signals={model.marginSignals} />
        </DrillSection>
      ) : null}

      {model.recommendations.length > 0 ? (
        <DrillSection title="Recommended next steps">
          <RecommendationList items={model.recommendations} />
        </DrillSection>
      ) : null}

      <Link
        to="/ingredients"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Open ingredient catalog
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </>
  );
}

function DrillSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RecipeExposureList({ rows }: { rows: ExposureRecipeRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.recipeId}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.recipeName}</p>
            <p className="text-[11px] text-muted-foreground">
              {[row.lineCostLabel, row.grossMarginLabel].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold tabular-nums">
            {formatPercent(Math.round(row.exposurePct))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SupplierMovementList({
  rows,
}: {
  rows: ExposureSupplierMovement[];
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={`${row.ingredientId}-${row.dateLabel}`} className="rounded-lg border border-border/40 px-3 py-2 text-xs">
          <p className="font-medium">{row.ingredientName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-muted-foreground">
            <MovementBadge changePct={row.changePct} />
            <span>{row.latestPriceLabel}</span>
            {row.supplier ? <span>· {row.supplier}</span> : null}
            <span>· {row.dateLabel}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function SignalList({
  signals,
}: {
  signals: ExposureDrillDownSignal[];
}) {
  return (
    <ul className="space-y-2">
      {signals.map((signal) => (
        <li
          key={signal.id}
          className="rounded-lg border border-border/50 bg-background px-3 py-2.5 text-xs"
        >
          <p className="font-medium text-foreground">{signal.title}</p>
          <p className="mt-0.5 text-muted-foreground">
            {marginAlertSeverityLabel(signal.severity)} · {signal.detail}
          </p>
        </li>
      ))}
    </ul>
  );
}

function RecommendationList({
  items,
}: {
  items: ExposureDrillDownRecommendation[];
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-lg border border-primary/15 bg-primary/[0.03] px-3 py-2.5 text-xs leading-relaxed text-foreground"
        >
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function PriceWindowCard({
  stats,
}: {
  stats: PriceWindowStats;
}) {
  if (stats.sampleCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
        No {stats.windowLabel} invoice rows
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 px-3 py-2.5 text-xs">
      <p className="font-medium text-foreground">{stats.windowLabel}</p>
      <dl className="mt-1.5 space-y-0.5 text-muted-foreground">
        {stats.minFormatted ? (
          <div className="flex justify-between gap-2">
            <dt>Low</dt>
            <dd className="font-medium tabular-nums text-foreground">{stats.minFormatted}</dd>
          </div>
        ) : null}
        {stats.avgFormatted ? (
          <div className="flex justify-between gap-2">
            <dt>Avg</dt>
            <dd className="font-medium tabular-nums text-foreground">{stats.avgFormatted}</dd>
          </div>
        ) : null}
        {stats.maxFormatted ? (
          <div className="flex justify-between gap-2">
            <dt>High</dt>
            <dd className="font-medium tabular-nums text-foreground">{stats.maxFormatted}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-1 text-[10px] text-muted-foreground/80">
        {stats.sampleCount} invoice price{stats.sampleCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function SupplierExtremeCard({
  kind,
  supplier,
  priceLabel,
  dateLabel,
}: {
  kind: "low" | "high";
  supplier: string;
  priceLabel: string;
  dateLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2.5 text-xs">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {kind === "low" ? "Recent low" : "Recent high"}
      </p>
      <p className="mt-1 font-medium">{supplier}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${kind === "low" ? "text-emerald-600" : "text-destructive"}`}>
        {priceLabel}
      </p>
      <p className="text-muted-foreground">{dateLabel}</p>
    </div>
  );
}

function MovementBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 0.5) {
    return <span className="text-muted-foreground">flat</span>;
  }
  const up = changePct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium ${up ? "text-destructive" : "text-emerald-600"}`}
    >
      {up ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
      {up ? "+" : ""}
      {Math.round(changePct)}%
    </span>
  );
}
