/**
 * v29 Mortadella validation — 5 Emporio invokes
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/mortadella-root-cause";
const IMG = ".tmp/emporio-italia-investigation/invoice-full.png";
const RUNS = 5;

const MORT_GT = { qty: 3.11, unit_price: 10.1, total: 31.07, gross_unit: 11.1, discount_pct: 10 };
const V28_STABILITY = JSON.parse(readFileSync(`${OUT}/stability.json`, "utf8"));
const V28_VL = { total: 27.57, financialErrorEuro: 3.5, unit_price: 8.88 };

const EMPORIO_GT: Array<{ pattern: RegExp; total: number }> = [
  { pattern: /paccheri/i, total: 50.2 },
  { pattern: /gorgonzola/i, total: 13.44 },
  { pattern: /prosciutto/i, total: 35.14 },
  { pattern: /mortadella/i, total: 31.07 },
  { pattern: /sanpellegrino|acqua in/i, total: 38.56 },
  { pattern: /bresaola/i, total: 49.48 },
  { pattern: /ginger beer/i, total: 19.38 },
  { pattern: /ventricina/i, total: 39.49 },
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

  const mort = items.find((i) => /mortadella/i.test(i.name)) ?? null;
  const mortErr = mort ? Math.abs(mort.total - MORT_GT.total) : MORT_GT.total;

  let emporioResidual = 0;
  const rowErrors: Array<{ name: string; gt: number; extracted: number; error: number }> = [];
  for (const gt of EMPORIO_GT) {
    const row = items.find((i) => gt.pattern.test(i.name));
    if (!row) {
      emporioResidual += gt.total;
      rowErrors.push({ name: gt.pattern.source, gt: gt.total, extracted: 0, error: gt.total });
      continue;
    }
    const err = Math.abs(row.total - gt.total);
    emporioResidual += err;
    rowErrors.push({ name: row.name, gt: gt.total, extracted: row.total, error: Math.round(err * 100) / 100 });
  }

  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    mortadella: mort,
    mortadellaErrorEuro: Math.round(mortErr * 100) / 100,
    mortadellaTotalCorrect: mort ? Math.abs(mort.total - MORT_GT.total) < 0.05 : false,
    emporioResidualEuro: Math.round(emporioResidual * 100) / 100,
    emporioRowErrors: rowErrors,
  });
  console.log(
    `run ${run} mort=${mort?.total} €err=${mortErr.toFixed(2)} emporioResidual=${emporioResidual.toFixed(2)}`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, 3500));
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const version = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

const perfect = runs.filter((r) => r.mortadellaTotalCorrect).length;
const avgMortErr =
  Math.round((runs.reduce((s, r) => s + Number(r.mortadellaErrorEuro), 0) / RUNS) * 100) / 100;
const avgEmporioResidual =
  Math.round((runs.reduce((s, r) => s + Number(r.emporioResidualEuro), 0) / RUNS) * 100) / 100;

const v29 = {
  generated_at: new Date().toISOString(),
  deployVersion: version,
  deployVerified: (version ?? 0) >= 29,
  promptVersion: "v29",
  invoiceId: "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
  groundTruth: MORT_GT,
  runs,
  summary: {
    mortadella: {
      perfectTotalRuns: `${perfect}/${RUNS}`,
      stabilityPercent: Math.round((perfect / RUNS) * 100),
      totalUnique: [...new Set(runs.map((r) => (r.mortadella as Item | null)?.total))],
      avgFinancialErrorEuro: avgMortErr,
    },
    emporio: {
      avgResidualEuro: avgEmporioResidual,
      v28LabRerunResidualEuro: 5.1,
    },
  },
  comparisonVsV28: {
    v28Stability3Run: V28_STABILITY.summary,
    v28LabRerun: V28_VL,
    v29: {
      stabilityPercent: Math.round((perfect / RUNS) * 100),
      avgFinancialErrorEuro: avgMortErr,
    },
    recoveryEuro: {
      vsV28LabRerun: Math.round((V28_VL.financialErrorEuro - avgMortErr) * 100) / 100,
      vsV28StabilityAvg: Math.round((V28_STABILITY.summary.avgFinancialErrorEuro - avgMortErr) * 100) / 100,
    },
  },
};

writeFileSync(`${OUT}/v29-validation.json`, JSON.stringify(v29, null, 2));
