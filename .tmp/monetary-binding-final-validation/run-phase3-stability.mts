/**
 * Phase 3 Pomodor 5-run stability (read-only).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = "/Users/salvadorseabra1/margin-master";
const OUT = join(ROOT, ".tmp/monetary-binding-final-validation");
const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BOCCONCINO_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";
const RUNS = 5;
const PAUSE_MS = 2000;
const TIMEOUT_MS = 90_000;

mkdirSync(OUT, { recursive: true });

function load<T>(p: string): T {
  return JSON.parse(readFileSync(join(ROOT, p), "utf8")) as T;
}

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name}`);
  return row.api_key;
}

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function invoke(imageDataUrl: string, run: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
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
    return { run, status: res.status, elapsedMs: Date.now() - started, body: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}

const funcListRaw = execSync(
  `supabase functions list --project-ref ${VL_REF} -o json`,
  { encoding: "utf8" },
);
const extractFn = (
  JSON.parse(funcListRaw) as Array<{
    slug: string;
    version: number;
    updated_at: number;
    ezbr_sha256?: string;
  }>
).find((f) => f.slug === "extract-invoice");

const localHead = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const phase3Commit = execSync(
  "git log --oneline -1 --grep='phase 3' 2>/dev/null || git log --oneline -1",
  { encoding: "utf8" },
).trim();

const { data: inv } = await sb
  .from("invoices")
  .select("file_url")
  .eq("id", BOCCONCINO_ID)
  .single();
const { data: sig } = await sb.storage
  .from("invoices")
  .createSignedUrl(inv!.file_url, 300);
const buf = Buffer.from(await fetch(sig!.signedUrl).then((r) => r.arrayBuffer()));
const imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;

const VL_GT = { quantity: 2, unit_price: 25, total: 50 };
const runs = [];

for (let i = 1; i <= RUNS; i++) {
  if (i > 1) await sleep(PAUSE_MS);
  const result = await invoke(imageDataUrl, i);
  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  const pomodor = items.find((it: Record<string, unknown>) =>
    /pomodor/i.test(String(it.name ?? ""))
  ) as Record<string, unknown> | undefined;

  runs.push({
    run: i,
    status: result.status,
    elapsedMs: result.elapsedMs,
    itemCount: items.length,
    itemKeys: items[0] ? Object.keys(items[0] as object) : [],
    hasStructuredFields: items.some(
      (it: Record<string, unknown>) =>
        "gross_unit_price" in it || "discount_pct" in it || "line_total_net" in it,
    ),
    pomodor: pomodor
      ? {
          name: pomodor.name,
          quantity: pomodor.quantity ?? null,
          unit: pomodor.unit ?? null,
          gross_unit_price: pomodor.gross_unit_price ?? null,
          discount_pct: pomodor.discount_pct ?? null,
          line_total_net: pomodor.line_total_net ?? null,
          unit_price: pomodor.unit_price ?? null,
          total: pomodor.total ?? null,
        }
      : null,
  });
  console.error(
    `run ${i}: qty=${pomodor?.quantity} unit=${pomodor?.unit_price} total=${pomodor?.total}`,
  );
}

const isCorrect = (p: Record<string, unknown> | null | undefined) =>
  p != null &&
  p.quantity === VL_GT.quantity &&
  p.unit_price === VL_GT.unit_price &&
  p.total === VL_GT.total;

const correct = runs.filter((r) => isCorrect(r.pomodor));
const incorrect = runs.filter((r) => !isCorrect(r.pomodor));

const phase12 = load<{
  runs: Array<{ pomodor: Record<string, unknown> | null }>;
  summary: { stabilityPctCorrect: number };
  monetaryErrorEstimateEuro: { stableResidual: number };
}>(".tmp/monetary-binding-final-validation/pomodor-5run-stability.json");

const phase12Modal = phase12.runs[0]?.pomodor;
const phase3Modal = runs[0]?.pomodor;

const output = {
  generated_at: new Date().toISOString(),
  invoiceId: BOCCONCINO_ID,
  product: "POMODOR PELATI (CX 2.5KG*6)",
  deployment: {
    vlExtractInvoiceVersion: extractFn?.version ?? null,
    vlUpdatedAt: extractFn?.updated_at
      ? new Date(extractFn.updated_at).toISOString()
      : null,
    ezbrSha256: extractFn?.ezbr_sha256 ?? null,
    localGitHead: localHead,
    phase3CommitLocal: phase3Commit,
    phase3DeployedPerUserClaim: (extractFn?.version ?? 0) > 21,
    phase3DeployedConfirmed: (extractFn?.version ?? 0) > 21,
    note:
      (extractFn?.version ?? 0) <= 21
        ? "VL still reports v21 (Phase 1+2 deploy). User claims Phase 3 deployed — version bump not observed; results may reflect v21 unless deploy completed after list check."
        : "Version > 21 — Phase 3 deploy confirmed",
  },
  baselines: {
    visibleInvoice: { quantity: 1, gross: 27.56, discount_pct: 20, valor: 22.05 },
    vlCatalogGt: VL_GT,
    preHybridRefined: { quantity: 2, unit_price: 20, total: 40 },
    phase12v21: {
      modal: { quantity: 1, unit_price: 22.05, total: 22.05 },
      stabilityPctCorrect: 0,
      deterministic: true,
      source: "pomodor-5run-stability.json",
    },
  },
  runs,
  summary: {
    correctVsVlGt: {
      count: correct.length,
      runNumbers: correct.map((r) => r.run),
    },
    incorrectVsVlGt: {
      count: incorrect.length,
      runNumbers: incorrect.map((r) => r.run),
      values: incorrect.map((r) => r.pomodor),
    },
    stabilityPctCorrect: Math.round((correct.length / RUNS) * 100),
    deterministic: new Set(runs.map((r) => JSON.stringify(r.pomodor))).size === 1,
    unitPriceUnique: [
      ...new Set(runs.map((r) => r.pomodor?.unit_price).filter((v) => typeof v === "number")),
    ],
    totalUnique: [
      ...new Set(runs.map((r) => r.pomodor?.total).filter((v) => typeof v === "number")),
    ],
    qtyUnique: [
      ...new Set(runs.map((r) => r.pomodor?.quantity).filter((v) => typeof v === "number")),
    ],
    structuredFieldsInResponse: runs.some((r) => r.hasStructuredFields),
  },
  comparison: {
    vsPhase12: {
      phase12Modal,
      phase3Modal,
      unitPriceDelta:
        phase3Modal?.unit_price != null && phase12Modal?.unit_price != null
          ? (phase3Modal.unit_price as number) - (phase12Modal.unit_price as number)
          : null,
      totalDelta:
        phase3Modal?.total != null && phase12Modal?.total != null
          ? (phase3Modal.total as number) - (phase12Modal.total as number)
          : null,
      changed: JSON.stringify(phase3Modal) !== JSON.stringify(phase12Modal),
    },
    vsPreHybrid: {
      preHybrid: { quantity: 2, unit_price: 20, total: 40 },
      improvedFromDescBleed:
        phase3Modal?.unit_price !== 20 && phase3Modal?.total !== 40,
    },
    vsVisibleInvoice: {
      matchesVisibleQty: phase3Modal?.quantity === 1,
      matchesVisibleNet: phase3Modal?.unit_price === 22.05,
    },
  },
  monetaryErrorEstimateEuro: {
    vsVlGtPerRun: correct.length > 0
      ? 0
      : phase3Modal?.total != null
        ? Math.abs(VL_GT.total - (phase3Modal.total as number))
        : 10,
    phase12Residual: 27.95,
    phase3Residual: phase3Modal?.total != null
      ? Math.abs(VL_GT.total - (phase3Modal.total as number))
      : null,
    deltaVsPhase12:
      phase3Modal?.total != null
        ? Math.abs(VL_GT.total - (phase3Modal.total as number)) - 27.95
        : null,
  },
  remainingColumnShiftRows: [
    {
      invoice: "IL Bocconcino",
      product: "POMODOR PELATI",
      status: correct.length === RUNS ? "CLOSED" : "OPEN",
      euroImpactVsVlGt: phase3Modal?.total != null
        ? Math.abs(VL_GT.total - (phase3Modal.total as number))
        : 10,
    },
    {
      invoice: "Emporio Italia",
      product: "Rovagnati Prosciutto Cotto",
      status: "NOT_RETESTED",
      note: "Phase 3 invoke not run; pre-hybrid stable error ~€1.4 vs VL GT",
      euroImpactVsVlGt: 1.4,
    },
  ],
  familyClosed: {
    verdict: correct.length === RUNS
      ? "YES"
      : runs.every((r) => JSON.stringify(r.pomodor) === JSON.stringify(phase12Modal))
        ? "NO"
        : "PARTIAL",
    evidence: [] as string[],
  },
};

if (!output.deployment.phase3DeployedConfirmed) {
  output.familyClosed.evidence.push(
    "VL extract-invoice still v21 — Phase 3 deploy not confirmed via functions list",
  );
}
if (output.summary.stabilityPctCorrect === 0 && output.summary.deterministic) {
  output.familyClosed.evidence.push(
    `0/${RUNS} vs VL GT; deterministic modal qty=${phase3Modal?.quantity} unit=${phase3Modal?.unit_price} total=${phase3Modal?.total}`,
  );
}
if (output.comparison.vsPhase12.changed) {
  output.familyClosed.evidence.push("Output differs from Phase 1+2 v21 baseline");
} else {
  output.familyClosed.evidence.push("Output identical to Phase 1+2 v21 5-run baseline");
}

writeFileSync(join(OUT, "pomodor-5run-phase3-stability.json"), JSON.stringify(output, null, 2));
console.log(
  JSON.stringify(
    {
      version: output.deployment.vlExtractInvoiceVersion,
      phase3Confirmed: output.deployment.phase3DeployedConfirmed,
      correct: output.summary.correctVsVlGt.count,
      stabilityPct: output.summary.stabilityPctCorrect,
      familyClosed: output.familyClosed.verdict,
    },
    null,
    2,
  ),
);
