import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/ingredients")({
  head: () => ({
    meta: [
      { title: "Ingredient Prices — Marginly" },
      { name: "description", content: "Track ingredient price changes across suppliers." },
    ],
  }),
  component: IngredientsPage,
});

type Row = {
  id: string;
  name: string;
  unit: string;
  current_price: number;
  supplier: string | null;
};

function IngredientsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", current_price: "", supplier: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ingredients")
      .select("id, name, unit, current_price, supplier")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("ingredients").insert({
      user_id: user.id,
      name: form.name,
      unit: form.unit,
      current_price: Number(form.current_price) || 0,
      supplier: form.supplier || null,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setForm({ name: "", unit: "kg", current_price: "", supplier: "" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("ingredients").delete().eq("id", id);
    load();
  };

  return (
    <AppShell
      title="Ingredient prices"
      subtitle="Track ingredient prices across your suppliers."
      action={
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add ingredient
        </button>
      }
    >
      {open && (
        <Card className="mb-4">
          <form onSubmit={save} className="grid sm:grid-cols-5 gap-3 items-end">
            <Field label="Name">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Beef tenderloin" />
            </Field>
            <Field label="Unit">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="input" placeholder="kg" />
            </Field>
            <Field label="Price (€)">
              <input required type="number" step="0.01" value={form.current_price} onChange={(e) => setForm({ ...form, current_price: e.target.value })} className="input" placeholder="0.00" />
            </Field>
            <Field label="Supplier">
              <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="input" placeholder="Boucherie Lafayette" />
            </Field>
            <button disabled={saving} type="submit" className="bg-foreground text-background rounded-lg px-3.5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </form>
          {error && <div className="text-xs text-destructive mt-2">{error}</div>}
          <style>{`.input{margin-top:.25rem;width:100%;border-radius:.5rem;border:1px solid var(--color-input);background:var(--color-card);padding:.55rem .75rem;font-size:.875rem}`}</style>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 px-5 font-medium">Ingredient</th>
                <th className="py-3 px-5 font-medium">Supplier</th>
                <th className="py-3 px-5 font-medium text-right">Current price</th>
                <th className="py-3 px-5 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={4} className="py-10 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No ingredients yet. Add your first one above.</td></tr>
              )}
              {rows.map((ing) => (
                <tr key={ing.id} className="hover:bg-muted/30">
                  <td className="py-4 px-5">
                    <div className="font-medium">{ing.name}</div>
                    <div className="text-xs text-muted-foreground">per {ing.unit}</div>
                  </td>
                  <td className="py-4 px-5 text-muted-foreground">{ing.supplier ?? "—"}</td>
                  <td className="py-4 px-5 text-right tabular-nums font-medium">€{Number(ing.current_price).toFixed(2)}</td>
                  <td className="py-4 px-5 text-right">
                    <button onClick={() => remove(ing.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
