import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/footer-validation-4dc40c3";
const DENO = ".tmp/deno/bin/deno";

const INVOICES = [
  {
    label: "Bidfood",
    id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
    expected: 292.7,
    source: "storage" as const,
  },
  {
    label: "Aviludo Maio",
    id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    expected: 330.42,
    source: "storage" as const,
  },
  {
    label: "Aviludo Abril",
    id: "c2f52357-0f80-491a-ba14-c97ff4837472",
    expected: 370.17,
    source: "storage-pdf" as const,
  },
];

const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const keys = JSON.parse(raw) as { name: string; api_key: string }[];
const anonKey = keys.find((k) => k.name === "anon")!.api_key;
const serviceKey = keys.find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

async function getDataUrl(inv: (typeof INVOICES)[number]): Promise<{ dataUrl: string; note?: string }> {
  const { data } = await sb.from("invoices").select("file_url").eq("id", inv.id).single();
  const { data: signed } = await sb.storage
    .from("invoices")
    .createSignedUrl(data!.file_url!, 300);
  const blob = await fetch(signed!.signedUrl).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime =
    inv.source === "storage-pdf" ? "application/pdf" : blob.type || "image/png";
  return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
}

async function invoke(name: string, dataUrl: string) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  });
  return { status: res.status, body: await res.json() };
}

function saveCrop(label: string, dataUrl: string): string | null {
  const safe = label.replace(/\s+/g, "-").toLowerCase();
  const imagePath = `${OUT_DIR}/${safe}-final.b64.txt`;
  const cropPath = `${OUT_DIR}/${safe}-footer-crop.png`;
  writeFileSync(imagePath, dataUrl);
  try {
    execSync(
      `${DENO} run --allow-read --allow-write --allow-net .tmp/vl-footer-crop-only.ts "${imagePath}" "${cropPath}"`,
      { encoding: "utf8", timeout: 120_000 },
    );
    return cropPath;
  } catch (e) {
    return null;
  }
}

const evidence = [];

for (const inv of INVOICES) {
  const { dataUrl } = await getDataUrl(inv);
  const extract = await invoke("extract-invoice", dataUrl);
  let footerDebug: { status: number; body: unknown } | null = null;
  try {
    footerDebug = await invoke("vl-footer-debug", dataUrl);
  } catch {
    footerDebug = null;
  }

  const cropPath = saveCrop(inv.label, dataUrl);
  const extractedTotal =
    extract.status === 200 && typeof extract.body?.total === "number"
      ? extract.body.total
      : null;

  if (extractedTotal != null) {
    await sb.from("invoices").update({ total: extractedTotal }).eq("id", inv.id);
  }
  const { data: dbRow } = await sb
    .from("invoices")
    .select("total")
    .eq("id", inv.id)
    .single();

  const pass =
    extractedTotal != null && Math.abs(extractedTotal - inv.expected) <= 0.01;

  evidence.push({
    label: inv.label,
    invoiceId: inv.id,
    expected: inv.expected,
    extractStatus: extract.status,
    extractedTotal,
    dbTotal: dbRow?.total ?? null,
    pass: pass ? "PASS" : "FAIL",
    footerCropPath: cropPath,
    edgeResponse: extract.status === 200 ? extract.body : extract.body,
    footerDebug: footerDebug?.body ?? { error: "vl-footer-debug not available" },
  });
}

writeFileSync(`${OUT_DIR}/final-evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
