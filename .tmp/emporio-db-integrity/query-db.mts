/** READ-ONLY Emporio DB integrity queries */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/emporio-db-integrity";
const EMPORIO = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";
const VL_INVOICES = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino" },
  { id: EMPORIO, label: "Emporio" },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore" },
];

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!.api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"), {
  auth: { persistSession: false },
});

const ids = VL_INVOICES.map((i) => i.id);
const { data: invoices, error: invErr } = await sb.from("invoices").select("*").in("id", ids);
const { data: items, error: itemsErr } = await sb
  .from("invoice_items")
  .select("*")
  .in("invoice_id", ids)
  .order("created_at", { ascending: true });
const { data: priceHist, error: phErr } = await sb
  .from("ingredient_price_history")
  .select("*")
  .in("invoice_id", ids)
  .order("created_at", { ascending: true });
const { data: aliases } = await sb
  .from("ingredient_aliases")
  .select("ingredient_id, alias_name, normalized_alias, supplier_name, confirmed_by_user, created_at")
  .ilike("supplier_name", "%emporio%");

const itemsByInvoice: Record<string, unknown> = {};
for (const inv of VL_INVOICES) {
  const invItems = (items ?? []).filter((r) => r.invoice_id === inv.id);
  const buckets: Record<string, number> = {};
  for (const it of invItems) {
    const key = (it.created_at as string)?.slice(0, 19) ?? "unknown";
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  itemsByInvoice[inv.id] = { label: inv.label, count: invItems.length, createdAtBuckets: buckets, items: invItems };
}

const emporioInvoice = (invoices ?? []).find((i) => i.id === EMPORIO);
const emporioHistory = (priceHist ?? []).filter((h) => h.invoice_id === EMPORIO);

const affected = VL_INVOICES.map((inv) => ({
  label: inv.label,
  invoiceId: inv.id,
  itemCount: (itemsByInvoice[inv.id] as { count: number }).count,
  invoice: (invoices ?? []).find((i) => i.id === inv.id) ?? null,
  priceHistoryRows: (priceHist ?? []).filter((h) => h.invoice_id === inv.id).length,
  createdAtBuckets: (itemsByInvoice[inv.id] as { createdAtBuckets: Record<string, number> }).createdAtBuckets,
}));

const result = {
  queriedAt: new Date().toISOString(),
  errors: { invErr: invErr?.message ?? null, itemsErr: itemsErr?.message ?? null, phErr: phErr?.message ?? null },
  emporioInvoice,
  emporioItemCount: (itemsByInvoice[EMPORIO] as { count: number }).count,
  emporioItems: (itemsByInvoice[EMPORIO] as { items: unknown[] }).items,
  emporioPriceHistory: emporioHistory,
  emporioAliases: aliases ?? [],
  affectedInvoices: affected,
};

writeFileSync(`${OUT}/db-query.json`, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      emporioItems: result.emporioItemCount,
      emporioInvoice: emporioInvoice
        ? { total: emporioInvoice.total, created_at: emporioInvoice.created_at, supplier: emporioInvoice.supplier_name }
        : null,
      affected: affected.map((a) => ({ label: a.label, items: a.itemCount, ph: a.priceHistoryRows })),
    },
    null,
    2,
  ),
);
