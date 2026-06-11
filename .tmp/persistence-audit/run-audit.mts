/**
 * Validation Lab Persistence Accuracy Audit — read-only.
 * Traces: Pass C → normalizeItems → reconcile → persistence → DB → UI
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/persistence-audit";
const DENO = ".tmp/deno/bin/deno";

type LineFields = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
};

type ProblemRow = {
  key: string;
  gtDescription: string;
  gt: LineFields;
  issue: string;
};

const INVOICES: Record<
  string,
  {
    label: string;
    deltaEur: number;
    problemRows: ProblemRow[];
  }
> = {
  "f0aa5a08-86a3-4938-99f0-711e86073968": {
    label: "IL Bocconcino",
    deltaEur: 70,
    problemRows: [
      {
        key: "pomodor",
        gtDescription: "POMODOR PELATI (CX 2.5KG*6)",
        gt: { name: "POMODOR PELATI (CX 2.5KG*6)", quantity: 2, unit: "un", unit_price: 25, total: 50 },
        issue: "qty=2/€25/€50 vs DB qty=6/€20/€120 (+€70)",
      },
    ],
  },
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d": {
    label: "Mammafiore",
    deltaEur: 16.82,
    problemRows: [
      {
        key: "phantom-olio",
        gtDescription: "(phantom — not on invoice)",
        gt: { name: "(absent)", quantity: null, unit: null, unit_price: null, total: null },
        issue: "Phantom Olio line (+€15–18)",
      },
      {
        key: "aceto",
        gtDescription: "Aceto balsamico di Modena IGP pet 5l*2 Toschi",
        gt: { name: "Aceto balsamico di Modena IGP pet 5l*2 Toschi", quantity: 1, unit: "un", unit_price: 18.929, total: 16.09 },
        issue: "qty 1 vs DB 2 (*2 pack notation)",
      },
      {
        key: "rulo",
        gtDescription: "Rulo Di Capra 1kg*2 Simonetta",
        gt: { name: "Rulo Di Capra 1kg*2 Simonetta", quantity: 1, unit: "un", unit_price: 15.192, total: 10.86 },
        issue: "qty 1 vs DB 2 (*2 pack notation)",
      },
    ],
  },
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb": {
    label: "Emporio Italia",
    deltaEur: 2,
    problemRows: [
      {
        key: "prosciutto",
        gtDescription: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4-4,25KG",
        gt: { name: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4-4,25KG", quantity: 4.3, unit: "kg", unit_price: 8.17, total: 35.14 },
        issue: "unit_price 8.17→17",
      },
      {
        key: "pellegrino",
        gtDescription: "SanPellegrino - Acqua in vitro 75cl x 15ud",
        gt: { name: "SanPellegrino - Acqua in vitro 75cl x 15ud", quantity: 2.56, unit: "cx", unit_price: 15.06, total: 38.56 },
        issue: "qty 2.56→2, unit_price 15.06→19.3",
      },
      {
        key: "ginger-beer",
        gtDescription: "Baladin - Ginger Beer 0.20cl",
        gt: { name: "Baladin - Ginger Beer 0.20cl", quantity: 2, unit: "un", unit_price: 9.69, total: 19.38 },
        issue: "unit un→cx",
      },
    ],
  },
};

const LEGACY_PASS_C_RAW: Record<string, string> = {
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d": ".tmp/mammafiore-line-audit/pass-c-raw.json",
};

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name);
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fieldsMatch(a: LineFields | null, b: LineFields | null, fields: (keyof LineFields)[]) {
  if (!a || !b) return false;
  return fields.every((f) => {
    if (f === "name") return normName(a.name) === normName(b.name);
    return a[f] === b[f];
  });
}

function normName(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numericDelta(a: number | null, b: number | null) {
  if (a == null || b == null) return null;
  return round2(b - a);
}

function findRow(items: LineFields[], key: string, gtDescription: string): LineFields | null {
  if (key === "phantom-olio") {
    return (
      items.find((it) => /olio\s+(nuto|nute|noc|nute)/i.test(it.name)) ?? null
    );
  }
  const needles: Record<string, RegExp> = {
    pomodor: /pomodor/i,
    aceto: /aceto\s+balsamico/i,
    rulo: /capra|rub\s+di\s+capra|rulo/i,
    prosciutto: /prosciutto\s+cotto/i,
    pellegrino: /pellegrino|acqua\s+in\s+vitro/i,
    "ginger-beer": /ginger\s+beer/i,
  };
  const re = needles[key];
  if (!re) return null;
  return items.find((it) => re.test(it.name)) ?? null;
}

function firstStageWhereWrong(
  gt: LineFields,
  stages: Record<string, LineFields | null>,
  numericFields: (keyof LineFields)[] = ["quantity", "unit_price", "total", "unit"],
): string | null {
  const order = ["passCRaw", "postNormalize", "postReconcileAmounts", "postFinalize", "extractInvoice", "persistencePayload", "db", "ui"];
  for (const stage of order) {
    const row = stages[stage];
    if (!row) {
      if (stage === "passCRaw" && gt.name === "(absent)") continue;
      continue;
    }
    if (gt.name === "(absent)" && row) return stage;
    for (const f of numericFields) {
      if (f === "name") continue;
      if (gt[f] != null && row[f] != null && gt[f] !== row[f]) return stage;
      if (gt[f] != null && row[f] == null) return stage;
    }
    if (gt.name !== "(absent)" && !normName(row.name).includes(normName(gt.name).split(" ")[0])) {
      // description drift only — skip for numeric attribution
    }
  }
  return null;
}

function classifyRootCause(firstStage: string | null, key: string): string {
  if (!firstStage) return "N/A";
  if (key === "phantom-olio") return "GPT";
  if (["passCRaw", "postNormalize"].includes(firstStage)) return "GPT";
  if (firstStage === "postReconcileAmounts" || firstStage === "postFinalize") return "Reconcile";
  if (firstStage === "extractInvoice") return "GPT"; // extract-invoice = edge output
  if (["persistencePayload", "db"].includes(firstStage)) {
    // if extract was correct but db wrong → stale persistence
    return "Persistence";
  }
  if (firstStage === "ui") return "UI";
  return "GPT";
}

// --- invoice-item-fields replication (persistence + UI) ---
const INVOICE_NUMBER_TOKEN = String.raw`\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]\d+|\d+`;
const INVOICE_UNIT_TOKEN = String.raw`un|uni|und|unds|unid|unids|unidade|unidades|kg|g|gr|l|lt|ml|cl|cx|caixa|caixas|dz|pack|packs|pc|pcs|mo|maço|maco|em|emb|embalagem|embalagens`;
const INVOICE_ROW_TAIL_RE = new RegExp(
  String.raw`\s+(?<quantity>${INVOICE_NUMBER_TOKEN})\s*(?<unit>${INVOICE_UNIT_TOKEN})\b\s+(?:€|EUR)?\s*${INVOICE_NUMBER_TOKEN}\s*(?:€|EUR)?\s*(?:\d{1,2}(?:[,.]\d+)?\s*%)?\s*$`,
  "iu",
);

function parseInvoiceNumberToken(raw: string): number | null {
  let value = raw.replace(/\u20AC/g, " ").replace(/€/g, " ").replace(/EUR/gi, " ").replace(/\s+/g, "").trim();
  if (!value) return null;
  value = value.replace(/[^\d.,-]/g, "");
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? value.replace(/\./g, "").replace(",", ".")
      : lastDot > lastComma
        ? value.replace(/,/g, "")
        : value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInvoiceUnitToken(raw: string | null | undefined) {
  const unit = raw?.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!unit) return null;
  if (["uni", "und", "unds", "unid", "unids", "unidade", "unidades", "pc", "pcs"].includes(unit)) return "un";
  if (unit === "maco") return "mo";
  if (["emb", "embalagem", "embalagens"].includes(unit)) return "em";
  if (unit === "lt") return "L";
  if (unit === "gr") return "g";
  return unit === "l" ? "L" : unit;
}

function extractInvoiceRowTailFields(name: string) {
  const rowTail = name.match(INVOICE_ROW_TAIL_RE);
  if (!rowTail?.groups?.quantity || !rowTail.groups.unit) return { quantity: null, unit: null };
  return {
    quantity: parseInvoiceNumberToken(rowTail.groups.quantity),
    unit: normalizeInvoiceUnitToken(rowTail.groups.unit),
  };
}

function cleanInvoiceItemDisplayName(item: Pick<LineFields, "name" | "quantity" | "unit">) {
  let name = String(item.name ?? "").replace(/\s+/g, " ").trim();
  const rowTail = name.match(INVOICE_ROW_TAIL_RE);
  if (rowTail?.groups?.quantity && rowTail.groups.unit) {
    const quantity = parseInvoiceNumberToken(rowTail.groups.quantity);
    const rowUnit = normalizeInvoiceUnitToken(rowTail.groups.unit);
    const itemUnit = normalizeInvoiceUnitToken(item.unit);
    const quantityMatches = item.quantity == null || quantity == null || Math.abs(item.quantity - quantity) < 0.005;
    const unitMatches = !itemUnit || !rowUnit || itemUnit === rowUnit;
    if (quantityMatches && unitMatches) name = name.slice(0, rowTail.index).trim();
  }
  return name.replace(/\s+/g, " ").trim();
}

function normalizeInvoiceItemFields(item: LineFields & { id?: string }): LineFields & { id?: string } {
  const rowTailFields = extractInvoiceRowTailFields(String(item.name ?? ""));
  const quantity =
    (typeof item.quantity === "number" ? item.quantity : null) ?? rowTailFields.quantity;
  const unit = normalizeInvoiceUnitToken(item.unit) ?? rowTailFields.unit;
  const unit_price = typeof item.unit_price === "number" ? item.unit_price : null;
  const total = typeof item.total === "number" ? item.total : null;
  return {
    ...item,
    name: cleanInvoiceItemDisplayName({ name: item.name ?? "", quantity, unit }),
    quantity,
    unit,
    unit_price,
    total,
  };
}

function simulatePersistencePayload(item: LineFields): LineFields {
  const normalized = normalizeInvoiceItemFields({ ...item, id: "sim" });
  return {
    name: String(normalized.name).slice(0, 200),
    quantity: normalized.quantity,
    unit: normalized.unit ? normalized.unit.slice(0, 20) : null,
    unit_price: normalized.unit_price,
    total: normalized.total,
  };
}

function simulateUiRender(dbRow: LineFields & { id: string }): LineFields {
  const renderItem = normalizeInvoiceItemFields(dbRow);
  return {
    name: renderItem.name,
    quantity: renderItem.quantity,
    unit: renderItem.unit,
    unit_price: renderItem.unit_price,
    total: renderItem.total,
  };
}

// --- main ---
mkdirSync(`${OUT}/pass-c-raw`, { recursive: true });
mkdirSync(`${OUT}/post-normalize`, { recursive: true });

const serviceKey = projectKey("service_role");
const anonKey = projectKey("anon");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

async function fetchImageDataUrl(fileUrl: string): Promise<string> {
  const { data: signed, error } = await sb.storage.from("invoices").createSignedUrl(fileUrl, 300);
  if (error || !signed?.signedUrl) throw new Error(`sign: ${error?.message}`);
  const blob = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(60_000) }).then((r) => r.blob());
  const buf = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "image/png"};base64,${buf.toString("base64")}`;
}

async function invokeExtract(imageDataUrl: string) {
  const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
    signal: AbortSignal.timeout(180_000),
  });
  return { status: res.status, body: await res.json() };
}

function runPipelineReplay(imageDataUrlPath: string, outPath: string) {
  if (!existsSync(DENO)) throw new Error(`deno not found at ${DENO}`);
  execSync(
    `${DENO} run --allow-read --allow-write --allow-net --allow-env ${OUT}/pipeline-replay.deno.ts "${imageDataUrlPath}" "${outPath}"`,
    {
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env },
    },
  );
  return loadJson<{
    passCRaw: LineFields[];
    postNormalize: LineFields[];
    postReconcileAmounts: LineFields[];
    postFinalize: LineFields[];
    reconcileModifiedQtyPriceTotal: boolean;
    finalizeModifiedQtyPriceTotal: boolean;
  }>(outPath);
}

const stageTrace: unknown[] = [];
const reconcileTrace: unknown[] = [];
const persistenceTrace: unknown[] = [];
const uiTrace: unknown[] = [];
const passCAnswers: unknown[] = [];
const deltaAttribution: unknown[] = [];
const rootCauses: string[] = [];

for (const [invoiceId, spec] of Object.entries(INVOICES)) {
  console.log(`\n=== ${spec.label} (${invoiceId}) ===`);

  const { data: invoice } = await sb
    .from("invoices")
    .select("id, supplier_name, total, file_url, created_at")
    .eq("id", invoiceId)
    .single();

  const { data: dbItems } = await sb
    .from("invoice_items")
    .select("id, name, quantity, unit, unit_price, total")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  const imageDataUrl = await fetchImageDataUrl(invoice!.file_url!);
  const dataUrlPath = `${OUT}/image-${invoiceId}.txt`;
  writeFileSync(dataUrlPath, imageDataUrl);

  const extractRes = await invokeExtract(imageDataUrl);
  writeFileSync(`${OUT}/pass-c-raw/${invoiceId}-extract-invoice.json`, JSON.stringify(extractRes, null, 2));

  const extractItems: LineFields[] = (extractRes.body?.items ?? []).map((it: LineFields) => ({
    name: it.name,
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    unit_price: it.unit_price ?? null,
    total: it.total ?? null,
  }));

  let pipeline: Awaited<ReturnType<typeof runPipelineReplay>> | null = null;
  try {
    const pipelinePath = `${OUT}/post-normalize/${invoiceId}-pipeline.json`;
    pipeline = runPipelineReplay(dataUrlPath, pipelinePath);
    writeFileSync(`${OUT}/pass-c-raw/${invoiceId}-gpt-raw.json`, JSON.stringify(pipeline.passCRaw, null, 2));
    writeFileSync(`${OUT}/post-normalize/${invoiceId}-post-normalize.json`, JSON.stringify(pipeline.postNormalize, null, 2));
    writeFileSync(`${OUT}/post-normalize/${invoiceId}-post-reconcile.json`, JSON.stringify(pipeline.postReconcileAmounts, null, 2));
    writeFileSync(`${OUT}/post-normalize/${invoiceId}-post-finalize.json`, JSON.stringify(pipeline.postFinalize, null, 2));
  } catch (e) {
    console.warn(`pipeline replay failed for ${invoiceId}:`, e);
    // fallback to legacy pass-c-raw if available
    const legacy = LEGACY_PASS_C_RAW[invoiceId];
    if (legacy && existsSync(legacy)) {
      const leg = loadJson<{ items: LineFields[] }>(legacy);
      pipeline = {
        passCRaw: leg.items,
        postNormalize: leg.items,
        postReconcileAmounts: leg.items,
        postFinalize: extractItems,
        reconcileModifiedQtyPriceTotal: false,
        finalizeModifiedQtyPriceTotal: false,
      };
      writeFileSync(`${OUT}/pass-c-raw/${invoiceId}-gpt-raw.json`, JSON.stringify(leg.items, null, 2));
    }
  }

  const dbRows: (LineFields & { id: string })[] = (dbItems ?? []).map((it) => ({
    id: it.id,
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    total: it.total,
  }));

  for (const prob of spec.problemRows) {
    const stages: Record<string, LineFields | null> = {
      passCRaw: pipeline ? findRow(pipeline.passCRaw, prob.key, prob.gtDescription) : null,
      postNormalize: pipeline ? findRow(pipeline.postNormalize, prob.key, prob.gtDescription) : null,
      postReconcileAmounts: pipeline ? findRow(pipeline.postReconcileAmounts, prob.key, prob.gtDescription) : null,
      postFinalize: pipeline ? findRow(pipeline.postFinalize, prob.key, prob.gtDescription) : null,
      extractInvoice: findRow(extractItems, prob.key, prob.gtDescription),
    };

    const extractRow = stages.extractInvoice;
    const persistencePayload = extractRow ? simulatePersistencePayload(extractRow) : null;
    stages.persistencePayload = persistencePayload;

    const dbRow = findRow(dbRows, prob.key, prob.gtDescription);
    stages.db = dbRow;
    stages.ui = dbRow ? simulateUiRender(dbRow) : null;

    const passCWrong =
      prob.key === "phantom-olio"
        ? stages.passCRaw != null
        : prob.gt.name !== "(absent)" &&
          (stages.passCRaw?.quantity !== prob.gt.quantity ||
            stages.passCRaw?.unit_price !== prob.gt.unit_price ||
            stages.passCRaw?.total !== prob.gt.total ||
            (prob.key === "ginger-beer" && stages.passCRaw?.unit !== prob.gt.unit));

    passCAnswers.push({
      invoiceId,
      label: spec.label,
      key: prob.key,
      passCAlreadyWrong: passCWrong ? "YES" : "NO",
      passCRaw: stages.passCRaw,
      groundTruth: prob.gt,
    });

    const reconcileModified =
      stages.postNormalize &&
      stages.postReconcileAmounts &&
      (stages.postNormalize.quantity !== stages.postReconcileAmounts.quantity ||
        stages.postNormalize.unit_price !== stages.postReconcileAmounts.unit_price ||
        stages.postNormalize.total !== stages.postReconcileAmounts.total);

    const finalizeModified =
      stages.postReconcileAmounts &&
      stages.postFinalize &&
      (stages.postReconcileAmounts.quantity !== stages.postFinalize.quantity ||
        stages.postReconcileAmounts.unit_price !== stages.postFinalize.unit_price ||
        stages.postReconcileAmounts.total !== stages.postFinalize.total);

    reconcileTrace.push({
      invoiceId,
      label: spec.label,
      key: prob.key,
      input: stages.postNormalize,
      afterReconcileLineItemAmounts: stages.postReconcileAmounts,
      afterFinalizeExtractedLineItems: stages.postFinalize,
      reconcileLineItemAmountsModified: reconcileModified ? "YES" : "NO",
      finalizeExtractedLineItemsModified: finalizeModified ? "YES" : "NO",
      reconcileModifiedQtyPriceTotal:
        reconcileModified || finalizeModified ? "YES" : "NO",
    });

    const persistenceModified =
      persistencePayload &&
      dbRow &&
      (persistencePayload.quantity !== dbRow.quantity ||
        persistencePayload.unit_price !== dbRow.unit_price ||
        persistencePayload.total !== dbRow.total ||
        persistencePayload.unit !== dbRow.unit);

    const extractMatchesDb =
      extractRow &&
      dbRow &&
      extractRow.quantity === dbRow.quantity &&
      extractRow.unit_price === dbRow.unit_price &&
      extractRow.total === dbRow.total &&
      extractRow.unit === dbRow.unit;

    persistenceTrace.push({
      invoiceId,
      label: spec.label,
      key: prob.key,
      extractInvoiceHandoff: extractRow,
      clientNormalize: extractRow ? normalizeInvoiceItemFields({ ...extractRow, id: "x" }) : null,
      insertPayload: persistencePayload,
      dbStored: dbRow,
      persistenceModifiedFields: persistenceModified ? "YES" : "NO",
      dbStaleVsFreshExtract: extractMatchesDb ? "NO" : "YES",
      dbCreatedAt: invoice?.created_at,
      note: persistenceModified
        ? "DB row differs from fresh extract-invoice handoff"
        : extractMatchesDb
          ? "DB matches fresh extract-invoice"
          : "Numeric fields differ between fresh extract and DB — likely stale DB from earlier run",
    });

    const uiModified =
      dbRow &&
      stages.ui &&
      (dbRow.quantity !== stages.ui.quantity ||
        dbRow.unit_price !== stages.ui.unit_price ||
        dbRow.total !== stages.ui.total ||
        dbRow.name !== stages.ui.name ||
        dbRow.unit !== stages.ui.unit);

    uiTrace.push({
      invoiceId,
      label: spec.label,
      key: prob.key,
      dbRow,
      renderItem: stages.ui,
      uiPostDbTransformation: uiModified ? "YES" : "NO",
      fieldsChangedInUi: uiModified
        ? ["quantity", "unit", "unit_price", "total", "name"].filter((f) => {
            const k = f as keyof LineFields;
            return dbRow && stages.ui && dbRow[k] !== stages.ui[k];
          })
        : [],
    });

    const firstStage = firstStageWhereWrong(prob.gt, stages);
    const rootCause = classifyRootCause(firstStage, prob.key);
    rootCauses.push(rootCause);

    const totalDelta =
      prob.gt.total != null && stages.db?.total != null
        ? numericDelta(prob.gt.total, stages.db.total)
        : stages.db?.total ?? null;

    deltaAttribution.push({
      invoice: spec.label,
      invoiceId,
      row: prob.key,
      issue: prob.issue,
      deltaEur: totalDelta ?? (prob.key === "phantom-olio" ? stages.db?.total : null),
      firstStageWhereDeltaAppears: firstStage,
      rootCause,
      freshExtractMatchesDb: extractMatchesDb,
    });

    stageTrace.push({
      invoiceId,
      label: spec.label,
      key: prob.key,
      issue: prob.issue,
      table: {
        groundTruth: prob.gt,
        gptPassCRaw: stages.passCRaw,
        normalizeItems: stages.postNormalize,
        reconcile: stages.postFinalize,
        extractInvoiceResponse: stages.extractInvoice,
        persistencePayload: stages.persistencePayload,
        db: stages.db,
        ui: stages.ui,
      },
      passCAlreadyWrong: passCWrong ? "YES" : "NO",
      reconcileModifiedQtyPriceTotal: reconcileModified || finalizeModified ? "YES" : "NO",
      persistenceModified: persistenceModified ? "YES" : "NO",
      uiTransformed: uiModified ? "YES" : "NO",
      firstStageWhereErrorAppears: firstStage,
      rootCause,
    });
  }
}

// root cause distribution
const counts: Record<string, number> = {};
for (const rc of rootCauses) counts[rc] = (counts[rc] ?? 0) + 1;
const total = rootCauses.length;
const distribution = Object.entries(counts).map(([source, count]) => ({
  source,
  count,
  percent: round2((count / total) * 100),
}));

writeFileSync(`${OUT}/stage-trace.json`, JSON.stringify({ generated_at: new Date().toISOString(), rows: stageTrace }, null, 2));
writeFileSync(`${OUT}/reconcile-trace.json`, JSON.stringify({ generated_at: new Date().toISOString(), rows: reconcileTrace }, null, 2));
writeFileSync(`${OUT}/persistence-trace.json`, JSON.stringify({ generated_at: new Date().toISOString(), rows: persistenceTrace }, null, 2));
writeFileSync(`${OUT}/ui-trace.json`, JSON.stringify({ generated_at: new Date().toISOString(), rows: uiTrace }, null, 2));
writeFileSync(`${OUT}/pass-c-raw/pass-c-answers.json`, JSON.stringify({ generated_at: new Date().toISOString(), rows: passCAnswers }, null, 2));
writeFileSync(`${OUT}/delta-attribution.json`, JSON.stringify({ generated_at: new Date().toISOString(), rows: deltaAttribution }, null, 2));
writeFileSync(
  `${OUT}/root-cause-distribution.json`,
  JSON.stringify({ generated_at: new Date().toISOString(), total, distribution }, null, 2),
);

console.log("\nDone. Artifacts written to", OUT);
console.log(JSON.stringify({ distribution, deltaAttribution }, null, 2));
