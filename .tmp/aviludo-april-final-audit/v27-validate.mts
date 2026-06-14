/**
 * v27 Aviludo April total-column isolation — 5-run validation
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/aviludo-april-final-audit";
const B64_PATH = ".tmp/footer-validation-4dc40c3/april-historico-png-fixture.b64.txt";
const INVOICE_ID = "c2f52357-0f80-491a-ba14-c97ff4837472";
const RUNS = 5;
const SLEEP_MS = 4000;

const GROUND_TRUTH: Record<
  string,
  { key: string; pattern: RegExp; qty: number; unit_price: number; total: number }
> = {
  nata: { key: "nata", pattern: /nata.*reny/i, qty: 5, unit_price: 18.29, total: 91.45 },
  ovo: { key: "ovo", pattern: /ovo.*líquido|ovo.*liquido/i, qty: 6, unit_price: 10.19, total: 61.14 },
  chocolate: { key: "chocolate", pattern: /chocolate.*pantagruel/i, qty: 2, unit_price: 29.19, total: 58.38 },
  anchovas: { key: "anchovas", pattern: /anchovas/i, qty: 2, unit_price: 9.49, total: 18.98 },
  atum: { key: "atum", pattern: /atum.*catrineta/i, qty: 2, unit_price: 6.29, total: 12.58 },
};

const V26_BASELINE = {
  financialErrorEuro: 169.08,
  failingRows: ["nata", "ovo", "chocolate", "anchovas", "atum"],
  mechanism: "line_total_net = gross_unit_price when qty > 1",
};

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!.api_key;
}

function buildImageUrl(): string {
  const raw = readFileSync(B64_PATH, "utf8").trim();
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw.replace(/^data:image\/png;base64,/, "")}`;
}

function matchRow(items: Array<Record<string, unknown>>, pattern: RegExp) {
  return items.find((i) => pattern.test(String(i.name ?? ""))) ?? null;
}

function rowCheck(
  item: { name: string; quantity: number; unit_price: number; total: number } | null,
  gt: (typeof GROUND_TRUTH)[string],
) {
  if (!item) {
    return {
      found: false,
      qtyOk: false,
      priceOk: false,
      totalOk: false,
      financialErrorEuro: gt.total,
      columnBleed: false,
    };
  }
  const qtyOk = item.quantity === gt.qty;
  const priceOk = Math.abs(item.unit_price - gt.unit_price) < 0.02;
  const totalOk = Math.abs(item.total - gt.total) < 0.02;
  const columnBleed =
    gt.qty > 1 && Math.abs(item.total - item.unit_price) < 0.02 && Math.abs(item.total - gt.total) > 0.02;
  const financialErrorEuro = Math.abs(item.total - gt.total);
  return {
    found: true,
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.total,
    qtyOk,
    priceOk,
    totalOk,
    columnBleed,
    financialErrorEuro: Math.round(financialErrorEuro * 100) / 100,
  };
}

const anonKey = projectKey("anon");
const imageDataUrl = buildImageUrl();
mkdirSync(OUT_DIR, { recursive: true });

const runs: Array<Record<string, unknown>> = [];

for (let run = 1; run <= RUNS; run++) {
  const t0 = Date.now();
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  const body = await res.json();
  const items = (body.items ?? []) as Array<{
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;

  const rowResults: Record<string, ReturnType<typeof rowCheck>> = {};
  let runFinancialError = 0;
  let multiQtyCorrect = 0;

  for (const [key, gt] of Object.entries(GROUND_TRUTH)) {
    const item = matchRow(items, gt.pattern);
    const check = rowCheck(item, gt);
    rowResults[key] = check;
    runFinancialError += check.financialErrorEuro;
    if (check.totalOk) multiQtyCorrect++;
  }

  runs.push({
    run,
    status: res.status,
    elapsedMs: Date.now() - t0,
    itemCount: items.length,
    ...rowResults,
    runFinancialErrorEuro: Math.round(runFinancialError * 100) / 100,
    multiQtyCorrect: `${multiQtyCorrect}/5`,
    allMultiQtyCorrect: multiQtyCorrect === 5,
  });

  console.log(
    `run ${run}/${RUNS} status=${res.status} items=${items.length} €err=${runFinancialError.toFixed(2)} multi=${multiQtyCorrect}/5`,
  );
  if (run < RUNS) await new Promise((r) => setTimeout(r, SLEEP_MS));
}

const deploymentRaw = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const fn = (JSON.parse(deploymentRaw) as Array<{ slug: string; version: number; updated_at: string }>).find(
  (f) => f.slug === "extract-invoice",
);

const perfectRuns = runs.filter((r) => r.allMultiQtyCorrect).length;
const avgFinancialError =
  runs.reduce((s, r) => s + Number(r.runFinancialErrorEuro), 0) / RUNS;
const columnBleedRuns = runs.filter((r) =>
  Object.values(GROUND_TRUTH).some((gt) => {
    const check = r[gt.key] as ReturnType<typeof rowCheck>;
    return check?.columnBleed;
  }),
).length;

const perRowCorrect: Record<string, string> = {};
for (const key of Object.keys(GROUND_TRUTH)) {
  const ok = runs.filter((r) => (r[key] as ReturnType<typeof rowCheck>)?.totalOk).length;
  perRowCorrect[key] = `${ok}/${RUNS}`;
}

const status =
  perfectRuns === RUNS ? "CLOSED" : perfectRuns >= 3 ? "PARTIAL" : "OPEN";

const output = {
  invoiceId: INVOICE_ID,
  label: "Aviludo April",
  deployVersion: fn?.version ?? null,
  deployUpdatedAt: fn?.updated_at ?? null,
  imageSource: B64_PATH,
  validatedAt: new Date().toISOString(),
  groundTruth: Object.fromEntries(
    Object.entries(GROUND_TRUTH).map(([k, v]) => [k, { qty: v.qty, unit_price: v.unit_price, total: v.total }]),
  ),
  v26Baseline: V26_BASELINE,
  runs,
  summary: {
    deployVersionOk: (fn?.version ?? 0) >= 27,
    perfectRuns: `${perfectRuns}/${RUNS}`,
    columnBleedRuns: `${columnBleedRuns}/${RUNS}`,
    perRowTotalCorrect: perRowCorrect,
    avgFinancialErrorEuro: Math.round(avgFinancialError * 100) / 100,
    financialImprovementVsV26Euro: Math.round((V26_BASELINE.financialErrorEuro - avgFinancialError) * 100) / 100,
    globalV26Euro: 220.27,
    globalEstimateAfterFixEuro: Math.round((220.27 - (V26_BASELINE.financialErrorEuro - avgFinancialError)) * 100) / 100,
    aviludoAprilStatus: status,
  },
};

writeFileSync(`${OUT_DIR}/v27-validation.json`, JSON.stringify(output, null, 2));

const report = `# Aviludo April v27 Validation

**Invoice:** \`${INVOICE_ID}\`  
**Deploy:** extract-invoice v${fn?.version ?? "?"} (${fn?.updated_at ?? "?"})  
**Validated:** ${output.validatedAt}

## Prompt change
TOTAL COLUMN ISOLATION — \`line_total_net\` from VALOR only; never copy \`gross_unit_price\`. When qty > 1, line total must exceed unit price.

## Stability (5 runs)
| Metric | Result |
|--------|--------|
| Perfect multi-qty runs | **${perfectRuns}/5** |
| Column-bleed runs (total = unit_price) | ${columnBleedRuns}/5 |
| Avg € error (5 target rows) | **€${output.summary.avgFinancialErrorEuro}** |

### Per-row total correctness
| Row | Correct |
|-----|---------|
| Nata Reny Picot | ${perRowCorrect.nata} |
| Ovo Líquido | ${perRowCorrect.ovo} |
| Chocolate Pantagruel | ${perRowCorrect.chocolate} |
| Filete Anchovas | ${perRowCorrect.anchovas} |
| Atum Catrineta | ${perRowCorrect.atum} |

## Financial impact
| Scope | Before (v26) | After (v27 avg) |
|-------|--------------|-----------------|
| Aviludo April (5 rows) | €${V26_BASELINE.financialErrorEuro} | €${output.summary.avgFinancialErrorEuro} |
| Global VL estimate | €220.27 | ~€${output.summary.globalEstimateAfterFixEuro} |

## Verdict
**Aviludo April: ${status}**

${perfectRuns === RUNS ? "All 5 multi-qty rows correct on every run — total column isolation fix stable." : perfectRuns >= 3 ? "Majority of runs correct — partial improvement; residual GPT variance possible." : "Fix insufficient — column bleed persists on most runs."}
`;

writeFileSync(`${OUT_DIR}/v27-validation-report.md`, report);
console.log("wrote", `${OUT_DIR}/v27-validation.json`);
console.log("perfect runs:", `${perfectRuns}/${RUNS}`);
console.log("status:", status);
