import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const id = "c2f52357-0f80-491a-ba14-c97ff4837472";
const b64 = readFileSync(".tmp/footer-validation-4dc40c3/april-historico-png-fixture.b64.txt", "utf8").trim();
const imageDataUrl = `data:image/png;base64,${b64}`;

const anon = (JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" }),
) as { name: string; api_key: string }[]).find((k) => k.name === "anon")!.api_key;

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
console.log("status", res.status, "items", body.items?.length ?? 0);

writeFileSync(
  `.tmp/passc-refinement-validation/reextract/${id}.json`,
  JSON.stringify(
    {
      invoiceId: id,
      label: "Aviludo April",
      source: "april-historico-png-fixture",
      extractedAt: new Date().toISOString(),
      status: res.status,
      ...body,
    },
    null,
    2,
  ),
);
