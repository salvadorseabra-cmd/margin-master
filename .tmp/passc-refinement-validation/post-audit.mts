/**
 * Three-way audit: before c33a7f1 / after c33a7f1 / after refinement.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Row = { description: string; qty: number; unit: string; unit_price: number; total: number };
type ExtractItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
};
type FieldStatus = "MATCH" | "MINOR_VARIATION" | "WRONG" | "MISSING";

const OUT = ".tmp/passc-refinement-validation";

const INVOICE_META: Record<string, { label: string; rowsExpected: number }> = {
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e": { label: "Bidfood", rowsExpected: 11 },
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2": { label: "Aviludo May", rowsExpected: 8 },
  "c2f52357-0f80-491a-ba14-c97ff4837472": { label: "Aviludo April", rowsExpected: 9 },
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb": { label: "Emporio", rowsExpected: 8 },
  "f0aa5a08-86a3-4938-99f0-711e86073968": { label: "Bocconcino", rowsExpected: 7 },
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d": { label: "Mammafiore", rowsExpected: 8 },
};

const BEFORE_PATHS: Record<string, string> = {
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e":
    ".tmp/hallucination-audit/extract-da472b7f-0fd9-4a26-a37c-80ad335f7f7e.json",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2":
    ".tmp/hallucination-audit/extract-3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2.json",
  "c2f52357-0f80-491a-ba14-c97ff4837472":
    ".tmp/hallucination-audit/extract-c2f52357-0f80-491a-ba14-c97ff4837472.json",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb":
    ".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json",
  "f0aa5a08-86a3-4938-99f0-711e86073968":
    ".tmp/persistence-audit/pass-c-raw/f0aa5a08-86a3-4938-99f0-711e86073968-extract-invoice.json",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d":
    ".tmp/persistence-audit/pass-c-raw/36c99d19-6f9f-413f-8c2d-ae3526291a2d-extract-invoice.json",
};

const C33_PATH = ".tmp/passc-implementation/reextract";
const REFINED_PATH = `${OUT}/reextract`;

const round2 = (n: number) => Math.round(n * 100) / 100;
const loadJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

function loadItems(path: string): ExtractItem[] {
  if (!existsSync(path)) return [];
  const data = loadJson<{ items?: ExtractItem[]; body?: { items?: ExtractItem[] } }>(path);
  return data.items ?? data.body?.items ?? [];
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
  return round2((countable.filter((s) => s === "MATCH" || s === "MINOR_VARIATION").length / countable.length) * 100);
}

function qtyAccuracy(gtRows: Row[], items: ExtractItem[]): number {
  const used = new Set<number>();
  const statuses: FieldStatus[] = [];
  for (const gt of gtRows) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0 || bestScore < 0.35) { statuses.push("MISSING"); continue; }
    used.add(best);
    statuses.push(compareQty(gt.qty, items[best].quantity));
  }
  return fieldAccuracy(statuses);
}

function overallFieldAccuracy(gtRows: Row[], items: ExtractItem[]): number {
  const used = new Set<number>();
  const statuses: FieldStatus[] = [];
  for (const gt of gtRows) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) { bestScore = score; best = i; }
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
    let best = -1, bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0 || bestScore < 0.35) { sum += Math.abs(gt.total); continue; }
    used.add(best);
    sum += Math.abs((items[best].total ?? 0) - gt.total);
  }
  return round2(sum);
}

function hallucinationRate(rowsExpected: number, items: ExtractItem[], gtRows: Row[]): number {
  const phantoms = items.filter((it) => Math.max(...gtRows.map((g) => matchScore(g.description, it.name)), 0) < 0.35).length;
  return round2((phantoms / Math.max(items.length, 1)) * 100);
}

function auditStage(label: string, pathFn: (id: string) => string) {
  const gtCatalog = loadJson<{ invoices: Array<{ invoiceId: string; rows: Row[] }> }>(
    ".tmp/field-accuracy-audit/ground-truth.json",
  );
  const perInvoice: Record<string, unknown>[] = [];
  for (const [id, meta] of Object.entries(INVOICE_META)) {
    const gtRows = gtCatalog.invoices.find((i) => i.invoiceId === id)?.rows ?? [];
    const items = loadItems(pathFn(id));
    perInvoice.push({
      invoiceId: id,
      label: meta.label,
      itemCount: items.length,
      qtyAccuracy: qtyAccuracy(gtRows, items),
      fieldAccuracy: overallFieldAccuracy(gtRows, items),
      financialAccuracy: financialAccuracy(gtRows, items),
      absFinancialError: totalAbsFinancialError(gtRows, items),
      hallucinationRate: hallucinationRate(meta.rowsExpected, items, gtRows),
    });
  }
  const avg = (vals: number[]) => round2(vals.reduce((a, b) => a + b, 0) / vals.length);
  return {
    stage: label,
    fieldAccuracy: avg(perInvoice.map((p) => (p as { fieldAccuracy: number }).fieldAccuracy)),
    quantityAccuracy: avg(perInvoice.map((p) => (p as { qtyAccuracy: number }).qtyAccuracy)),
    financialAccuracy: avg(perInvoice.map((p) => (p as { financialAccuracy: number }).financialAccuracy)),
    financialErrorEuro: round2(perInvoice.reduce((s, p) => s + (p as { absFinancialError: number }).absFinancialError, 0)),
    hallucinationRate: avg(perInvoice.map((p) => (p as { hallucinationRate: number }).hallucinationRate)),
    perInvoice,
  };
}

function rowDetails(pathFn: (id: string) => string) {
  const gtCatalog = loadJson<{ invoices: Array<{ invoiceId: string; rows: Row[] }> }>(
    ".tmp/field-accuracy-audit/ground-truth.json",
  );
  const fixed: unknown[] = [];
  const wrong: unknown[] = [];
  const targets = [
    { invoice: "Bidfood", pattern: /hortel/i, field: "quantity", expected: 0.5 },
    { invoice: "Aviludo May", pattern: /acucar|açucar/i, field: "quantity", expected: 1 },
    { invoice: "Aviludo May", pattern: /acucar|açucar/i, field: "total", expected: 9.99 },
    { invoice: "Emporio", pattern: /ginger/i, field: "quantity", expected: 2 },
    { invoice: "Mammafiore", pattern: /aceto/i, field: "total", expected: 16.09 },
  ];

  for (const [id, meta] of Object.entries(INVOICE_META)) {
    const gtRows = gtCatalog.invoices.find((i) => i.invoiceId === id)?.rows ?? [];
    const items = loadItems(pathFn(id));
    const used = new Set<number>();
    for (const gt of gtRows) {
      let best = -1, bestScore = 0;
      for (let i = 0; i < items.length; i++) {
        if (used.has(i)) continue;
        const score = matchScore(gt.description, items[i].name);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best < 0 || bestScore < 0.35) continue;
      used.add(best);
      const it = items[best];
      const qtyOk = compareQty(gt.qty, it.quantity) !== "WRONG";
      const totalOk = compareMoney(gt.total, it.total) !== "WRONG";
      const row = {
        invoice: meta.label,
        product: gt.description,
        gt: { qty: gt.qty, total: gt.total },
        extracted: { qty: it.quantity, total: it.total },
        qtyOk,
        totalOk,
      };
      if (qtyOk && totalOk) fixed.push(row);
      else wrong.push(row);
    }
    const phantoms = items.filter((it) => Math.max(...gtRows.map((g) => matchScore(g.description, it.name)), 0) < 0.35);
    for (const p of phantoms) {
      wrong.push({ invoice: meta.label, product: `[PHANTOM] ${p.name}`, phantom: true });
    }
  }

  const targetResults = targets.map((t) => {
    const inv = Object.entries(INVOICE_META).find(([, m]) => m.label === t.invoice);
    if (!inv) return { ...t, pass: false };
    const items = loadItems(pathFn(inv[0]));
    const item = items.find((i) => t.pattern.test(i.name ?? ""));
    const val = t.field === "quantity" ? item?.quantity : item?.total;
    const pass = val != null && (t.field === "quantity" ? numClose(t.expected, val, 0.05, 0.02) : numClose(t.expected, val, 0.1, 0.02));
    return { ...t, actual: val, pass };
  });

  return { fixed, wrong, targetResults };
}

mkdirSync(OUT, { recursive: true });

const before = auditStage("before c33a7f1", (id) => BEFORE_PATHS[id]);
const c33 = auditStage("after c33a7f1", (id) => `${C33_PATH}/${id}.json`);
const refined = auditStage("after refinement", (id) => `${REFINED_PATH}/${id}.json`);
const refinedRows = rowDetails((id) => `${REFINED_PATH}/${id}.json`);

const output = {
  generated_at: new Date().toISOString(),
  comparison: { before, c33, refined },
  targets: refinedRows.targetResults,
  fixedRows: refinedRows.fixed.filter((r) => {
    const row = r as { invoice: string; product: string };
    return /hortel|acucar|açucar|ginger|aceto/i.test(row.product);
  }),
  remainingWrongRows: refinedRows.wrong,
};

writeFileSync(`${OUT}/post-audit.json`, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  before: { field: before.fieldAccuracy, qty: before.quantityAccuracy, finErr: before.financialErrorEuro, hall: before.hallucinationRate },
  c33: { field: c33.fieldAccuracy, qty: c33.quantityAccuracy, finErr: c33.financialErrorEuro, hall: c33.hallucinationRate },
  refined: { field: refined.fieldAccuracy, qty: refined.quantityAccuracy, finErr: refined.financialErrorEuro, hall: refined.hallucinationRate },
  targets: refinedRows.targetResults,
}, null, 2));
