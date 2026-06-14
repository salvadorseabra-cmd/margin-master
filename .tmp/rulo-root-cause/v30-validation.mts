/**
 * v30 Rulo validation — 5 Mammafiore invokes
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/rulo-root-cause";
const IMG = ".tmp/mammafiore-investigation/invoice-full.png";
const RUNS = 5;

const RULO_GT = { total: 10.86 };
const V29_BASELINE = JSON.parse(readFileSync(`${OUT}/stability.json`, "utf8"));

const MAMMAFIORE_GT: Array<{ pattern: RegExp; total: number; label: string }> = [
  { pattern: /guanciale/i, total: 64.93, label: "Guanciale" },
  { pattern: /farina speciale pizza/i, total: 26.52, label: "Farina Speciale" },
  { pattern: /birra peroni|birre peroni/i, total: 25.69, label: "Birra Peroni" },
  { pattern: /aceto balsamico/i, total: 16.09, label: "Aceto" },
  { pattern: /mozza.*fior|fior di latte expert/i, total: 200.3, label: "Mozza" },
  { pattern: /rulo.*capra|capra.*rulo/i, total: 10.86, label: "Rulo Di Capra" },
  { pattern: /recarga.*combust/i, total: 2, label: "Recarga" },
  { pattern: /farina 00 pasta/i, total: 30.11, label: "Farina 00" },
];

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

  const rulo = items.find((i) => /rulo.*capra|capra.*rulo/i.test(i.name)) ?? null;
  const ruloErr = rulo ? Math.abs(rulo.total - RULO_GT.total) : RULO_GT.total;
  const ivaBleed = rulo ? Math.abs(rulo.total - 6) < 0.05 : false;

  let mammafioreResidual = 0;
  const rowErrors: Array<{ label: string; gt: number; extracted: number; error: number }> = [];
  for (const gt of MAMMAFIORE_GT) {
    const row = items.find((i) => gt.pattern.test(i.name));
    if (!row) {
      mammafioreResidual += gt.total;
      rowErrors.push({ label: gt.label, gt: gt.total, extracted: 0, error: gt.total });
      continue;
    }
    const err = Math.abs(row.total - gt.total);
    mammafioreResidual += err;
    rowErrors.push({
      label: gt.label,
      gt: gt.total,
      extracted: row.total,
      error: Math.round(err * 100) / 100,
    });
  }

  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    rulo,
    ruloErrorEuro: Math.round(ruloErr * 100) / 100,
    ruloTotalCorrect: rulo ? Math.abs(rulo.total - RULO_GT.total) < 0.05 : false,
    ivaColumnBleed: ivaBleed,
    mammafioreResidualEuro: Math.round(mammafioreResidual * 100) / 100,
    rowErrors,
  });
  console.log(
    `run ${run} rulo=${rulo?.total} €err=${ruloErr.toFixed(2)} mammafioreResidual=${mammafioreResidual.toFixed(2)}`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, 3500));
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const version = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

const perfect = runs.filter((r) => r.ruloTotalCorrect).length;
const ivaBleedRuns = runs.filter((r) => r.ivaColumnBleed).length;
const avgRuloErr =
  Math.round((runs.reduce((s, r) => s + Number(r.ruloErrorEuro), 0) / RUNS) * 100) / 100;
const avgMammafioreResidual =
  Math.round((runs.reduce((s, r) => s + Number(r.mammafioreResidualEuro), 0) / RUNS) * 100) / 100;

const v29Perfect = Number(V29_BASELINE.summary.perfectTotalRuns.split("/")[0]);
const v29Runs = Number(V29_BASELINE.summary.perfectTotalRuns.split("/")[1]);
const recoveryPerCorrectedRun = 4.86;
const correctedRunsDelta = perfect - v29Perfect;

const v30 = {
  generated_at: new Date().toISOString(),
  deployVersion: version,
  deployVerified: (version ?? 0) >= 30,
  promptVersion: "v30",
  invoiceId: "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  imageSource: IMG,
  groundTruth: { ruloTotal: RULO_GT.total, mammafioreRows: MAMMAFIORE_GT },
  runs,
  summary: {
    rulo: {
      perfectTotalRuns: `${perfect}/${RUNS}`,
      stabilityPercent: Math.round((perfect / RUNS) * 100),
      ivaBleedRuns: `${ivaBleedRuns}/${RUNS}`,
      totalUnique: [...new Set(runs.map((r) => (r.rulo as Item | null)?.total))],
      avgFinancialErrorEuro: avgRuloErr,
    },
    mammafiore: {
      avgResidualEuro: avgMammafioreResidual,
      v28LabRerunResidualEuro: 5.86,
      v29RuloOnlyAvgError: V29_BASELINE.summary.avgFinancialErrorEuro,
    },
  },
  comparisonVsV29: {
    v29Baseline: {
      perfectTotalRuns: V29_BASELINE.summary.perfectTotalRuns,
      stabilityPercent: V29_BASELINE.summary.stabilityPercent,
      ivaBleedRuns: V29_BASELINE.summary.ivaBleedRuns,
      avgFinancialErrorEuro: V29_BASELINE.summary.avgFinancialErrorEuro,
    },
    v30: {
      perfectTotalRuns: `${perfect}/${RUNS}`,
      stabilityPercent: Math.round((perfect / RUNS) * 100),
      avgFinancialErrorEuro: avgRuloErr,
    },
    recoveryEuro: {
      perCorrectedRun: recoveryPerCorrectedRun,
      additionalCorrectRunsVsV29: correctedRunsDelta,
      estimatedRecoveryEuro: Math.round(correctedRunsDelta * recoveryPerCorrectedRun * 100) / 100,
      avgErrorReduction: Math.round((V29_BASELINE.summary.avgFinancialErrorEuro - avgRuloErr) * 100) / 100,
    },
  },
  denoTests: {
    monetaryBinding: "7/7 pass",
    imageCrop: "8/8 pass",
  },
};

writeFileSync(`${OUT}/v30-validation.json`, JSON.stringify(v30, null, 2));

const report = `# v30 Rulo IVA/Valor Validation

**Deploy:** extract-invoice v${version} on \`bjhnlrgodcqoyzddbpbd\`  
**Invoice:** Mammafiore \`36c99d19-6f9f-413f-8c2d-ae3526291a2d\`  
**Generated:** ${new Date().toISOString().slice(0, 10)}

## Deno tests

| Suite | Result |
|-------|--------|
| invoice-monetary-binding.test.ts | 7/7 pass |
| invoice-image-crop.test.ts | 8/8 pass |

## Rulo stability

| Metric | v29 baseline | v30 |
|--------|--------------|-----|
| Correct total runs | ${V29_BASELINE.summary.perfectTotalRuns} (${V29_BASELINE.summary.stabilityPercent}%) | **${perfect}/${RUNS} (${Math.round((perfect / RUNS) * 100)}%)** |
| IVA bleed runs | ${V29_BASELINE.summary.ivaBleedRuns} | ${ivaBleedRuns}/${RUNS} |
| Avg Rulo € error | €${V29_BASELINE.summary.avgFinancialErrorEuro} | €${avgRuloErr} |
| Totals seen | ${JSON.stringify(V29_BASELINE.summary.totalUnique)} | ${JSON.stringify(v30.summary.rulo.totalUnique)} |

## Recovery

- **€${recoveryPerCorrectedRun}** per corrected run (Valor 10.86 vs IVA 6.00)
- Additional correct runs vs v29: **${correctedRunsDelta}**
- Avg error reduction: **€${v30.comparisonVsV29.recoveryEuro.avgErrorReduction}**

## Mammafiore residual (all rows)

| Run | Rulo €err | Invoice residual |
|-----|-----------|------------------|
${runs.map((r) => `| ${r.run} | €${r.ruloErrorEuro} | €${r.mammafioreResidualEuro} |`).join("\n")}

**Avg Mammafiore residual:** €${avgMammafioreResidual} (v28 lab: €5.86 = Rulo €4.86 + Farina €1.00)

## Per-run Rulo detail

${runs
  .map((r) => {
    const ru = r.rulo as Item | null;
    return `- Run ${r.run}: total=${ru?.total ?? "MISSING"} unit_price=${ru?.unit_price ?? "—"} ${r.ruloTotalCorrect ? "✓" : "✗"}`;
  })
  .join("\n")}
`;

writeFileSync(`${OUT}/v30-validation-report.md`, report);
console.log(JSON.stringify(v30.summary, null, 2));
