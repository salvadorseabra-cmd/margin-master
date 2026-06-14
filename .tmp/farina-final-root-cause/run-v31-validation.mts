/**
 * v31 Farina Valor digit drift validation — 5 invokes on Mammafiore
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/farina-final-root-cause";
const INVOICE_ID = "36c99d19-6f9f-413f-8c2d-ae3526291a2d";
const IMAGE = ".tmp/mammafiore-investigation/invoice-full.png";
const RUNS = 5;
const GT_TOTAL = 26.52;
const FARINA_PATTERN = /farin[ae].*speciale.*pizza|speciale pizza.*25kg/i;

const round2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number | null | undefined, tol = 0.05) =>
  b != null && Math.abs(a - b) <= tol;

function projectKey(name: "anon"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const deployVersion = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

if ((deployVersion ?? 0) < 31) {
  throw new Error(`Expected v31+, got v${deployVersion}`);
}

const anonKey = projectKey("anon");
mkdirSync(OUT, { recursive: true });

async function invoke(imagePath: string) {
  const png = readFileSync(imagePath);
  const imageDataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  const t0 = Date.now();
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
  return { status: res.status, body: await res.json(), elapsedMs: Date.now() - t0 };
}

type Item = {
  name: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
};

const runs: Array<Record<string, unknown>> = [];

console.log(`\n=== Mammafiore Farina v${deployVersion} (${RUNS} runs) ===`);

for (let run = 1; run <= RUNS; run++) {
  const result = await invoke(IMAGE);
  const items = (result.body?.items ?? []) as Item[];
  const row = items.find((i) => FARINA_PATTERN.test(i.name)) ?? null;
  const errorEuro = row?.total != null ? round2(Math.abs(row.total - GT_TOTAL)) : GT_TOTAL;
  const correct = row?.total != null && close(GT_TOTAL, row.total);
  const rowData = {
    run,
    status: result.status,
    elapsedMs: result.elapsedMs,
    farina: row
      ? {
          name: row.name,
          quantity: row.quantity,
          unit_price: row.unit_price,
          total: row.total,
          errorEuro,
          correctVsGt: correct,
        }
      : null,
  };
  runs.push(rowData);
  console.log(
    `  run ${run} total=${row?.total ?? "MISSING"} correct=${correct} (${result.elapsedMs}ms)`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, 2500));
}

const correctRuns = runs.filter((r) => (r.farina as { correctVsGt?: boolean })?.correctVsGt).length;
const errors = runs.map((r) => (r.farina as { errorEuro?: number })?.errorEuro ?? GT_TOTAL);
const totals = runs
  .map((r) => (r.farina as { total?: number | null })?.total)
  .filter((t): t is number => t != null);

const v30Baseline = {
  deployVersion: 30,
  runs: 10,
  correctVsGt: 0,
  correctnessPct: 0,
  stableTotal: 25.52,
  avgErrorEuro: 1,
  source: ".tmp/final-stability-audit/stability-matrix.json",
};

const validation = {
  generated_at: new Date().toISOString(),
  deployVersion,
  invoiceId: INVOICE_ID,
  product: "Farina Speciale pizza 25kg Amoruso",
  groundTruthTotal: GT_TOTAL,
  runs: RUNS,
  farinaStabilityPct: round2((correctRuns / RUNS) * 100),
  correctRuns,
  perRun: runs,
  totalsUnique: [...new Set(totals)],
  avgErrorEuro: round2(errors.reduce((a, b) => a + b, 0) / RUNS),
  recoveryEuro: v30Baseline.avgErrorEuro - round2(errors.reduce((a, b) => a + b, 0) / RUNS),
  before: v30Baseline,
  after: {
    deployVersion,
    runs: RUNS,
    correctVsGt: correctRuns,
    correctnessPct: round2((correctRuns / RUNS) * 100),
    avgErrorEuro: round2(errors.reduce((a, b) => a + b, 0) / RUNS),
  },
  focusRowClassA: {
    farinaFixed: correctRuns === RUNS,
    remainingDeterministicBugsEuro:
      correctRuns === RUNS ? 0 : round2(errors.reduce((a, b) => a + b, 0) / RUNS),
    note:
      correctRuns === RUNS
        ? "Farina was sole Class A focus-row bug; fix eliminates €1.00 deterministic error"
        : "Farina still failing — Class A remains",
  },
  verdict: correctRuns === RUNS ? "PASS" : correctRuns >= 4 ? "PARTIAL" : "FAIL",
};

writeFileSync(`${OUT}/v31-validation.json`, JSON.stringify(validation, null, 2));

const report = `# Farina Valor Digit Drift — v${deployVersion} Validation

**Deploy:** extract-invoice **v${deployVersion}** on \`${VL_REF}\`  
**Invoice:** Mammafiore \`${INVOICE_ID}\`  
**Generated:** ${new Date().toISOString().slice(0, 10)}

---

## Verdict: **${validation.verdict}**

| Metric | v30 (before) | v${deployVersion} (after) |
|--------|--------------|---------------------------|
| Correct vs GT | **0/10** (0%) | **${correctRuns}/${RUNS}** (${validation.farinaStabilityPct}%) |
| Stable total | 25.52 | ${JSON.stringify(validation.totalsUnique)} |
| Avg € error | €1.00 | €${validation.avgErrorEuro} |
| Recovery | — | €${validation.recoveryEuro} |

**Target:** 5/5 at total **€26.52**

---

## Per-Run Results

| Run | Qty | Unit Price | Total | Correct | € Error |
|-----|-----|------------|-------|---------|---------|
${runs
  .map((r) => {
    const f = r.farina as {
      quantity: number | null;
      unit_price: number | null;
      total: number | null;
      correctVsGt: boolean;
      errorEuro: number;
    } | null;
    return `| ${r.run} | ${f?.quantity ?? "—"} | ${f?.unit_price ?? "—"} | ${f?.total ?? "MISSING"} | ${f?.correctVsGt ? "✓" : "✗"} | €${f?.errorEuro ?? GT_TOTAL} |`;
  })
  .join("\n")}

---

## Focus-Row Class A Impact

- **Before (v30):** Farina sole Class A deterministic bug — €1.00 stable across 10/10 runs
- **After (v${deployVersion}):** ${validation.focusRowClassA.note}
- **Remaining deterministic € on focus rows:** €${validation.focusRowClassA.remainingDeterministicBugsEuro}

---

## Prompt Change

Added Farina GOOD/BAD example + Valor digit rule in \`invoice-table-extraction.ts\` MAMMAFIORE COLUMN ISOLATION block (after Rulo example).
`;

writeFileSync(`${OUT}/v31-validation-report.md`, report);
console.log("\nDONE", JSON.stringify({ verdict: validation.verdict, correctRuns, deployVersion }, null, 2));
