import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { alerts, type Alert } from "@/lib/mock-data";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Margin Alerts — Marginly" },
      {
        name: "description",
        content: "Operational alerts on ingredient prices and margin shifts.",
      },
    ],
  }),
  component: AlertsPage,
});

const sevStyles: Record<
  Alert["severity"],
  { dot: string; chip: string; label: string; card: string }
> = {
  high: {
    dot: "bg-destructive",
    chip: "border-destructive/20 bg-destructive/10 text-destructive",
    label: "Critical",
    card: "border-destructive/20",
  },
  medium: {
    dot: "bg-warning/75",
    chip: "border-warning/20 bg-warning/10 text-warning-foreground/80",
    label: "Watch",
    card: "border-border",
  },
  low: {
    dot: "bg-success",
    chip: "border-success/20 bg-success/10 text-success",
    label: "Opportunity",
    card: "border-success/20",
  },
};

const alertMeta: Record<
  Alert["id"],
  { monthlyImpact: number; affectedRecipes: number; supplier?: string }
> = {
  a1: { monthlyImpact: -246, affectedRecipes: 2, supplier: "Boucherie Lafayette" },
  a2: { monthlyImpact: -166, affectedRecipes: 1, supplier: "Épicerie Fine" },
  a3: { monthlyImpact: -58, affectedRecipes: 3 },
  a4: { monthlyImpact: 94, affectedRecipes: 1, supplier: "Marée du Jour" },
  a5: { monthlyImpact: -36, affectedRecipes: 2, supplier: "Fromagerie Alpine" },
};

const suggestedActions: Record<Alert["id"], string> = {
  a1: "Increase menu price to €15.90",
  a2: "Reduce saffron portion by 0.3g",
  a3: "Recheck prep yield in recipe costing",
  a4: "Highlight scallop dish this week",
  a5: "Review supplier price for raclette",
};

function AlertsPage() {
  const criticalCount = alerts.filter((a) => a.severity === "high").length;
  const estimatedImpact = alerts.reduce((sum, alert) => sum + alertMeta[alert.id].monthlyImpact, 0);

  return (
    <AppShell
      title="Margin alerts"
      subtitle="Price and margin movements that need operator attention."
    >
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {criticalCount} critical alerts
          </span>
          <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/40 sm:block" />
          <span className="text-muted-foreground">
            Estimated margin impact:{" "}
            <span
              className={
                estimatedImpact < 0
                  ? "font-semibold text-destructive"
                  : "font-semibold text-success"
              }
            >
              {formatMonthlyImpact(estimatedImpact)}
            </span>
          </span>
          <span className="hidden h-1 w-1 rounded-full bg-muted-foreground/40 sm:block" />
          <span className="text-muted-foreground">{alerts.length} open items</span>
        </div>
      </Card>

      <div className="mt-3 space-y-1.5">
        {alerts.map((a) => {
          const s = sevStyles[a.severity];
          const up = a.delta >= 0;
          const meta = alertMeta[a.id];
          return (
            <Card key={a.id} className={`p-2.5 transition-colors hover:bg-muted/20 ${s.card}`}>
              <div className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`rounded-full border px-1.5 py-0.5 font-semibold uppercase tracking-wider ${s.chip}`}
                    >
                      {s.label}
                    </span>
                    {a.recipe && <span className="text-muted-foreground">{a.recipe}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{a.time}</span>
                  </div>
                  <div className="mt-0.5 font-semibold leading-snug">{a.title}</div>
                  <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{a.detail}</p>
                  <div className="mt-1 text-xs leading-snug text-muted-foreground">
                    <span className="font-medium text-foreground/80">Suggested action:</span>{" "}
                    {suggestedActions[a.id]}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${up ? "text-destructive" : "text-success"}`}
                    >
                      {up ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {up ? "+" : ""}
                      {a.delta}%
                    </span>
                    <MetaPill
                      label="Monthly impact"
                      value={formatMonthlyImpact(meta.monthlyImpact)}
                      tone={meta.monthlyImpact < 0 ? "text-destructive" : "text-success"}
                    />
                    <MetaPill label={`Affects ${meta.affectedRecipes} recipes`} />
                    {meta.supplier && <MetaPill label="Supplier" value={meta.supplier} />}
                    <button className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted">
                      Review action
                    </button>
                    <button className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
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
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {value && <span className={`font-semibold ${tone}`}>{value}</span>}
    </span>
  );
}

function formatMonthlyImpact(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}€${Math.abs(value).toLocaleString("en-US")}/month`;
}
