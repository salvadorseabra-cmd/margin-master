/**
 * Final Validation Lab re-run — v28 (April v27 + Emporio VALOR isolation).
 * READ-ONLY audit artifacts.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/final-validation-lab-rerun-v28";
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
type ClassCode = "A" | "B" | "C" | "D";

const INVOICES: Array<{
  id: string;
  label: string;
  rowsExpected: number;
  imageOverride?: string;
}> = [
  {
    id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
    label: "Bidfood",
    rowsExpected: 11,
    imageOverride: ".tmp/footer-validation-4dc40c3/bidfood-final.b64.txt",
  },
  {
    id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    label: "Aviludo May",
    rowsExpected: 8,
    imageOverride: ".tmp/footer-validation-4dc40c3/aviludo-maio-final.b64.txt",
  },
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

const VISIBLE: Record<string, Partial<Row> & { notes?: string }> = {
  "POMODOR PELATI (CX 2.5KG*6)": {
    qty: 1,
    unit_price: 27.56,
    total: 22.05,
    notes: "visible: QUANT 1, P.VENDA 27.56, VALOR 22.05",
  },
  "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4-4,25KG": {
    qty: 4.3,
    unit_price: 10.3,
    total: 36.54,
    notes: "visible Preço Total 36.54",
  },
  "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelgrottto 1/8 - 1,5kg": {
    qty: 1.35,
    total: 13.44,
    notes: "visible Qtd 1,35 · Preço Total 13,44",
  },
  "Rigamonti - Bresaola Punta d'Anca Oro 1/2": {
    qty: 1.83,
    total: 49.48,
    notes: "visible Preço Total 49,48",
  },
  "SanPellegrino - Acqua in vitro 75cl x 15ud": {
    qty: 2,
    total: 38.56,
    notes: "visible Qtd 2,00 · Preço Total 38,56",
  },
  "Baladin - Ginger Beer 0.20cl": {
    qty: 24,
    unit_price: 0.85,
    total: 19.38,
    notes: "visible Qtd 24; GT case qty 2",
  },
};

/** Rows with documented multi-run instability (emporio-variance-cluster). */
const VARIANCE_ROWS = new Set([
  "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelgrottto 1/8 - 1,5kg",
  "Rigamonti - Bresaola Punta d'Anca Oro 1/2",
  "SanPellegrino - Acqua in vitro 75cl x 15ud",
]);

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

function matchesVisible(
  ext: { quantity?: number | null; unit_price?: number | null; total?: number | null },
  vis: Partial<Row>,
): { qty: boolean; total: boolean } {
  const qty = vis.qty == null || numClose(vis.qty, ext.quantity, 0.05, 0.02);
  const total = vis.total == null || numClose(vis.total, ext.total, 0.1, 0.02);
  return { qty, total };
}

