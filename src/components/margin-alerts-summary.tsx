import { Card } from "@/components/AppShell";
import { Activity, Clock } from "lucide-react";
import type { OperationalHealthPanel } from "@/lib/margin-alert-data";
import type { MarginVisitDelta } from "@/lib/margin-alert-visit";
import { formatLastVisitLabel } from "@/lib/margin-alert-visit";

type MarginAlertsSummaryProps = {
  visitDelta: MarginVisitDelta;
  criticalCount: number;
  sectionCount: number;
  monitoredIngredients: number;
  health?: OperationalHealthPanel;
};

function healthLevelClass(level: "good" | "fair" | "poor" | "unknown"): string {
  if (level === "good") return "text-success";
  if (level === "fair") return "text-warning-foreground/80";
  if (level === "poor") return "text-destructive";
  return "text-muted-foreground";
}

export function MarginAlertsSummary({
  visitDelta,
  criticalCount,
  sectionCount,
  monitoredIngredients,
  health,
}: MarginAlertsSummaryProps) {
  const healthEntries = [
    health?.supplierStability,
    health?.recipeReliability,
    health?.invoiceFreshness,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <Card className="border-border/60 bg-muted/20 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Since {formatLastVisitLabel(visitDelta.lastVisitAt)}
            </div>
            {visitDelta.isFirstVisit ? (
              <p className="mt-1.5 text-sm text-foreground">
                Monitoring {monitoredIngredients} ingredient costs across {sectionCount} signal
                {sectionCount === 1 ? "" : " groups"}.
                {criticalCount > 0
                  ? ` ${criticalCount} need immediate attention.`
                  : " No critical risks right now."}
              </p>
            ) : visitDelta.lines.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-sm text-foreground">
                {visitDelta.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                No material change in alert counts since your last visit.
              </p>
            )}
          </div>
        </div>
      </Card>

      {healthEntries.length > 0 && (
        <Card className="border-border/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Operational health
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {healthEntries.map((entry) =>
              entry ? (
                <div
                  key={entry.label}
                  className="rounded-lg border border-border/50 bg-background/60 px-3 py-2.5"
                >
                  <div className="text-xs text-muted-foreground">{entry.label}</div>
                  <div
                    className={`mt-0.5 text-lg font-semibold tabular-nums ${healthLevelClass(entry.level)}`}
                  >
                    {entry.score}
                  </div>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{entry.detail}</p>
                </div>
              ) : null,
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
