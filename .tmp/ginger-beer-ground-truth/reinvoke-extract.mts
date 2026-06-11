/** Re-invoke extract-invoice + row OCR — read-only ground truth probe */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/ginger-beer-ground-truth";
mkdirSync(OUT, { recursive: true });

function projectKey(name: "anon" | "service_role"): string {
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

const anonKey = projectKey("anon");
const imageDataUrl = readFileSync(
  ".tmp/emporio-italia-investigation/invoice-full.b64.txt",
  "utf8",
);

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
  `${OUT}/extract-invoice-retry.json`,
  JSON.stringify({ status: res.status, body }, null, 2),
);

const ginger = (body?.items ?? []).find((it: { name?: string }) =>
  /ginger/i.test(it?.name ?? ""),
);
writeFileSync(`${OUT}/ginger-gpt-item.json`, JSON.stringify(ginger ?? null, null, 2));

console.log(
  JSON.stringify(
    {
      status: res.status,
      gingerName: ginger?.name ?? null,
      itemCount: body?.items?.length ?? 0,
    },
    null,
    2,
  ),
);
