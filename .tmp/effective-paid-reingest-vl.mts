/**
 * Effective paid price re-ingestion — VL bjhnlrgodcqoyzddbpbd
 * Mirrors src/routes/invoices.tsx runExtraction + reExtract persistence path.
 *
 *   npx vite-node .tmp/effective-paid-reingest-vl.mts [--dry-run]
 */
if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
} else {
  const meta = import.meta as { env: Record<string, unknown> };
  meta.env.DEV = false;
}

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { defaultIsGenericUnit } from "../src/lib/ingredient-auto-persist.ts";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory.ts";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load.ts";
import { syncOperationalIngredientCostsFromInvoiceLines } from "../src/lib/ingredient-operational-intelligence.ts";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../src/lib/invoice-item-fields.ts";
import { shadowSeedInvoiceItemMatchesAfterExtract } from "../src/lib/invoice-item-match-shadow-seed.ts";
import { resolveInvoicePersistedItemUnit } from "../src/lib/invoice-purchase-format.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";
import {
  normalizeInvoiceDate,
  normalizeSupplierDisplayName,
} from "../src/lib/supplier-identity.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL_REF = "bjhnlrgodcqoyzddbpbd";
const TOLERANCE = 0.02;
const OUT = join(ROOT, ".tmp/effective-paid-reingest-result.json");

const TARGET_INVOICES = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "ab52796d-de1d-418d-86e7-230c8f056f09", label: "Emporio" },
];

const AFFECTED_PATTERNS = ["Paccheri", "Courgettes", "Alho Francês", "Manjericão", "Gorgonzola"];
const REGRESSION_PATTERNS = [
  "Prosciutto",
  "San Pellegrino",
  "Mortadella",
  "Atum",
  "Anchoas",
  "Aceto",
];

const EXPECTED_UNIT_PRICE: Record<string, number> = {
  Paccheri: 2.1,
  Courgettes: 1.56,
  "Alho Francês": 1.42,
  Manjericão: 2.06,
  Gorgonzola: 6.72,
};

const dryRun = process.argv.includes("--dry-run");

function loadKeys(): { url: string; serviceKey: string; anonKey: string } {
  for (const name of [".env", ".env.local"]) {
    try {
      const raw = readFileSync(join(ROOT, name), "utf8");
      const vars: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      if (vars.SUPABASE_URL?.includes(VL_REF) && vars.SUPABASE_SERVICE_ROLE_KEY) {
        return {
          url: vars.SUPABASE_URL,
          serviceKey: vars.SUPABASE_SERVICE_ROLE_KEY,
          anonKey: vars.SUPABASE_PUBLISHABLE_KEY ?? vars.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        };
      }
    } catch {
      /* skip */
    }
  }
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  const keys = JSON.parse(raw) as { name: string; api_key: string }[];
  const serviceKey = keys.find((k) => k.name === "service_role")!.api_key;
  const anonKey = keys.find((k) => k.name === "anon")!.api_key;
  return { url: `https://${VL_REF}.supabase.co`, serviceKey, anonKey };
}

function resolveUnit(item: { name: string; unit: string | null }) {
  return resolveInvoicePersistedItemUnit(item, defaultIsGenericUnit);
}

function wouldFixByBinding(row: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
        unit_price: row.unit_price,
        total: row.total,
      },
    ]),
  );
  const oldUp = row.unit_price == null ? null : Number(row.unit_price);
  const newUp = bound.unit_price == null ? null : Number(bound.unit_price);
  const changed = oldUp != null && newUp != null && Math.abs(oldUp - newUp) > TOLERANCE;
  const consistent =
    bound.quantity != null &&
    newUp != null &&
    bound.total != null &&
    Math.abs(Number(bound.quantity) * newUp - Number(bound.total)) <= TOLERANCE;
  return { changed, consistent, bound_unit_price: newUp };
}

