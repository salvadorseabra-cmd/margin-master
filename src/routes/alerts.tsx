import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { alerts } from "@/lib/mock-data";
import { AlertTriangle, Bell, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Margin Alerts — Marginly" },
      { name: "description", content: "AI alerts on ingredient prices and margin shifts." },
    ],
  }),
  component: AlertsPage,
});

const sevStyles: Record<string, { dot: string; chip: string; label: string }> = {
  high: { dot: "bg-destructive", chip: "bg-destructive/10 text-destructive", label: "High" },
  medium: { dot: "bg-warning", chip: "bg-warning/15 text-warning-foreground", label: "Medium" },
  low: { dot: "bg-success", chip: "bg-success/10 text-success", label: "Low" },
};

function AlertsPage() {
  const counts = {
    high: alerts.filter((a) => a.severity === "high").length,
    medium: alerts.filter((a) => a.severity === "medium").length,
    low: alerts.filter((a) => a.severity === "low").length,
  };

  return (
    <AppShell
      title="Margin alerts"
      subtitle="AI-generated insights ranked by impact on your margin."
    >
      <div className="grid grid-cols-3 gap-4">
        <Summary icon={<AlertTriangle className="h-4 w-4" />} label="High" value={counts.high} tone="text-destructive" />
        <Summary icon={<Bell className="h-4 w-4" />} label="Medium" value={counts.medium} tone="text-warning-foreground" />
        <Summary icon={<Sparkles className="h-4 w-4" />} label="Low" value={counts.low} tone="text-success" />
      </div>

      <div className="mt-4 space-y-3">
        {alerts.map((a) => {
          const s = sevStyles[a.severity];
          const up = a.delta >= 0;
          return (
            <Card key={a.id}>
              <div className="flex items-start gap-4">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${s.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${s.chip}`}>{s.label}</span>
                    {a.recipe && <span className="text-xs text-muted-foreground">· {a.recipe}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{a.time}</span>
                  </div>
                  <div className="mt-1.5 font-semibold">{a.title}</div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{a.detail}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${up ? "text-destructive" : "text-success"}`}>
                      {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {up ? "+" : ""}{a.delta}%
                    </span>
                    <button className="text-xs font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90">
                      Apply AI suggestion
                    </button>
                    <button className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted">
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

function Summary({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card>
      <div className={`inline-flex items-center gap-2 ${tone}`}>
        {icon}
        <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
    </Card>
  );
}
