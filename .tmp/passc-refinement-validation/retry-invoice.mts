import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const id = process.argv[2];
const label = process.argv[3] ?? id;
const OUT = `.tmp/passc-refinement-validation/reextract/${id}.json`;

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"));
const anon = projectKey("anon");

const { data: inv } = await sb.from("invoices").select("file_url,supplier_name").eq("id", id).single();
if (!inv?.file_url) throw new Error("no invoice");

const { data: signed } = await sb.storage.from("invoices").createSignedUrl(inv.file_url, 300);
const blob = await fetch(signed!.signedUrl).then((r) => r.blob());
const buf = Buffer.from(await blob.arrayBuffer());
const mime = inv.file_url.endsWith(".pdf") ? "application/pdf" : blob.type || "image/png";
const imageDataUrl = `data:${mime};base64,${buf.toString("base64")}`;

for (let attempt = 1; attempt <= 3; attempt++) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  const body = await res.json();
  const count = body.items?.length ?? 0;
  console.log(`attempt ${attempt}: status ${res.status}, items ${count}`);
  if (count > 0 || attempt === 3) {
    writeFileSync(
      OUT,
      JSON.stringify(
        {
          invoiceId: id,
          label,
          supplier: inv.supplier_name,
          extractedAt: new Date().toISOString(),
          status: res.status,
          attempt,
          ...body,
        },
        null,
        2,
      ),
    );
    const acucar = (body.items ?? []).find((i: { name?: string }) => /acucar|açucar/i.test(i.name ?? ""));
    if (acucar) console.log("acucar:", acucar);
    break;
  }
  await new Promise((r) => setTimeout(r, 6000));
}
