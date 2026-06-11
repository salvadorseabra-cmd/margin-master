/**
 * Retry Bidfood + April footer validation with fixes.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/footer-validation-4dc40c3";
const DENO = ".tmp/deno/bin/deno";

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
  );
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  )!.api_key;
}

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

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
  return { status: res.status, body: await res.json() };
}

function toDataUrl(path: string, mime: string): string {
  const buf = readFileSync(path);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function saveCrop(label: string, imageDataUrl: string): string {
  const safe = label.replace(/\s+/g, "-").toLowerCase();
  const imagePath = `${OUT_DIR}/${safe}-retry-full.b64.txt`;
  const cropPath = `${OUT_DIR}/${safe}-footer-crop.png`;
  writeFileSync(imagePath, imageDataUrl);
  execSync(
    `${DENO} run --allow-read --allow-write --allow-net .tmp/vl-footer-crop-only.ts "${imagePath}" "${cropPath}"`,
    { encoding: "utf8", timeout: 120_000 },
  );
  return cropPath;
}

async function runFooterPass(label: string, imageDataUrl: string) {
  const safe = label.replace(/\s+/g, "-").toLowerCase();
  const imagePath = `${OUT_DIR}/${safe}-retry-full.b64.txt`;
  writeFileSync(imagePath, imageDataUrl);
  const out = execSync(
    `${DENO} run --allow-read --allow-net --allow-env .tmp/vl-footer-pass-only.ts "${imagePath}"`,
    {
      encoding: "utf8",
      timeout: 180_000,
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
        SUPABASE_URL: `https://${VL_REF}.supabase.co`,
        SUPABASE_ANON_KEY: anonKey,
      },
    },
  );
  return JSON.parse(out);
}

const results: Record<string, unknown>[] = [];

// --- Bidfood retry (storage PNG) ---
{
  const id = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";
  const { data: invoice } = await sb
    .from("invoices")
    .select("file_url,total")
    .eq("id", id)
    .single();
  const { data: signed } = await sb.storage
    .from("invoices")
    .createSignedUrl(invoice!.file_url!, 300);
  const blob = await fetch(signed!.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  const imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;

  let extract = await invokeExtract(imageDataUrl);
  if (extract.status === 546) {
    await new Promise((r) => setTimeout(r, 5000));
    extract = await invokeExtract(imageDataUrl);
  }

  const cropPath = saveCrop("bidfood", imageDataUrl);
  let footerPass: unknown;
  try {
    footerPass = await runFooterPass("bidfood", imageDataUrl);
  } catch (e) {
    footerPass = { error: String(e) };
  }

  const extractedTotal =
    extract.status === 200 && typeof extract.body?.total === "number"
      ? extract.body.total
      : null;
  if (extractedTotal != null) {
    await sb.from("invoices").update({ total: extractedTotal }).eq("id", id);
  }
  const { data: after } = await sb.from("invoices").select("total").eq("id", id).single();

  results.push({
    label: "Bidfood",
    expected: 292.7,
    extractStatus: extract.status,
    extractError: extract.status !== 200 ? extract.body : null,
    extractedTotal,
    dbTotal: after?.total ?? null,
    pass:
      extractedTotal != null && Math.abs(extractedTotal - 292.7) <= 0.01
        ? "PASS"
        : "FAIL",
    footerCropPath: cropPath,
    footerPass,
    edgeResponse:
      extract.status === 200
        ? {
            total: extract.body.total,
            supplier: extract.body.supplier,
            itemCount: extract.body.items?.length ?? 0,
          }
        : null,
  });
}

// --- Aviludo April (PNG fixture — storage is tiny PDF) ---
{
  const id = "c2f52357-0f80-491a-ba14-c97ff4837472";
  const pngPath =
    ".tmp/aviludo-investigation/Aviludo_Historico_2026_04_with_total.pdf.png";
  const imageDataUrl = toDataUrl(pngPath, "image/png");
  const extract = await invokeExtract(imageDataUrl);
  const cropPath = saveCrop("aviludo-abril", imageDataUrl);
  let footerPass: unknown;
  try {
    footerPass = await runFooterPass("aviludo-abril", imageDataUrl);
  } catch (e) {
    footerPass = { error: String(e) };
  }

  const extractedTotal =
    extract.status === 200 && typeof extract.body?.total === "number"
      ? extract.body.total
      : null;
  if (extractedTotal != null) {
    await sb.from("invoices").update({ total: extractedTotal }).eq("id", id);
  }
  const { data: after } = await sb.from("invoices").select("total").eq("id", id).single();

  results.push({
    label: "Aviludo Abril",
    expected: 370.17,
    note: "Storage file is 2.5KB PDF; extraction used local PNG fixture equivalent",
    extractStatus: extract.status,
    extractedTotal,
    dbTotal: after?.total ?? null,
    pass:
      extractedTotal != null && Math.abs(extractedTotal - 370.17) <= 0.01
        ? "PASS"
        : "FAIL",
    footerCropPath: cropPath,
    footerPass,
    edgeResponse:
      extract.status === 200
        ? {
            total: extract.body.total,
            supplier: extract.body.supplier,
            itemCount: extract.body.items?.length ?? 0,
          }
        : null,
  });
}

writeFileSync(`${OUT_DIR}/retry-results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
