/**
 * Emporio variance cluster — 5 v27 invokes, all 3 focus rows per run
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/emporio-variance-cluster";
const IMG = ".tmp/emporio-italia-investigation/invoice-full.png";
const RUNS = 5;

const GT = {
  gorgonzola: { total: 13.44 },
  bresaola: { total: 49.48 },
  sanpellegrino: { total: 38.56 },
};

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

type Item = { name: string; quantity: number; unit_price: number; total: number };
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

  const pick = (re: RegExp) => items.find((i) => re.test(i.name)) ?? null;
  const g = pick(/gorgonzola/i);
  const b = pick(/bresaola/i);
  const s = pick(/sanpellegrino|acqua in/i);

  const err = (row: Item | null, gt: number) =>
    row ? Math.round(Math.abs(row.total - gt) * 100) / 100 : gt;

  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    gorgonzola: g,
    bresaola: b,
    sanpellegrino: s,
    errors: {
      gorgonzola: err(g, GT.gorgonzola.total),
      bresaola: err(b, GT.bresaola.total),
      sanpellegrino: err(s, GT.sanpellegrino.total),
    },
    allThreeCorrect:
      err(g, GT.gorgonzola.total) < 0.05 &&
      err(b, GT.bresaola.total) < 0.05 &&
      err(s, GT.sanpellegrino.total) < 0.05,
  });
  console.log(
    `run ${run} G=${g?.total} B=${b?.total} S=${s?.total} allOk=${runs.at(-1)?.allThreeCorrect}`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, 3500));
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const version = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

function rowSummary(key: keyof typeof GT) {
  const gt = GT[key].total;
  const perfect = runs.filter(
    (r) => (r.errors as Record<string, number>)[key] < 0.05,
  ).length;
  const totals = runs.map((r) => (r[key] as Item | null)?.total).filter(Boolean);
  const errs = runs.map((r) => (r.errors as Record<string, number>)[key]);
  return {
    perfectRuns: `${perfect}/${RUNS}`,
    stabilityPercent: Math.round((perfect / RUNS) * 100),
    totalUnique: [...new Set(totals)],
    avgFinancialErrorEuro: Math.round((errs.reduce((a, b) => a + b, 0) / RUNS) * 100) / 100,
  };
}

writeFileSync(
  `${OUT}/cluster-stability.json`,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      deployVersion: version,
      groundTruth: GT,
      runs,
      summary: {
        allThreeCorrectRuns: runs.filter((r) => r.allThreeCorrect).length,
        gorgonzola: rowSummary("gorgonzola"),
        bresaola: rowSummary("bresaola"),
        sanpellegrino: rowSummary("sanpellegrino"),
        correlatedBadRuns: runs.filter((r) => {
          const e = r.errors as Record<string, number>;
          return Object.values(e).filter((x) => x >= 0.05).length >= 2;
        }).length,
      },
    },
    null,
    2,
  ),
);