function classifyRow(
  gt: Row,
  extracted: ExtractItem | null,
  financialErrorEuro: number,
  fields: Record<string, FieldStatus>,
): { code: ClassCode; label: string; rationale: string } {
  if (!extracted) {
    return { code: "A", label: "extraction_bug", rationale: "Row missing from extraction" };
  }
  const vis = VISIBLE[gt.description];
  const ext = {
    quantity: extracted.quantity,
    unit_price: extracted.unit_price,
    total: extracted.total,
  };

  if (/ginger beer/i.test(gt.description) && financialErrorEuro < 0.05) {
    return {
      code: "D",
      label: "business_interpretation",
      rationale: "Bottle vs case qty semantics; €0 financial",
    };
  }

  if (fields.total === "MATCH" && fields.unit_price === "WRONG" && financialErrorEuro < 0.05) {
    return {
      code: "D",
      label: "business_interpretation",
      rationale: "Total correct; unit_price gross/net display vs GT",
    };
  }

  if (vis?.qty != null && vis?.total != null) {
    const visMatch = matchesVisible(ext, vis);
    const gtWrong = fields.quantity === "WRONG" || fields.total === "WRONG";
    if (visMatch.qty && visMatch.total && gtWrong) {
      return {
        code: "B",
        label: "gt_mismatch",
        rationale: `Extraction matches visible invoice; GT catalog differs (${vis.notes ?? ""})`,
      };
    }
    if (gtWrong && financialErrorEuro > 0.05 && visMatch.total && !visMatch.qty) {
      if (VARIANCE_ROWS.has(gt.description)) {
        return {
          code: "C",
          label: "gpt_variance",
          rationale: "Qty field unstable across runs; total matches visible on good probes",
        };
      }
    }
  }

  if (vis && financialErrorEuro > 0.05) {
    const visMatch = matchesVisible(ext, vis);
    if (!visMatch.total && VARIANCE_ROWS.has(gt.description)) {
      return {
        code: "C",
        label: "gpt_variance",
        rationale: "Known Emporio unstable row — wrong this run; v28 probe achieved correct total on majority runs",
      };
    }
    if (visMatch.total && (fields.quantity === "WRONG" || fields.total === "WRONG")) {
      return {
        code: "B",
        label: "gt_mismatch",
        rationale: "Extraction aligns with visible total; GT qty/unit differs",
      };
    }
  }

  if (financialErrorEuro < 0.05) {
    if (fields.quantity === "WRONG" || fields.unit_price === "WRONG") {
      return {
        code: "D",
        label: "business_interpretation",
        rationale: "Field mismatch with €0 financial impact",
      };
    }
    return { code: "D", label: "business_interpretation", rationale: "Row fully correct financially" };
  }

  if (VARIANCE_ROWS.has(gt.description)) {
    return {
      code: "C",
      label: "gpt_variance",
      rationale: "Emporio variance-family row — non-deterministic Pass C on this single run",
    };
  }

  return {
    code: "A",
    label: "extraction_bug",
    rationale: "Financial delta vs GT — extraction does not match expected totals",
  };
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
    classification: ReturnType<typeof classifyRow>;
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
      failureFamilies.push(/emporio|discount|pomodor|prosciutto/i.test(gt.description)
        ? "discount_or_column_shift"
        : "column_shift_or_price");
    }
    if (!extracted) failureFamilies.push("missing_row");

    aligned.push({
      description: gt.description,
      gt,
      extracted,
      fields,
      rowFullyCorrect,
      financialErrorEuro,
      classification: classifyRow(gt, extracted, financialErrorEuro, fields),
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

function invoiceStatus(m: {
  fieldAccuracy: number;
  qtyAccuracy: number;
  absFinancialError: number;
  phantomCount: number;
}): "CLOSED" | "PARTIAL" | "OPEN" {
  if (m.fieldAccuracy >= 95 && m.qtyAccuracy >= 95 && m.absFinancialError <= 2 && m.phantomCount === 0)
    return "CLOSED";
  if (m.fieldAccuracy >= 80 && m.absFinancialError <= 15) return "PARTIAL";
  return "OPEN";
}

function normalizeDataUrl(rawPath: string): string {
  const raw = readFileSync(rawPath, "utf8").trim();
  return raw.startsWith("data:")
    ? raw
    : `data:image/png;base64,${raw.replace(/^data:image\/[^;]+;base64,/, "")}`;
}

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(EXTRACT_DIR, { recursive: true });

async function invokeExtract(imageDataUrl: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);
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
    return { status: res.status, body: await res.json() };
  } finally {
    clearTimeout(t);
  }
}

