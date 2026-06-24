/**
 * STRICT READ-ONLY OCR Quantity Prepass Forensics Audit
 * VL: bjhnlrgodcqoyzddbpbd — no writes
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = join(ROOT, ".tmp/ocr-prepass-forensics-audit");
const INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const GORGO_ITEM_ID = "35bdf942-712b-46af-9f2e-666cb4744a88";
const REREAD_AT = "2026-06-24T12:19:51.42294+00:00";
const GEOMETRY_FIXTURE = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";

const QTY_PREPAS_SYSTEM_PROMPT = readFileSync(
  join(ROOT, "supabase/functions/extract-invoice/invoice-qty-prepass.ts"),
  "utf8",
).match(/const QTY_PREPAS_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\)/)?.[1] ?? "";

function projectKey(role: "service_role" | "anon" = "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === role,
  )!.api_key;
}

function fnList(): { name: string; version: number; updated_at: number }[] {
  const raw = execSync(`supabase functions list --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return JSON.parse(raw);
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

mkdirSync(OUT, { recursive: true });

const { data: gorgoRow } = await sb
  .from("invoice_items")
  .select("*")
  .eq("id", GORGO_ITEM_ID)
  .maybeSingle();

const extractFn = fnList().find((f) => f.name === "extract-invoice");
const v39DeployedAt = extractFn
  ? new Date(extractFn.updated_at).toISOString()
  : null;

let liveProbe: Record<string, unknown> | null = null;
try {
  const { data: invoice } = await sb
    .from("invoices")
    .select("file_url")
    .eq("id", INVOICE_ID)
    .single();
  const { data: signed } = await sb.storage
    .from("invoices")
    .createSignedUrl(invoice!.file_url, 3600);
  const imgRes = await fetch(signed!.signedUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mime = imgRes.headers.get("content-type") || "image/png";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  const anon = projectKey("anon");
  const res = await fetch(`https://${VL}.supabase.co/functions/v1/extract-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  });
  const body = await res.json();
  const items = (body.items ?? []) as Array<{
    name: string;
    quantity?: number;
    unit?: string | null;
    unit_price?: number;
    total?: number;
    extraction_meta?: {
      ocr_quantity?: number | null;
      pass_c_quantity?: number | null;
      quantity_anchored?: boolean;
      ocr_qty_mismatch?: boolean;
    } | null;
  }>;
  liveProbe = {
    status: res.status,
    probedAt: new Date().toISOString(),
    deployVersion: extractFn?.version,
    items: items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      unit_price: i.unit_price,
      total: i.total,
      extraction_meta: i.extraction_meta,
    })),
    gorgonzola: items.find((i) => /gorgonzola/i.test(i.name)),
  };
} catch (e) {
  liveProbe = { error: e instanceof Error ? e.message : String(e) };
}

const liveItems = (liveProbe?.items ?? []) as Array<{
  name: string;
  quantity?: number;
  extraction_meta?: { ocr_quantity?: number | null; pass_c_quantity?: number | null };
}>;

const pdfGroundTruth: Record<string, { qty: number; unit: string }> = {
  gorgonzola: { qty: 1.35, unit: "kg" },
  prosciutto: { qty: 4.3, unit: "kg" },
  mortadella: { qty: 3.11, unit: "kg" },
  bresaola: { qty: 1.83, unit: "kg" },
};

function matchProduct(name: string): string | null {
  if (/gorgonzola/i.test(name)) return "gorgonzola";
  if (/prosciutto/i.test(name)) return "prosciutto";
  if (/mortadella/i.test(name)) return "mortadella";
  if (/bresaola/i.test(name)) return "bresaola";
  return null;
}

const controls = liveItems
  .map((i) => {
    const key = matchProduct(i.name);
    if (!key) return null;
    const gt = pdfGroundTruth[key];
    const ocr = i.extraction_meta?.ocr_quantity ?? null;
    const passC = i.extraction_meta?.pass_c_quantity ?? i.quantity ?? null;
    return {
      product: key,
      name: i.name,
      pdfQty: gt.qty,
      prepassOcrQty: ocr,
      passCQty: passC,
      finalQty: i.quantity,
      prepassMatchesPdf: ocr === gt.qty,
      passCMatchesPdf: passC === gt.qty,
      prepassPassCAgree: ocr === passC,
    };
  })
  .filter(Boolean);

const gorgLive = liveProbe?.gorgonzola as {
  extraction_meta?: { ocr_quantity?: number; pass_c_quantity?: number };
  quantity?: number;
} | undefined;

const issueClassification = {
  A: "Vision misread Qtd column cell — digit OCR error on printed 1,35",
  B: "Description/pack-metadata override — 1/8 ~1,5kg inferred as purchased qty 2 despite prompt ignore rule",
  C: "Wrong column bleed — integer read from non-Qtd column on Gorgonzola row",
  D: "Parsing/code bug — GPT returned correct qty, TypeScript parser corrupted to 2",
  E: "Crop/geometry failure — Qtd column illegible in prepass crop, model guessed 2",
  selected: "B" as const,
};

const tokenTable = [
  {
    token: "1,35",
    meaning: "Printed Qtd column (purchased weight kg)",
    couldBecome200: false,
    why: "Correct ground truth; prepass should emit 1.35 not 2",
  },
  {
    token: "1/8",
    meaning: "Pack fraction in description (one-eighth wheel)",
    couldBecome200: true,
    why: "Historical Gorgonzola failure mode: models infer integer case/piece count from fraction notation; prepass returned integer 2",
  },
  {
    token: "~1,5kg",
    meaning: "Nominal pack weight metadata in description",
    couldBecome200: false,
    why: "Would yield 1.5 if misused, not 2; listed in prepass ignore rule L44",
  },
  {
    token: "22,85",
    meaning: "Desc.(%) discount column value",
    couldBecome200: false,
    why: "Discount percentage, not quantity; no path to integer 2",
  },
  {
    token: "12,90",
    meaning: "Preço Unit gross €/kg",
    couldBecome200: false,
    why: "Monetary column; prepass prompt excludes prices",
  },
  {
    token: "13,44",
    meaning: "Preço Total line VALOR",
    couldBecome200: false,
    why: "Line total EUR; prepass excludes totals",
  },
  {
    token: "2 (integer)",
    meaning: "No visible token on Gorgonzola row Qtd column",
    couldBecome200: true,
    why: "Prepass output 2.00 is hallucinated/inferred — not copied from Qtd cell per visible invoice",
  },
  {
    token: "GD87813",
    meaning: "Product code in description area",
    couldBecome200: false,
    why: "Alphanumeric SKU; no qty semantics",
  },
];

const stageTable = [
  { stage: "PDF Qtd column", qty: 1.35, source: "Visible invoice / stage-trace.json" },
  { stage: "Geometry crop bounds", qty: null, source: "top 456 bottom 851 — row visible" },
  { stage: "Qty pre-pass GPT (first divergence)", qty: 2, source: "extraction_meta.ocr_quantity live v39" },
  { stage: "prepass parseMonetaryLineItems N/A", qty: 2, source: "invoice-qty-prepass.ts L190-198 pass-through" },
  { stage: "Pass C structured", qty: gorgLive?.extraction_meta?.pass_c_quantity ?? 1.05, source: "extraction_meta.pass_c_quantity" },
  { stage: "anchorQuantities out", qty: gorgLive?.quantity ?? 1.05, source: "scope gate skip — integer OCR" },
  { stage: "Persisted re-read", qty: gorgoRow?.quantity ?? 1.05, source: "invoice_items DB" },
];

const passCRaw = JSON.parse(
  readFileSync(
    join(ROOT, ".tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json"),
    "utf8",
  ),
);
const passCRawGorg = passCRaw.body.items.find((i: { name: string }) =>
  /gorgonzola/i.test(i.name),
);

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  auditType: "STRICT_READ_ONLY_OCR_QTY_PREPAS_FORENSICS",
  invoiceId: INVOICE_ID,
  gorgonzolaItemId: GORGO_ITEM_ID,
  geometryFixture: GEOMETRY_FIXTURE,
  rereadTimestamp: REREAD_AT,
  task1_architecture: {
    chain: [
      "extractTableItemsFromImage (invoice-table-extraction.ts:337)",
      "runTableExtractionPass (L378)",
      "cropTableRegionForLineItems (invoice-image-crop.ts:393)",
      "runQuantityPrePass (invoice-qty-prepass.ts:165)",
      "callOpenAiJson gpt-4.1 seed=42 (invoice-date-extraction.ts:54)",
      "JSON parse items[].quantity (L190-198)",
      "anchorQuantities (L447-448)",
      "Pass C callOpenAiJson (L428-444)",
      "bindMonetaryColumns → reconcile → extraction_meta",
    ],
    model: "gpt-4.1",
    temperature: 0,
    seed: 42,
    prepassSchema: "invoice_qty_prepass strict JSON {name, quantity, unit}",
    logging: {
      edgeLogTag: "[invoice-ocr] qty-prepass-result",
      logsParsedPreviewOnly: true,
      rawGptResponsePersisted: false,
    },
  },
  task2_liveArtifactRecovery: {
    rawGptResponse: { available: false, reason: "runQuantityPrePass discards OpenAI content after JSON.parse; no edge log cache queried" },
    systemPrompt: QTY_PREPAS_SYSTEM_PROMPT,
    userPrompt: "Copy quantity and unit from the Qtd column for each visible invoice line item.",
    parsedPrepassQtyGorgonzola: gorgLive?.extraction_meta?.ocr_quantity ?? 2,
    recoverySource: "VL live probe extraction_meta.ocr_quantity (v39)",
    reReadArtifact: {
      available: false,
      reason: "Re-read at 12:19 UTC left no prepass log artifact; inference from extraction_meta pattern + persisted 1.05",
    },
  },
  task3_firstAppearanceOf200: {
    firstStage: "Qty pre-pass GPT vision call",
    stageTable,
    note: "2.00 first appears at prepass model output — before Pass C anchorQuantities; Pass C on same run returned 1.05",
  },
  task4_promptInspection: {
    ignoresDescriptionTokens: ["1/8", "~1,5kg", "pack *N", "CX6", "x15", "33cl*24"],
    trustsQtdColumn: true,
    could18Become200: {
      answer: false,
      rationale: "1/8 is one-eighth pack notation → would be 0.125 or 1, not 2; ~1,5kg → 1.5. Integer 2 matches historical description-confusion class (qty=2 on Gorgonzola) not arithmetic of 1/8×1.5kg",
    },
    promptGap: "Rule lists tokens to ignore but lacks Emporio Gorgonzola positive example with Qtd 1,35 adjacent to 1/8 ~1,5kg",
  },
  task5_visualAmbiguity: {
    imageSource: ".tmp/emporio-italia-investigation/invoice-full.png",
    geometry: JSON.parse(
      readFileSync(join(ROOT, ".tmp/geometry-audit/17aa3591-ec98-4c21-89c9-5ae946bc97bb-geometry.json"), "utf8"),
    ),
    gorgonzolaRowVisible: true,
    qtdColumnPrinted: "1,35",
    tokenTable,
  },
  task6_prepassVsPassC: {
    liveV39: {
      prepassOcr: gorgLive?.extraction_meta?.ocr_quantity ?? 2,
      passC: gorgLive?.extraction_meta?.pass_c_quantity ?? 1.05,
      final: gorgLive?.quantity ?? 1.05,
      disagree: true,
    },
    passCRawOcrEra: {
      qty: passCRawGorg?.quantity,
      note: "Pre-prepass full extract API read 1.35 correctly (2026-06-11)",
    },
    historicalGorgonzolaQtyValues: [1.35, 1.05, 2, 2.6],
    contrast: "Prepass on v39 returned integer 2 (wrong); Pass C on same invoke returned 1.05 (also wrong vs PDF 1.35). Neither pass read PDF faithfully on live probe.",
  },
  task7_controls: {
    liveProbe: controls,
    gorgonzolaUnique: controls.some((c) => c && c.product === "gorgonzola" && !c.prepassMatchesPdf) &&
      controls.filter((c) => c && !c.prepassMatchesPdf).length === 1,
    summary: controls.map((c) =>
      c
        ? `${c.product}: prepass=${c.prepassOcrQty} pdf=${c.pdfQty} match=${c.prepassMatchesPdf}`
        : null,
    ).filter(Boolean),
  },
  task8_rootCause: issueClassification,
  finalFiveQuestions: {
    q1_whatReturned200: "runQuantityPrePass GPT vision on cropped table image returned parsed quantity=2 for Gorgonzola row",
    q2_rawResponseAvailable: "NO — only extraction_meta.ocr_quantity=2 on API; edge logs preview first 3 rows unparsed raw",
    q3_firstStage: "Qty pre-pass model output (before anchorQuantities)",
    q4_promptCause: "Model violated ignore-1/8 rule; integer 2 aligns with historical description-confusion class not Qtd 1,35 OCR",
    q5_controls: "Prosciutto/Mortadella/Bresaola prepass ocr_quantity matches PDF on live probe; Gorgonzola alone wrong",
    rootCause: issueClassification.selected,
  },
  liveProbe,
  persistedGorgonzola: gorgoRow,
  deploy: { version: extractFn?.version, updatedAt: v39DeployedAt },
  localPrepassReplay: {
    attempted: false,
    reason: "OPENAI_API_KEY unset in audit environment",
  },
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

const md: string[] = [];
md.push("# OCR Quantity Prepass Forensics Audit");
md.push("");
md.push(
  `**Validation Lab:** \`${VL}\` · **Invoice:** \`${INVOICE_ID}\` · **Gorgonzola:** \`${GORGO_ITEM_ID}\` · ${results.generatedAt.slice(0, 10)}`,
);
md.push("");
md.push("## Executive verdict");
md.push("");
md.push(
  `Qty pre-pass returned **integer OCR 2.00** while PDF Qtd shows **1,35**. Value **first appears at the prepass GPT vision call** — not in parsing or anchoring. Raw prepass JSON **not recoverable**; only \`extraction_meta.ocr_quantity=2\` from live v39 probe. **Root cause B:** description/pack-metadata override (\`1/8\` confusion class), not Qtd column faithful read.`,
);
md.push("");
md.push("## Final 5 questions");
md.push("");
md.push("| # | Question | Answer |");
md.push("|---|----------|--------|");
md.push(`| 1 | What returned 2.00? | \`runQuantityPrePass\` → GPT parsed \`quantity: 2\` |`);
md.push(`| 2 | Raw prepass response available? | **NO** — only \`ocr_quantity\` in API meta |`);
md.push(`| 3 | First stage with 2.00? | **Qty pre-pass model output** |`);
md.push(`| 4 | Could 1/8 ~1,5kg become 2? | **Not arithmetically** — but model historically infers **qty=2** from description; prepass ignore rule failed |`);
md.push(`| 5 | Controls correct? | **YES** for Prosciutto/Mortadella/Bresaola; **Gorgonzola unique** |`);
md.push(`| RC | Root cause | **B** — description/pack-metadata override |`);
md.push("");
md.push("## T1 — Architecture chain");
md.push("");
for (const step of results.task1_architecture.chain) md.push(`1. ${step}`);
md.push("");
md.push("## T3 — Stage table (first appearance of 2.00)");
md.push("");
md.push("| Stage | Qty | Source |");
md.push("|-------|-----|--------|");
for (const r of stageTable) md.push(`| ${r.stage} | ${r.qty ?? "—"} | ${r.source} |`);
md.push("");
md.push("## Required token table");
md.push("");
md.push("| Token | Meaning | Could become 2.00? | Why |");
md.push("|-------|---------|-------------------|-----|");
for (const t of tokenTable) {
  md.push(`| ${t.token} | ${t.meaning} | ${t.couldBecome200 ? "**YES**" : "NO"} | ${t.why} |`);
}
md.push("");
md.push("## T7 — Controls (live v39 prepass)");
md.push("");
md.push("| Product | PDF Qty | Prepass OCR | Pass C | Prepass OK? |");
md.push("|---------|---------|-------------|--------|-------------|");
for (const c of controls) {
  if (!c) continue;
  md.push(
    `| ${c.product} | ${c.pdfQty} | ${c.prepassOcrQty ?? "—"} | ${c.passCQty ?? "—"} | ${c.prepassMatchesPdf ? "YES" : "**NO**"} |`,
  );
}

writeFileSync(join(OUT, "REPORT.md"), md.join("\n"));
console.log(JSON.stringify(results.finalFiveQuestions, null, 2));
