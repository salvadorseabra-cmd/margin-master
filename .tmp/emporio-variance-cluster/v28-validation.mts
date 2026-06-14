/**
 * v28 Emporio validation — 5 invokes, 3 focus rows
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/emporio-variance-cluster";
const IMG = ".tmp/emporio-italia-investigation/invoice-full.png";
const RUNS = 5;
const V27_BASELINE = JSON.parse(
  readFileSync(`${OUT}/cluster-stability.json`, "utf8"),
);

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

  const errors = {
    gorgonzola: err(g, GT.gorgonzola.total),
    bresaola: err(b, GT.bresaola.total),
    sanpellegrino: err(s, GT.sanpellegrino.total),
  };
  const allThreeCorrect =
    errors.gorgonzola < 0.05 && errors.bresaola < 0.05 && errors.sanpellegrino < 0.05;

  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    gorgonzola: g,
    bresaola: b,
    sanpellegrino: s,
    errors,
    allThreeCorrect,
    focusRowsResidualEuro: Math.round(
      (errors.gorgonzola + errors.bresaola + errors.sanpellegrino) * 100,
    ) / 100,
  });
  console.log(
    `run ${run} G=${g?.total} B=${b?.total} S=${s?.total} clusterOk=${allThreeCorrect} residual=${runs.at(-1)?.focusRowsResidualEuro}`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, 3500));
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const version = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

function rowSummary(rowKey: "gorgonzola" | "bresaola" | "sanpellegrino") {
  const errs = runs.map((r) => (r.errors as Record<string, number>)[rowKey]);
  const perfectCount = errs.filter((e) => e < 0.05).length;
  const totals = runs.map((r) => (r[rowKey] as Item | null)?.total).filter((t) => t != null);
  return {
    perfectRuns: `${perfectCount}/${RUNS}`,
    stabilityPercent: Math.round((perfectCount / RUNS) * 100),
    totalUnique: [...new Set(totals)],
    avgFinancialErrorEuro: Math.round((errs.reduce((a, b) => a + b, 0) / RUNS) * 100) / 100,
  };
}

const gSum = rowSummary("gorgonzola");
const bSum = rowSummary("bresaola");
const sSum = rowSummary("sanpellegrino");
const clusterCorrect = runs.filter((r) => r.allThreeCorrect).length;
const avgClusterResidual =
  Math.round((runs.reduce((a, r) => a + Number(r.focusRowsResidualEuro), 0) / RUNS) * 100) / 100;
const v27Cluster = V27_BASELINE.summary;

const v28 = {
  generated_at: new Date().toISOString(),
  deployVersion: version,
  promptVersion: "v28",
  invoiceId: "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
  groundTruth: GT,
  runs,
  summary: {
    gorgonzola: gSum,
    bresaola: bSum,
    sanpellegrino: sSum,
    clusterAllThreeCorrect: `${clusterCorrect}/${RUNS}`,
    clusterStabilityPercent: Math.round((clusterCorrect / RUNS) * 100),
    avgFocusRowsResidualEuro: avgClusterResidual,
    totalFocusRowsResidualEuro: Math.round(
      runs.reduce((a, r) => a + Number(r.focusRowsResidualEuro), 0) * 100,
    ) / 100,
  },
  comparisonVsV27: {
    v27BaselineSource: "cluster-stability.json",
    v27: {
      gorgonzola: v27Cluster.gorgonzola,
      bresaola: v27Cluster.bresaola,
      sanpellegrino: v27Cluster.sanpellegrino,
      clusterAllThreeCorrect: `${v27Cluster.allThreeCorrectRuns}/${RUNS}`,
      avgFocusRowsResidualEuro: Math.round(
        (v27Cluster.gorgonzola.avgFinancialErrorEuro +
          v27Cluster.bresaola.avgFinancialErrorEuro +
          v27Cluster.sanpellegrino.avgFinancialErrorEuro) *
          100,
      ) / 100,
    },
    v28: {
      gorgonzola: gSum,
      bresaola: bSum,
      sanpellegrino: sSum,
      clusterAllThreeCorrect: `${clusterCorrect}/${RUNS}`,
      avgFocusRowsResidualEuro: avgClusterResidual,
    },
    recoveryVsClusterEstimateEuro: {
      estimate: 28.26,
      v27AvgResidual: 25.5,
      v28AvgResidual: avgClusterResidual,
      avgRecoveryEuro: Math.round((25.5 - avgClusterResidual) * 100) / 100,
    },
  },
};

writeFileSync(`${OUT}/v28-validation.json`, JSON.stringify(v28, null, 2));
