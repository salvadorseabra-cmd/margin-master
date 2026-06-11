/**
 * Bocconcino Pomodor 5-run stability (read-only).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = "/Users/salvadorseabra1/margin-master";
const OUT = join(ROOT, ".tmp/monetary-binding-final-validation");
const VL_REF = "bjhnlrgodcqoyzddbpbd";
const BOCCONCINO_ID = "f0aa5a08-86a3-4938-99f0-711e86073968";
const RUNS = 5;
const INVOKE_TIMEOUT_MS = 90_000;
const PAUSE_MS = 2000;

mkdirSync(OUT, { recursive: true });

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
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

async function invokeExtract(imageDataUrl: string, run: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);
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
    const body = await res.json();
    return { run, status: res.status, elapsedMs: Date.now() - started, body };
  } finally {
    clearTimeout(timer);
  }
}

function findPomodor(items: Array<Record<string, unknown>>) {
  return items.find((it) => /pomodor/i.test(String(it.name ?? ""))) ?? null;
}

function loadImageDataUrl(): string {
  const fixtureB64 = join(ROOT, ".tmp/bocconcino-investigation/invoice-full.b64.txt");
  if (existsSync(fixtureB64)) {
    const raw = readFileSync(fixtureB64, "utf8").trim();
    return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
  }
  throw new Error("fixture not found");
}

async function fetchStorageImageDataUrl(): Promise<string> {
  const { data: invoice } = await sb
    .from("invoices")
    .select("file_url")
    .eq("id", BOCCONCINO_ID)
    .single();
  if (!invoice?.file_url) throw new Error("no file_url");
  const { data: signed } = await sb.storage
    .from("invoices")
    .createSignedUrl(invoice.file_url, 300);
  if (!signed?.signedUrl) throw new Error("signed url failed");
  const buf = Buffer.from(await fetch(signed.signedUrl).then((r) => r.arrayBuffer()));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Deployment probe
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

const headCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const phase12Diff = execSync(
  "git diff HEAD -- supabase/functions/extract-invoice/invoice-crop-geometry.ts supabase/functions/extract-invoice/invoice-table-extraction.ts",
  { encoding: "utf8" },
);

// Prefer VL storage image — local .b64 fixture may be truncated
const imageDataUrl = await fetchStorageImageDataUrl();

const stabilityRuns = [];
for (let i = 1; i <= RUNS; i++) {
  if (i > 1) await sleep(PAUSE_MS);
  const result = await invokeExtract(imageDataUrl, i);
  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  const pomodor = findPomodor(items);
  const firstItem = items[0] as Record<string, unknown> | undefined;
  stabilityRuns.push({
    run: i,
    status: result.status,
    elapsedMs: result.elapsedMs,
    itemCount: items.length,
    itemKeys: firstItem ? Object.keys(firstItem) : [],
    hasStructuredFields: items.some(
      (it) =>
        "gross_unit_price" in it ||
        "discount_pct" in it ||
        "line_total_net" in it,
    ),
    responseTopLevelKeys: result.body ? Object.keys(result.body as object) : [],
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
    error: (result.body as { error?: string })?.error ?? null,
  });
  console.error(`run ${i}/${RUNS} done: unit=${(pomodor as Record<string,unknown>|null)?.unit_price} total=${(pomodor as Record<string,unknown>|null)?.total}`);
}

const VL_GT = { quantity: 2, unit_price: 25, total: 50 };
const isCorrect = (p: Record<string, unknown> | null) =>
  p != null &&
  p.quantity === VL_GT.quantity &&
  p.unit_price === VL_GT.unit_price &&
  p.total === VL_GT.total;

const correctRuns = stabilityRuns.filter((r) => isCorrect(r.pomodor as Record<string, unknown> | null));
const incorrectRuns = stabilityRuns.filter((r) => !isCorrect(r.pomodor as Record<string, unknown> | null));

const output = {
  generated_at: new Date().toISOString(),
  invoiceId: BOCCONCINO_ID,
  product: "POMODOR PELATI (CX 2.5KG*6)",
  deployment: {
    extractInvoiceVersion: extractFn?.version ?? null,
    extractInvoiceUpdatedAt: extractFn?.updated_at
      ? new Date(extractFn.updated_at).toISOString()
      : null,
    ezbrSha256: extractFn?.ezbr_sha256 ?? null,
    gitHeadCommit: headCommit,
    phase12StillUncommittedLocally: phase12Diff.length > 0,
    phase12DeployedPerUserClaim: (extractFn?.version ?? 0) >= 21,
    structuredFieldsInAnyRun: stabilityRuns.some((r) => r.hasStructuredFields),
    structuredFieldsExposedInApi: stabilityRuns[0]?.hasStructuredFields ?? false,
    limitation:
      "index.ts returns reconciled legacy items only; gross_unit_price/discount_pct/line_total_net stripped unless index.ts extended",
  },
  baselines: {
    visibleInvoice: {
      quantity: 1,
      gross_unit_price: 27.56,
      discount_pct: 20,
      line_total_net: 22.05,
    },
    vlCatalogGt: VL_GT,
    preHybridRefined: { quantity: 2, unit_price: 20, total: 40 },
    preHybrid5Run: "column-shift-audit/run-stability.json",
    bocconcinoHybridValidation: "bocconcino-hybrid-validation/row-comparison.json",
  },
  runs: stabilityRuns,
  summary: {
    correctCount: correctRuns.length,
    correctRunNumbers: correctRuns.map((r) => r.run),
    incorrectCount: incorrectRuns.length,
    incorrectRuns: incorrectRuns.map((r) => ({
      run: r.run,
      pomodor: r.pomodor,
      failurePattern: (() => {
        const p = r.pomodor;
        if (!p) return "missing_row";
        if (p.unit_price === 20) return "DESC_bleed_unit_equals_discount_pct";
        if (p.unit_price === 27.56) return "neighbour_PVENDA_bleed";
        if (p.unit_price === 25.9) return "partial_shift";
        return "other";
      })(),
    })),
    stabilityPctCorrect: Math.round((correctRuns.length / RUNS) * 100),
    unitPriceUnique: [
      ...new Set(
        stabilityRuns
          .map((r) => r.pomodor?.unit_price)
          .filter((v) => typeof v === "number"),
      ),
    ],
    totalUnique: [
      ...new Set(
        stabilityRuns
          .map((r) => r.pomodor?.total)
          .filter((v) => typeof v === "number"),
      ),
    ],
    descBleedUnit20Count: stabilityRuns.filter((r) => r.pomodor?.unit_price === 20).length,
    deterministic: correctRuns.length === RUNS || incorrectRuns.length === RUNS,
  },
  monetaryErrorEstimateEuro: {
    perIncorrectRunVsVlGt: 10,
    stableResidualIfModalWrong:
      correctRuns.length < RUNS ? 10 : 0,
    note: "€10 = |VL GT total €50 − modal wrong €40| on unit_price field",
  },
  phase3BinderRequired: correctRuns.length < RUNS,
  phase3Reasoning: [] as string[],
};

if (output.deployment.phase12DeployedPerUserClaim) {
  output.phase3Reasoning.push("Phase 1+2 deployed (v21+)");
} else if ((extractFn?.version ?? 0) > 20) {
  output.phase3Reasoning.push(`Version incremented to v${extractFn?.version} but structured fields not in API response`);
} else {
  output.phase3Reasoning.push(`Still on v${extractFn?.version ?? "?"} — user claim of deploy not confirmed by version bump`);
}

if (output.summary.stabilityPctCorrect < 100) {
  output.phase3Reasoning.push(
    `${output.summary.descBleedUnit20Count}/${RUNS} runs show unit €20 = DESC 20% bleed`,
  );
  output.phase3Reasoning.push(
    "monetary-column-validation-audit: self-consistent wrong triples (2×20=40) need bindMonetaryColumns (Phase 3)",
  );
}
if (output.summary.stabilityPctCorrect === 100) {
  output.phase3Reasoning.push("All 5 runs match VL GT — Phase 3 may be deferrable for Pomodor");
}

writeFileSync(join(OUT, "pomodor-5run-stability.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  version: output.deployment.extractInvoiceVersion,
  structured: output.deployment.structuredFieldsInAnyRun,
  correct: output.summary.correctCount,
  stabilityPct: output.summary.stabilityPctCorrect,
  phase3: output.phase3BinderRequired,
}, null, 2));
