import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/bocconcino-investigation/extract-invoice-postfix.json";

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8" },
  );
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  )!.api_key;
}

const anonKey = projectKey("anon");
const imageDataUrl = readFileSync(".tmp/bocconcino-investigation/invoice-dataurl.txt", "utf8").trim();

const extractRes = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
  body: JSON.stringify({ imageDataUrl }),
});

const extracted = await extractRes.json();
writeFileSync(OUT, JSON.stringify(extracted, null, 2));

const items = extracted.items ?? [];
const names = items.map((it: { name?: string }) => it.name);
const hasMozzarella = names.some((n: string) => /mozzarella/i.test(n));
const hasStracciatella = names.some((n: string) => /stracciatella/i.test(n));

console.log(
  JSON.stringify({
    status: extractRes.status,
    itemCount: items.length,
    hasMozzarella,
    hasStracciatella,
    names,
  }, null, 2),
);
