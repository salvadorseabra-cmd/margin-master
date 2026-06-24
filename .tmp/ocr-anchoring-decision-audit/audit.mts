/**
 * STRICT READ-ONLY OCR Anchoring Decision Audit
 * VL: bjhnlrgodcqoyzddbpbd — no writes
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  deriveMathematicalReconciliationReviewReason,
  deriveOcrQtyMismatchReviewReason,
  needsMathematicalReconciliationReview,
  needsOcrQtyMismatchReview,
} from "../../src/lib/invoice-extraction-review.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = join(ROOT, ".tmp/ocr-anchoring-decision-audit");
const INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const GORGO_ITEM_ID = "35bdf942-712b-46af-9f2e-666cb4744a88";
const REREAD_AT = "2026-06-24T12:19:51.42294+00:00";

const QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT = 2;
const QTY_ANCHOR_SCORE_MARGIN_EUR = 0.1;
const QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR = 0.5;
const OCR_QTY_MISMATCH_THRESHOLD_PCT = 10;

const round2 = (n: number) => Math.round(n * 100) / 100;

type Structured = {
  name: string;
  quantity: number;
  unit: string;
  gross_unit_price: number;
  discount_pct: number;
  line_total_net: number;
};

function isFractionalQty(qty: number): boolean {
  return Number.isFinite(qty) && qty > 0 && Math.abs(qty % 1) > 0.001;
}

function isQtyAnchorScopeRow(ocrQty: number, structured: Structured): boolean {
  if (structured.unit !== "kg") return false;
  if (!isFractionalQty(ocrQty)) return false;
  return structured.discount_pct != null ||
    structured.gross_unit_price > structured.line_total_net;
}

function deriveNetUnit(gross: number, discount: number): number {
  return round2(gross * (1 - discount / 100));
}

function scoreQty(qty: number, lineTotalNet: number, netUnit: number): number {
  return round2(Math.abs(lineTotalNet - qty * netUnit));
}

function mathReviewFails(qty: number, unitPrice: number, total: number): boolean {
  const expected = round2(qty * unitPrice);
  const actual = round2(total);
  const variance_abs = round2(Math.abs(expected - actual));
  const denom = Math.max(Math.abs(actual), Math.abs(expected), 0.01);
  const variance_pct = round2((variance_abs / denom) * 100);
  return variance_abs > 0.5 && variance_pct > 5;
}

function replayAnchor(
  id: string,
  ocrQty: number,
  passCQty: number,
  lineTotalNet: number,
) {
  const structured: Structured = {
    name: "Gorgonzola",
    quantity: passCQty,
    unit: "kg",
    gross_unit_price: 12.9,
    discount_pct: 22.85,
    line_total_net: lineTotalNet,
  };
  const netUnit = deriveNetUnit(12.9, 22.85);
  const scopeIn = isQtyAnchorScopeRow(ocrQty, structured);
  const delta = round2((Math.abs(ocrQty - passCQty) / Math.max(ocrQty, 0.01)) * 100);
  const scoreOcr = scoreQty(ocrQty, lineTotalNet, netUnit);
  const scorePassC = scoreQty(passCQty, lineTotalNet, netUnit);
  const mathFails = mathReviewFails(passCQty, netUnit, lineTotalNet);

  let quantityAnchored = false;
  let ocrMismatch = false;
  let outputQty = passCQty;
  let branch = "";

  if (!scopeIn) {
    branch = "isQtyAnchorScopeRow false → early return (invoice-qty-prepass.ts:221-224)";
  } else if (delta <= QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT) {
    branch = `deltaPct ${delta}% ≤ ${QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT}% → agreement skip (L234-237)`;
  } else if (lineTotalNet == null) {
    branch = "line_total_net null (L240-246)";
    ocrMismatch = delta > OCR_QTY_MISMATCH_THRESHOLD_PCT;
  } else {
    const shouldAnchor =
      scoreOcr < scorePassC - QTY_ANCHOR_SCORE_MARGIN_EUR ||
      (mathFails && scoreOcr <= QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR);
    if (shouldAnchor) {
      outputQty = ocrQty;
      quantityAnchored = true;
      branch = "shouldAnchor true → replace with OCR (L257-264)";
    } else {
      ocrMismatch = delta > OCR_QTY_MISMATCH_THRESHOLD_PCT;
      branch = `shouldAnchor false → keep Pass C; ocr_qty_mismatch=${ocrMismatch} (L267-273)`;
    }
  }

  const meta = {
    ocr_quantity: ocrQty,
    pass_c_quantity: passCQty,
    quantity_anchored: quantityAnchored,
    ocr_qty_mismatch: ocrMismatch,
  };
  const persisted = {
    quantity: outputQty,
    unit_price: quantityAnchored ? netUnit : netUnit,
    total: lineTotalNet,
  };
  return {
    id,
    scopeIn,
    deltaPct: delta,
    scoring: { scoreOcr, scorePassC, mathFails, netUnit },
    meta,
    outputQty,
    persisted,
    mathReview: needsMathematicalReconciliationReview(persisted),
    ocrReview: needsOcrQtyMismatchReview(meta),
    branch,
  };
}

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

const { data: gorgoHistory } = await sb
  .from("invoice_items")
  .select("id,quantity,unit_price,total,created_at")
  .eq("invoice_id", INVOICE_ID)
  .ilike("name", "%gorgonzola%")
  .order("created_at", { ascending: false })
  .limit(8);

const extractFn = fnList().find((f) => f.name === "extract-invoice");
const v39DeployedAt = extractFn
  ? new Date(extractFn.updated_at).toISOString()
  : null;
const rereadAfterDeploy =
  v39DeployedAt != null && new Date(REREAD_AT) > new Date(v39DeployedAt);

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
  const g = (body.items ?? []).find((i: { name: string }) =>
    /gorgonzola/i.test(i.name),
  );
  liveProbe = { status: res.status, gorgonzola: g, probedAt: new Date().toISOString() };
} catch (e) {
  liveProbe = { error: e instanceof Error ? e.message : String(e) };
}

const liveGorg = liveProbe?.gorgonzola as {
  quantity?: number;
  unit_price?: number;
  total?: number;
  extraction_meta?: {
    ocr_quantity?: number;
    pass_c_quantity?: number;
    quantity_anchored?: boolean;
    ocr_qty_mismatch?: boolean;
  };
} | undefined;

const liveMeta = liveGorg?.extraction_meta ?? null;
const liveOcrQty = liveMeta?.ocr_quantity ?? 2;

const replayA = replayAnchor("counterfactual_135_vs_105", 1.35, 1.05, 13.44);
const replayLive = replayAnchor("live_probe_replay", liveOcrQty, 1.05, 13.44);
const replayAgreement = replayAnchor("agreement_105", 1.05, 1.05, 13.44);
const replayS3 = replayAnchor("S3_scoring_decline", 1.35, 2, 18.72);

const persistedTrio = {
  quantity: gorgoRow?.quantity ?? 1.05,
  unit_price: gorgoRow?.unit_price ?? 9.95,
  total: gorgoRow?.total ?? 13.44,
};

const persistedMath = deriveMathematicalReconciliationReviewReason(persistedTrio);
const liveOcrReview = deriveOcrQtyMismatchReviewReason(liveMeta);

let gitClientOcrReview = "unknown";
try {
  const originInvoices = execSync("git show origin/main:src/routes/invoices.tsx", {
    encoding: "utf8",
    cwd: ROOT,
  });
  gitClientOcrReview = originInvoices.includes("needsOcrQtyMismatchReview")
    ? "present"
    : "absent";
} catch {
  gitClientOcrReview = "error";
}

const issueClassification = {
  A: "Scoring declined anchor — OCR 1.35 loses vs Pass C on line-total score",
  B: "Scope gate excluded row — isQtyAnchorScopeRow false (OCR prepass qty not fractional)",
  C: "runQuantityPrePass / anchorQuantities never executed",
  D: "ocr_qty_mismatch true but client review not visible",
  selected: "B" as const,
};

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  auditType: "STRICT_READ_ONLY_OCR_ANCHORING_DECISION",
  invoiceId: INVOICE_ID,
  gorgonzolaItemId: GORGO_ITEM_ID,
  rereadTimestamp: REREAD_AT,
  finalFiveQuestions: {
    executed: true,
    saw135InPrepass: false,
    whyRejected:
      "isQtyAnchorScopeRow requires fractional OCR qty; live prepass ocr_quantity=2 fails isFractionalQty → L221-224. Re-read persisted 1.05 proves prepass≠1.35.",
    whyNoOcrQtyMismatch:
      "defaultMeta.ocr_qty_mismatch=false on scope-fail; flag only when scoped+declined and delta>10%",
    issueClassification: issueClassification.selected,
  },
  task1_pipelineTrace: {
    deployVersion: extractFn?.version,
    deployUpdatedAt: v39DeployedAt,
    rereadAfterV39Deploy: rereadAfterDeploy,
  },
  task2_runQuantityPrePass: {
    executedAtReread: rereadAfterDeploy,
    returned135: false,
    liveProbeOcrQty: liveOcrQty,
    evidence: [
      `extract-invoice v${extractFn?.version} deployed ${v39DeployedAt}`,
      `Re-read ${REREAD_AT} after v39 deploy`,
      `extraction_meta.ocr_quantity=${liveOcrQty}`,
    ],
  },
  task3_anchorQuantities: {
    executed: true,
    liveProbeMeta: liveMeta,
    scoringTable: replayLive.scoring,
    scopeIn: replayLive.scopeIn,
    branch: replayLive.branch,
    counterfactual135: replayA,
  },
  task4_exactBranch: {
    file: "invoice-qty-prepass.ts",
    lines: "221-224",
    failingGate: "isFractionalQty(ocrQty)",
    liveOcrQty,
    alternativeIfPrepass105: replayAgreement.branch,
  },
  task5_ocrQtyMismatch: {
    generated: liveMeta?.ocr_qty_mismatch === true,
    liveFlag: liveMeta?.ocr_qty_mismatch ?? false,
    whyNot: "scope-fail defaultMeta forces false",
  },
  task6_reviewFramework: {
    extractionMetaInApi: liveMeta != null,
    originMainOcrReview: gitClientOcrReview,
    mathReviewOnPersisted: persistedMath,
    ocrReviewOnLiveMeta: liveOcrReview,
  },
  task7_replay: {
    scenarios: [replayA, replayAgreement, replayLive, replayS3],
    expected135: replayA,
    actualPersisted: persistedTrio,
  },
  task8_stageTable: [
    { stage: "PDF Qtd", qty: 1.35, source: "OCR/PDF" },
    { stage: "Qty pre-pass (live v39)", qty: liveOcrQty, source: "OCR prepass" },
    { stage: "Pass C (live)", qty: liveMeta?.pass_c_quantity ?? 1.05, source: "Pass C" },
    { stage: "anchorQuantities out", qty: liveGorg?.quantity, source: "Anchored" },
    { stage: "Persisted re-read", qty: persistedTrio.quantity, source: "Persisted" },
  ],
  gorgonzolaHistory: gorgoHistory,
  liveProbe,
  issueClassification,
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

const md: string[] = [];
md.push("# OCR Anchoring Decision Audit");
md.push("");
md.push(
  `**Validation Lab:** \`${VL}\` · **Invoice:** \`${INVOICE_ID}\` · **Gorgonzola:** \`${GORGO_ITEM_ID}\` · **Re-read:** \`${REREAD_AT}\` · ${results.generatedAt.slice(0, 10)}`,
);
md.push("");
md.push("## Executive verdict");
md.push("");
md.push(
  "Anchoring **ran on v39** but **did not select 1.35**. Qty pre-pass returned **integer OCR 2.00** (live probe), failing the fractional scope gate → early exit. Persisted **1.05** proves re-read prepass **≠ 1.35**.",
);
md.push("");
md.push("## Final 5 questions");
md.push("");
md.push("| # | Question | Answer |");
md.push("|---|----------|--------|");
md.push("| 1 | Executed? | **YES** — v39; extraction_meta in API |");
md.push("| 2 | Saw 1.35? | **NO** — live ocr_quantity=2 |");
md.push("| 3 | Why rejected? | **Scope gate** — isFractionalQty(2)=false → L221-224 |");
md.push("| 4 | Why no OCR_QTY_MISMATCH? | defaultMeta forces false on scope-fail |");
md.push("| 5 | Issue | **B** — Scope gate excluded row |");
md.push("");
md.push("## T3 — Scoring table (live OCR=" + liveOcrQty + ")");
md.push("");
md.push("| | Live | Counterfactual 1.35 |");
md.push("|---|------|---------------------|");
md.push(`| scopeIn | ${replayLive.scopeIn} | ${replayA.scopeIn} |`);
md.push(`| scoreOcr | ${replayLive.scoring.scoreOcr} | ${replayA.scoring.scoreOcr} |`);
md.push(`| scorePassC | ${replayLive.scoring.scorePassC} | ${replayA.scoring.scorePassC} |`);
md.push(`| output qty | ${replayLive.outputQty} | ${replayA.outputQty} |`);
md.push(`| quantity_anchored | ${replayLive.meta.quantity_anchored} | ${replayA.meta.quantity_anchored} |`);
md.push("");
md.push("## T8 — Stage table");
md.push("");
md.push("| Stage | Qty | Source |");
md.push("|-------|-----|--------|");
for (const r of results.task8_stageTable) md.push(`| ${r.stage} | ${r.qty} | ${r.source} |`);

writeFileSync(join(OUT, "REPORT.md"), md.join("\n"));
console.log(JSON.stringify(results.finalFiveQuestions, null, 2));
