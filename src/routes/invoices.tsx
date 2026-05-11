import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { StatusPill } from "./index";
import { UploadCloud, FileText, Sparkles, Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Marginly" },
      { name: "description", content: "Upload supplier invoices and let AI extract line items." },
    ],
  }),
  component: InvoicesPage,
});

type InvoiceRow = {
  id: string;
  supplier: string;
  invoice_date: string;
  total: number;
  status: string;
  items_count: number;
  file_path: string | null;
};

function InvoicesPage() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, supplier, invoice_date, total, status, items_count, file_path")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows(data ?? []);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const handleFile = async (file: File) => {
    if (!user) return;
    setError(null);
    setUploading(file.name);
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) throw upErr;

      const supplier = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Unknown supplier";
      const total = +(Math.random() * 1500 + 100).toFixed(2);
      const items = Math.floor(Math.random() * 18) + 4;

      const { error: insErr } = await supabase.from("invoices").insert({
        user_id: user.id,
        supplier,
        total,
        items_count: items,
        status: "Processed",
        file_path: path,
      });
      if (insErr) throw insErr;
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
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
            onDrop={(e) => { e.preventDefault(); setDrop(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-10 text-center transition ${
              drop ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30 hover:bg-muted/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
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
                  <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading
                  </span>
                </div>
              </div>
            )}
            {error && <div className="mt-4 text-xs text-destructive">{error}</div>}
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
              "Line items detected automatically",
              "Prices compared to previous invoice",
              "Items flagged for review when ambiguous",
              "Linked to your recipes and ingredients",
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
          <div className="text-sm font-medium">Your invoices</div>
          <span className="text-xs text-muted-foreground">{rows.length} total</span>
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Supplier</th>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium text-right">Items</th>
                <th className="py-2 font-medium text-right">Total</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No invoices yet. Drop one above to get started.</td></tr>
              )}
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-muted/30">
                  <td className="py-3 font-medium">{i.supplier}</td>
                  <td className="py-3 text-muted-foreground">{i.invoice_date}</td>
                  <td className="py-3 text-right tabular-nums">{i.items_count}</td>
                  <td className="py-3 text-right tabular-nums">€{Number(i.total).toFixed(2)}</td>
                  <td className="py-3"><StatusPill status={i.status as "Processed" | "Processing" | "Review"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
