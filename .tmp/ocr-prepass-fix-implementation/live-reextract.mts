/**
 * Live VL re-extract — Emporio ab52796d after Design D deploy
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VL = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const ROOT = "/Users/salvadorseabra1/margin-master";
const OUT = join(ROOT, ".tmp/ocr-prepass-fix-implementation");
const IMAGE = join(ROOT, ".tmp/emporio-italia-investigation/invoice-full.png");

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
) as { name: string; api_key: string }[];
const ak = keys.find((k) => k.name === "anon")!.api_key;

const deployVersion = (
  JSON.parse(execSync(`supabase functions list --project-ref ${VL} -o json`, { encoding: "utf8" })) as Array<{
    slug: string;
    version: number;
  }>
).find((f) => f.slug === "extract-invoice")?.version;

const buf = readFileSync(IMAGE);
const imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;

const res = await fetch(`https://${VL}.supabase.co/functions/v1/extract-invoice`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ak,
    Authorization: `Bearer ${ak}`,
  },
  body: JSON.stringify({ imageDataUrl }),
  signal: AbortSignal.timeout(180_000),
});

const body = (await res.json()) as {
  items?: Array<{ name?: string; quantity?: number; unit?: string; unit_price?: number; line_total?: number }>;
  extraction_meta?: Record<string, unknown>;
  error?: string;
};

const pick = (pattern: RegExp) =>
  (body.items ?? []).find((it) => pattern.test(String(it.name ?? ""))) ?? null;

const targets = {
  gorgonzola: pick(/gorgonzola/i),
  bresaola: pick(/bresaola/i),
  prosciutto: pick(/prosciutto/i),
  mortadella: pick(/mortadella/i),
  pellegrino: pick(/pellegrino|san pellegrino/i),
  paccheri: pick(/paccheri/i),
};

const expectations: Record<string, { qty: number; tol?: number }> = {
  gorgonzola: { qty: 1.35 },
  bresaola: { qty: 1.83 },
  prosciutto: { qty: 4.3, tol: 0.05 },
  mortadella: { qty: 3.11, tol: 0.05 },
  paccheri: { qty: 24 },
};

const checks = Object.fromEntries(
  Object.entries(expectations).map(([key, exp]) => {
    const row = targets[key as keyof typeof targets];
    const actual = row?.quantity ?? null;
    const tol = exp.tol ?? 0.02;
    const ok = actual != null && Math.abs(actual - exp.qty) <= tol;
    return [key, { expected: exp.qty, actual, ok, row }];
  }),
);

const allOk = Object.values(checks).every((c) => c.ok);

const result = {
  capturedAt: new Date().toISOString(),
  invoiceId: INVOICE_ID,
  deployVersion,
  status: res.status,
  checks,
  allFractionFamilyOk: checks.gorgonzola.ok && checks.bresaola.ok,
  allControlsOk: checks.prosciutto.ok && checks.mortadella.ok && checks.paccheri.ok,
  allOk,
  extraction_meta: body.extraction_meta ?? null,
  itemCount: body.items?.length ?? 0,
};

writeFileSync(join(OUT, "live-reextract.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ deployVersion, allOk, checks: Object.fromEntries(Object.entries(checks).map(([k,v]) => [k, { expected: v.expected, actual: v.actual, ok: v.ok }])) }, null, 2));
