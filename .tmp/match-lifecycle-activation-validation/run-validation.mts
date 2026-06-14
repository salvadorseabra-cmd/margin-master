/**
 * One-off VL activation validation — queries + Bidfood re-read simulation.
 * Run: vite-node .tmp/match-lifecycle-activation-validation/run-validation.mts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../../src/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "../../src/lib/ingredient-catalog-load";
import { shadowSeedInvoiceItemMatchesAfterExtract } from "../../src/lib/invoice-item-match-shadow-seed";
import { loadEnvFiles } from "../../scripts/load-env.mts";

loadEnvFiles();

const BIDFOOD_INVOICE_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
const PEPINO_ITEM_ID = "514feb41-6cd4-44f1-abc8-344f0c0dfc23";
const PEPINO_INGREDIENT_ID = "635a1189-36ea-4ff2-9012-8172ab1ab81d";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function coverageSnapshot() {
  const { data: items, error: itemsErr } = await supabase.from("invoice_items").select("id");
  if (itemsErr) throw itemsErr;
  const { data: matches, error: matchErr } = await supabase
    .from("invoice_item_matches")
    .select("invoice_item_id,status");
  if (matchErr) throw matchErr;

  const itemIds = new Set((items ?? []).map((r) => r.id));
  const matchIds = new Set((matches ?? []).map((r) => r.invoice_item_id));
  const missing = [...itemIds].filter((id) => !matchIds.has(id));
  const orphans = [...matchIds].filter((id) => !itemIds.has(id));

  const dupes: string[] = [];
  const seen = new Map<string, number>();
  for (const m of matches ?? []) {
    seen.set(m.invoice_item_id, (seen.get(m.invoice_item_id) ?? 0) + 1);
  }
  for (const [id, n] of seen) {
    if (n > 1) dupes.push(id);
  }

  const byStatus: Record<string, number> = {};
  for (const m of matches ?? []) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
  }

  return {
    invoiceItemsCount: itemIds.size,
    matchRecordsCount: matches?.length ?? 0,
    missingInvoiceItemIds: missing,
    orphanMatchInvoiceItemIds: orphans,
    duplicateInvoiceItemIds: dupes,
    byStatus,
  };
}

async function pepinoRow() {
  const { data, error } = await supabase
    .from("invoice_item_matches")
    .select("invoice_item_id,status,match_kind,ingredient_id,confirmed_at")
    .eq("invoice_item_id", PEPINO_ITEM_ID)
    .maybeSingle();
  if (error) throw error;
  const { data: item } = await supabase
    .from("invoice_items")
    .select("name")
    .eq("id", PEPINO_ITEM_ID)
    .maybeSingle();
  return { itemName: item?.name ?? null, match: data };
}

async function aviludoConfirmed() {
  const { data, error } = await supabase
    .from("invoice_item_matches")
    .select("invoice_item_id,status,match_kind,ingredient_id,invoice_items!inner(name,invoices!inner(supplier_name))")
    .eq("status", "confirmed");
  if (error) throw error;
  return (data ?? [])
    .filter((row) => {
      const nested = row.invoice_items as { name: string; invoices: { supplier_name: string | null } };
      return (nested.invoices.supplier_name ?? "").toLowerCase().includes("aviludo");
    })
    .map((row) => {
      const nested = row.invoice_items as { name: string; invoices: { supplier_name: string | null } };
      return {
        name: nested.name,
        status: row.status,
        match_kind: row.match_kind,
        ingredient_id: row.ingredient_id,
      };
    });
}

async function simulateBidfoodReread() {
  const { data: bidfoodItems, error: loadErr } = await supabase
    .from("invoice_items")
    .select("id,name,user_id,quantity,unit,unit_price,total")
    .eq("invoice_id", BIDFOOD_INVOICE_ID);
  if (loadErr) throw loadErr;
  const oldItemIds = (bidfoodItems ?? []).map((r) => r.id);
  const pepinoBefore = await pepinoRow();

  const { count: matchCountBefore } = await supabase
    .from("invoice_item_matches")
    .select("*", { count: "exact", head: true })
    .in("invoice_item_id", oldItemIds);

  const { error: delErr } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", BIDFOOD_INVOICE_ID);
  if (delErr) throw delErr;

  const { count: orphanAfterDelete } = await supabase
    .from("invoice_item_matches")
    .select("*", { count: "exact", head: true })
    .in("invoice_item_id", oldItemIds);

  const userId = bidfoodItems?.[0]?.user_id;
  if (!userId) throw new Error("No user_id on Bidfood items");

  const insertRows = (bidfoodItems ?? []).map((it) => ({
    invoice_id: BIDFOOD_INVOICE_ID,
    user_id: userId,
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    total: it.total,
  }));
  const { data: inserted, error: insErr } = await supabase
    .from("invoice_items")
    .insert(insertRows)
    .select("id,name");
  if (insErr) throw insErr;

  const [{ data: aliasRows }, catalogResult] = await Promise.all([
    supabase
      .from("ingredient_aliases")
      .select("ingredient_id, alias_name, normalized_alias, supplier_name")
      .eq("confirmed_by_user", true),
    loadCanonicalIngredientCatalog(supabase),
  ]);
  if (catalogResult.error) throw catalogResult.error;
  const confirmedAliases = buildConfirmedAliasMapFromRows(aliasRows ?? []);

  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("supplier_name")
    .eq("id", BIDFOOD_INVOICE_ID)
    .single();

  const seedResult = await shadowSeedInvoiceItemMatchesAfterExtract(supabase, {
    invoiceId: BIDFOOD_INVOICE_ID,
    userId,
    items: inserted ?? [],
    ingredientCatalog: catalogResult.rows,
    confirmedAliases,
    supplierName: invoiceRow?.supplier_name ?? null,
  });

  const coverage = await coverageSnapshot();
  const pepinoNew = (inserted ?? []).find((r) => r.name?.toLowerCase() === "pepino");
  let pepinoAfter = null;
  if (pepinoNew) {
    const { data } = await supabase
      .from("invoice_item_matches")
      .select("invoice_item_id,status,match_kind,ingredient_id,confirmed_at")
      .eq("invoice_item_id", pepinoNew.id)
      .maybeSingle();
    pepinoAfter = { newItemId: pepinoNew.id, match: data };
  }

  return {
    bidfoodLineCount: bidfoodItems?.length ?? 0,
    oldItemIds,
    matchRowsBeforeDelete: matchCountBefore ?? 0,
    orphanMatchRowsAfterDelete: orphanAfterDelete ?? 0,
    pepinoBefore,
    seedResult,
    pepinoAfter,
    coverage,
  };
}

const phase = process.argv[2] ?? "all";

(async () => {
  if (phase === "queries" || phase === "all") {
    console.log(
      JSON.stringify(
        {
          phase: "coverage",
          flags: {
            shadowSeed: process.env.VITE_MATCH_LIFECYCLE_SHADOW_SEED,
            dualWrite: process.env.VITE_MATCH_LIFECYCLE_DUAL_WRITE,
            extractGate: process.env.VITE_MATCH_LIFECYCLE_EXTRACT_GATE ?? "(default ON)",
          },
          coverage: await coverageSnapshot(),
          pepino: await pepinoRow(),
          aviludoConfirmed: await aviludoConfirmed(),
        },
        null,
        2,
      ),
    );
  }
  if (phase === "reread" || phase === "all") {
    console.log(
      JSON.stringify({ phase: "reread_simulation", ...(await simulateBidfoodReread()) }, null, 2),
    );
  }
})().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
