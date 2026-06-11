/** Invoke extract-invoice on row crop only — proxy for GPT vision read of row */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/ginger-beer-ground-truth";

function projectKey(name: "anon"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8", timeout: 15_000 },
  );
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

const png = readFileSync(`${OUT}/ginger-beer-row-crop.png`);
const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;
const anonKey = projectKey("anon");

const res = await fetch(
  `https://${VL_REF}.supabase.co/functions/v1/extract-invoice`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
    signal: AbortSignal.timeout(120_000),
  },
);

const body = await res.json();
writeFileSync(
  `${OUT}/row-crop-extract-response.json`,
  JSON.stringify({ status: res.status, body }, null, 2),
);

const ginger = (body?.items ?? []).find((it: { name?: string }) =>
  /ginger|baladin|bbb-ginger/i.test(it?.name ?? ""),
);

console.log(
  JSON.stringify(
    {
      status: res.status,
      items: body?.items?.map((i: { name: string }) => i.name) ?? [],
      ginger,
    },
    null,
    2,
  ),
);
