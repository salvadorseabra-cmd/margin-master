/**
 * Bocconcino Hybrid H Phase 1+2 validation (read-only).
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BOCCONCINO_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";
const OUT_DIR = ".tmp/bocconcino-hybrid-validation";
const INVOKE_TIMEOUT_MS = 90_000;

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

async function invokeExtract(imageDataUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ imageDataUrl }),
      signal: controller.signal,
    });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function findPomodor(items: Array<Record<string, unknown>>) {
  return items.find((it) => /pomodor/i.test(String(it.name ?? ""))) ?? null;
}

const { data: invoice } = await sb
  .from("invoices")
  .select("id, supplier_name, total, invoice_date, file_url, created_at")
  .eq("id", BOCCONCINO_ID)
  .single();

const { data: dbItems } = await sb
  .from("invoice_items")
  .select("id, name, quantity, unit, unit_price, total, created_at")
  .eq("invoice_id", BOCCONCINO_ID)
  .order("created_at", { ascending: true });

let deployedExtract: Record<string, unknown> | null = null;
if (invoice?.file_url) {
  const { data: signed } = await sb.storage
    .from("invoices")
    .createSignedUrl(invoice.file_url, 300);
  if (signed?.signedUrl) {
    const blob = await fetch(signed.signedUrl).then((r) => r.blob());
    const buf = Buffer.from(await blob.arrayBuffer());
    const ext = invoice.file_url.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "pdf" ? "application/pdf" : "image/png";
    const imageDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    const result = await invokeExtract(imageDataUrl);
    const items = Array.isArray(result.body?.items) ? result.body.items : [];
    deployedExtract = {
      status: result.status,
      itemCount: items.length,
      tableCrop: result.body?.tableCrop ?? null,
      pomodor: findPomodor(items),
      allItems: items,
      error: result.body?.error ?? null,
    };
  }
}

const gitPhase12 = {
  localModified: true,
  files: [
    "supabase/functions/extract-invoice/invoice-crop-geometry.ts (TABLE_TOP_MARGIN 10→36)",
    "supabase/functions/extract-invoice/invoice-table-extraction.ts (structured monetary schema)",
  ],
  headCommit: execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(),
  note: "Phase 1+2 changes are uncommitted locally; VL edge invoke uses deployed function unless separately deployed",
};

writeFileSync(
  `${OUT_DIR}/deployed-extract.json`,
  JSON.stringify({ generated_at: new Date().toISOString(), invoice, deployedExtract, gitPhase12 }, null, 2),
);

const dbPomodor = (dbItems ?? []).find((it) => /pomodor/i.test(it.name)) ?? null;
console.log(JSON.stringify({
  deploy: gitPhase12.headCommit,
  phase12LocalOnly: gitPhase12.localModified,
  dbPomodor,
  deployedPomodor: deployedExtract?.pomodor ?? null,
  dbItemCount: dbItems?.length,
}, null, 2));
