/**
 * Gorgonzola v27 stability — 5 Emporio invokes (read-only)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/gorgonzola-root-cause";
const IMG = ".tmp/emporio-italia-investigation/invoice-full.png";
const RUNS = 5;
const GT = { qty: 1.35, unit_price: 9.92, total: 13.44 };

function projectKey(name: "anon"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const anonKey = projectKey("anon");
const png = readFileSync(IMG);
const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;
mkdirSync(OUT, { recursive: true });

const runs: Array<Record<string, unknown>> = [];

for (let run = 1; run <= RUNS; run++) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
    signal: controller.signal,
  });
  clearTimeout(timer);
  const body = await res.json();
  const items = (body.items ?? []) as Array<{
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  const row =
    items.find((i) => /gorgonzola/i.test(i.name)) ?? null;
  const finErr = row ? Math.abs(row.total - GT.total) : GT.total;
  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    gorgonzola: row,
    financialErrorEuro: Math.round(finErr * 100) / 100,
    totalCorrect: row ? Math.abs(row.total - GT.total) < 0.05 : false,
  });
  console.log(
    `run ${run}/${RUNS} qty=${row?.quantity} unit=${row?.unit_price} total=${row?.total} €err=${finErr.toFixed(2)}`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, 3500));
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const version = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

const perfect = runs.filter((r) => r.totalCorrect).length;
const totals = runs.map((r) => (r.gorgonzola as { total?: number })?.total);
const qtys = runs.map((r) => (r.gorgonzola as { quantity?: number })?.quantity);

writeFileSync(
  `${OUT}/v27-stability.json`,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      deployVersion: version,
      runs,
      summary: {
        perfectTotalRuns: `${perfect}/${RUNS}`,
        totalUnique: [...new Set(totals)],
        qtyUnique: [...new Set(qtys)],
        deterministic: new Set(totals).size === 1 && new Set(qtys).size === 1,
        avgFinancialError:
          Math.round(
            (runs.reduce((s, r) => s + Number(r.financialErrorEuro), 0) / RUNS) * 100,
          ) / 100,
      },
    },
    null,
    2,
  ),
);
