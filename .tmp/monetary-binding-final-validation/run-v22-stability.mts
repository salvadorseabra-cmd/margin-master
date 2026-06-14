/**
 * v22 Phase 3 final validation — Bocconcino Pomodor 5-run (read-only).
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
const VISIBLE = { quantity: 1, gross: 27.56, discount_pct: 20, valor: 22.05 };

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

const isCorrectVlGt = (p: Record<string, unknown> | null | undefined) =>
  p != null &&
  p.quantity === VL_GT.quantity &&
  p.unit_price === VL_GT.unit_price &&
  p.total === VL_GT.total;

const correct = runs.filter((r) => isCorrectVlGt(r.pomodor));
const incorrect = runs.filter((r) => !isCorrectVlGt(r.pomodor));

const phase12 = load<{
  runs: Array<{ pomodor: Record<string, unknown> | null }>;
}>("pomodor-5run-stability.json");

const phase12Modal = phase12.runs[0]?.pomodor;
const v22Modal = runs[0]?.pomodor;

const output = {
  generated_at: new Date().toISOString(),
  invoiceId: BOCCONCINO_ID,
  product: "POMODOR PELATI (CX 2.5KG*6)",
  deployment: {
    version: extractFn?.version,
    updatedAtUtc: extractFn?.updated_at
      ? new Date(extractFn.updated_at).toISOString()
      : null,
    ezbrSha256: extractFn?.ezbr_sha256 ?? null,
    localHead: execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(),
    phase3Commit: "de556e0",
    v22Confirmed: (extractFn?.version ?? 0) >= 22,
  },
  baselines: {
    visibleInvoice: VISIBLE,
    vlCatalogGt: VL_GT,
    preHybridRefined: { quantity: 2, unit_price: 20, total: 40 },
    phase12v21: {
      modal: { quantity: 1, unit_price: 22.05, total: 22.05 },
      stabilityPctVsVlGt: 0,
      deterministic: true,
    },
  },
  runs,
  summary: {
    correctVsVlGt: { count: correct.length, runNumbers: correct.map((r) => r.run) },
    incorrectVsVlGt: {
      count: incorrect.length,
      runNumbers: incorrect.map((r) => r.run),
    },
    stabilityPctVsVlGt: Math.round((correct.length / RUNS) * 100),
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
  financialDelta: {
    vsVlGt: {
      unitPrice: v22Modal?.unit_price != null ? (v22Modal.unit_price as number) - VL_GT.unit_price : null,
      total: v22Modal?.total != null ? (v22Modal.total as number) - VL_GT.total : null,
      absTotalError: v22Modal?.total != null ? Math.abs(VL_GT.total - (v22Modal.total as number)) : null,
    },
    vsPhase12: {
      unitPriceDelta:
        v22Modal?.unit_price != null && phase12Modal?.unit_price != null
          ? (v22Modal.unit_price as number) - (phase12Modal.unit_price as number)
          : null,
      totalDelta:
        v22Modal?.total != null && phase12Modal?.total != null
          ? (v22Modal.total as number) - (phase12Modal.total as number)
          : null,
      changed: JSON.stringify(v22Modal) !== JSON.stringify(phase12Modal),
    },
  },
  remainingColumnShiftRows: [
    {
      invoice: "IL Bocconcino",
      product: "POMODOR PELATI",
      status: correct.length === RUNS ? "CLOSED" : "OPEN",
      euroImpactVsVlGt: v22Modal?.total != null
        ? Math.abs(VL_GT.total - (v22Modal.total as number))
        : 10,
    },
    {
      invoice: "Emporio Italia",
      product: "Rovagnati Prosciutto Cotto",
      status: "NOT_RETESTED_V22",
      priorAudit: {
        source: "passc-refinement-validation/reextract/17aa3591-....json",
        quantity: 4,
        unit_price: 9.17,
        total: 36.54,
        vlGtUnit: 8.17,
        vlGtTotal: 35.14,
        euroImpact: 1.4,
        note: "Pre-Phase-3 refined extract; v22 invoke not run in this audit",
      },
    },
  ],
  familyVerdict: {
    status: "OPEN",
    evidence: [] as string[],
  },
};

if (output.summary.stabilityPctVsVlGt === 100) {
  output.familyVerdict.status = "CLOSED";
  output.familyVerdict.evidence.push("5/5 match VL GT");
} else if (output.financialDelta.vsPhase12.changed) {
  output.familyVerdict.status = "PARTIAL";
  output.familyVerdict.evidence.push("v22 differs from Phase 1+2 baseline");
} else {
  output.familyVerdict.evidence.push(
    `${output.summary.stabilityPctVsVlGt}/5 vs VL GT; identical to Phase 1+2 v21 modal`,
  );
  output.familyVerdict.evidence.push("Structured fields absent in API — binder effect unverifiable from response");
  if (output.summary.deterministic) {
    output.familyVerdict.evidence.push(
      `Deterministic modal: qty=${v22Modal?.quantity} unit=${v22Modal?.unit_price} total=${v22Modal?.total}`,
    );
  }
}

writeFileSync(join(OUT, "pomodor-5run-v22-stability.json"), JSON.stringify(output, null, 2));
console.log(
  JSON.stringify(
    {
      v22: output.deployment.v22Confirmed,
      version: output.deployment.version,
      correct: output.summary.correctVsVlGt.count,
      stabilityPct: output.summary.stabilityPctVsVlGt,
      changedVsPhase12: output.financialDelta.vsPhase12.changed,
      family: output.familyVerdict.status,
    },
    null,
    2,
  ),
);
