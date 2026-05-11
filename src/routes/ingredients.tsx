import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { ingredients } from "@/lib/mock-data";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/ingredients")({
  head: () => ({
    meta: [
      { title: "Ingredient Prices — Marginly" },
      { name: "description", content: "Track ingredient price changes across suppliers." },
    ],
  }),
  component: IngredientsPage,
});

function IngredientsPage() {
  return (
    <AppShell
      title="Ingredient prices"
      subtitle="Weekly price evolution per ingredient — sourced from your invoices."
    >
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 px-5 font-medium">Ingredient</th>
                <th className="py-3 px-5 font-medium">Supplier</th>
                <th className="py-3 px-5 font-medium text-right">Current</th>
                <th className="py-3 px-5 font-medium text-right">Δ 7d</th>
                <th className="py-3 px-5 font-medium">Trend (8w)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ingredients.map((ing) => {
                const delta = ((ing.current - ing.prev) / ing.prev) * 100;
                const up = delta >= 0;
                return (
                  <tr key={ing.id} className="hover:bg-muted/30">
                    <td className="py-4 px-5">
                      <div className="font-medium">{ing.name}</div>
                      <div className="text-xs text-muted-foreground">per {ing.unit}</div>
                    </td>
                    <td className="py-4 px-5 text-muted-foreground">{ing.supplier}</td>
                    <td className="py-4 px-5 text-right tabular-nums font-medium">€{ing.current.toFixed(2)}</td>
                    <td className="py-4 px-5 text-right">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-destructive" : "text-success"}`}>
                        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {up ? "+" : ""}{delta.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-5 w-44">
                      <div className="h-10">
                        <ResponsiveContainer>
                          <LineChart data={ing.history}>
                            <Tooltip
                              contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                              formatter={(v: number) => [`€${v}`, "Price"]}
                              labelFormatter={() => ""}
                            />
                            <Line
                              type="monotone"
                              dataKey="p"
                              stroke={up ? "var(--color-destructive)" : "var(--color-success)"}
                              strokeWidth={2}
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
    </AppShell>
  );
}
