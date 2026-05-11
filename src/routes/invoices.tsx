import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { invoices } from "@/lib/mock-data";
import { StatusPill } from "./index";
import { UploadCloud, FileText, Sparkles, Check } from "lucide-react";
import { useRef, useState } from "react";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Marginly" },
      { name: "description", content: "Upload supplier invoices and let AI extract line items." },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const fakeUpload = (name: string) => {
    setUploading(name);
    setTimeout(() => setUploading(null), 1800);
  };

  return (
    <AppShell
      title="Invoices"
      subtitle="Drop supplier invoices — AI extracts items, prices and matches ingredients automatically."
    >
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrop(true); }}
            onDragLeave={() => setDrop(false)}
            onDrop={(e) => { e.preventDefault(); setDrop(false); fakeUpload(e.dataTransfer.files[0]?.name ?? "invoice.pdf"); }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-10 text-center transition ${
              drop ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30 hover:bg-muted/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.png"
              onChange={(e) => e.target.files?.[0] && fakeUpload(e.target.files[0].name)}
            />
            <div className="mx-auto h-12 w-12 rounded-xl bg-foreground text-background grid place-items-center">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="mt-4 text-sm font-medium">Drop PDF / image invoices here</div>
            <div className="text-xs text-muted-foreground mt-1">or click to browse · PDF, JPG, PNG up to 20 MB</div>

            {uploading && (
              <div className="mt-6 max-w-sm mx-auto text-left">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="truncate">{uploading}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Extracting…</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-foreground animate-[grow_1.6s_ease-in-out]" style={{ width: "85%" }} />
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            {[
              { label: "Auto-categorised", value: "12 items" },
              { label: "Matched to ingredients", value: "11 / 12" },
              { label: "Avg processing", value: "8.4s" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-muted/40 border border-border p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-sm font-semibold mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-foreground text-background grid place-items-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">AI extraction</div>
              <div className="text-xs text-muted-foreground">Reviewed last invoice</div>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              "Line items detected: 12",
              "Beef tenderloin price up 11.5% vs last invoice",
              "1 item flagged for review (unit mismatch)",
              "Linked to recipe: Filet Mignon Rossini",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">All invoices</div>
          <span className="text-xs text-muted-foreground">{invoices.length} this month</span>
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Invoice</th>
                <th className="py-2 font-medium">Supplier</th>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium text-right">Items</th>
                <th className="py-2 font-medium text-right">Total</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-muted/30">
                  <td className="py-3 font-medium">{i.id}</td>
                  <td className="py-3">{i.supplier}</td>
                  <td className="py-3 text-muted-foreground">{i.date}</td>
                  <td className="py-3 text-right tabular-nums">{i.items}</td>
                  <td className="py-3 text-right tabular-nums">€{i.total.toFixed(2)}</td>
                  <td className="py-3"><StatusPill status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <style>{`@keyframes grow { from { width: 0% } to { width: 85% } }`}</style>
    </AppShell>
  );
}
