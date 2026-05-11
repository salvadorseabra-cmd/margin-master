import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { kpis, marginTrend, topIngredients, alerts, invoices } from "@/lib/mock-data";
import { ArrowDownRight, ArrowUpRight, Plus, Sparkles } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
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
          className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Upload invoice
        </Link>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Food cost" value={`${kpis.foodCost.value}%`} delta={+(kpis.foodCost.value - kpis.foodCost.prev).toFixed(1)} suffix="pts" inverse />
        <Kpi label="Gross margin" value={`${kpis.margin.value}%`} delta={+(kpis.margin.value - kpis.margin.prev).toFixed(1)} suffix="pts" />
        <Kpi label="Revenue (mtd)" value={`€${(kpis.revenue.value / 1000).toFixed(1)}k`} delta={+(((kpis.revenue.value - kpis.revenue.prev) / kpis.revenue.prev) * 100).toFixed(1)} suffix="%" />
        <Kpi label="Invoices" value={`${kpis.invoices.value}`} delta={kpis.invoices.value - kpis.invoices.prev} suffix="" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm font-medium">Margin vs food cost</div>
              <div className="text-xs text-muted-foreground">Last 7 months</div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Legend color="var(--color-chart-1)" label="Margin %" />
              <Legend color="var(--color-chart-3)" label="Food cost %" />
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={marginTrend} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.35} />
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

        <Card>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-foreground text-background grid place-items-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">AI insight</div>
              <div className="text-xs text-muted-foreground">Generated 2h ago</div>
            </div>
          </div>
          <p className="text-sm mt-4 leading-relaxed">
            Your <span className="font-medium">food cost rose 1.4 pts</span> this week, driven mostly by{" "}
            <span className="font-medium">beef tenderloin (+11.5%)</span> and{" "}
            <span className="font-medium">saffron (+15.3%)</span>.
          </p>
          <p className="text-sm mt-3 leading-relaxed text-muted-foreground">
            Repricing Filet Mignon Rossini to <span className="font-medium text-foreground">€52</span> would restore your 65% target margin.
          </p>
          <Link to="/alerts" className="mt-5 inline-flex text-sm font-medium text-primary hover:underline">
            View 5 alerts →
          </Link>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium">Top ingredient spend</div>
            <span className="text-xs text-muted-foreground">This month</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={topIngredients} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={120} />
                <Tooltip contentStyle={chartTooltip} formatter={(v: number) => `€${v}`} />
                <Bar dataKey="spend" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Recent alerts</div>
            <Link to="/alerts" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          <ul className="divide-y divide-border">
            {alerts.slice(0, 4).map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3">
                <span
                  className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                    a.severity === "high" ? "bg-destructive" : a.severity === "medium" ? "bg-warning" : "bg-success"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.time}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Latest invoices</div>
          <Link to="/invoices" className="text-xs text-muted-foreground hover:text-foreground">Open invoices →</Link>
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Invoice</th>
                <th className="py-2 font-medium">Supplier</th>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium text-right">Total</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.slice(0, 5).map((i) => (
                <tr key={i.id}>
                  <td className="py-3 font-medium">{i.id}</td>
                  <td className="py-3">{i.supplier}</td>
                  <td className="py-3 text-muted-foreground">{i.date}</td>
                  <td className="py-3 text-right tabular-nums">€{i.total.toFixed(2)}</td>
                  <td className="py-3"><StatusPill status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function Kpi({ label, value, delta, suffix, inverse }: { label: string; value: string; delta: number; suffix: string; inverse?: boolean }) {
  const positive = inverse ? delta < 0 : delta > 0;
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1.5 tabular-nums">{value}</div>
      <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-success" : "text-destructive"}`}>
        <Icon className="h-3.5 w-3.5" />
        {delta > 0 ? "+" : ""}{delta}{suffix}
      </div>
    </Card>
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
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

const chartTooltip = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
} as const;