async function fetchImageDataUrl(
  sb: ReturnType<typeof createClient>,
  fileUrl: string,
): Promise<string> {
  const { data: signed, error } = await sb.storage.from("invoices").createSignedUrl(fileUrl, 300);
  if (error || !signed?.signedUrl) throw new Error(`signed url failed: ${error?.message}`);
  const blob = await fetch(signed.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = fileUrl.endsWith(".pdf") ? "application/pdf" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function invokeExtract(anonKey: string, imageDataUrl: string) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function snapshotIngredients(sb: ReturnType<typeof createClient>, patterns: string[]) {
  const out: Record<string, unknown>[] = [];
  for (const pattern of patterns) {
    const { data: ings } = await sb
      .from("ingredients")
      .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit")
      .ilike("name", `%${pattern}%`);
    for (const ing of ings ?? []) {
      const { data: hist } = await sb
        .from("ingredient_price_history")
        .select("id,invoice_id,new_price,previous_price,delta,created_at")
        .eq("ingredient_id", ing.id)
        .order("created_at", { ascending: false })
        .limit(10);
      const { data: matches } = await sb
        .from("invoice_item_matches")
        .select(
          "status,invoice_item_id,invoice_items(id,invoice_id,name,quantity,unit,unit_price,total,invoices(supplier_name,invoice_date))",
        )
        .eq("ingredient_id", ing.id)
        .in("status", ["confirmed", "auto_confirmed"]);
      const matchRows = (matches ?? [])
        .map((m) => ({
          status: m.status,
          item: m.invoice_items as unknown as {
            id: string;
            invoice_id: string;
            name: string;
            quantity: number | null;
            unit: string | null;
            unit_price: number | null;
            total: number | null;
            invoices: { supplier_name: string | null; invoice_date: string | null } | null;
          },
        }))
        .filter((r) => r.item?.id)
        .sort((a, b) =>
          (b.item.invoices?.invoice_date ?? "").localeCompare(a.item.invoices?.invoice_date ?? ""),
        );
      const latest = matchRows[0]?.item;
      out.push({
        pattern,
        ingredient: ing,
        operational_eur: resolvedOperationalUnitCostEur({
          current_price: ing.current_price,
          purchase_quantity: ing.purchase_quantity,
        }),
        latest_history_new_price: hist?.[0]?.new_price ?? null,
        history_rows: hist ?? [],
        latest_invoice_line: latest
          ? {
              id: latest.id,
              invoice_id: latest.invoice_id,
              name: latest.name,
              unit_price: latest.unit_price,
              quantity: latest.quantity,
              total: latest.total,
              supplier: latest.invoices?.supplier_name,
            }
          : null,
      });
    }
  }
  return out;
}

async function identifyAffected(sb: ReturnType<typeof createClient>) {
  const invoiceIds = TARGET_INVOICES.map((i) => i.id);
  const { data: items } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total,invoices(supplier_name)")
    .in("invoice_id", invoiceIds);

  const byInvoice: Record<
    string,
    { supplier: string; affected: { id: string; name: string; unit_price: number | null; bound: number | null }[] }
  > = {};

  for (const inv of TARGET_INVOICES) {
    byInvoice[inv.id] = { supplier: inv.label, affected: [] };
  }

  for (const row of items ?? []) {
    const norm = normalizeInvoiceItemFields(row);
    const fix = wouldFixByBinding(norm);
    if (!fix.changed || !fix.consistent) continue;
    const inv = byInvoice[row.invoice_id];
    if (!inv) continue;
    inv.supplier =
      (row.invoices as { supplier_name?: string } | null)?.supplier_name ?? inv.supplier;
    inv.affected.push({
      id: row.id,
      name: norm.name,
      unit_price: norm.unit_price,
      bound: fix.bound_unit_price,
    });
  }

  return Object.entries(byInvoice).map(([id, v]) => ({
    invoice_id: id,
    supplier: v.supplier,
    affected_row_count: v.affected.length,
    affected_rows: v.affected,
  }));
}

async function runExtractionPath(
  sb: ReturnType<typeof createClient>,
  anonKey: string,
  invoiceId: string,
  catalog: Awaited<ReturnType<typeof loadCanonicalIngredientCatalog>>["rows"],
  confirmedAliases: Record<string, string>,
) {
  const { data: invoice, error } = await sb
    .from("invoices")
    .select("id,user_id,file_url,supplier_name,invoice_date,created_at")
    .eq("id", invoiceId)
    .single();
  if (error || !invoice?.file_url) throw new Error(`invoice ${invoiceId}: ${error?.message}`);

  const imageDataUrl = await fetchImageDataUrl(sb, invoice.file_url);
  let result = await invokeExtract(anonKey, imageDataUrl);
  if (result.status === 546) {
    await new Promise((r) => setTimeout(r, 5000));
    result = await invokeExtract(anonKey, imageDataUrl);
  }
  if (result.status !== 200) {
    throw new Error(`extract ${invoiceId} status ${result.status}: ${JSON.stringify(result.body)}`);
  }

  const rawItems = Array.isArray(result.body?.items) ? result.body.items : [];
  const normalizedItems = rawItems
    .map((it: Record<string, unknown>) => normalizeInvoiceItemFields(it))
    .filter((it) => !shouldRejectInvoiceIngredientRow(it));

  if (normalizedItems.length === 0) {
    throw new Error(`extract ${invoiceId} returned no accepted rows`);
  }

  if (!dryRun) {
    const { error: deleteError } = await sb.from("invoice_items").delete().eq("invoice_id", invoiceId);
    if (deleteError) throw deleteError;

    const insertRows = normalizedItems.map((it) => {
      const name = String(it.name ?? "Unknown");
      const unit = resolveUnit({ name, unit: it.unit });
      return {
        invoice_id: invoiceId,
        user_id: invoice.user_id,
        name: name.slice(0, 200),
        quantity: it.quantity ?? null,
        unit: unit ? unit.slice(0, 20) : null,
        unit_price: it.unit_price ?? null,
        total: it.total ?? null,
      };
    });
    const { error: insertError } = await sb.from("invoice_items").insert(insertRows);
    if (insertError) throw insertError;

    const supplierForSync = normalizeSupplierDisplayName(result.body?.supplier);
    const invoiceDateForHistory = normalizeInvoiceDate(
      result.body?.invoice_date ?? result.body?.invoiceDate,
    );

    await syncOperationalIngredientCostsFromInvoiceLines(
      sb,
      catalog,
      confirmedAliases,
      normalizedItems.map((it) => {
        const name = String(it.name ?? "");
        return {
          name,
          quantity: it.quantity ?? null,
          unit: resolveUnit({ name, unit: it.unit }),
          unit_price: it.unit_price ?? null,
          total: it.total ?? null,
          supplierName: supplierForSync,
        };
      }),
      {
        isGenericUnit: defaultIsGenericUnit,
        priceHistory: {
          invoiceId,
          supplierName: supplierForSync,
          invoiceDate: invoiceDateForHistory,
          invoiceCreatedAt: invoice.created_at ?? null,
        },
      },
    );

    const { data: persistedItemRows } = await sb
      .from("invoice_items")
      .select("id,name")
      .eq("invoice_id", invoiceId);

    await shadowSeedInvoiceItemMatchesAfterExtract(sb, {
      invoiceId,
      userId: invoice.user_id,
      items: persistedItemRows ?? [],
      ingredientCatalog: catalog,
      confirmedAliases,
      supplierName: supplierForSync,
    });

    const invoiceUpdate: Record<string, unknown> = {
      supplier_name: (result.body?.supplier ?? invoice.supplier_name)?.slice?.(0, 120) ?? invoice.supplier_name,
      total: typeof result.body?.total === "number" && result.body.total > 0 ? result.body.total : undefined,
    };
    const nd = normalizeInvoiceDate(result.body?.invoice_date ?? result.body?.invoiceDate);
    if (nd) invoiceUpdate.invoice_date = nd;
    await sb.from("invoices").update(invoiceUpdate).eq("id", invoiceId);
  }

  return {
    invoiceId,
    itemCount: normalizedItems.length,
    sampleItems: normalizedItems
      .filter((it) =>
        AFFECTED_PATTERNS.some((p) => String(it.name).toLowerCase().includes(p.toLowerCase())),
      )
      .map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total: it.total,
      })),
  };
}

