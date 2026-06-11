/**
 * Mammafiore line-level extraction audit — read-only evidence collection.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeInvoiceItemFields,
  shouldRejectInvoiceIngredientRow,
} from "../../src/lib/invoice-item-fields.ts";
import {
  reconcileLineItemAmounts,
  reconcileLineItemsToNetSubtotal,
  type InvoiceLineItem,
} from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "36c99d19-6f9f-413f-8c2d-ae3526291a2d";
const OUT_DIR = ".tmp/mammafiore-line-audit";
const DENO = ".tmp/deno/bin/deno";
const INVEST_DIR = ".tmp/mammafiore-investigation";

const GROUND_TRUTH = [
  {
    description: "Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino",
    qty: 5.996,
    unit: "un",
    unit_price: 16.922,
    total: 64.93,
  },
  {
    description: "Farina Speciale pizza 25kg Amoruso",
    qty: 1,
    unit: "un",
    unit_price: 33.154,
    total: 26.52,
  },
  {
    description: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro",
    qty: 24,
    unit: "un",
    unit_price: 1.529,
    total: 25.69,
  },
  {
    description: "Aceto balsamico di Modena IGP pet 5l*2 Toschi",
    qty: 1,
    unit: "un",
    unit_price: 18.929,
    total: 16.09,
  },
  {
    description: "MOZZA Fior di Latte Expert Julienne 3kg Simonetta",
    qty: 10,
    unit: "un",
    unit_price: 24.728,
    total: 200.3,
  },
  {
    description: "Rulo Di Capra 1kg*2 Simonetta",
    qty: 1,
    unit: "un",
    unit_price: 15.192,
    total: 10.86,
  },
  {
    description: "Recargo por combustible",
    qty: 1,
    unit: "un",
    unit_price: 2,
    total: 2,
  },
  {
    description: "Farina 00 pasta fresca e gnocchi25kg Caputo",
    qty: 1,
    unit: "un",
    unit_price: 39.101,
    total: 30.11,
  },
] as const;

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8", timeout: 60_000 },
  );
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

function normalizeItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    name: typeof item?.name === "string" ? item.name : "Unknown item",
    quantity: typeof item?.quantity === "number" ? item.quantity : null,
    unit: typeof item?.unit === "string" ? item.unit : null,
    unit_price: typeof item?.unit_price === "number" ? item.unit_price : null,
    total: typeof item?.total === "number" ? item.total : null,
  }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumTotals = (rows: { total?: number | null }[]) =>
  round2(rows.reduce((s, r) => s + (r.total ?? 0), 0));

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
  const gtTokens = a.split(" ").filter((t) => t.length > 2);
  const hits = gtTokens.filter((t) => b.includes(t)).length;
  return hits / Math.max(gtTokens.length, 1);
}

function bestMatch<T extends { name?: string; description?: string }>(
  needle: string,
  rows: T[],
  used: Set<number>,
): { index: number; row: T; score: number } | null {
  let best: { index: number; row: T; score: number } | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (used.has(i)) continue;
    const name = "description" in rows[i] ? rows[i].description! : (rows[i].name ?? "");
    const score = matchScore(needle, name);
    if (!best || score > best.score) best = { index: i, row: rows[i], score };
  }
  if (!best || best.score < 0.35) return null;
  used.add(best.index);
  return best;
}

function classifyRow(
  gt: (typeof GROUND_TRUTH)[number],
  extracted: InvoiceLineItem | null,
): "MATCH" | "PARTIAL" | "WRONG" | "MISSING" {
  if (!extracted) return "MISSING";
  const score = matchScore(gt.description, extracted.name ?? "");
  if (score < 0.4) return "WRONG";
  const qtyOk =
    extracted.quantity == null ||
    Math.abs((extracted.quantity ?? 0) - gt.qty) < 0.05 ||
    Math.abs((extracted.quantity ?? 0) - gt.qty) / gt.qty < 0.02;
  const totalOk =
    extracted.total == null || Math.abs((extracted.total ?? 0) - gt.total) < 0.15;
  if (score >= 0.75 && qtyOk && totalOk) return "MATCH";
  return "PARTIAL";
}

const anonKey = projectKey("anon");
const serviceKey = projectKey("service_role");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

// TASK 1 — ground truth
writeFileSync(`${OUT_DIR}/ground-truth.json`, JSON.stringify({ rows: GROUND_TRUTH }, null, 2));

// DB query
const { data: dbItems } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total,created_at")
  .eq("invoice_id", INVOICE_ID)
  .order("created_at");

const { data: invoice } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,total,file_url,user_id,created_at")
  .eq("id", INVOICE_ID)
  .single();

writeFileSync(
  `${OUT_DIR}/db-invoice-items.json`,
  JSON.stringify({ invoice, dbItemCount: dbItems?.length ?? 0, dbItems }, null, 2),
);

// Image data URL (cached investigation PNG or storage)
let imageDataUrl: string;
const cachedPng = `${INVEST_DIR}/invoice-full.png`;
if (readFileSync(cachedPng)) {
  const buf = readFileSync(cachedPng);
  imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
} else {
  const { data: signed } = await sb.storage
    .from("invoices")
    .createSignedUrl(invoice!.file_url!, 600);
  const buf = Buffer.from(await fetch(signed!.signedUrl).then((r) => r.arrayBuffer()));
  imageDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
}
writeFileSync(`${OUT_DIR}/invoice-dataurl.txt`, imageDataUrl);

// Crop table region locally
const cropScript = `
import { readFileSync, writeFileSync } from "node:fs";
import { cropTableRegionForLineItems, detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { parseImageDataUrl } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const dataUrl = readFileSync(Deno.args[0], "utf8").trim();
const outDir = Deno.args[1];
const { bytes } = parseImageDataUrl(dataUrl);
const image = await Image.decode(bytes);
const bounds = detectTableBounds(image);
const cropResult = await cropTableRegionForLineItems(dataUrl);
writeFileSync(outDir + "/table-crop.png", parseImageDataUrl(cropResult.croppedDataUrl).bytes);
writeFileSync(outDir + "/table-crop-dataurl.txt", cropResult.croppedDataUrl);
console.log(JSON.stringify({ bounds, fallbackUsed: cropResult.fallbackUsed, fullSize: { w: image.width, h: image.height } }));
`;
writeFileSync(`${OUT_DIR}/crop-local.ts`, cropScript);
const cropOut = execSync(
  `${DENO} run --allow-read --allow-write --allow-net ${OUT_DIR}/crop-local.ts "${OUT_DIR}/invoice-dataurl.txt" "${OUT_DIR}"`,
  { encoding: "utf8", cwd: process.cwd(), timeout: 60_000 },
);
const cropMeta = JSON.parse(cropOut.trim());
writeFileSync(`${OUT_DIR}/crop-bounds.json`, JSON.stringify(cropMeta, null, 2));

const tableCropDataUrl = readFileSync(`${OUT_DIR}/table-crop-dataurl.txt`, "utf8").trim();

// TASK 2 — Pass C raw via vl-prompt-compare on table crop (GPT JSON before normalizeItems)
const passCRawRes = await fetch(
  `https://${VL_REF}.supabase.co/functions/v1/vl-prompt-compare`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl: tableCropDataUrl, promptVariant: "A" }),
    signal: AbortSignal.timeout(120_000),
  },
);
const passCRawBody = await passCRawRes.json();
const passCRawItems = passCRawBody.items ?? [];
writeFileSync(
  `${OUT_DIR}/pass-c-raw.json`,
  JSON.stringify(
    {
      method:
        "vl-prompt-compare variant A on production table crop (GPT JSON before normalizeItems)",
      cropBounds: cropMeta.bounds,
      cropFallbackUsed: cropMeta.fallbackUsed,
      itemCount: passCRawItems.length,
      items: passCRawItems,
      gptProducedOlioNuto: passCRawItems.some((it: { name?: string }) =>
        /olio\s*nu/i.test(it?.name ?? ""),
      ),
      phantomItemNames: passCRawItems
        .filter((it: { name?: string }) => /olio\s*nu/i.test(it?.name ?? ""))
        .map((it: { name?: string }) => it.name),
    },
    null,
    2,
  ),
);

// Full extract-invoice (Pass C after normalize + reconcile in edge function)
const extractRes = await fetch(
  `https://${VL_REF}.supabase.co/functions/v1/extract-invoice`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageDataUrl }),
    signal: AbortSignal.timeout(120_000),
  },
);
const extracted = await extractRes.json();
writeFileSync(`${OUT_DIR}/extract-invoice-response.json`, JSON.stringify(extracted, null, 2));

const passCItems = extracted.items ?? [];
const netSubtotal = extracted.net_subtotal ?? null;

// Pipeline stages locally
const afterNormalizeItems = normalizeItems(passCRawItems);
const afterReconcileAmounts = reconcileLineItemAmounts(afterNormalizeItems);
const afterReconcileNet = reconcileLineItemsToNetSubtotal(afterReconcileAmounts, netSubtotal);

const clientNormalized = passCItems.map((it: InvoiceLineItem) => {
  const norm = normalizeInvoiceItemFields({
    id: "x",
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    total: it.total,
  });
  const rejected = shouldRejectInvoiceIngredientRow(norm);
  return { ...norm, rejected, eligible: !rejected };
});

// TASK 3 — line trace
const usedPassC = new Set<number>();
const usedRaw = new Set<number>();
const usedNorm = new Set<number>();
const usedRec = new Set<number>();
const usedDb = new Set<number>();

const lineTrace = GROUND_TRUTH.map((gt) => {
  const passCMatch = bestMatch(gt.description, passCItems, usedPassC);
  const rawMatch = bestMatch(gt.description, passCRawItems, usedRaw);
  const normMatch = bestMatch(gt.description, afterNormalizeItems, usedNorm);
  const recMatch = bestMatch(gt.description, afterReconcileNet, usedRec);
  const dbMatch = bestMatch(
    gt.description,
    (dbItems ?? []).map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit, unit_price: r.unit_price, total: r.total })),
    usedDb,
  );
  return {
    groundTruth: gt,
    passC: passCMatch?.row ?? null,
    passCRaw: rawMatch?.row ?? null,
    normalizeItems: normMatch?.row ?? null,
    reconcile: recMatch?.row ?? null,
    invoice_items: dbMatch?.row ?? null,
  };
});

// Unmatched extracted rows (phantoms)
const phantomRows = passCItems.filter((_, i) => !usedPassC.has(i));
writeFileSync(
  `${OUT_DIR}/line-trace.json`,
  JSON.stringify({ lineTrace, phantomExtractedRows: phantomRows }, null, 2),
);

// TASK 4 — monetary audit
const moneyAudit = {
  invoiceTotalWithVat: invoice?.total ?? 415.96,
  netSubtotalFromFooter: netSubtotal,
  sums: {
    groundTruthLineSum: sumTotals(GROUND_TRUTH),
    passCRawSum: sumTotals(passCRawItems),
    passCSum: sumTotals(passCItems),
    afterNormalizeSum: sumTotals(afterNormalizeItems),
    afterReconcileSum: sumTotals(afterReconcileNet),
    persistedSum: sumTotals(dbItems ?? []),
  },
  perRow: GROUND_TRUTH.map((gt) => {
    const passCMatch = passCItems.find((it: InvoiceLineItem) => matchScore(gt.description, it.name) >= 0.5);
    const dbMatch = (dbItems ?? []).find((r) => matchScore(gt.description, r.name ?? "") >= 0.5);
    return {
      item: gt.description,
      pdfTotal: gt.total,
      gptTotal: passCMatch?.total ?? null,
      persistedTotal: dbMatch?.total ?? null,
    };
  }),
  phantomRows: phantomRows.map((r: InvoiceLineItem) => ({
    name: r.name,
    gptTotal: r.total,
    persistedTotal:
      (dbItems ?? []).find((d) => normName(d.name ?? "") === normName(r.name ?? ""))?.total ?? null,
  })),
  differenceExplainedBy: [] as string[],
};

const gtSum = moneyAudit.sums.groundTruthLineSum;
const gptSum = moneyAudit.sums.passCSum;
if (Math.abs(gptSum - gtSum) > 0.02) {
  moneyAudit.differenceExplainedBy.push(
    `GPT line sum ${gptSum} vs ground truth ${gtSum} (delta ${round2(gptSum - gtSum)})`,
  );
}
for (const p of phantomRows) {
  moneyAudit.differenceExplainedBy.push(
    `Phantom/extra row "${p.name}" adds ${p.total ?? 0} to GPT sum`,
  );
}
writeFileSync(`${OUT_DIR}/money-audit.json`, JSON.stringify(moneyAudit, null, 2));

// TASK 5 — phantom trace
const olioInRaw = passCRawItems.find((it: { name?: string }) => /olio\s*nu/i.test(it?.name ?? ""));
const olioInPassC = passCItems.find((it: { name?: string }) => /olio\s*nu/i.test(it?.name ?? ""));
const olioInDb = (dbItems ?? []).find((r) => /olio\s*nu/i.test(r.name ?? ""));

writeFileSync(
  `${OUT_DIR}/phantom-item-trace.json`,
  JSON.stringify(
    {
      phantomLabel: "Olio Nuto 609 10lt (user) / Olio Nueto 609 DOP 3lt (GPT)",
      visibleOnSourceInvoice: false,
      firstAppearance: olioInRaw
        ? "GPT (Pass C raw)"
        : olioInPassC
          ? "After normalizeItems/reconcile (edge function)"
          : olioInDb
            ? "Persistence only"
            : "Not found in current pipeline",
      stages: {
        sourceInvoice: { present: false, evidence: "Manual transcription of invoice-full.png — 8 rows, no olive oil product" },
        crop: {
          present: "N/A — crop does not invent text",
          cropTop: cropMeta.bounds?.top,
          cropBounds: cropMeta.bounds,
          note: "Table crop includes all 8 visible rows after geometry fix (top≈386)",
        },
        ocr: { present: false, note: "Pipeline uses GPT vision, not separate OCR stage" },
        gptPassCRaw: {
          present: !!olioInRaw,
          item: olioInRaw ?? null,
        },
        afterNormalizeItems: {
          present: !!afterNormalizeItems.find((it) => /olio\s*nu/i.test(it.name)),
          note: "normalizeItems does not add/remove rows",
        },
        afterReconcile: {
          present: !!afterReconcileNet.find((it) => /olio\s*nu/i.test(it.name)),
          note: "reconcile does not add/remove rows",
        },
        extractInvoiceResponse: { present: !!olioInPassC, item: olioInPassC ?? null },
        persistence: { present: !!olioInDb, item: olioInDb ?? null },
      },
      hallucinationHypothesis:
        "GPT may have fused Birra Peroni lot number '6009' with Aceto 'pet 5l*2' (10L) into a phantom olive oil line",
    },
    null,
    2,
  ),
);

// TASK 6 — classification
const usedExtracted = new Set<number>();
const classifications = GROUND_TRUTH.map((gt) => {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < passCItems.length; i++) {
    const score = matchScore(gt.description, passCItems[i].name ?? "");
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  const extracted =
    bestIdx >= 0 && bestScore >= 0.35 ? passCItems[bestIdx] : null;
  if (extracted && bestIdx >= 0) usedExtracted.add(bestIdx);
  const status = classifyRow(gt, extracted);
  return {
    groundTruthItem: gt.description,
    extractedItem: extracted?.name ?? null,
    status,
  };
});

for (let i = 0; i < passCItems.length; i++) {
  if (!usedExtracted.has(i)) {
    classifications.push({
      groundTruthItem: null,
      extractedItem: passCItems[i].name,
      status: "PHANTOM" as const,
    });
  }
}

writeFileSync(`${OUT_DIR}/classification.json`, JSON.stringify({ rows: classifications }, null, 2));

const summary = {
  invoiceId: INVOICE_ID,
  dbRowCount: dbItems?.length ?? 0,
  passCRawCount: passCRawItems.length,
  passCCount: passCItems.length,
  gptProducedOlio: !!olioInRaw,
  groundTruthSum: gtSum,
  passCSum: gptSum,
  invoiceTotal: invoice?.total,
  cropTop: cropMeta.bounds?.top,
};
writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
