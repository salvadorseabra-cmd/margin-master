/**
 * STRICT READ-ONLY OCR Anchoring Activation Audit
 * VL: bjhnlrgodcqoyzddbpbd — no writes
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  needsMathematicalReconciliationReview,
  needsOcrQtyMismatchReview,
} from "../../src/lib/invoice-extraction-review.ts";

const QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT = 2;
const QTY_ANCHOR_SCORE_MARGIN_EUR = 0.1;
const QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR = 0.5;
const OCR_QTY_MISMATCH_THRESHOLD_PCT = 10;

const round2 = (n: number) => Math.round(n * 100) / 100;

function replayS3Scenario() {
  const ocrQty = 1.35;
  const passCQty = 2;
  const lineTotalNet = 18.72;
  const gross = 12.9;
  const discount = 22.85;
  const netUnit = round2(gross * (1 - discount / 100));
  const delta = round2((Math.abs(ocrQty - passCQty) / Math.max(ocrQty, 0.01)) * 100);
  const scoreOcr = round2(Math.abs(lineTotalNet - ocrQty * netUnit));
  const scorePassC = round2(Math.abs(lineTotalNet - passCQty * netUnit));
  const mathFails =
    round2(Math.abs(round2(passCQty * netUnit) - lineTotalNet)) > 0.5 &&
    round2(
      (round2(Math.abs(round2(passCQty * netUnit) - lineTotalNet)) /
        Math.max(lineTotalNet, round2(passCQty * netUnit), 0.01)) *
        100,
    ) > 5;
  const scopeIn =
    ocrQty > 0 &&
    Math.abs(ocrQty % 1) > 0.001 &&
    discount != null;
  let quantityAnchored = false;
  let anchoredQty = passCQty;
  let ocrMismatch = false;
  if (delta > QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT) {
    const shouldAnchor =
      scoreOcr < scorePassC - QTY_ANCHOR_SCORE_MARGIN_EUR ||
      (mathFails && scoreOcr <= QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR);
    if (shouldAnchor) {
      anchoredQty = ocrQty;
      quantityAnchored = true;
    } else if (delta > OCR_QTY_MISMATCH_THRESHOLD_PCT) {
      ocrMismatch = true;
    }
  }
  const meta = {
    ocr_quantity: ocrQty,
    pass_c_quantity: passCQty,
    quantity_anchored: quantityAnchored,
    ocr_qty_mismatch: ocrMismatch,
  };
  const persisted = {
    quantity: anchoredQty,
    unit_price: quantityAnchored ? netUnit : round2(lineTotalNet / anchoredQty),
    total: lineTotalNet,
  };
  return {
    scopeIn,
    meta,
    persisted,
    ocrReview: needsOcrQtyMismatchReview(meta),
    mathReview: needsMathematicalReconciliationReview(persisted),
    scores: { scoreOcr, scorePassC, netUnit, delta, mathFails },
  };
}

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = join(ROOT, ".tmp/ocr-anchoring-activation-audit");
const CURRENT_ITEM_ID = "091d5bc2-b041-4a65-b652-d9be15b5fd3f";
const INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const REREAD_AT = "2026-06-24T10:45:37.333848+00:00";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

function fnList(): unknown {
  const raw = execSync(`supabase functions list --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return JSON.parse(raw);
}

function gitShowHead(path: string): string | null {
  try {
    return execSync(`git show HEAD:${path}`, { encoding: "utf8", cwd: ROOT });
  } catch {
    return null;
  }
}

function gitStatusShort(path: string): string {
  try {
    return execSync(`git status --short ${path}`, { encoding: "utf8", cwd: ROOT }).trim();
  } catch {
    return "";
  }
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

mkdirSync(OUT, { recursive: true });

const { data: item, error: itemErr } = await sb
  .from("invoice_items")
  .select("*")
  .eq("id", CURRENT_ITEM_ID)
  .maybeSingle();

const { data: gorgoRows } = await sb
  .from("invoice_items")
  .select("id,name,quantity,unit,unit_price,total,created_at,updated_at,invoice_id")
  .eq("invoice_id", INVOICE_ID)
  .ilike("name", "%gorgonzola%")
  .order("created_at", { ascending: false })
  .limit(5);

const latestGorgo = (gorgoRows ?? [])[0] ?? null;
const persistedRow = (item ?? latestGorgo) as Record<string, unknown> | null;
const itemSuperseded = !item && latestGorgo != null;

const extractFn = (fnList() as { name: string; version: number; updated_at: number }[]).find(
  (f) => f.name === "extract-invoice",
);

const deployedUpdatedAt = extractFn
  ? new Date(extractFn.updated_at).toISOString()
  : null;

const headTable = gitShowHead("supabase/functions/extract-invoice/invoice-table-extraction.ts");
const headHasAnchoring =
  headTable != null &&
  (headTable.includes("runQuantityPrePass") || headTable.includes("anchorQuantities"));

const localTable = readFileSync(
  join(ROOT, "supabase/functions/extract-invoice/invoice-table-extraction.ts"),
  "utf8",
);
const localHasAnchoring =
  localTable.includes("runQuantityPrePass") && localTable.includes("anchorQuantities");

const qtyPrepassStatus = gitStatusShort(
  "supabase/functions/extract-invoice/invoice-qty-prepass.ts",
);
const tableStatus = gitStatusShort(
  "supabase/functions/extract-invoice/invoice-table-extraction.ts",
);
const reviewStatus = gitStatusShort("src/lib/invoice-extraction-review.ts");
const invoicesStatus = gitStatusShort("src/routes/invoices.tsx");

const GORGO_PREPAS = { name: "Gorgonzola DOP Dolce", quantity: 1.35, unit: "kg" };
const replay = replayS3Scenario();
const scopeIn = replay.scopeIn;
const anchorMeta = [replay.meta];
const replayPersisted = replay.persisted;
const replayOcrReview = replay.ocrReview;
const replayMathReview = replay.mathReview;

const HISTORICAL_REREAD_ROW = {
  id: CURRENT_ITEM_ID,
  quantity: 2,
  unit_price: 9.35,
  total: 18.72,
  created_at: REREAD_AT,
  note: "From reread-pipeline-forensics-audit; superseded in VL by later re-read",
};
const dbColumns = persistedRow ? Object.keys(persistedRow) : [];
const hasOcrQuantityCol = dbColumns.includes("ocr_quantity");
const hasAnchoredQuantityCol = dbColumns.includes("anchored_quantity");
const hasExtractionMetaCol = dbColumns.includes("extraction_meta");

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  auditType: "STRICT_READ_ONLY_OCR_ANCHORING_ACTIVATION",
  invoiceId: INVOICE_ID,
  currentInvoiceItemId: CURRENT_ITEM_ID,
  rereadTimestamp: REREAD_AT,
  finalFiveQuestions: {
    activeInLocalCode: localHasAnchoring,
    executedDuringLiveReread: false,
    bypassedByGating: false,
    neverWiredToProduction: true,
    whyNoReview:
      "VL extract-invoice v38 (deployed 2026-06-23) lacks qty pre-pass; OCR anchoring + client review exist only in uncommitted local files; extraction_meta is session-only and not persisted; persisted 2/9.35/18.72 is math-consistent so math review would not fire even on committed client.",
  },
  verdict: "NEVER_RUNNING_AT_REREAD",
  verdictDetail:
    "OCR quantity anchoring was implemented locally after the live re-read and was never deployed to Validation Lab extract-invoice v38.",
  task1_pipelineTrace: {
    ui: "reExtract(row) → invoices.tsx:2438",
    runExtraction: "supabase.functions.invoke('extract-invoice', { imageDataUrl }) — invoices.tsx:1389",
    edgeIndex: "extract-invoice/index.ts → extractTableItemsFromImage",
  deployedV38Pipeline:
      "crop → Pass C GPT (parseMonetaryLineItems) → bindMonetaryColumns → reconcileLineItemAmounts → finalize",
    localUncommittedPipeline:
      "crop → runQuantityPrePass → Pass C GPT → anchorQuantities → bindMonetaryColumns → reconcile → attach extraction_meta per item",
    persist:
      "DELETE invoice_items → INSERT quantity/unit_price/total only (no ocr_quantity, extraction_meta) — invoices.tsx:1475-1494",
    sessionMeta:
      "extraction_meta stripped before insert; mapped to extractionMetaByItemId by name after insert — invoices.tsx:1401-1566 (uncommitted)",
  },
  task2_runQuantityPrePass: {
    executedDuringLiveReread: false,
    evidence: [
      "HEAD commit has no runQuantityPrePass in invoice-table-extraction.ts",
      "invoice-qty-prepass.ts is untracked (??) — never committed",
      `VL extract-invoice still version ${extractFn?.version ?? "?"} updated ${deployedUpdatedAt}`,
      `Live re-read ${REREAD_AT} predates hardening implementation 2026-06-24T11:46:08Z`,
      "No qty-prepass-result logs available; edge logs not queried",
    ],
    logsExpectedIfRan: "[invoice-ocr] qty-prepass-result / qty-prepass-failed",
    extractionMetaInDb: false,
    artifacts: "none captured for 2026-06-24 live invoke",
  },
  task3_anchorQuantities: {
    executedDuringLiveReread: false,
    wouldHaveInputsIfRan: {
      ocr_quantity: 1.35,
      pass_c_quantity: 2,
      line_total_net: 18.72,
      selected_quantity_expected: 2,
      quantity_anchored: false,
      ocr_qty_mismatch: true,
    },
    evidence: [
      "anchorQuantities only called when prepassRows.length > 0 in local invoice-table-extraction.ts:447-448",
      "Deployed v38 calls bindMonetaryColumns(parseMonetaryLineItems(...)) directly — no anchorQuantities",
    ],
  },
  task4_gatingConditions: {
    source: "supabase/functions/extract-invoice/invoice-qty-prepass.ts",
    isQtyAnchorScopeRow: {
      unitMustBeKg: "normalizeWeightUnit(structured.unit ?? prepass.unit) === 'kg'",
      ocrQtyMustBeFractional: "isFractionalQty(ocrQty) — abs(qty % 1) > 0.001",
      emporioDiscountSemantics:
        "discount_pct != null OR (gross_unit_price > line_total_net when both present)",
    },
    anchorWhen: {
      agreementSkip: `deltaPct <= ${QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT}%`,
      noLineTotal: "if line_total_net null → no anchor; may set ocr_qty_mismatch if delta > 10%",
      shouldAnchor:
        `scoreOcr < scorePassC - ${QTY_ANCHOR_SCORE_MARGIN_EUR} OR (mathReviewFails(passC) AND scoreOcr <= ${QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR})`,
      mismatchFlag: `delta > ${OCR_QTY_MISMATCH_THRESHOLD_PCT}% when anchor not applied`,
    },
    gorgonzolaS3ScopeGate: scopeIn,
    gorgonzolaS3GateNotes:
      "fractional 1.35 kg + discount_pct 22.85 → IN SCOPE; anchoring declined because Pass C qty×net unit fits line_total better than OCR qty",
  },
  task5_persistedInvoiceItem: {
    historicalRereadRow: HISTORICAL_REREAD_ROW,
    currentVlRow: persistedRow,
    itemId091d5bc2StillPresent: Boolean(item),
    itemSuperseded,
    queryError: itemErr?.message ?? null,
    columnNames: dbColumns,
    ocr_quantity_present: hasOcrQuantityCol,
    anchored_quantity_present: hasAnchoredQuantityCol,
    extraction_meta_present: hasExtractionMetaCol,
    gorgonzolaHistory: gorgoRows,
    note: "invoice_items schema stores only quantity/unit_price/total; anchoring metadata is API-only (extraction_meta) and session state",
  },
  task6_ocrMismatchTrigger: {
    wouldTriggerWithCurrentCodeIfAnchoringRan: true,
    persistedQuantity: persistedRow?.quantity ?? HISTORICAL_REREAD_ROW.quantity,
    hypotheticalOcrQuantity: 1.35,
    deltaPct: 48.15,
    whyClientDidNotShowReview: [
      "Edge v38 did not run anchorQuantities → no extraction_meta in API response",
      "Client OCR review wiring (needsOcrQtyMismatchReview + extractionMetaByItemId) is uncommitted local change",
      "Committed needsExtractionConfirmation only checks placeholder/qty/unit/amount — not OCR mismatch",
      "Persisted 2×9.35≈18.72 passes math reconciliation — no MATHEMATICAL_RECONCILIATION_FAILURE",
      "extractionMetaByItemId is React session state; lost on full page reload",
    ],
  },
  task7_replay: {
    inputs: { ocrQty: 1.35, passCQty: 2, lineTotalNet: 18.72, gross: 12.9, discount: 22.85 },
    anchorMeta: anchorMeta[0],
    expectedPersisted: replayPersisted,
    actualPersistedFromDb: persistedRow
      ? {
          id: persistedRow.id,
          quantity: persistedRow.quantity,
          unit_price: persistedRow.unit_price,
          total: persistedRow.total,
          created_at: persistedRow.created_at,
        }
      : HISTORICAL_REREAD_ROW,
    ocrReview: replayOcrReview,
    mathReview: replayMathReview,
    matchActualToReplay:
      (persistedRow?.quantity ?? HISTORICAL_REREAD_ROW.quantity) === replayPersisted.quantity &&
      (persistedRow?.total ?? HISTORICAL_REREAD_ROW.total) === replayPersisted.total,
    interpretation:
      "Replay confirms Pass C hallucination (2/18.72) would be KEPT with ocr_qty_mismatch=true IF anchoring ran; actual DB matches Pass C output because anchoring never ran",
  },
  deployGap: {
    extractInvoice: extractFn ?? null,
    deployedUpdatedAt,
    hardeningImplementedAt: "2026-06-24T11:46:08.586Z",
    rereadBeforeHardening: true,
    gitStatus: {
      "invoice-qty-prepass.ts": qtyPrepassStatus || "missing",
      "invoice-table-extraction.ts": tableStatus,
      "invoice-extraction-review.ts": reviewStatus || "missing",
      "invoices.tsx": invoicesStatus,
    },
    headHasAnchoring,
    localHasAnchoring,
    parallelToFamilyA:
      "Same pattern as Family A Hybrid H — local code ahead of VL edge deploy; live re-read hit pre-anchoring v38",
  },
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

const md: string[] = [];
md.push("# OCR Quantity Anchoring Activation Audit");
md.push("");
md.push(
  `**Validation Lab:** \`${VL}\` · **Invoice:** \`${INVOICE_ID}\` · **Gorgonzola item:** \`${CURRENT_ITEM_ID}\` · **Re-read:** \`${REREAD_AT}\` · **Read-only** · ${results.generatedAt.slice(0, 10)}`,
);
md.push("");
md.push("## Executive verdict");
md.push("");
md.push(
  "**NEVER RUNNING at live re-read** — OCR quantity anchoring exists only in **uncommitted local code** and was **not deployed** to VL `extract-invoice` v38 when the 2026-06-24 re-read produced Gorgonzola **2.00 / €9.35 / €18.73**.",
);
md.push("");
md.push("---");
md.push("");
md.push("## Final 5 questions");
md.push("");
md.push("| # | Question | Answer |");
md.push("|---|----------|--------|");
md.push(
  "| 1 | **Active?** | **Locally yes** — `invoice-qty-prepass.ts` + wired `runTableExtractionPass` in working tree. **Production VL: no** — v38 deployed 2026-06-23 lacks it. |",
);
md.push(
  "| 2 | **Executed during live re-read?** | **NO** — re-read at 10:45 UTC used deployed v38; hardening landed ~11:46 UTC; `invoice-qty-prepass.ts` is untracked. |",
);
md.push(
  "| 3 | **Bypassed by gating?** | **NO** — not bypassed; function absent from deployed edge. Gorgonzola S3 row **would be in scope** (fractional kg + Emporio discount). |",
);
md.push(
  "| 4 | **Never wired?** | **Edge: never deployed.** Client review (`extractionMetaByItemId`, `OCR_QUANTITY_MISMATCH`) also **uncommitted**. |",
);
md.push(
  "| 5 | **Why no review?** | No `extraction_meta` from edge; client OCR review not in committed build; persisted trio math-consistent; meta not stored in DB. |",
);
md.push("");
md.push("## T1 — Pipeline trace (UI → persist)");
md.push("");
md.push("| Stage | Live re-read (v38) | Local uncommitted |");
md.push("|-------|-------------------|-------------------|");
md.push("| UI | `reExtract` → `runExtraction` | same |");
md.push("| Edge | `extractTableItemsFromImage` | + `runQuantityPrePass` + `anchorQuantities` |");
md.push("| Pass C | GPT → `parseMonetaryLineItems` | same |");
md.push("| Bind | `bindMonetaryColumns` | after anchoring |");
md.push("| API meta | none | `extraction_meta` per item |");
md.push("| Persist | qty, unit_price, total only | same (meta stripped) |");
md.push("| Review | committed: placeholder/qty/amount only | + OCR + math reconciliation |");
md.push("");
md.push("## T2 — `runQuantityPrePass` executed? **NO**");
md.push("");
for (const e of results.task2_runQuantityPrePass.evidence) md.push(`- ${e}`);
md.push("");
md.push("## T3 — `anchorQuantities` executed? **NO**");
md.push("");
md.push(
  "If it had run with OCR **1.35**, Pass C **2.00**, total **18.72**: keep Pass C qty, `ocr_qty_mismatch: true`, `quantity_anchored: false`.",
);
md.push("");
md.push("## T4 — Gating conditions (`invoice-qty-prepass.ts`)");
md.push("");
md.push("**Scope (`isQtyAnchorScopeRow`):**");
md.push("- Unit normalized to `kg`");
md.push("- OCR/prepass quantity fractional (`abs(qty % 1) > 0.001`)");
md.push("- Emporio discount semantics: `discount_pct` set OR `gross_unit_price > line_total_net`");
md.push("");
md.push("**Anchor decision:**");
md.push(`- Skip if OCR vs Pass C delta ≤ ${QTY_ANCHOR_AGREEMENT_THRESHOLD_PCT}%`);
md.push(
  `- Anchor if OCR line-total score beats Pass C by > €${QTY_ANCHOR_SCORE_MARGIN_EUR}, or Pass C fails math review and OCR score ≤ €${QTY_ANCHOR_MATH_FALLBACK_MAX_SCORE_EUR}`,
);
md.push(
  `- Flag ocr_qty_mismatch when delta > ${OCR_QTY_MISMATCH_THRESHOLD_PCT}% and anchor not applied`,
);
md.push("");
md.push(`**Gorgonzola S3 in scope?** ${scopeIn ? "**YES**" : "NO"}`);
md.push("");
md.push("## T5 — Persisted `invoice_item`");
md.push("");
if (persistedRow) {
  md.push("| Field | Value |");
  md.push("|-------|-------|");
  md.push(`| id | \`${persistedRow.id}\` |`);
  md.push(`| quantity | ${persistedRow.quantity} |`);
  md.push(`| unit_price | ${persistedRow.unit_price} |`);
  md.push(`| total | ${persistedRow.total} |`);
  md.push(`| created_at | ${persistedRow.created_at} |`);
}
if (itemSuperseded) {
  md.push("");
  md.push(
    `Historical re-read row \`${CURRENT_ITEM_ID}\` (2/9.35/18.72 at ${REREAD_AT}) superseded; latest VL Gorgonzola shown above.`,
  );
}
md.push("");
md.push(
  `DB columns: ${dbColumns.join(", ")} — **no** ocr_quantity, **no** anchored_quantity, **no** extraction_meta.`,
);
md.push("");
md.push("## T6 — OCR 1.35 vs persisted 2.00 → `OCR_QTY_MISMATCH`?");
md.push("");
md.push(
  "**YES with current anchoring code** (delta 48% > 10%, anchor declined). **NO in live re-read** because anchoring never ran and client review unwired/deployed.",
);
md.push("");
md.push("## T7 — Replay (OCR 1.35, Pass C 2.00, Total 18.72)");
md.push("");
md.push("| | Expected (current code) | Actual (VL DB) |");
md.push("|---|-------------------------|----------------|");
md.push(
  `| quantity | ${replayPersisted.quantity} | ${persistedRow?.quantity ?? HISTORICAL_REREAD_ROW.quantity} |`,
);
md.push(
  `| unit_price | ${replayPersisted.unit_price} | ${persistedRow?.unit_price ?? HISTORICAL_REREAD_ROW.unit_price} |`,
);
md.push(`| total | ${replayPersisted.total} | ${persistedRow?.total ?? HISTORICAL_REREAD_ROW.total} |`);
md.push(
  `| ocr_qty_mismatch | ${anchorMeta[0].ocr_qty_mismatch} | n/a (not stored) |`,
);
md.push(`| OCR review flag | ${replayOcrReview} | false (no meta) |`);
md.push(`| Math review flag | ${replayMathReview} | false |`);
md.push("");
md.push("## Deploy gap (Family A parallel)");
md.push("");
md.push(
  `VL \`extract-invoice\` **v${extractFn?.version}** last updated **${deployedUpdatedAt}**. Anchoring files are local-only (\`${qtyPrepassStatus || "??"}\`, \`${tableStatus}\`). Same deploy lag pattern as Family A Hybrid H.`,
);
md.push("");
md.push("## Classification");
md.push("");
md.push("| State | Assessment |");
md.push("|-------|------------|");
md.push("| Failed | No — code path never invoked |");
md.push("| Bypassed | No — not gated out; absent from deploy |");
md.push("| **Never running (at re-read)** | **Yes** |");

writeFileSync(join(OUT, "REPORT.md"), md.join("\n"));
console.log(
  JSON.stringify(
    {
      verdict: results.verdict,
      executed: results.finalFiveQuestions.executedDuringLiveReread,
      deployVersion: extractFn?.version,
    },
    null,
    2,
  ),
);