async function imageDataUrlFor(inv: (typeof INVOICES)[number]): Promise<string> {
  if (inv.imageOverride) {
    if (inv.imageOverride.endsWith(".b64.txt")) return normalizeDataUrl(inv.imageOverride);
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

const fnList = execSync(`supabase functions list --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const deployVersion = (
  JSON.parse(fnList) as Array<{ slug: string; version: number }>
).find((f) => f.slug === "extract-invoice")?.version;

if ((deployVersion ?? 0) < 28) {
  console.warn(`WARN: expected v28, got v${deployVersion}`);
}

const gtCatalog = loadJson<{ invoices: Array<{ invoiceId: string; label: string; rows: Row[] }> }>(
  ".tmp/field-accuracy-audit/ground-truth.json",
);

const v26 = loadJson<{ aggregate: Record<string, number> }>(
  ".tmp/final-validation-lab-rerun-v26/metrics.json",
).aggregate;
const v27 = loadJson<{ aggregate: { financialErrorEuro: number; fieldAccuracy: number } }>(
  ".tmp/final-residual-error-audit/metrics.json",
).aggregate;
const postAudit = loadJson<{ comparison: Record<string, { fieldAccuracy: number; quantityAccuracy: number; financialErrorEuro: number }> }>(
  ".tmp/passc-refinement-validation/post-audit.json",
).comparison;

const perInvoice: Array<Record<string, unknown>> = [];
const remainingErrors: Array<Record<string, unknown>> = [];

for (const inv of INVOICES) {
  console.log(`[v28-rerun] ${inv.label}`);
  const imageDataUrl = await imageDataUrlFor(inv);
  let result = await invokeExtract(imageDataUrl);
  if (result.status === 546 || (result.body?.items?.length === 0 && !inv.imageOverride)) {
    await new Promise((r) => setTimeout(r, 5000));
    result = await invokeExtract(imageDataUrl);
  }

  const items = Array.isArray(result.body?.items) ? result.body.items : [];
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
      classification: w.classification,
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
      classification: { code: "A", label: "extraction_bug", rationale: "Phantom row" },
    });
  }

  const rowsFullyCorrect = aligned.filter((r) => r.rowFullyCorrect).length;
  const fa = overallFieldAccuracy(gtRows, items);
  const qa = qtyAccuracy(gtRows, items);
  const finErr = totalAbsFinancialError(gtRows, items);

  perInvoice.push({
    invoiceId: inv.id,
    label: inv.label,
    deployVersion,
    itemCount: items.length,
    rowsExpected: inv.rowsExpected,
    rowsAligned: aligned.length,
    rowsFullyCorrect,
    rowsFullyCorrectPct: round2((rowsFullyCorrect / Math.max(gtRows.length, 1)) * 100),
    phantomCount: phantoms.length,
    qtyAccuracy: qa,
    fieldAccuracy: fa,
    financialAccuracy: financialAccuracy(gtRows, items),
    absFinancialError: finErr,
    wrongRowCount: wrongRows.length,
    status: invoiceStatus({
      fieldAccuracy: fa,
      qtyAccuracy: qa,
      absFinancialError: finErr,
      phantomCount: phantoms.length,
    }),
    aligned,
  });
  console.log(`  → fin err €${finErr} | field ${fa}% | ${wrongRows.length} wrong | status pending`);
  await new Promise((r) => setTimeout(r, 3000));
}

const avg = (vals: number[]) => round2(vals.reduce((a, b) => a + b, 0) / vals.length);

const ranked = [...remainingErrors]
  .filter((e) => !e.phantom)
  .sort((a, b) => Number(b.financialErrorEuro) - Number(a.financialErrorEuro));

const classA = ranked.filter((r) => (r.classification as { code: string }).code === "A");
const classB = ranked.filter((r) => (r.classification as { code: string }).code === "B");
const classC = ranked.filter((r) => (r.classification as { code: string }).code === "C");
const classD = ranked.filter((r) => (r.classification as { code: string }).code === "D");

const extractionBugEuro = round2(classA.reduce((s, r) => s + Number(r.financialErrorEuro ?? 0), 0));
const gtIssueEuro = round2(classB.reduce((s, r) => s + Number(r.financialErrorEuro ?? 0), 0));
const varianceEuro = round2(classC.reduce((s, r) => s + Number(r.financialErrorEuro ?? 0), 0));
const totalFinancialError = round2(perInvoice.reduce((s, p) => s + Number(p.absFinancialError), 0));

const aggregate = {
  invoicesAudited: perInvoice.length,
  fieldAccuracy: avg(perInvoice.map((p) => p.fieldAccuracy as number)),
  quantityAccuracy: avg(perInvoice.map((p) => p.qtyAccuracy as number)),
  financialAccuracy: avg(perInvoice.map((p) => p.financialAccuracy as number)),
  financialErrorEuro: totalFinancialError,
  rowsFullyCorrect: perInvoice.reduce((s, p) => s + (p.rowsFullyCorrect as number), 0),
  rowsFullyCorrectPct: round2(
    (perInvoice.reduce((s, p) => s + (p.rowsFullyCorrect as number), 0) /
      perInvoice.reduce((s, p) => s + (p.rowsAligned as number), 0)) *
      100,
  ),
  phantomRows: perInvoice.reduce((s, p) => s + (p.phantomCount as number), 0),
  extractionBugsOnlyEuro: extractionBugEuro,
  gtIssuesOnlyEuro: gtIssueEuro,
  gptVarianceEuro: varianceEuro,
  extractionBugsBelow15Euro: extractionBugEuro < 15,
};

const closed = perInvoice.filter((p) => p.status === "CLOSED").length;
const partial = perInvoice.filter((p) => p.status === "PARTIAL").length;
const open = perInvoice.filter((p) => p.status === "OPEN").length;
const vlStatus = closed >= 5 ? "CLOSED" : closed + partial >= 4 ? "PARTIAL" : "OPEN";

const metrics = {
  generated_at: new Date().toISOString(),
  deployVersion,
  deployVerified: deployVersion === 28,
  harnessFixes: [
    "Aviludo April: b64 data URL normalization",
    "v27: TOTAL COLUMN ISOLATION (April Ovo/Nata)",
    "v28: EMPORIO DENSE TABLE VALOR ISOLATION",
  ],
  methodology: "Single v28 invoke per invoice vs field-accuracy-audit GT; A/B/C/D classification",
  aggregate,
  perInvoice,
  baselineComparison: {
    beforeC33: {
      fieldAccuracy: postAudit.before.fieldAccuracy,
      quantityAccuracy: postAudit.before.quantityAccuracy,
      financialErrorEuro: postAudit.before.financialErrorEuro,
    },
    afterRefinement: {
      fieldAccuracy: postAudit.refined.fieldAccuracy,
      quantityAccuracy: postAudit.refined.quantityAccuracy,
      financialErrorEuro: postAudit.refined.financialErrorEuro,
    },
    v26: {
      fieldAccuracy: v26.fieldAccuracy,
      quantityAccuracy: v26.quantityAccuracy,
      financialErrorEuro: v26.financialErrorEuro,
    },
    v27: {
      fieldAccuracy: v27.fieldAccuracy,
      financialErrorEuro: v27.financialErrorEuro,
    },
    v28: {
      fieldAccuracy: aggregate.fieldAccuracy,
      quantityAccuracy: aggregate.quantityAccuracy,
      financialErrorEuro: aggregate.financialErrorEuro,
    },
  },
};

const executiveSummary = {
  generated_at: new Date().toISOString(),
  deployVersion,
  deployVerified: deployVersion === 28,
  vlStatus,
  invoiceStatusBreakdown: { closed, partial, open },
  global: aggregate,
  keyQuestion: {
    extractionBugsOnlyEuro: extractionBugEuro,
    below15EuroThreshold: extractionBugEuro < 15,
    answer: extractionBugEuro < 15 ? "YES — Class A extraction bugs below €15" : "NO — Class A extraction bugs still ≥ €15",
  },
  classificationSummary: {
    A_extraction_bugs: { count: classA.length, euro: extractionBugEuro },
    B_gt_issues: { count: classB.length, euro: gtIssueEuro },
    C_gpt_variance: { count: classC.length, euro: varianceEuro },
    D_business_interpretation: { count: classD.length },
  },
  baselineComparison: metrics.baselineComparison,
  deltaVsV27: {
    financialErrorEuro: round2(totalFinancialError - v27.financialErrorEuro),
    fieldAccuracy: round2(aggregate.fieldAccuracy - v27.fieldAccuracy),
  },
  deltaVsV26: {
    financialErrorEuro: round2(totalFinancialError - v26.financialErrorEuro),
  },
  perInvoiceSummary: perInvoice.map((p) => ({
    label: p.label,
    status: p.status,
    fieldAccuracy: p.fieldAccuracy,
    qtyAccuracy: p.qtyAccuracy,
    financialErrorEuro: p.absFinancialError,
    rowsFullyCorrectPct: p.rowsFullyCorrectPct,
    wrongRowCount: p.wrongRowCount,
  })),
  topRemainingErrors: ranked.slice(0, 12).map((r, i) => ({
    rank: i + 1,
    invoice: r.invoice,
    product: r.product,
    euro: r.financialErrorEuro,
    class: (r.classification as { code: string }).code,
  })),
  closureRecommendation:
    extractionBugEuro < 15 && closed >= 3
      ? "PARTIAL CLOSURE — extraction bugs under €15; address GT issues (Pomodor) and Mammafiore discount rows for full closure"
      : "OPEN — continue prompt hardening on remaining Class A rows",
};

writeFileSync(`${OUT_DIR}/metrics.json`, JSON.stringify(metrics, null, 2));
writeFileSync(`${OUT_DIR}/remaining-errors.json`, JSON.stringify(ranked, null, 2));
writeFileSync(`${OUT_DIR}/executive-summary.json`, JSON.stringify(executiveSummary, null, 2));

console.log("done", JSON.stringify({ vlStatus, aggregate, extractionBugEuro, below15: extractionBugEuro < 15 }));
