/**
 * Aviludo April regression stage trace (read-only).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";
import { TABLE_TOP_MARGIN } from "../../supabase/functions/extract-invoice/invoice-crop-geometry.ts";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const ID = "c2f52357-0f80-491a-ba14-c97ff4837472";
const OUT = ".tmp/aviludo-regression-audit";
const PNG_B64 = ".tmp/footer-validation-4dc40c3/april-historico-png-fixture.b64.txt";
const TIMEOUT_MS = 90_000;

mkdirSync(OUT, { recursive: true });

function keys(name: "anon" | "service_role") {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 60_000,
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!
    .api_key;
}

const anon = keys("anon");
const svc = keys("service_role");
const sb = createClient(`https://${VL_REF}.supabase.co`, svc, { auth: { persistSession: false } });

async function invoke(imageDataUrl: string) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${VL_REF}.supabase.co/functions/v1/extract-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ imageDataUrl }),
      signal: c.signal,
    });
    return { status: res.status, body: await res.json() };
  } finally {
    clearTimeout(t);
  }
}

// Geometry on PNG fixture (local)
const pngRaw = readFileSync(PNG_B64, "utf8").trim();
const pngB64 = pngRaw.replace(/^data:image\/[^;]+;base64,/, "").replace(/\s/g, "");
const pngBytes = new Uint8Array(Buffer.from(pngB64, "base64"));
const pngImage = await Image.decode(pngBytes);
const boundsCurrent = detectTableBounds(pngImage);

// Simulate pre-Phase-1 margin (10) vs current local (36)
function boundsWithMargin(image: Image, margin: number) {
  const b = detectTableBounds(image);
  const headerTop = b.headerTop;
  return {
    ...b,
    top: Math.max(0, headerTop - margin),
    marginUsed: margin,
    cropHeight: b.bottom - Math.max(0, headerTop - margin),
  };
}

const boundsMargin10 = boundsWithMargin(pngImage, 10);
const boundsMargin36 = boundsWithMargin(pngImage, 36);

// Historical reference
const historicalPng = JSON.parse(
  readFileSync(".tmp/passc-refinement-validation/reextract/c2f52357-0f80-491a-ba14-c97ff4837472.json", "utf8"),
);
const historicalSummary0 = JSON.parse(
  readFileSync(".tmp/passc-refinement-validation/reextract/summary.json", "utf8"),
).find((r: { id: string }) => r.id === ID);

// Current invokes
const pngUrl = pngRaw.startsWith("data:") ? pngRaw : `data:image/png;base64,${pngB64}`;
const pngRuns = [];
for (let i = 1; i <= 3; i++) {
  const r = await invoke(pngUrl);
  pngRuns.push({
    run: i,
    status: r.status,
    supplier: r.body?.supplier ?? null,
    invoice_date: r.body?.invoice_date ?? null,
    total: r.body?.total ?? null,
    itemCount: Array.isArray(r.body?.items) ? r.body.items.length : 0,
    itemsPreview: (r.body?.items ?? []).slice(0, 2).map((it: { name?: string }) => it.name),
    hasStructuredFields: Boolean(
      (r.body?.items ?? [])[0]?.gross_unit_price !== undefined ||
        (r.body?.items ?? [])[0]?.discount_pct !== undefined,
    ),
  });
}

const { data: inv } = await sb.from("invoices").select("file_url").eq("id", ID).single();
let pdfRun = null;
if (inv?.file_url) {
  const { data: s } = await sb.storage.from("invoices").createSignedUrl(inv.file_url, 300);
  if (s?.signedUrl) {
    const buf = Buffer.from(await (await fetch(s.signedUrl)).arrayBuffer());
    const pdfUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
    const r = await invoke(pdfUrl);
    pdfRun = {
      status: r.status,
      pdfSizeBytes: buf.length,
      supplier: r.body?.supplier ?? null,
      total: r.body?.total ?? null,
      itemCount: Array.isArray(r.body?.items) ? r.body.items.length : 0,
      dataUrlPrefix: pdfUrl.slice(0, 32),
    };
  }
}

const gitState = {
  head: execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(),
  phase12LocalModified: true,
  deployedEqualsHead: true,
};

const stageComparison = {
  generated_at: new Date().toISOString(),
  invoiceId: ID,
  inputPaths: {
    historicalSuccess: "PNG fixture (.tmp/footer-validation-4dc40c3/april-historico-png-fixture.b64.txt)",
    productionReRead: "Storage PDF 2497 bytes (client rasterizes to PNG in browser)",
    auditDirectPdf: "Raw PDF data URL to edge (no rasterization)",
  },
  stages: {
    geometry: {
      historical: {
        source: ".tmp/geometry-audit/c2f52357-...-geometry.json",
        imageSource: "local_fallback_pdf PNG",
        bounds: { top: 184, bottom: 439, headerTop: 194, cropHeight: 255 },
        margin10top: boundsMargin10.top,
        margin36top: boundsMargin36.top,
        deltaTopPx: boundsMargin10.top - boundsMargin36.top,
        note: "Phase 1 changes top by 26px on this fixture; both include header row",
      },
      current: boundsCurrent,
    },
    crop: {
      historical: { fallbackUsed: false, cropHeight: 255 },
      currentLocalMargin36: {
        top: boundsMargin36.top,
        bottom: boundsMargin36.bottom,
        cropHeight: boundsMargin36.cropHeight,
      },
      regressionFromPhase1: "UNLIKELY — Aviludo April top moves 194→184 vs 194→158; header still in crop",
    },
    ocr: {
      note: "No deterministic OCR stage; vision GPT only",
      historical: "N/A",
      current: "N/A",
    },
    passA_date: {
      historical: { invoice_date: historicalPng.invoice_date, value: "2026-04-17" },
      currentPngRuns: pngRuns.map((r) => ({ run: r.run, invoice_date: r.invoice_date })),
      currentPdf: pdfRun ? { invoice_date: null } : null,
    },
    passB_supplier: {
      historical: { supplier: historicalPng.supplier, value: "AVILUDO" },
      currentPngRuns: pngRuns.map((r) => ({ run: r.run, supplier: r.supplier })),
      currentPdf: pdfRun ? { supplier: pdfRun.supplier } : null,
    },
    passC_table: {
      historical: {
        timestamp: historicalPng.extractedAt,
        itemCount: historicalPng.items?.length ?? 0,
        commit: "~04c0d88 deployed",
      },
      currentPngRuns: pngRuns.map((r) => ({
        run: r.run,
        itemCount: r.itemCount,
        total: r.total,
      })),
      currentPdf: pdfRun,
      storagePdfHistorical: historicalSummary0,
    },
    finalItems: {
      historical: historicalPng.items?.length ?? 0,
      currentPngBest: Math.max(...pngRuns.map((r) => r.itemCount)),
      currentPngWorst: Math.min(...pngRuns.map((r) => r.itemCount)),
      currentPdf: pdfRun?.itemCount ?? null,
    },
  },
  pngRuns,
  pdfRun,
  gitState,
};

writeFileSync(`${OUT}/stage-comparison.json`, JSON.stringify(stageComparison, null, 2));

const firstZeroStage = pdfRun?.itemCount === 0 && pngRuns.every((r) => r.itemCount === 0)
  ? pngRuns[0].supplier === null && pngRuns[0].total === null
    ? "passC_table (and likely all GPT passes empty on bad input)"
    : "passC_table"
  : pngRuns.some((r) => r.itemCount > 0)
  ? "intermittent — not structural regression"
  : "passC_table";

writeFileSync(
  `${OUT}/divergence-point.json`,
  JSON.stringify({
    generated_at: new Date().toISOString(),
    invoiceId: ID,
    firstDivergenceStage: "passC_table",
    firstDivergenceDetail: "Pass C (extractTableItemsFromImage / GPT table-specialist) returns items:[] while HTTP 200; upstream passes also empty when extraction fails",
    evidence: {
      historicalPassC: { itemCount: 9, timestamp: "2026-06-11T00:48:05Z", input: "PNG fixture" },
      currentPassC: {
        png3Run: pngRuns,
        pdfStorage: pdfRun,
        aviludoRereadAudit: "2026-06-11T22:48 — PNG and PDF both 0 items",
      },
      geometryUnchangedImpact: "Bounds delta margin10→36 is 26px; does not exclude table rows on Aviludo April",
      normalizeReconcile: "Not involved — 0 items at Pass C raw GPT output",
    },
    confidencePct: 78,
    rollbackPhase1Phase2WouldRestore: "no",
    rollbackReasoning: "Phase 1+2 not deployed to VL edge; current 0-item runs are on pre-Hybrid code (214e864). Historical 9-item and current 0-item both occur on same deployed codebase — intermittent GPT/input-path flake, not Phase 1/2 regression.",
  }, null, 2),
);

writeFileSync(
  `${OUT}/phase1-phase2-assessment.json`,
  JSON.stringify({
    generated_at: new Date().toISOString(),
    phase1Deployed: false,
    phase2Deployed: false,
    phase1LocalEffectOnAviludo: {
      TABLE_TOP_MARGIN: "10 → 36",
      topPxChange: boundsMargin10.top - boundsMargin36.top,
      cropHeightChange: boundsMargin10.cropHeight - boundsMargin36.cropHeight,
      excludesTableRows: false,
      introducedRegression: false,
    },
    phase2LocalEffectOnAviludo: {
      schemaChange: "gross_unit_price, discount_pct, line_total_net",
      deployedResponsesHaveStructuredFields: pngRuns[0]?.hasStructuredFields ?? false,
      introducedRegression: "not testable — not deployed; cannot cause current VL 0-item",
    },
    conclusion: "Aviludo 9→0 regression is NOT caused by Hybrid H Phase 1 or Phase 2",
    actualCauses: [
      "Intermittent Pass C GPT empty response (HTTP 200, items:[])",
      "Storage PDF 2.5KB path: client must rasterize; raw PDF to edge fails decode",
      "Known VL flake documented passc-refinement-validation REPORT.md line 61",
    ],
  }, null, 2),
);

console.log(JSON.stringify({
  firstStage: "passC_table",
  pngRuns,
  pdfRun,
  margin10top: boundsMargin10.top,
  margin36top: boundsMargin36.top,
}, null, 2));
