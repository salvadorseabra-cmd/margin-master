/**
 * Post-4dc40c3 footer validation — evidence collection only.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/footer-validation-4dc40c3";

const INVOICES = [
  {
    id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
    label: "Bidfood",
    expected: 292.7,
  },
  {
    id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    label: "Aviludo Maio",
    expected: 330.42,
  },
  {
    id: "c2f52357-0f80-491a-ba14-c97ff4837472",
    label: "Aviludo Abril",
    expected: 370.17,
  },
] as const;

function projectKey(name: "anon" | "service_role"): string {
  const fromEnv =
    name === "anon"
      ? process.env.ANON_KEY ?? process.env.VL_ANON
      : process.env.SR_KEY ?? process.env.VL_SR ?? process.env.VL_KEY;
  if (fromEnv) return fromEnv;
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
  );
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

async function fetchImageDataUrl(invoiceId: string): Promise<string> {
  const { data: invoice, error } = await sb
    .from("invoices")
    .select("file_url")
    .eq("id", invoiceId)
    .single();
  if (error || !invoice?.file_url) throw new Error(`${invoiceId}: ${error?.message}`);

  const { data: signed, error: signErr } = await sb.storage
    .from("invoices")
    .createSignedUrl(invoice.file_url, 300);
  if (signErr || !signed?.signedUrl) throw new Error(`sign: ${signErr?.message}`);

  const blob = await fetch(signed.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
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

async function saveFooterCrop(label: string, imageDataUrl: string): Promise<string> {
  const safe = label.replace(/\s+/g, "-").toLowerCase();
  const imagePath = `${OUT_DIR}/${safe}-full.b64.txt`;
  const cropPath = `${OUT_DIR}/${safe}-footer-crop.png`;
  writeFileSync(imagePath, imageDataUrl);

  const deno = execSync(
    `deno run --allow-read --allow-write --allow-net .tmp/vl-footer-crop-only.ts "${imagePath}" "${cropPath}"`,
    { encoding: "utf8", timeout: 120_000 },
  );
  return cropPath;
}

async function runLocalFooterPass(
  label: string,
  imageDataUrl: string,
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const safe = label.replace(/\s+/g, "-").toLowerCase();
  const imagePath = `${OUT_DIR}/${safe}-full.b64.txt`;
  writeFileSync(imagePath, imageDataUrl);

  try {
    const out = execSync(
      `deno run --allow-read --allow-net --allow-env .tmp/vl-footer-pass-local.ts "${imagePath}"`,
      { encoding: "utf8", timeout: 180_000, env: { ...process.env, OPENAI_API_KEY: apiKey } },
    );
    return JSON.parse(out) as Record<string, unknown>;
  } catch (e) {
    return { error: String(e) };
  }
}

const results = [];

for (const inv of INVOICES) {
  const before = await sb
    .from("invoices")
    .select("total,supplier_name")
    .eq("id", inv.id)
    .single();

  const imageDataUrl = await fetchImageDataUrl(inv.id);
  let cropPath = "";
  try {
    cropPath = await saveFooterCrop(inv.label, imageDataUrl);
  } catch (e) {
    cropPath = `crop-failed: ${e}`;
  }

  const { status, body } = await invokeExtract(imageDataUrl);
  const extractedTotal =
    status === 200 && typeof body?.total === "number" ? body.total : null;

  let dbTotal: number | null = before.data?.total ?? null;
  if (extractedTotal != null) {
    const { data: updated, error: updErr } = await sb
      .from("invoices")
      .update({ total: extractedTotal })
      .eq("id", inv.id)
      .select("total")
      .single();
    dbTotal = updErr ? null : (updated?.total ?? null);
  }

  const localFooter = await runLocalFooterPass(inv.label, imageDataUrl);

  const pass =
    extractedTotal != null &&
    Math.abs(extractedTotal - inv.expected) <= 0.01 &&
    dbTotal != null &&
    Math.abs(dbTotal - inv.expected) <= 0.01;

  results.push({
    label: inv.label,
    invoiceId: inv.id,
    expected: inv.expected,
    extractStatus: status,
    extractError: status !== 200 ? body : null,
    extractedTotal,
    dbTotalBefore: before.data?.total ?? null,
    dbTotalAfter: dbTotal,
    pass: pass ? "PASS" : "FAIL",
    footerCropPath: cropPath,
    edgeResponse: status === 200
      ? {
          supplier: body.supplier,
          invoice_date: body.invoice_date,
          total: body.total,
          itemCount: Array.isArray(body.items) ? body.items.length : 0,
        }
      : null,
    localFooterPass: localFooter,
  });
}

writeFileSync(`${OUT_DIR}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
