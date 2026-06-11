import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("usage: invoke-footer-debug.mts <subdir>...");
  process.exit(1);
}

const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const anonKey = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "anon",
)!.api_key;

for (const sub of targets) {
  const dir = `.tmp/emporio-footer-audit/${sub}`;
  const imageDataUrl = readFileSync(`${dir}/invoice-full.b64.txt`, "utf8");
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/vl-footer-debug`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await res.json();
  writeFileSync(`${dir}/footer-gpt-edge.json`, JSON.stringify({ status: res.status, body }, null, 2));
  console.log(sub, res.status, JSON.stringify(body?.parsed ?? body));
}
