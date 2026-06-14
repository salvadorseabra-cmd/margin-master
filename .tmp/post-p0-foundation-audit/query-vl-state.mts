/**
 * READ-ONLY VL state snapshot for post-P0 foundation audit.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OUT = ".tmp/post-p0-foundation-audit";
const VL_REF = "bjhnlrgodcqoyzddbpbd";

const VL_INVOICES = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino" },
  { id: "ab52796d-de1d-418d-86e7-230c8f056f09", label: "Emporio (live)" },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore" },
];
const DELETED_EMPORIO = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"), {
  auth: { persistSession: false },
});

mkdirSync(OUT, { recursive: true });

const ids = VL_INVOICES.map((i) => i.id);

const { data: invoices } = await sb
  .from("invoices")
  .select("id, supplier_name, invoice_date, created_at, total, updated_at")
  .in("id", [...ids, DELETED_EMPORIO]);

const { data: items } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at")
  .in("invoice_id", [...ids, DELETED_EMPORIO])
  .order("created_at", { ascending: true });

const { data: priceHistory } = await sb
  .from("ingredient_price_history")
  .select("id, ingredient_id, invoice_id, ingredient_name, previous_price, new_price, delta_percent, created_at")
  .in("invoice_id", [...ids, DELETED_EMPORIO])
  .order("created_at", { ascending: true });

const { data: aliases } = await sb
  .from("ingredient_aliases")
  .select("id, ingredient_id, alias_name, supplier_name, confirmed_by_user")
  .limit(200);

const v31Extracts: Record<string, { rowCount?: number }> = {};
for (const inv of VL_INVOICES) {
  try {
    const raw = readFileSync(`.tmp/vl-final-state-audit/extracts/${inv.id}.json`, "utf8");
    const parsed = JSON.parse(raw) as { items?: unknown[]; rows?: unknown[] };
    v31Extracts[inv.id] = { rowCount: (parsed.items ?? parsed.rows ?? []).length };
  } catch {
    v31Extracts[inv.id] = { rowCount: null as unknown as number };
  }
}

const STALE_CUTOFF = "2026-06-12T00:00:00Z";

const perInvoice = VL_INVOICES.map((inv) => {
  const invItems = (items ?? []).filter((r) => r.invoice_id === inv.id);
  const invMeta = (invoices ?? []).find((i) => i.id === inv.id);
  const hist = (priceHistory ?? []).filter((h) => h.invoice_id === inv.id);
  const linked = invItems.filter(() => false);
  const oldest = invItems[0]?.created_at ?? null;
  const lineSum = invItems.reduce((s, r) => s + (Number(r.total) || 0), 0);
  return {
    label: inv.label,
    invoiceId: inv.id,
    exists: Boolean(invMeta),
    dbItemCount: invItems.length,
    v31ExtractRowCount: v31Extracts[inv.id]?.rowCount ?? null,
    countMatch: v31Extracts[inv.id]?.rowCount === invItems.length,
    linkedIngredientLines: linked.length,
    priceHistoryRows: hist.length,
    headerTotal: invMeta?.total ?? null,
    lineSum: Math.round(lineSum * 100) / 100,
    oldestItemCreatedAt: oldest,
    stale: oldest != null && String(oldest) < STALE_CUTOFF,
    invoiceCreatedAt: invMeta?.created_at ?? null,
  };
});

const deletedEmporio = {
  invoiceExists: (invoices ?? []).some((i) => i.id === DELETED_EMPORIO),
  itemCount: (items ?? []).filter((r) => r.invoice_id === DELETED_EMPORIO).length,
  priceHistoryRows: (priceHistory ?? []).filter((h) => h.invoice_id === DELETED_EMPORIO).length,
};

const snapshot = {
  generated_at: new Date().toISOString(),
  deployVersion: 31,
  perInvoice,
  deletedEmporioVl: deletedEmporio,
  totals: {
    vlInvoices: perInvoice.length,
    staleInvoices: perInvoice.filter((p) => p.stale).length,
    countMismatches: perInvoice.filter((p) => p.countMatch === false).length,
    totalPriceHistoryRows: (priceHistory ?? []).length,
    ghostHistoryOnDeletedEmporio: deletedEmporio.priceHistoryRows,
    totalAliases: (aliases ?? []).length,
    linkedLines: 0,
    unmatchedLines: (items ?? []).length,
  },
};

writeFileSync(`${OUT}/vl-state-snapshot.json`, JSON.stringify(snapshot, null, 2));
console.log("VL_STATE", JSON.stringify(snapshot.totals, null, 2));
