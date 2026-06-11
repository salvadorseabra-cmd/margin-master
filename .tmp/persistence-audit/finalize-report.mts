/**
 * Post-process audit artifacts with corrected stale-DB vs GPT attribution.
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT = ".tmp/persistence-audit";

type Line = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

function load<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

// Enrich pass-c raw from prior audits when local GPT replay unavailable
const PASS_C_RAW_CACHE: Record<string, Line[]> = {
  "f0aa5a08-86a3-4938-99f0-711e86073968": load<{ items: Line[] }>(
    ".tmp/bocconcino-investigation/extract-invoice-postfix.json",
  ).items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    total: it.total,
  })),
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d": load<{ items: Line[] }>(
    ".tmp/mammafiore-line-audit/pass-c-raw.json",
  ).items,
};

const stageTrace = load<{ rows: Record<string, unknown>[] }>(`${OUT}/stage-trace.json`);
const persistenceTrace = load<{ rows: Record<string, unknown>[] }>(`${OUT}/persistence-trace.json`);

const correctedAttribution: unknown[] = [];
const rootCauses: string[] = [];

for (const row of stageTrace.rows) {
  const invoiceId = row.invoiceId as string;
  const key = row.key as string;
  const table = row.table as Record<string, Line | null>;
  const gt = table.groundTruth;
  const db = table.db;
  const extract = table.extractInvoiceResponse;
  const passCRaw =
    table.gptPassCRaw ??
    (PASS_C_RAW_CACHE[invoiceId]
      ? findRow(PASS_C_RAW_CACHE[invoiceId], key)
      : null);

  if (passCRaw && !table.gptPassCRaw) {
    table.gptPassCRaw = passCRaw;
    table.normalizeItems = passCRaw;
  }

  const freshExtractMatchesDb =
    extract &&
    db &&
    extract.quantity === db.quantity &&
    extract.unit_price === db.unit_price &&
    extract.total === db.total &&
    (extract.unit?.toLowerCase() ?? null) === (db.unit?.toLowerCase() ?? null);

  const dbStale = extract && db && !freshExtractMatchesDb;

  let firstStageVsGt: string;
  let rootCause: string;
  let passCWrong: "YES" | "NO" = "NO";

  if (key === "phantom-olio") {
    passCWrong = passCRaw ? "YES" : extract ? "YES" : "NO";
    firstStageVsGt = passCRaw ? "passCRaw" : extract ? "extractInvoice" : "db";
    rootCause = "GPT";
  } else if (dbStale && extract) {
    // DB written from older extraction; compare GT vs extract for GPT, GT vs DB for user-visible delta
    const gtErrorInPassC =
      passCRaw &&
      (passCRaw.quantity !== gt.quantity ||
        passCRaw.unit_price !== gt.unit_price ||
        passCRaw.total !== gt.total);
    const gtErrorInFreshExtract =
      extract.quantity !== gt.quantity ||
      extract.unit_price !== gt.unit_price ||
      extract.total !== gt.total ||
      (key === "ginger-beer" && extract.unit?.toLowerCase() !== gt.unit);

    passCWrong = gtErrorInPassC || gtErrorInFreshExtract ? "YES" : "NO";

    if (gtErrorInPassC && passCRaw) firstStageVsGt = "passCRaw";
    else if (gtErrorInFreshExtract) firstStageVsGt = "extractInvoice";
    else firstStageVsGt = "db";

    // DB delta vs GT: if extract is closer to GT than DB, root cause is stale persistence
    const extractCloser =
      Math.abs((extract.total ?? 0) - (gt.total ?? 0)) <
      Math.abs((db?.total ?? 0) - (gt.total ?? 0));
    if (dbStale && extractCloser && gtErrorInPassC && !gtErrorInFreshExtract) {
      rootCause = "Persistence"; // stale — never re-persisted after GPT/reconcile improved
    } else if (gtErrorInPassC || gtErrorInFreshExtract) {
      rootCause = "GPT";
    } else {
      rootCause = "Persistence";
    }
  } else {
    const stages = [
      ["passCRaw", passCRaw],
      ["extractInvoice", extract],
      ["db", db],
    ] as const;
    for (const [name, val] of stages) {
      if (!val) continue;
      if (
        val.quantity !== gt.quantity ||
        val.unit_price !== gt.unit_price ||
        val.total !== gt.total ||
        (key === "ginger-beer" && val.unit?.toLowerCase() !== gt.unit)
      ) {
        firstStageVsGt = name;
        passCWrong = name === "passCRaw" || name === "extractInvoice" ? "YES" : "NO";
        rootCause = name === "db" ? "Persistence" : "GPT";
        break;
      }
    }
    firstStageVsGt ??= "none";
    rootCause ??= "N/A";
  }

  row.passCAlreadyWrong = passCWrong;
  row.firstStageWhereErrorAppears = firstStageVsGt;
  row.rootCause = rootCause;
  row.dbStaleVsFreshExtract = dbStale ? "YES" : "NO";
  row.freshExtractMatchesDb = freshExtractMatchesDb ? "YES" : "NO";

  const deltaEur =
    gt.total != null && db?.total != null ? Math.round((db.total - gt.total) * 100) / 100 : null;

  correctedAttribution.push({
    invoice: row.label,
    invoiceId,
    row: key,
    issue: row.issue,
    deltaEur,
    firstStageWhereDeltaAppearsVsGroundTruth: firstStageVsGt,
    dbStaleVsFreshExtract: dbStale ? "YES" : "NO",
    freshExtractMatchesDb: freshExtractMatchesDb ? "YES" : "NO",
    rootCause,
    passCAlreadyWrong: passCWrong,
  });
  rootCauses.push(rootCause);
}

function findRow(items: Line[], key: string): Line | null {
  const re: Record<string, RegExp> = {
    pomodor: /pomodor/i,
    aceto: /aceto\s+balsamico/i,
    rulo: /capra|rub|rulo/i,
    prosciutto: /prosciutto\s+cotto/i,
    pellegrino: /pellegrino|acqua\s+in\s+vitro/i,
    "ginger-beer": /ginger\s+beer/i,
    "phantom-olio": /olio|nui\s+lote/i,
  };
  return items.find((it) => re[key]?.test(it.name)) ?? null;
}

const counts: Record<string, number> = {};
for (const rc of rootCauses) counts[rc] = (counts[rc] ?? 0) + 1;
const total = rootCauses.length;
const distribution = Object.entries(counts).map(([source, count]) => ({
  source,
  count,
  percent: Math.round((count / total) * 10000) / 100,
}));

writeFileSync(`${OUT}/stage-trace.json`, JSON.stringify(stageTrace, null, 2));
writeFileSync(`${OUT}/delta-attribution.json`, JSON.stringify({ generated_at: new Date().toISOString(), rows: correctedAttribution }, null, 2));
writeFileSync(`${OUT}/root-cause-distribution.json`, JSON.stringify({ generated_at: new Date().toISOString(), total, distribution, notes: "Persistence = stale DB never re-extracted after pipeline improvements; no client-side field corruption observed" }, null, 2));

console.log(JSON.stringify({ distribution, correctedAttribution }, null, 2));
