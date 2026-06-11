import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const anonKey = (JSON.parse(raw) as { name: string; api_key: string }[])
  .find((k) => k.name === "anon")!.api_key;

const buf = readFileSync(".tmp/bidfood-ovo.png");
const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
  body: JSON.stringify({ imageDataUrl: dataUrl }),
});
const body = await res.json();
console.log(JSON.stringify({ status: res.status, total: body.total, error: body.code }, null, 2));
