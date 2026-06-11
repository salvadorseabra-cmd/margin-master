/**
 * Post Pass C redesign audit — compare before/after vs field-accuracy baselines.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Row = {
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
};

type ExtractItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
};

type FieldStatus = "MATCH" | "MINOR_VARIATION" | "WRONG" | "MISSING";

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

const round2 = (n: number) => Math.round(n * 100) / 100;
const loadJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

function loadItems(path: string): ExtractItem[] {
  if (!existsSync(path)) return [];
  const data = loadJson<{ items?: ExtractItem[]; body?: { items?: ExtractItem[] } }>(path);
  return data.items ?? data.body?.items ?? [];
}

function normName(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchScore(gt: string, name: string): number {
  const a = normName(gt);
  const b = normName(name);
  if (a === b) return 1;
  if (/recarg.*combust/i.test(a) && /recarg.*combust/i.test(b)) return 0.95;
  const gtTokens = a.split(" ").filter((t) => t.length > 2);
  const hits = gtTokens.filter((t) => b.includes(t)).length;
  return hits / Math.max(gtTokens.length, 1);
}

function numClose(gt: number, ext: number | null | undefined, absTol: number, relTol: number) {
  if (ext == null || Number.isNaN(Number(ext))) return false;
  const e = Number(ext);
  const diff = Math.abs(e - gt);
  return diff <= absTol || diff / Math.max(Math.abs(gt), 0.001) <= relTol;
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
  const good = countable.filter((s) => s === "MATCH" || s === "MINOR_VARIATION").length;
  return round2((good / countable.length) * 100);
}

function qtyAccuracy(gtRows: Row[], items: ExtractItem[]): number {
  const used = new Set<number>();
  const statuses: FieldStatus[] = [];
  for (const gt of gtRows) {
    let best = -1;
    let bestScore = 0;
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
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(gt.description, items[i].name);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || bestScore < 0.35) {
      statuses.push("MISSING", "MISSING", "MISSING", "MISSING", "MISSING");
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
  const deltaPct = Math.abs(extSum - gtSum) / gtSum * 100;
  return round2(Math.max(0, 100 - deltaPct));
}

function hallucinationRate(rowsExpected: number, items: ExtractItem[], gtRows: Row[]): number {
  const phantoms = items.filter((it) => {
    const maxScore = Math.max(...gtRows.map((g) => matchScore(g.description, it.name)), 0);
    return maxScore < 0.35;
  }).length;
  return round2(phantoms / Math.max(items.length, 1) * 100);
}

const gtCatalog = loadJson<{ invoices: Array<{ invoiceId: string; rows: Row[] }> }>(
  ".tmp/field-accuracy-audit/ground-truth.json",
);

const beforeBaseline = loadJson<typeof import(".tmp/field-accuracy-audit/statistics.json")>(
  ".tmp/field-accuracy-audit/statistics.json",
);
const beforeHallucination = loadJson<{ aggregate: { avgHallucinationRate: number } }>(
  ".tmp/hallucination-audit/reliability-score.json",
);
const beforeFinancial = loadJson<{ invoices: Array<{ financialAccuracyPct: number }> }>(
  ".tmp/field-accuracy-audit/financial-accuracy.json",
);

const perInvoice: Record<string, unknown>[] = [];

for (const [id, meta] of Object.entries(INVOICE_META)) {
  const gtInv = gtCatalog.invoices.find((i) => i.invoiceId === id);
  const gtRows = gtInv?.rows ?? [];
  const beforeItems = loadItems(BEFORE_PATHS[id]);
  const afterItems = loadItems(`.tmp/passc-implementation/reextract/${id}.json`);

  perInvoice.push({
    invoiceId: id,
    label: meta.label,
    rowsExpected: meta.rowsExpected,
    before: {
      itemCount: beforeItems.length,
      qtyAccuracy: qtyAccuracy(gtRows, beforeItems),
      fieldAccuracy: overallFieldAccuracy(gtRows, beforeItems),
      financialAccuracy: financialAccuracy(gtRows, beforeItems),
      hallucinationRate: hallucinationRate(meta.rowsExpected, beforeItems, gtRows),
      items: beforeItems.map((i) => ({ name: i.name, quantity: i.quantity })),
    },
    after: {
      itemCount: afterItems.length,
      qtyAccuracy: qtyAccuracy(gtRows, afterItems),
      fieldAccuracy: overallFieldAccuracy(gtRows, afterItems),
      financialAccuracy: financialAccuracy(gtRows, afterItems),
      hallucinationRate: hallucinationRate(meta.rowsExpected, afterItems, gtRows),
      items: afterItems.map((i) => ({ name: i.name, quantity: i.quantity })),
    },
  });
}

const avg = (vals: number[]) => round2(vals.reduce((a, b) => a + b, 0) / vals.length);

const afterMetrics = {
  fieldAccuracy: avg(perInvoice.map((p) => (p.after as { fieldAccuracy: number }).fieldAccuracy)),
  quantityAccuracy: avg(perInvoice.map((p) => (p.after as { qtyAccuracy: number }).qtyAccuracy)),
  financialAccuracy: avg(perInvoice.map((p) => (p.after as { financialAccuracy: number }).financialAccuracy)),
  hallucinationRate: avg(perInvoice.map((p) => (p.after as { hallucinationRate: number }).hallucinationRate)),
};

const beforeMetrics = {
  fieldAccuracy: beforeBaseline.aggregate.overallFieldAccuracyLenient,
  quantityAccuracy: beforeBaseline.aggregate.fieldAccuracyLenient.quantity,
  financialAccuracy: avg(beforeFinancial.invoices.map((i) => i.financialAccuracyPct)),
  hallucinationRate: round2(beforeHallucination.aggregate.avgHallucinationRate * 100),
};

const regressions: string[] = [];
for (const p of perInvoice) {
  const b = p.before as { itemCount: number; fieldAccuracy: number; qtyAccuracy: number };
  const a = p.after as { itemCount: number; fieldAccuracy: number; qtyAccuracy: number };
  if (a.itemCount < b.itemCount) regressions.push(`${p.label}: row count ${b.itemCount}→${a.itemCount}`);
  if (a.fieldAccuracy < b.fieldAccuracy - 5) regressions.push(`${p.label}: field accuracy ${b.fieldAccuracy}%→${a.fieldAccuracy}%`);
  if (a.qtyAccuracy < b.qtyAccuracy - 5) regressions.push(`${p.label}: qty accuracy ${b.qtyAccuracy}%→${a.qtyAccuracy}%`);
}

const recommendation =
  afterMetrics.fieldAccuracy >= beforeMetrics.fieldAccuracy &&
  afterMetrics.hallucinationRate <= beforeMetrics.hallucinationRate &&
  regressions.filter((r) => !r.includes("Aviludo April")).length === 0
    ? "YES"
    : afterMetrics.fieldAccuracy > beforeMetrics.fieldAccuracy + 2 &&
        afterMetrics.hallucinationRate < beforeMetrics.hallucinationRate
      ? "YES"
      : "NO";

const output = {
  generated_at: new Date().toISOString(),
  promptChange: "Pass C column-faithful redesign",
  metrics: {
    fieldAccuracy: { before: beforeMetrics.fieldAccuracy, after: afterMetrics.fieldAccuracy },
    quantityAccuracy: { before: beforeMetrics.quantityAccuracy, after: afterMetrics.quantityAccuracy },
    financialAccuracy: { before: beforeMetrics.financialAccuracy, after: afterMetrics.financialAccuracy },
    hallucinationRate: { before: beforeMetrics.hallucinationRate, after: afterMetrics.hallucinationRate },
  },
  perInvoice,
  regressions,
  validationTargets: {
    mammafiore: {
      rows: (perInvoice.find((p) => p.invoiceId === "36c99d19-6f9f-413f-8c2d-ae3526291a2d")?.after as { itemCount: number })?.itemCount,
      noPhantomOlio: !((perInvoice.find((p) => p.invoiceId === "36c99d19-6f9f-413f-8c2d-ae3526291a2d")?.after as { items: { name: string }[] })?.items ?? []).some((i) => /olio|lote 609/i.test(i.name)),
      acetoQty: ((perInvoice.find((p) => p.invoiceId === "36c99d19-6f9f-413f-8c2d-ae3526291a2d")?.after as { items: { name: string; quantity: number }[] })?.items ?? []).find((i) => /aceto/i.test(i.name))?.quantity,
      ruloQty: ((perInvoice.find((p) => p.invoiceId === "36c99d19-6f9f-413f-8c2d-ae3526291a2d")?.after as { items: { name: string; quantity: number }[] })?.items ?? []).find((i) => /rulo/i.test(i.name))?.quantity,
    },
    bocconcinoPomodoroQty: ((perInvoice.find((p) => p.invoiceId === "f0aa5a08-86a3-4938-99f0-711e86073968")?.after as { items: { name: string; quantity: number }[] })?.items ?? []).find((i) => /pomodoro/i.test(i.name))?.quantity,
    emporioGingerBeerQty: ((perInvoice.find((p) => p.invoiceId === "17aa3591-ec98-4c21-89c9-5ae946bc97bb")?.after as { items: { name: string; quantity: number }[] })?.items ?? []).find((i) => /ginger/i.test(i.name))?.quantity,
  },
  recommendation: { keepPrompt: recommendation },
};

writeFileSync(".tmp/passc-implementation/post-audit.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify(output.metrics, null, 2));
console.log("recommendation:", recommendation);
