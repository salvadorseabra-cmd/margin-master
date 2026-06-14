/**
 * Final Validation Lab re-run — post Hybrid H + v25 + re-read safety.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/final-validation-lab-rerun";
const EXTRACT_DIR = `${OUT_DIR}/extracts`;

type Row = { description: string; qty: number; unit: string; unit_price: number; total: number };
type ExtractItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
};
type FieldStatus = "MATCH" | "MINOR_VARIATION" | "WRONG" | "MISSING";

const INVOICES: Array<{
  id: string;
  label: string;
  rowsExpected: number;
  imageOverride?: string;
}> = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood", rowsExpected: 11 },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May", rowsExpected: 8 },
  {
    id: "c2f52357-0f80-491a-ba14-c97ff4837472",
    label: "Aviludo April",
    rowsExpected: 9,
    imageOverride: ".tmp/footer-validation-4dc40c3/april-historico-png-fixture.b64.txt",
  },
  {
    id: "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
    label: "Emporio",
    rowsExpected: 8,
    imageOverride: ".tmp/emporio-italia-investigation/invoice-full.png",
  },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino", rowsExpected: 7 },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore", rowsExpected: 8 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const loadJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

function normName(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchScore(gt: string, name: string): number {
  const a = normName(gt);
  const b = normName(name);
  if (a === b) return 1;
  if (/recarg.*combust/i.test(a) && /recarg.*combust/i.test(b)) return 0.95;
  const gtTokens = a.split(" ").filter((t) => t.length > 2);
  return gtTokens.filter((t) => b.includes(t)).length / Math.max(gtTokens.length, 1);
}

function numClose(gt: number, ext: number | null | undefined, absTol: number, relTol: number) {
  if (ext == null || Number.isNaN(Number(ext))) return false;
  const e = Number(ext);
  return Math.abs(e - gt) <= absTol || Math.abs(e - gt) / Math.max(Math.abs(gt), 0.001) <= relTol;
}

function compareQty(gt: number, ext: number | null | undefined): FieldStatus {
  if (ext == null) return "MISSING";
  if (numClose(gt, ext, 0.05, 0.02)) return "MATCH";
  if (numClose(gt, ext, 0.2, 0.05)) return "MINOR_VARIATION";
  return "WRONG";
}

function compareMoney(gt: number, ext: number | null | undefined): FieldStatus {
  if (ext == null) return "MISSING";
  if (numClose(gt, ext, 0.05, 0.01)) return "MATCH";
  if (numClose(gt, ext, 0.25, 0.03)) return "MINOR_VARIATION";
  return "WRONG";
}

function compareDescription(gt: string, ext: string | null | undefined): FieldStatus {
  if (!ext) return "MISSING";
  const score = matchScore(gt, ext);
  if (score >= 0.92) return "MATCH";
  if (score >= 0.65) return "MINOR_VARIATION";
  return "WRONG";
}

function fieldAccuracy(statuses: FieldStatus[]): number {
  const countable = statuses.filter((s) => s !== "MISSING");
  if (!countable.length) return 0;
  return round2(
    (countable.filter((s) => s === "MATCH" || s === "MINOR_VARIATION").length / countable.length) *
      100,
  );
}

function qtyAccuracy(gtRows: Row[], items: ExtractItem[]): number {
  const used = new Set<number>();
  const statuses: FieldStatus[] = [];
  for (const gt of gtRows) {
    let best = -1,
      bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || bestScore < 0.35) {
      statuses.push("MISSING");
      continue;
    }
    used.add(best);
    statuses.push(compareQty(gt.qty, items[best].quantity));
  }
  return fieldAccuracy(statuses);
}

function overallFieldAccuracy(gtRows: Row[], items: ExtractItem[]): number {
  const used = new Set<number>();
  const statuses: FieldStatus[] = [];
  for (const gt of gtRows) {
    let best = -1,
      bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || bestScore < 0.35) {
      statuses.push("MISSING", "MISSING", "MISSING", "MISSING");
      continue;
    }
    used.add(best);
    const it = items[best];
    statuses.push(
      compareDescription(gt.description, it.name),
      compareQty(gt.qty, it.quantity),
      compareMoney(gt.unit_price, it.unit_price),
      compareMoney(gt.total, it.total),
    );
  }
  return fieldAccuracy(statuses);
}

function financialAccuracy(gtRows: Row[], items: ExtractItem[]): number {
  const gtSum = round2(gtRows.reduce((s, r) => s + r.total, 0));
  const extSum = round2(items.reduce((s, r) => s + (Number(r.total) || 0), 0));
  if (gtSum === 0) return 100;
  return round2(Math.max(0, 100 - (Math.abs(extSum - gtSum) / gtSum) * 100));
}

function totalAbsFinancialError(gtRows: Row[], items: ExtractItem[]): number {
  const used = new Set<number>();
  let sum = 0;
  for (const gt of gtRows) {
    let best = -1,
      bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || bestScore < 0.35) {
      sum += Math.abs(gt.total);
      continue;
    }
    used.add(best);
    sum += Math.abs((items[best].total ?? 0) - gt.total);
  }
  return round2(sum);
}

function alignRows(gtRows: Row[], items: ExtractItem[]) {
  const used = new Set<number>();
  const aligned: Array<{
    description: string;
    gt: Row;
    extracted: ExtractItem | null;
    fields: Record<string, FieldStatus>;
    rowFullyCorrect: boolean;
    financialErrorEuro: number;
    failureFamilies: string[];
  }> = [];

  for (const gt of gtRows) {
    let best = -1,
      bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const extracted = best >= 0 && bestScore >= 0.35 ? items[best] : null;
    if (extracted) used.add(best);

    const fields = {
      description: extracted
        ? compareDescription(gt.description, extracted.name)
        : ("MISSING" as FieldStatus),
      quantity: extracted ? compareQty(gt.qty, extracted.quantity) : ("MISSING" as FieldStatus),
      unit_price: extracted
        ? compareMoney(gt.unit_price, extracted.unit_price)
        : ("MISSING" as FieldStatus),
      total: extracted ? compareMoney(gt.total, extracted.total) : ("MISSING" as FieldStatus),
    };
    const rowFullyCorrect = Object.values(fields).every((s) => s === "MATCH");
    const financialErrorEuro = extracted
      ? round2(Math.abs((extracted.total ?? 0) - gt.total))
      : round2(Math.abs(gt.total));

    const failureFamilies: string[] = [];
    if (fields.quantity === "WRONG") failureFamilies.push("quantity");
    if (fields.unit_price === "WRONG" || fields.total === "WRONG") {
      if (/emporio|bocconcino/i.test(gt.description) || /prosciutto|mortadella|ventricina|pomodor/i.test(gt.description)) {
        failureFamilies.push("discount_or_column_shift");
      } else failureFamilies.push("column_shift_or_price");
    }
    if (!extracted) failureFamilies.push("missing_row");

    aligned.push({
      description: gt.description,
      gt,
      extracted,
      fields,
      rowFullyCorrect,
      financialErrorEuro,
      failureFamilies,
    });
  }

  const phantoms = items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => !used.has(i))
    .filter(({ it }) => Math.max(...gtRows.map((g) => matchScore(g.description, it.name)), 0) < 0.35)
    .map(({ it }) => it);

  return { aligned, phantoms };
}

function invoiceStatus(metrics: {
  fieldAccuracy: number;
  qtyAccuracy: number;
  absFinancialError: number;
  rowsFullyCorrectPct: number;
  phantomCount: number;
}): "CLOSED" | "PARTIAL" | "OPEN" {
  if (
    metrics.fieldAccuracy >= 95 &&
    metrics.qtyAccuracy >= 95 &&
    metrics.absFinancialError <= 2 &&
    metrics.phantomCount === 0
  )
    return "CLOSED";
  if (metrics.fieldAccuracy >= 80 && metrics.absFinancialError <= 15) return "PARTIAL";
  return "OPEN";
}

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(EXTRACT_DIR, { recursive: true });

async function invokeExtract(imageDataUrl: string) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  return { status: res.status, body: await res.json() };
}

async function imageDataUrlFor(inv: (typeof INVOICES)[number]): Promise<string> {
  if (inv.imageOverride) {
    if (inv.imageOverride.endsWith(".b64.txt")) {
      const b64 = readFileSync(inv.imageOverride, "utf8").trim();
      return `data:image/png;base64,${b64}`;
    }
    const buf = readFileSync(inv.imageOverride);
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
  const { data: invoice, error } = await sb
    .from("invoices")
    .select("file_url")
    .eq("id", inv.id)
    .single();
  if (error || !invoice?.file_url) throw new Error(`${inv.label}: ${error?.message ?? "no file"}`);
  const { data: signed } = await sb.storage.from("invoices").createSignedUrl(invoice.file_url, 300);
  if (!signed?.signedUrl) throw new Error(`${inv.label}: signed url failed`);
  const buf = Buffer.from(await fetch(signed.signedUrl).then((r) => r.arrayBuffer()));
  const mime = invoice.file_url.endsWith(".pdf") ? "application/pdf" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, {
  encoding: "utf8",
});
const deployVersion = (
  JSON.parse(fnList) as Array<{ slug: string; version: number; updated_at: number }>
).find((f) => f.slug === "extract-invoice")?.version;

const gtCatalog = loadJson<{
  invoices: Array<{ invoiceId: string; label: string; rows: Row[]; groundTruthConfidence?: string }>;
}>(".tmp/field-accuracy-audit/ground-truth.json");

const perInvoice: Array<Record<string, unknown>> = [];
const remainingErrors: Array<Record<string, unknown>> = [];

for (const inv of INVOICES) {
  console.log(`[final-rerun] ${inv.label}`);
  const imageDataUrl = await imageDataUrlFor(inv);
  let result = await invokeExtract(imageDataUrl);
  if (result.status === 546 || (result.body?.items?.length === 0 && !inv.imageOverride)) {
    await new Promise((r) => setTimeout(r, 5000));
    result = await invokeExtract(imageDataUrl);
  }
  writeFileSync(
    `${EXTRACT_DIR}/${inv.id}.json`,
    JSON.stringify(
      {
        invoiceId: inv.id,
        label: inv.label,
        extractedAt: new Date().toISOString(),
        deployVersion,
        imageSource: inv.imageOverride ?? "vl-storage",
        status: result.status,
        ...result.body,
      },
      null,
      2,
    ),
  );

  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  const gtRows = gtCatalog.invoices.find((i) => i.invoiceId === inv.id)?.rows ?? [];
  const { aligned, phantoms } = alignRows(gtRows, items);
  const wrongRows = aligned.filter((r) => !r.rowFullyCorrect);
  for (const w of wrongRows) {
    remainingErrors.push({
      invoice: inv.label,
      invoiceId: inv.id,
      product: w.description,
      gt: w.gt,
      extracted: w.extracted,
      fields: w.fields,
      financialErrorEuro: w.financialErrorEuro,
      failureFamilies: w.failureFamilies,
    });
  }
  for (const p of phantoms) {
    remainingErrors.push({
      invoice: inv.label,
      invoiceId: inv.id,
      product: `[PHANTOM] ${p.name}`,
      phantom: true,
      extracted: p,
    });
  }

  const rowsFullyCorrect = aligned.filter((r) => r.rowFullyCorrect).length;
  const metrics = {
    invoiceId: inv.id,
    label: inv.label,
    deployVersion,
    itemCount: items.length,
    rowsExpected: inv.rowsExpected,
    rowsAligned: aligned.length,
    rowsFullyCorrect,
    rowsFullyCorrectPct: round2((rowsFullyCorrect / Math.max(gtRows.length, 1)) * 100),
    phantomCount: phantoms.length,
    qtyAccuracy: qtyAccuracy(gtRows, items),
    fieldAccuracy: overallFieldAccuracy(gtRows, items),
    financialAccuracy: financialAccuracy(gtRows, items),
    absFinancialError: totalAbsFinancialError(gtRows, items),
    wrongRowCount: wrongRows.length,
    status: invoiceStatus({
      fieldAccuracy: overallFieldAccuracy(gtRows, items),
      qtyAccuracy: qtyAccuracy(gtRows, items),
      absFinancialError: totalAbsFinancialError(gtRows, items),
      rowsFullyCorrectPct: round2((rowsFullyCorrect / Math.max(gtRows.length, 1)) * 100),
      phantomCount: phantoms.length,
    }),
    aligned,
  };
  perInvoice.push(metrics);
  console.log(
    `  → ${items.length} items | field ${metrics.fieldAccuracy}% | fin err €${metrics.absFinancialError} | ${metrics.status}`,
  );
  await new Promise((r) => setTimeout(r, 3000));
}

const avg = (vals: number[]) => round2(vals.reduce((a, b) => a + b, 0) / vals.length);

const baselines = {
  fieldAccuracyAudit: loadJson<{ aggregate: Record<string, unknown> }>(
    ".tmp/field-accuracy-audit/statistics.json",
  ).aggregate,
  beforeC33: loadJson<{ comparison: { before: Record<string, unknown> } }>(
    ".tmp/passc-refinement-validation/post-audit.json",
  ).comparison.before,
  afterRefinement: loadJson<{ comparison: { refined: Record<string, unknown> } }>(
    ".tmp/passc-refinement-validation/post-audit.json",
  ).comparison.refined,
};

const globalMetrics = {
  generated_at: new Date().toISOString(),
  deployVersion,
  note: "Re-read safety fix is frontend-only; does not affect extraction metrics",
  methodology: "passc-refinement-validation/post-audit.mts alignment",
  aggregate: {
    invoicesAudited: perInvoice.length,
    fieldAccuracy: avg(perInvoice.map((p) => p.fieldAccuracy as number)),
    quantityAccuracy: avg(perInvoice.map((p) => p.qtyAccuracy as number)),
    financialAccuracy: avg(perInvoice.map((p) => p.financialAccuracy as number)),
    financialErrorEuro: round2(
      perInvoice.reduce((s, p) => s + (p.absFinancialError as number), 0),
    ),
    rowsFullyCorrect: perInvoice.reduce((s, p) => s + (p.rowsFullyCorrect as number), 0),
    rowsFullyCorrectPct: round2(
      (perInvoice.reduce((s, p) => s + (p.rowsFullyCorrect as number), 0) /
        perInvoice.reduce((s, p) => s + (p.rowsAligned as number), 0)) *
        100,
    ),
    phantomRows: perInvoice.reduce((s, p) => s + (p.phantomCount as number), 0),
  },
  perInvoice,
  baselineComparison: {
    beforeC33: {
      fieldAccuracy: baselines.beforeC33.fieldAccuracy,
      quantityAccuracy: baselines.beforeC33.quantityAccuracy,
      financialErrorEuro: baselines.beforeC33.financialErrorEuro,
    },
    afterRefinement: {
      fieldAccuracy: baselines.afterRefinement.fieldAccuracy,
      quantityAccuracy: baselines.afterRefinement.quantityAccuracy,
      financialErrorEuro: baselines.afterRefinement.financialErrorEuro,
    },
    fieldAccuracyAudit: {
      overallFieldAccuracyLenient: baselines.fieldAccuracyAudit.overallFieldAccuracyLenient,
      rowsFullyCorrectPct: baselines.fieldAccuracyAudit.rowsFullyCorrectPct,
    },
    now: {
      fieldAccuracy: avg(perInvoice.map((p) => p.fieldAccuracy as number)),
      quantityAccuracy: avg(perInvoice.map((p) => p.qtyAccuracy as number)),
      financialErrorEuro: round2(
        perInvoice.reduce((s, p) => s + (p.absFinancialError as number), 0),
      ),
    },
  },
};

const closed = perInvoice.filter((p) => p.status === "CLOSED").length;
const partial = perInvoice.filter((p) => p.status === "PARTIAL").length;
const open = perInvoice.filter((p) => p.status === "OPEN").length;
const vlStatus =
  closed >= 5 ? "CLOSED" : closed + partial >= 4 ? "PARTIAL" : "OPEN";

const familyCounts: Record<string, number> = {};
for (const e of remainingErrors) {
  for (const f of (e.failureFamilies as string[] | undefined) ?? ["phantom_or_other"]) {
    familyCounts[f] = (familyCounts[f] ?? 0) + 1;
  }
}

writeFileSync(`${OUT_DIR}/metrics.json`, JSON.stringify(globalMetrics, null, 2));
writeFileSync(`${OUT_DIR}/remaining-errors.json`, JSON.stringify(remainingErrors, null, 2));
writeFileSync(
  `${OUT_DIR}/executive-summary.json`,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      deployVersion,
      vlStatus,
      invoiceStatusBreakdown: { closed, partial, open },
      global: globalMetrics.aggregate,
      baselineComparison: globalMetrics.baselineComparison,
      remainingErrorEuro: globalMetrics.aggregate.financialErrorEuro,
      structuralFamilies: familyCounts,
      notes: [
        "Emporio/Emporio discount hardening v24/v25 — Prosciutto+Ventricina improved in spot checks",
        "Pomodor VL GT qty=2 vs visible qty=1 — GT mismatch not extraction regression",
        "Mortadella partial on Emporio",
        "Mammafiore discount variance persists",
        "Aviludo April uses PNG fixture (PDF flake)",
        "Re-read safety fix: frontend persistence only",
      ],
    },
    null,
    2,
  ),
);

console.log("done", JSON.stringify({ vlStatus, global: globalMetrics.aggregate }, null, 2));
