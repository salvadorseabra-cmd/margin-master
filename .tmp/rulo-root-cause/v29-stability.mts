/**
 * v29 Rulo Di Capra stability — 5 Mammafiore invokes (read-only)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/rulo-root-cause";
const IMG = ".tmp/mammafiore-investigation/invoice-full.png";
const RUNS = 5;

const RULO_GT = {
  qty: 1,
  unit_price_list: 15.192,
  discount_pct: 28.5,
  iva_pct: 6,
  total: 10.86,
};
const V28_LAB = { unit_price: 10.86, total: 6, financialErrorEuro: 4.86 };

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

type Item = {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount_pct?: number | null;
};
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
  const items = (body.items ?? []) as Item[];

  const rulo = items.find((i) => /rulo.*capra|capra.*rulo/i.test(i.name)) ?? null;
  const ruloErr = rulo ? Math.abs(rulo.total - RULO_GT.total) : RULO_GT.total;
  const ivaBleed = rulo ? Math.abs(rulo.total - RULO_GT.iva_pct) < 0.05 : false;
  const valorCorrect = rulo ? Math.abs(rulo.total - RULO_GT.total) < 0.05 : false;

  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    rulo,
    financialErrorEuro: Math.round(ruloErr * 100) / 100,
    totalCorrect: valorCorrect,
    ivaColumnBleed: ivaBleed,
    unitPriceMatchesList: rulo ? Math.abs(rulo.unit_price - RULO_GT.unit_price_list) < 0.05 : false,
    unitPriceMatchesNet: rulo ? Math.abs(rulo.unit_price - RULO_GT.total) < 0.05 : false,
  });
  console.log(
    `run ${run} total=${rulo?.total} unit=${rulo?.unit_price} €err=${ruloErr.toFixed(2)} ivaBleed=${ivaBleed}`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, 3500));
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const version = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

const perfect = runs.filter((r) => r.totalCorrect).length;
const ivaBleedRuns = runs.filter((r) => r.ivaColumnBleed).length;
const avgErr =
  Math.round((runs.reduce((s, r) => s + Number(r.financialErrorEuro), 0) / RUNS) * 100) / 100;

const stability = {
  generated_at: new Date().toISOString(),
  deployVersion: version,
  deployVerified: (version ?? 0) >= 29,
  promptVersion: "v29",
  invoiceId: "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  imageSource: IMG,
  groundTruth: RULO_GT,
  visibleInvoice: {
    qty: 1,
    unit: "UN",
    pr_unitario: 15.192,
    desc_pct: 28.5,
    iva_pct: 6,
    valor: 10.86,
    source: "mammafiore-investigation/invoice-full.png",
  },
  runs,
  summary: {
    perfectTotalRuns: `${perfect}/${RUNS}`,
    stabilityPercent: Math.round((perfect / RUNS) * 100),
    ivaBleedRuns: `${ivaBleedRuns}/${RUNS}`,
    totalUnique: [...new Set(runs.map((r) => (r.rulo as Item | null)?.total))],
    unitPriceUnique: [...new Set(runs.map((r) => (r.rulo as Item | null)?.unit_price))],
    avgFinancialErrorEuro: avgErr,
  },
  comparisonVsV28Lab: {
    v28LabRerun: V28_LAB,
    v29AvgError: avgErr,
    unchangedFromV28: avgErr >= 4.5,
  },
};

writeFileSync(`${OUT}/stability.json`, JSON.stringify(stability, null, 2));
console.log(JSON.stringify(stability.summary, null, 2));