async function validateHistory(sb: ReturnType<typeof createClient>, ingredientIds: string[]) {
  const issues: string[] = [];
  for (const ingredientId of ingredientIds) {
    const { data: rows } = await sb
      .from("ingredient_price_history")
      .select("id,invoice_id,new_price,previous_price,created_at")
      .eq("ingredient_id", ingredientId)
      .order("created_at", { ascending: true });

    const seen = new Set<string>();
    for (const row of rows ?? []) {
      const key = `${row.invoice_id ?? "null"}:${row.new_price}`;
      if (row.invoice_id && seen.has(row.invoice_id)) {
        issues.push(`duplicate invoice linkage ${ingredientId} invoice ${row.invoice_id}`);
      }
      if (row.invoice_id) seen.add(row.invoice_id);
    }

    for (let i = 1; i < (rows ?? []).length; i++) {
      const prev = rows![i - 1];
      const cur = rows![i];
      if (prev.created_at > cur.created_at) {
        issues.push(`chronology damage ${ingredientId}: ${prev.created_at} > ${cur.created_at}`);
      }
      if (prev.new_price != null && cur.previous_price != null) {
        const diff = Math.abs(Number(prev.new_price) - Number(cur.previous_price));
        if (diff > 0.0001) {
          issues.push(
            `chain break ${ingredientId}: prev.new ${prev.new_price} != cur.previous ${cur.previous_price}`,
          );
        }
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

async function main() {
  const { url, serviceKey, anonKey } = loadKeys();
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const affectedInvoices = await identifyAffected(sb);
  const beforeAffected = await snapshotIngredients(sb, [...AFFECTED_PATTERNS, ...REGRESSION_PATTERNS]);

  const beforeHistoryIds = [
    ...new Set(
      beforeAffected.flatMap((r) =>
        ((r.history_rows as { id: string }[]) ?? []).map((h) => h.id),
      ),
    ),
  ];

  const reingestResults: unknown[] = [];
  if (!dryRun) {
    const { rows: catalog } = await loadCanonicalIngredientCatalog(sb);
    const { data: aliasRows } = await sb.from("ingredient_aliases").select("*");
    const confirmedAliases = buildConfirmedAliasMapFromRows(aliasRows ?? []);

    for (const inv of TARGET_INVOICES) {
      console.log(`[reingest] ${inv.label} (${inv.id})`);
      reingestResults.push(
        await runExtractionPath(sb, anonKey, inv.id, catalog, confirmedAliases),
      );
    }
  }

  const afterAffected = dryRun
    ? beforeAffected
    : await snapshotIngredients(sb, [...AFFECTED_PATTERNS, ...REGRESSION_PATTERNS]);

  const ingredientIds = [
    ...new Set(
      afterAffected.map((r) => (r.ingredient as { id: string }).id),
    ),
  ];
  const historyValidation = dryRun
    ? { ok: true, issues: [], note: "dry-run skipped" }
    : await validateHistory(sb, ingredientIds);

  const comparisons = AFFECTED_PATTERNS.map((pattern) => {
    const before = beforeAffected.find((r) => r.pattern === pattern);
    const after = afterAffected.find((r) => r.pattern === pattern);
    const expected = EXPECTED_UNIT_PRICE[pattern];
    const afterLine = after?.latest_invoice_line as { unit_price: number | null } | null;
    const afterIng = after?.ingredient as { current_price: number | null; purchase_quantity: number | null; purchase_unit: string | null } | null;
    const beforeIng = before?.ingredient as { current_price: number | null; purchase_quantity: number | null; purchase_unit: string | null } | null;
    return {
      pattern,
      before: {
        invoice_unit_price: (before?.latest_invoice_line as { unit_price: number | null })?.unit_price,
        current_price: beforeIng?.current_price,
        purchase_quantity: beforeIng?.purchase_quantity,
        purchase_unit: beforeIng?.purchase_unit,
        operational_eur: before?.operational_eur,
        history_new_price: before?.latest_history_new_price,
      },
      after: {
        invoice_unit_price: afterLine?.unit_price,
        current_price: afterIng?.current_price,
        purchase_quantity: afterIng?.purchase_quantity,
        purchase_unit: afterIng?.purchase_unit,
        operational_eur: after?.operational_eur,
        history_new_price: after?.latest_history_new_price,
      },
      expected_unit_price: expected,
      unit_price_ok:
        afterLine?.unit_price != null &&
        Math.abs(Number(afterLine.unit_price) - expected) <= TOLERANCE,
    };
  });

  const regression = REGRESSION_PATTERNS.map((pattern) => {
    const before = beforeAffected.find((r) => r.pattern === pattern);
    const after = afterAffected.find((r) => r.pattern === pattern);
    const bIng = before?.ingredient as { current_price: number | null; purchase_quantity: number | null } | null;
    const aIng = after?.ingredient as { current_price: number | null; purchase_quantity: number | null } | null;
    return {
      pattern,
      before_operational: before?.operational_eur,
      after_operational: after?.operational_eur,
      before_current_price: bIng?.current_price,
      after_current_price: aIng?.current_price,
      before_purchase_quantity: bIng?.purchase_quantity,
      after_purchase_quantity: aIng?.purchase_quantity,
      no_drift:
        before?.operational_eur === after?.operational_eur &&
        bIng?.current_price === aIng?.current_price &&
        bIng?.purchase_quantity === aIng?.purchase_quantity,
    };
  });

  const out = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    commit: "20001b424826731c650c02c5935e739160ecbb9e",
    deploy: "extract-invoice deployed to bjhnlrgodcqoyzddbpbd",
    affected_invoices: affectedInvoices,
    reingest_results: reingestResults,
    comparisons,
    regression,
    history_validation: historyValidation,
    before_history_row_ids: beforeHistoryIds,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
