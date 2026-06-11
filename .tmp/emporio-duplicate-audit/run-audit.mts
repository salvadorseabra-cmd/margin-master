/**
 * Read-only Emporio duplicate investigation.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const EMPORIO_ID = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";
const OUT_DIR = ".tmp/emporio-duplicate-audit";

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

async function fetchImageDataUrl(fileUrl: string): Promise<string> {
  const { data: signed, error } = await sb.storage
    .from("invoices")
    .createSignedUrl(fileUrl, 300);
  if (error || !signed?.signedUrl) throw new Error(`signed url failed: ${error?.message}`);
  const blob = await fetch(signed.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = fileUrl.endsWith(".pdf") ? "application/pdf" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function invokeExtract(imageDataUrl: string) {
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

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findDuplicates(items: { name: string }[]) {
  const byNorm = new Map<string, number>();
  for (const it of items) {
    const k = normalizeName(it.name);
    byNorm.set(k, (byNorm.get(k) ?? 0) + 1);
  }
  return [...byNorm.entries()].filter(([, c]) => c > 1).map(([name, count]) => ({ name, count }));
}

// Historical snapshots from .tmp audits
const historicalDb = JSON.parse(
  await Deno.readTextFile(".tmp/emporio-footer-audit/emporio/db-record.json"),
);
const priorReextract = JSON.parse(
  await Deno.readTextFile(".tmp/passc-refinement-validation/reextract/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json"),
);

const { data: invoice, error: invErr } = await sb
  .from("invoices")
  .select("id, supplier_name, total, invoice_date, file_url, created_at, updated_at")
  .eq("id", EMPORIO_ID)
  .single();

const { data: dbItems, error: itemsErr } = await sb
  .from("invoice_items")
  .select("id, name, quantity, unit, unit_price, total, created_at, updated_at")
  .eq("invoice_id", EMPORIO_ID)
  .order("created_at", { ascending: true });

let freshExtract: { status: number; body: Record<string, unknown> } | null = null;
if (invoice?.file_url) {
  const imageDataUrl = await fetchImageDataUrl(invoice.file_url);
  freshExtract = await invokeExtract(imageDataUrl);
}

const extractItems = Array.isArray(freshExtract?.body?.items)
  ? freshExtract!.body.items as Record<string, unknown>[]
  : [];

const duplicateTrace = {
  generated_at: new Date().toISOString(),
  invoiceId: EMPORIO_ID,
  counts: {
    historicalDbSnapshot: historicalDb.itemsCount,
    priorReextractPassC: priorReextract.items?.length ?? 0,
    currentDb: dbItems?.length ?? 0,
    freshExtractDeployed: extractItems.length,
  },
  dbQueryError: itemsErr?.message ?? null,
  invoiceQueryError: invErr?.message ?? null,
  invoice,
  dbDuplicatesByNormalizedName: findDuplicates(dbItems ?? []),
  extractDuplicatesByNormalizedName: findDuplicates(extractItems as { name: string }[]),
  dbCreatedAtBuckets: Object.entries(
    (dbItems ?? []).reduce<Record<string, number>>((acc, row) => {
      const key = row.created_at?.slice(0, 19) ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ),
  dbItems: dbItems ?? [],
  freshExtractItems: extractItems,
  priorReextractItems: priorReextract.items ?? [],
  historicalDbItems: historicalDb.items ?? [],
};

writeFileSync(`${OUT_DIR}/duplicate-trace.json`, JSON.stringify(duplicateTrace, null, 2));

const extractionVsDb = {
  generated_at: new Date().toISOString(),
  invoiceId: EMPORIO_ID,
  freshExtractStatus: freshExtract?.status ?? null,
  tableCrop: freshExtract?.body?.tableCrop ?? null,
  rowPairs: (dbItems ?? []).map((db) => {
    const norm = normalizeName(db.name);
    const match = extractItems.find((ex) => normalizeName(String(ex.name ?? "")) === norm
      || normalizeName(String(ex.name ?? "")).includes(norm.slice(0, 20))
      || norm.includes(normalizeName(String(ex.name ?? "")).slice(0, 20)));
    return {
      db: { id: db.id, name: db.name, qty: db.quantity, unit_price: db.unit_price, total: db.total, created_at: db.created_at },
      extract: match ? {
        name: match.name,
        quantity: match.quantity,
        unit_price: match.unit_price ?? match.gross_unit_price,
        total: match.total ?? match.line_total_net,
        gross_unit_price: match.gross_unit_price,
        discount_pct: match.discount_pct,
        line_total_net: match.line_total_net,
      } : null,
    };
  }),
  extractOnlyRows: extractItems.filter((ex) => {
    const norm = normalizeName(String(ex.name ?? ""));
    return !(dbItems ?? []).some((db) => {
      const dbNorm = normalizeName(db.name);
      return dbNorm === norm || dbNorm.includes(norm.slice(0, 20)) || norm.includes(dbNorm.slice(0, 20));
    });
  }),
  dbOnlyRows: (dbItems ?? []).filter((db) => {
    const norm = normalizeName(db.name);
    return !extractItems.some((ex) => {
      const exNorm = normalizeName(String(ex.name ?? ""));
      return exNorm === norm || exNorm.includes(norm.slice(0, 20)) || norm.includes(exNorm.slice(0, 20));
    });
  }),
};

writeFileSync(`${OUT_DIR}/extraction-vs-db.json`, JSON.stringify(extractionVsDb, null, 2));
console.log(JSON.stringify({
  currentDb: duplicateTrace.counts.currentDb,
  freshExtract: duplicateTrace.counts.freshExtractDeployed,
  dbDuplicates: duplicateTrace.dbDuplicatesByNormalizedName,
  extractDuplicates: duplicateTrace.extractDuplicatesByNormalizedName,
  createdAtBuckets: duplicateTrace.dbCreatedAtBuckets,
}, null, 2));
