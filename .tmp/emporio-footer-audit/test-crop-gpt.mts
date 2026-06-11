import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const anonKey = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
  (k) => k.name === "anon",
)!.api_key;

async function call(fn: string, pngPath: string, label: string) {
  const png = readFileSync(pngPath);
  const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/${fn}`, {
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
  return { label, fn, status: res.status, body };
}

const tests = [
  ["emporio production footer-crop only", "emporio/footer-crop.png"],
  ["emporio fraction crop", "emporio/footer-fraction-crop.png"],
];

const out = [];
for (const [label, rel] of tests) {
  const path = `.tmp/emporio-footer-audit/${rel}`;
  out.push({
  ...(await call("vl-footer-debug", path, label + " → vl-footer-debug")),
  });
  out.push({
  ...(await call("extract-invoice", path, label + " → extract-invoice")),
  });
}

writeFileSync(".tmp/emporio-footer-audit/crop-isolation-test.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.map((o) => ({
  label: o.label,
  status: o.status,
  total: o.body?.parsed?.total ?? o.body?.total ?? null,
})), null, 2));
