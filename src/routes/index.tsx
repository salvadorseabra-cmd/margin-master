import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import {
  recipes,
  kpis,
  marginTrend,
  topIngredients,
  alerts,
  invoices,
  ingredients,
} from "@/lib/mock-data";
import {
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  UploadCloud,
  FileText,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Marginly" },
      { name: "description", content: "Overview of food cost, margin and AI alerts." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <AppShell
      title="Good evening, Camille"
      subtitle="Here's how Maison Olivier performed this week."
      action={
        <Link
          to="/invoices"
          className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Upload invoice
        </Link>
      }
    >
      {/* Hero AI insight */}
      <section className="hero-surface p-5 sm:p-7 mb-5 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute right-0 top-0 h-64 w-64 rounded-full opacity-25"
          style={{ background: "radial-gradient(closest-side, var(--color-chart-1), transparent)" }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider opacity-80">
              <Sparkles className="h-3.5 w-3.5" /> AI insight · 2h ago
            </div>
            <h2 className="mt-3 text-xl sm:text-2xl font-semibold leading-snug">
              Margin slipped 1.4 pts this week — mainly beef and saffron.
            </h2>
            <p className="mt-2 text-sm opacity-80">
              Repricing Filet Mignon Rossini to <span className="font-semibold opacity-100">€52</span> would
              restore your 65% target margin.
            </p>
          </div>
          <div className="flex sm:flex-col gap-2 sm:items-end">
            <Link
              to="/alerts"
              className="inline-flex items-center gap-2 rounded-lg bg-white text-foreground px-3.5 py-2 text-sm font-medium hover:opacity-95"
            >
              View 5 alerts <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/recipes"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3.5 py-2 text-sm font-medium hover:bg-white/10"
            >
              Adjust recipes
            </Link>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi
          label="Food cost"
          value={`${kpis.foodCost.value}%`}
          delta={+(kpis.foodCost.value - kpis.foodCost.prev).toFixed(1)}
          suffix="pts"
          inverse
          spark={marginTrend.map((d) => ({ v: d.foodCost }))}
          color="var(--color-chart-3)"
        />
        <Kpi
          label="Gross margin"
          value={`${kpis.margin.value}%`}
          delta={+(kpis.margin.value - kpis.margin.prev).toFixed(1)}
          suffix="pts"
          spark={marginTrend.map((d) => ({ v: d.margin }))}
          color="var(--color-chart-1)"
        />
        <Kpi
          label="Revenue MTD"
          value={`€${(kpis.revenue.value / 1000).toFixed(1)}k`}
          delta={+(((kpis.revenue.value - kpis.revenue.prev) / kpis.revenue.prev) * 100).toFixed(1)}
          suffix="%"
          spark={[68, 71, 70, 74, 76, 79, 84].map((v) => ({ v }))}
          color="var(--color-chart-2)"
        />
        <Kpi
          label="Invoices"
          value={`${kpis.invoices.value}`}
          delta={kpis.invoices.value - kpis.invoices.prev}
          suffix=""
          spark={[28, 32, 30, 36, 39, 42, 47].map((v) => ({ v }))}
          color="var(--color-chart-5)"
        />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2 card-hover">
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Margin vs food cost</div>
              <div className="text-xs text-muted-foreground">Last 7 months</div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Legend color="var(--color-chart-1)" label="Margin %" />
              <Legend color="var(--color-chart-3)" label="Food cost %" />
            </div>
          </div>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer>
              <AreaChart data={marginTrend} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip} />
                <Area type="monotone" dataKey="margin" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#g1)" />
                <Area type="monotone" dataKey="foodCost" stroke="var(--color-chart-3)" strokeWidth={2} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="card-hover">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Top ingredient spend</div>
            <span className="text-xs text-muted-foreground">This month</span>
          </div>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer>
              <BarChart data={topIngredients} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={104} />
                <Tooltip contentStyle={chartTooltip} formatter={(v: number) => [`€${v}`, "Spend"]} />
                <Bar dataKey="spend" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Upload + Alerts row */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-1 card-hover">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Upload invoice</div>
            <Link to="/invoices" className="text-xs text-muted-foreground hover:text-foreground">
              All invoices →
            </Link>
          </div>
          <Link
            to="/invoices"
            className="block rounded-xl border-2 border-dashed border-border hover:border-foreground/40 hover:bg-muted/40 transition-colors p-6 text-center"
          >
            <div className="mx-auto h-11 w-11 rounded-full bg-muted grid place-items-center mb-3">
              <UploadCloud className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">Drop a PDF or image</div>
            <div className="text-xs text-muted-foreground mt-1">
              AI extracts items, prices and supplier in seconds.
            </div>
          </Link>

          <div className="mt-4 space-y-2">
            {invoices.slice(0, 3).map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50">
                <div className="h-8 w-8 rounded-md bg-muted grid place-items-center shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{i.supplier}</div>
                  <div className="text-xs text-muted-foreground">{i.id} · {i.date}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm tabular-nums font-medium">€{i.total.toFixed(0)}</div>
                  <StatusPill status={i.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2 card-hover">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Margin alerts</div>
            <Link to="/alerts" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {alerts.slice(0, 4).map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        </Card>
      </div>

      {/* Ingredient table */}
      <Card className="mt-4 p-0 overflow-hidden card-hover">
        <div className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-semibold">Ingredient price tracker</div>
            <div className="text-xs text-muted-foreground">Top movers this week</div>
          </div>
          <Link to="/ingredients" className="text-xs text-muted-foreground hover:text-foreground">
            Full list →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2.5 px-5 font-medium">Ingredient</th>
                <th className="py-2.5 px-5 font-medium hidden sm:table-cell">Supplier</th>
                <th className="py-2.5 px-5 font-medium text-right">Price</th>
                <th className="py-2.5 px-5 font-medium text-right">Δ 7d</th>
                <th className="py-2.5 px-5 font-medium hidden md:table-cell">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ingredients.slice(0, 5).map((ing) => {
                const delta = ((ing.current - ing.prev) / ing.prev) * 100;
                const up = delta >= 0;
                return (
                  <tr key={ing.id} className="hover:bg-muted/30">
                    <td className="py-3 px-5">
                      <div className="font-medium">{ing.name}</div>
                      <div className="text-xs text-muted-foreground">per {ing.unit}</div>
                    </td>
                    <td className="py-3 px-5 text-muted-foreground hidden sm:table-cell">{ing.supplier}</td>
                    <td className="py-3 px-5 text-right tabular-nums font-medium">€{ing.current.toFixed(2)}</td>
                    <td className="py-3 px-5 text-right">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-destructive" : "text-success"}`}>
                        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {up ? "+" : ""}{delta.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-5 w-32 hidden md:table-cell">
                      <div className="h-8">
                        <ResponsiveContainer>
                          <LineChart data={ing.history}>
                            <Line
                              type="monotone"
                              dataKey="p"
                              stroke={up ? "var(--color-destructive)" : "var(--color-success)"}
                              strokeWidth={1.75}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recipes performance */}
      <Card className="mt-4 card-hover">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold">Recipe performance</div>
            <div className="text-xs text-muted-foreground">Margin per dish · last 30 days</div>
          </div>
          <Link to="/recipes" className="text-xs text-muted-foreground hover:text-foreground">
            All recipes →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recipes.slice(0, 6).map((r) => {
            const margin = ((r.price - r.cost) / r.price) * 100;
            const healthy = margin >= 65;
            return (
              <div key={r.id} className="rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.category} · {r.sold} sold</div>
                  </div>
                  <span className={`text-xs font-semibold tabular-nums ${healthy ? "text-success" : "text-destructive"}`}>
                    {margin.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${healthy ? "bg-success" : "bg-destructive"}`}
                    style={{ width: `${Math.min(100, margin)}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Cost €{r.cost.toFixed(2)}</span>
                  <span className="text-foreground font-medium">€{r.price.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  delta,
  suffix,
  inverse,
  spark,
  color,
}: {
  label: string;
  value: string;
  delta: number;
  suffix: string;
  inverse?: boolean;
  spark: { v: number }[];
  color: string;
}) {
  const positive = inverse ? delta < 0 : delta > 0;
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="card-surface card-hover p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
            positive ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
          }`}
        >
          <Icon className="h-3 w-3" />
          {delta > 0 ? "+" : ""}
          {delta}
          {suffix}
        </div>
      </div>
      <div className="text-xl sm:text-2xl font-semibold mt-1.5 tabular-nums tracking-tight">{value}</div>
      <div className="h-8 sm:h-10 -mx-1 mt-2">
        <ResponsiveContainer>
          <AreaChart data={spark} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#spark-${label})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AlertCard({ alert: a }: { alert: (typeof alerts)[number] }) {
  const tone =
    a.severity === "high"
      ? { dot: "bg-destructive", icon: <AlertTriangle className="h-3.5 w-3.5" />, ring: "ring-destructive/20" }
      : a.severity === "medium"
        ? { dot: "bg-warning", icon: <TrendingUp className="h-3.5 w-3.5" />, ring: "ring-warning/30" }
        : { dot: "bg-success", icon: <ArrowDownRight className="h-3.5 w-3.5" />, ring: "ring-success/20" };
  return (
    <div className={`rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full grid place-items-center text-background ${tone.dot} ring-4 ${tone.ring}`}>
            {tone.icon}
          </span>
          <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            {a.severity}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{a.time}</span>
      </div>
      <div className="text-sm font-medium mt-3 leading-snug">{a.title}</div>
      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{a.detail}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Processed: "bg-success/10 text-success",
    Processing: "bg-warning/15 text-warning-foreground",
    Review: "bg-destructive/10 text-destructive",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

const chartTooltip = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
} as const;
