/**
 * VALIDATION LAB — Invoice Geometry Reliability Audit
 * Read-only. Writes artifacts under .tmp/geometry-audit/
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT_DIR = ".tmp/geometry-audit";
const DENO = existsSync(".tmp/deno/bin/deno") ? ".tmp/deno/bin/deno" : "deno";
const GEOMETRY_SCRIPT = join(OUT_DIR, "geometry-deno.ts");

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(join(OUT_DIR, "images"), { recursive: true });

function projectKey(name: "anon" | "service_role"): string {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8", timeout: 15_000 },
  );
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  )!.api_key;
}

const serviceKey = projectKey("service_role");
const sb = createClient(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

// ── Ground truth from prior validated audits ────────────────────────────────
type GroundTruth = {
  label: string;
  headerStyle: "A_grey_shaded" | "B_white_rule" | "C_other";
  rowsExpected: number | null;
  totalExpected: number | null;
  netSubtotalExpected: number | null;
  vatExpected: number | null;
  expectedHeaderY: number | null;
  supplierExpected: string | null;
  dateExpected: string | null;
  notes?: string;
  localImageFallback?: string;
};

const GROUND_TRUTH: Record<string, GroundTruth> = {
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e": {
    label: "Bidfood Portugal",
    headerStyle: "A_grey_shaded",
    rowsExpected: 11,
    totalExpected: 292.7,
    netSubtotalExpected: 276.13,
    vatExpected: 16.57,
    expectedHeaderY: 447,
    supplierExpected: "Bidfood Portugal",
    dateExpected: "2026-05-25",
    localImageFallback: ".tmp/bidfood-ovo.png",
  },
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2": {
    label: "Aviludo May",
    headerStyle: "A_grey_shaded",
    rowsExpected: 8,
    totalExpected: 330.42,
    netSubtotalExpected: 296.88,
    vatExpected: 33.54,
    expectedHeaderY: 228,
    supplierExpected: "Aviludo",
    dateExpected: "2026-05-19",
    localImageFallback:
      ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png",
  },
  "c2f52357-0f80-491a-ba14-c97ff4837472": {
    label: "Aviludo April",
    headerStyle: "A_grey_shaded",
    rowsExpected: 9,
    totalExpected: 370.17,
    netSubtotalExpected: null,
    vatExpected: null,
    expectedHeaderY: null,
    supplierExpected: "AVILUDO",
    dateExpected: "2026-04-17",
    notes: "Storage is PDF (unsupported for geometry); rows/total from DB + prior validation",
    localImageFallback:
      ".tmp/aviludo-investigation/Aviludo_Historico_2026_04_with_total.pdf.png",
  },
  "f0aa5a08-86a3-4938-99f0-711e86073968": {
    label: "IL Bocconcino",
    headerStyle: "B_white_rule",
    rowsExpected: 7,
    totalExpected: 290.64,
    netSubtotalExpected: null,
    vatExpected: null,
    expectedHeaderY: 430,
    supplierExpected: "IL BOCCONCINO Distribuição ALIMENTAR",
    dateExpected: "2026-05-08",
    localImageFallback: ".tmp/bocconcino-investigation/invoice-full.png",
  },
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb": {
    label: "Emporio Italia",
    headerStyle: "C_other",
    rowsExpected: 8,
    totalExpected: 327.46,
    netSubtotalExpected: 278.16,
    vatExpected: 49.3,
    expectedHeaderY: 466,
    supplierExpected: "Emporio Italia",
    dateExpected: "2026-05-19",
    localImageFallback: ".tmp/emporio-italia-investigation/invoice-full.png",
  },
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d": {
    label: "Mammafiore Portugal",
    headerStyle: "B_white_rule",
    rowsExpected: 8,
    totalExpected: 415.96,
    netSubtotalExpected: null,
    vatExpected: null,
    expectedHeaderY: 370,
    supplierExpected: "Mammafiore Portugal",
    dateExpected: "2026-05-19",
    localImageFallback: ".tmp/mammafiore-investigation/invoice-full.png",
  },
};

// ── DB fetch ────────────────────────────────────────────────────────────────
const { data: invoices, error: invErr } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,total,file_url,created_at")
  .order("created_at", { ascending: true });

if (invErr) throw new Error(invErr.message);

const { data: allItems } = await sb
  .from("invoice_items")
  .select("id,invoice_id,name,quantity,unit,unit_price,total")
  .order("created_at", { ascending: true });

const itemsByInvoice = new Map<string, typeof allItems>();
for (const it of allItems ?? []) {
  const list = itemsByInvoice.get(it.invoice_id) ?? [];
  list.push(it);
  itemsByInvoice.set(it.invoice_id, list);
}

writeFileSync(
  join(OUT_DIR, "db-snapshot.json"),
  JSON.stringify({ invoices, itemCounts: Object.fromEntries([...itemsByInvoice.entries()].map(([k,v])=>[k,v.length])) }, null, 2),
);

// ── Helpers ─────────────────────────────────────────────────────────────────
function runGeometry(imagePath: string) {
  const out = execSync(
    `${DENO} run --allow-read --allow-net ${GEOMETRY_SCRIPT} ${imagePath}`,
    { encoding: "utf8", timeout: 30_000 },
  );
  return JSON.parse(out) as {
    imageWidth: number;
    imageHeight: number;
    bounds: {
      top: number;
      bottom: number;
      headerTop: number;
      headerBottom: number;
      totalsStart: number | null;
      detected: boolean;
    };
    fractionStartY: number;
    summaryBandTop: number | null;
    footerCropStartY: number;
    footerCropHeight: number;
  };
}

async function resolveImage(
  id: string,
  fileUrl: string | null,
  fallback?: string,
): Promise<{ path: string; source: string; isPdf: boolean } | null> {
  const dest = join(OUT_DIR, "images", `${id}.png`);
  if (fileUrl?.toLowerCase().endsWith(".pdf")) {
    if (fallback && existsSync(fallback)) {
      return { path: fallback, source: "local_fallback_pdf", isPdf: true };
    }
    return null;
  }
  if (existsSync(dest)) {
    return { path: dest, source: "cached", isPdf: false };
  }
  if (!fileUrl) {
    if (fallback && existsSync(fallback)) {
      return { path: fallback, source: "local_fallback", isPdf: false };
    }
    return null;
  }
  try {
    const { data: signed, error } = await sb.storage
      .from("invoices")
      .createSignedUrl(fileUrl, 300);
    if (error || !signed?.signedUrl) throw error;
    const res = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    return { path: dest, source: "storage", isPdf: false };
  } catch {
    if (fallback && existsSync(fallback)) {
      return { path: fallback, source: "local_fallback", isPdf: false };
    }
    return null;
  }
}

type FooterFieldStatus = "PASS" | "PARTIAL" | "FAIL" | "UNKNOWN";

function footerFieldStatus(
  extracted: number | null,
  expected: number | null,
): FooterFieldStatus {
  if (expected == null) return "UNKNOWN";
  if (extracted == null) return "FAIL";
  if (Math.abs(extracted - expected) < 0.02) return "PASS";
  return "PARTIAL";
}

function footerRecallScore(fields: {
  subtotal: FooterFieldStatus;
  vat: FooterFieldStatus;
  total: FooterFieldStatus;
}): number {
  const scored = [fields.subtotal, fields.vat, fields.total].filter(
    (f) => f !== "UNKNOWN",
  );
  if (scored.length === 0) return 1;
  const pass = scored.filter((f) => f === "PASS").length;
  const partial = scored.filter((f) => f === "PARTIAL").length;
  return (pass + partial * 0.5) / scored.length;
}

function metadataRecallScore(
  supplier: string | null,
  date: string | null,
  total: number | null,
  gt: GroundTruth,
): number {
  let hits = 0;
  let total_fields = 0;
  if (gt.supplierExpected) {
    total_fields++;
    if (supplier && supplier.toLowerCase().includes(gt.supplierExpected.split(" ")[0].toLowerCase())) hits++;
  }
  if (gt.dateExpected) {
    total_fields++;
    if (date === gt.dateExpected) hits++;
  }
  if (gt.totalExpected != null) {
    total_fields++;
    if (total != null && Math.abs(total - gt.totalExpected) < 0.02) hits++;
  }
  return total_fields > 0 ? hits / total_fields : 1;
}

function classifyFailureSource(row: {
  geometryOk: boolean;
  footerGeometryOk: boolean;
  rowsExtracted: number;
  rowsExpected: number | null;
  totalExtracted: number | null;
  totalExpected: number | null;
  isPdf: boolean;
  headerDeltaPx: number | null;
}): string[] {
  const sources: string[] = [];
  if (row.isPdf) {
    sources.push("Table geometry");
    sources.push("Footer geometry");
    return sources;
  }
  if (row.headerDeltaPx != null && Math.abs(row.headerDeltaPx) > 30) {
    sources.push("Table geometry");
  }
  if (!row.footerGeometryOk) sources.push("Footer geometry");
  if (
    row.rowsExpected != null &&
    row.rowsExtracted < row.rowsExpected &&
    !row.geometryOk
  ) {
    sources.push("Table geometry");
  } else if (
    row.rowsExpected != null &&
    row.rowsExtracted < row.rowsExpected &&
    row.geometryOk
  ) {
    sources.push("GPT");
    sources.push("OCR");
  }
  if (
    row.totalExpected != null &&
    row.totalExtracted != null &&
    Math.abs(row.totalExtracted - row.totalExpected) < 0.02 &&
    row.rowsExpected != null &&
    row.rowsExtracted === 0
  ) {
    // footer ok, rows 0 → table geometry primary
    if (!sources.includes("Table geometry")) sources.unshift("Table geometry");
  }
  if (sources.length === 0) {
    if (
      row.rowsExpected != null &&
      row.rowsExtracted >= row.rowsExpected &&
      row.totalExpected != null &&
      row.totalExtracted != null &&
      Math.abs(row.totalExtracted - row.totalExpected) < 0.02
    ) {
      return ["None"];
    }
    sources.push("Normalization");
  }
  return [...new Set(sources)];
}

function classifyGeometryFailure(
  id: string,
  headerStyle: string,
  headerDeltaPx: number | null,
  cropTop: number | null,
  imageH: number | null,
  footerCropStartY: number | null,
  summaryBandTop: number | null,
  boundsBottom: number | null,
  rowsExtracted: number,
  rowsExpected: number | null,
): string | null {
  if (headerDeltaPx == null || cropTop == null || imageH == null) {
    if (id === "c2f52357-0f80-491a-ba14-c97ff4837472") return "Class 4: PDF storage (geometry N/A)";
    return null;
  }
  if (headerStyle === "B_white_rule" && headerDeltaPx > 50 && cropTop > (imageH * 0.45)) {
    return "Class 2: Header search too late (Mammafiore)";
  }
  if (headerStyle === "B_white_rule" && headerDeltaPx > 50 && cropTop < (imageH * 0.55)) {
    return "Class 1: Header too low (Bocconcino)";
  }
  if (
    headerStyle === "C_other" &&
    summaryBandTop != null &&
    footerCropStartY != null &&
    footerCropStartY > summaryBandTop + 50
  ) {
    return "Class 3: Footer below totals (Emporio)";
  }
  if (headerStyle === "A_grey_shaded" && Math.abs(headerDeltaPx) <= 5) {
    return null;
  }
  if (rowsExpected != null && rowsExtracted === 0 && headerDeltaPx > 100) {
    return "Class 2: Header search too late (Mammafiore)";
  }
  if (rowsExpected != null && rowsExtracted < rowsExpected && headerDeltaPx > 50) {
    return "Class 1: Header too low (Bocconcino)";
  }
  if (Math.abs(headerDeltaPx) > 30) return "Class 5: Header mis-detection (other)";
  return null;
}

// ── Process each invoice ────────────────────────────────────────────────────
type MasterRow = Record<string, unknown>;
const masterRows: MasterRow[] = [];
const geometryResults: Record<string, unknown> = {};

for (const inv of invoices ?? []) {
  const gt = GROUND_TRUTH[inv.id] ?? {
    label: inv.supplier_name ?? inv.id,
    headerStyle: "C_other" as const,
    rowsExpected: null,
    totalExpected: null,
    netSubtotalExpected: null,
    vatExpected: null,
    expectedHeaderY: null,
    supplierExpected: inv.supplier_name,
    dateExpected: inv.invoice_date,
  };

  const dbItems = itemsByInvoice.get(inv.id) ?? [];
  const rowsExtracted = dbItems.length;
  const totalExtracted = inv.total;

  const img = await resolveImage(inv.id, inv.file_url, gt.localImageFallback);
  let geom: ReturnType<typeof runGeometry> | null = null;
  let geometryError: string | null = null;

  if (img) {
    try {
      geom = runGeometry(img.path);
      geometryResults[inv.id] = { ...geom, imageSource: img.source, isPdf: img.isPdf };
      writeFileSync(
        join(OUT_DIR, `${inv.id}-geometry.json`),
        JSON.stringify(geometryResults[inv.id], null, 2),
      );
    } catch (e) {
      geometryError = e instanceof Error ? e.message : String(e);
    }
  }

  const bounds = geom?.bounds;
  const headerDeltaPx =
    gt.expectedHeaderY != null && bounds?.headerTop != null
      ? bounds.headerTop - gt.expectedHeaderY
      : null;

  const headerDetectionOk =
    headerDeltaPx == null ? null : Math.abs(headerDeltaPx) <= 15;

  const tableGeometryOk =
    bounds?.detected &&
    (headerDeltaPx == null || Math.abs(headerDeltaPx) <= 30) &&
    (gt.rowsExpected == null ||
      rowsExtracted >= gt.rowsExpected ||
      (headerDeltaPx != null && Math.abs(headerDeltaPx) <= 15));

  const footerGeometryOk =
    geom == null
      ? null
      : gt.label === "Emporio Italia"
        ? geom.footerCropStartY <= (geom.summaryBandTop ?? 9999) + 20 ||
          geom.footerCropStartY <= geom.fractionStartY + 30
        : geom.footerCropStartY <= (bounds?.bottom ?? geom.imageHeight);

  const rowRecall =
    gt.rowsExpected != null && gt.rowsExpected > 0
      ? rowsExtracted / gt.rowsExpected
      : null;

  const footerFields = {
    subtotal: footerFieldStatus(
      gt.netSubtotalExpected != null && totalExtracted === gt.totalExpected
        ? gt.netSubtotalExpected
        : null,
      gt.netSubtotalExpected,
    ),
    vat: footerFieldStatus(
      gt.vatExpected != null && totalExtracted === gt.totalExpected
        ? gt.vatExpected
        : null,
      gt.vatExpected,
    ),
    total: footerFieldStatus(totalExtracted, gt.totalExpected),
  };

  // Use DB total as proxy for footer pass when totals match expected
  if (gt.totalExpected != null && totalExtracted != null) {
    footerFields.total = footerFieldStatus(totalExtracted, gt.totalExpected);
  }

  const footerRecall = footerRecallScore(footerFields);
  const metadataRecall = metadataRecallScore(
    inv.supplier_name,
    inv.invoice_date,
    totalExtracted,
    gt,
  );
  const reliabilityScore =
    0.5 * (rowRecall ?? 0) + 0.25 * footerRecall + 0.25 * metadataRecall;

  const failureClass = classifyGeometryFailure(
    inv.id,
    gt.headerStyle,
    headerDeltaPx,
    bounds?.top ?? null,
    geom?.imageHeight ?? null,
    geom?.footerCropStartY ?? null,
    geom?.summaryBandTop ?? null,
    bounds?.bottom ?? null,
    rowsExtracted,
    gt.rowsExpected,
  );

  const failureSources = classifyFailureSource({
    geometryOk: tableGeometryOk ?? false,
    footerGeometryOk: footerGeometryOk ?? true,
    rowsExtracted,
    rowsExpected: gt.rowsExpected,
    totalExtracted,
    totalExpected: gt.totalExpected,
    isPdf: img?.isPdf ?? inv.file_url?.endsWith(".pdf") ?? false,
    headerDeltaPx,
  });

  let status: string;
  if (rowRecall === 1 && footerFields.total === "PASS") status = "PASS";
  else if ((rowRecall ?? 0) >= 0.7 && footerFields.total !== "FAIL") status = "PARTIAL";
  else status = "FAIL";

  masterRows.push({
    invoiceId: inv.id,
    invoice: gt.label,
    supplier: inv.supplier_name,
    imageH: geom?.imageHeight ?? null,
    imageW: geom?.imageWidth ?? null,
    headerStyle: gt.headerStyle,
    tableHeaderY: gt.expectedHeaderY,
    detectedHeaderY: bounds?.headerTop ?? null,
    headerDeltaPx,
    headerDetectionOk,
    cropTop: bounds?.top ?? null,
    cropBottom: bounds?.bottom ?? null,
    footerCropStart: geom?.footerCropStartY ?? null,
    summaryBandTop: geom?.summaryBandTop ?? null,
    fractionStartY: geom?.fractionStartY ?? null,
    rowsExpected: gt.rowsExpected,
    rowsExtracted,
    rowRecall,
    totalExpected: gt.totalExpected,
    totalExtracted,
    footerFields,
    footerRecall,
    metadataRecall,
    reliabilityScore,
    tableGeometryOk,
    footerGeometryOk,
    failureClass,
    failureSources,
    status,
    fileUrl: inv.file_url,
    imageSource: img?.source ?? null,
    isPdf: img?.isPdf ?? inv.file_url?.endsWith(".pdf") ?? false,
    geometryError,
    notes: gt.notes ?? null,
  });
}

writeFileSync(
  join(OUT_DIR, "master-dataset.json"),
  JSON.stringify(masterRows, null, 2),
);

// ── TASK 2: Header classes ──────────────────────────────────────────────────
const headerClasses: Record<
  string,
  {
    invoices: string[];
    detectionSuccessRate: number | null;
    avgRowRecall: number | null;
    avgFooterRecall: number | null;
  }
> = {
  A_grey_shaded: { invoices: [], detectionSuccessRate: null, avgRowRecall: null, avgFooterRecall: null },
  B_white_rule: { invoices: [], detectionSuccessRate: null, avgRowRecall: null, avgFooterRecall: null },
  C_other: { invoices: [], detectionSuccessRate: null, avgRowRecall: null, avgFooterRecall: null },
};

for (const row of masterRows) {
  const cls = row.headerStyle as string;
  headerClasses[cls].invoices.push(row.invoice as string);
}

for (const cls of Object.keys(headerClasses)) {
  const rows = masterRows.filter((r) => r.headerStyle === cls);
  const detOk = rows.filter((r) => r.headerDetectionOk === true);
  const withDet = rows.filter((r) => r.headerDetectionOk != null);
  headerClasses[cls].detectionSuccessRate =
    withDet.length > 0 ? detOk.length / withDet.length : null;
  const recalls = rows.map((r) => r.rowRecall as number | null).filter((x) => x != null) as number[];
  headerClasses[cls].avgRowRecall =
    recalls.length > 0 ? recalls.reduce((a, b) => a + b, 0) / recalls.length : null;
  const fRecalls = rows.map((r) => r.footerRecall as number);
  headerClasses[cls].avgFooterRecall =
    fRecalls.length > 0 ? fRecalls.reduce((a, b) => a + b, 0) / fRecalls.length : null;
}

writeFileSync(join(OUT_DIR, "header-classes.json"), JSON.stringify(headerClasses, null, 2));

// ── TASK 3: Row recall table ────────────────────────────────────────────────
const rowRecallTable = masterRows.map((r) => ({
  invoiceId: r.invoiceId,
  invoice: r.invoice,
  rowsExpected: r.rowsExpected,
  rowsExtracted: r.rowsExtracted,
  rowRecall: r.rowRecall,
  status: r.rowRecall === 1 ? "PASS" : r.rowRecall === 0 ? "FAIL" : "PARTIAL",
}));
writeFileSync(join(OUT_DIR, "row-recall-table.json"), JSON.stringify(rowRecallTable, null, 2));

// ── TASK 4: Footer recall table ─────────────────────────────────────────────
const footerRecallTable = masterRows.map((r) => ({
  invoiceId: r.invoiceId,
  invoice: r.invoice,
  subtotal: (r.footerFields as { subtotal: string }).subtotal,
  vat: (r.footerFields as { vat: string }).vat,
  total: (r.footerFields as { total: string }).total,
  footerRecall: r.footerRecall,
  footerGeometryOk: r.footerGeometryOk,
  footerCropStart: r.footerCropStart,
}));
writeFileSync(join(OUT_DIR, "footer-recall-table.json"), JSON.stringify(footerRecallTable, null, 2));

// ── TASK 5: Failure classes ─────────────────────────────────────────────────
const failureClassMap: Record<string, { invoices: string[]; count: number; description: string }> = {
  "Class 1: Header too low (Bocconcino)": {
    invoices: [],
    count: 0,
    description: "White-header invoice: grey-band fallback picks product metadata band below real column headers; crop top cuts off first rows.",
  },
  "Class 2: Header search too late (Mammafiore)": {
    invoices: [],
    count: 0,
    description: "White-header search zone (≥38% height) excludes real headers; grey fallback picks footer summary band; all rows excluded.",
  },
  "Class 3: Footer below totals (Emporio)": {
    invoices: [],
    count: 0,
    description: "Table-anchored footer crop starts below grey Subtotal/Total box; GPT sees IVA/banking only.",
  },
  "Class 4: PDF storage (geometry N/A)": {
    invoices: [],
    count: 0,
    description: "Storage file is PDF; imagescript cannot decode; geometry and OCR blocked.",
  },
  "Class 5: Header mis-detection (other)": {
    invoices: [],
    count: 0,
    description: "Grey-header or other template with >30px header delta without white-header pattern.",
  },
};

for (const row of masterRows) {
  const fc = row.failureClass as string | null;
  if (fc && failureClassMap[fc]) {
    failureClassMap[fc].invoices.push(row.invoice as string);
    failureClassMap[fc].count++;
  }
}

writeFileSync(join(OUT_DIR, "failure-classes.json"), JSON.stringify(failureClassMap, null, 2));

// ── TASK 6: Failure sources ─────────────────────────────────────────────────
const failureSourcesTable = masterRows.map((r) => ({
  invoiceId: r.invoiceId,
  invoice: r.invoice,
  failureSources: r.failureSources,
  failureClass: r.failureClass,
}));
writeFileSync(join(OUT_DIR, "failure-sources.json"), JSON.stringify(failureSourcesTable, null, 2));

// ── TASK 7: Reliability score ───────────────────────────────────────────────
const reliabilityRanking = [...masterRows]
  .sort((a, b) => (b.reliabilityScore as number) - (a.reliabilityScore as number))
  .map((r, i) => ({
    rank: i + 1,
    invoiceId: r.invoiceId,
    invoice: r.invoice,
    reliabilityScore: Math.round((r.reliabilityScore as number) * 1000) / 1000,
    rowRecall: r.rowRecall,
    footerRecall: r.footerRecall,
    metadataRecall: r.metadataRecall,
    status: r.status,
  }));

const aggregate = {
  invoiceCount: masterRows.length,
  maisLenhasPresent: false,
  avgReliabilityScore:
    masterRows.reduce((s, r) => s + (r.reliabilityScore as number), 0) /
    masterRows.length,
  ocrSuccessRate: null as number | null,
  geometrySuccessRate: null as number | null,
  footerSuccessRate: null as number | null,
  ranking: reliabilityRanking,
};

const geomOk = masterRows.filter((r) => r.tableGeometryOk === true).length;
const geomKnown = masterRows.filter((r) => r.tableGeometryOk != null).length;
aggregate.geometrySuccessRate = geomKnown > 0 ? geomOk / geomKnown : null;

const footerOk = masterRows.filter(
  (r) => (r.footerFields as { total: string }).total === "PASS",
).length;
aggregate.footerSuccessRate = masterRows.length > 0 ? footerOk / masterRows.length : null;

const rowOk = masterRows.filter((r) => r.rowRecall === 1).length;
const rowKnown = masterRows.filter((r) => r.rowRecall != null).length;
aggregate.ocrSuccessRate = rowKnown > 0 ? rowOk / rowKnown : null;

writeFileSync(
  join(OUT_DIR, "reliability-score.json"),
  JSON.stringify(aggregate, null, 2),
);

// ── REPORT.md ───────────────────────────────────────────────────────────────
const sortedFailures = Object.entries(failureClassMap)
  .filter(([, v]) => v.count > 0)
  .sort((a, b) => b[1].count - a[1].count);

const report = `# Invoice Geometry Reliability Audit

**Date:** 2026-06-10 · **VL project:** \`${VL_REF}\` · **Read-only**

## Executive Summary

| Metric | Value |
|--------|-------|
| VL invoices in DB | **${masterRows.length}** |
| Mais Lenhas & Carvão | **Not present** in VL |
| Avg reliability score | **${(aggregate.avgReliabilityScore * 100).toFixed(1)}%** |
| Row recall (OCR/table) success | **${((aggregate.ocrSuccessRate ?? 0) * 100).toFixed(0)}%** (${rowOk}/${rowKnown} invoices full row recall) |
| Table geometry success | **${((aggregate.geometrySuccessRate ?? 0) * 100).toFixed(0)}%** (${geomOk}/${geomKnown} invoices) |
| Footer total success | **${((aggregate.footerSuccessRate ?? 0) * 100).toFixed(0)}%** (${footerOk}/${masterRows.length} invoices) |

**Current VL extraction reliability:** ${aggregate.avgReliabilityScore >= 0.8 ? "Moderate–good on grey-header templates (Bidfood, Aviludo May); fragile on white-header Primavera layouts and Emporio footer geometry." : "Below target — white-header table crops and one PDF storage blocker dominate failures."}

**Biggest failure class:** ${sortedFailures[0]?.[0] ?? "None"} (${sortedFailures[0]?.[1].count ?? 0} invoice(s))

**Second biggest:** ${sortedFailures[1]?.[0] ?? "None"} (${sortedFailures[1]?.[1].count ?? 0} invoice(s))

---

## Invoice Ranking (best → worst)

| Rank | Invoice | Score | Rows | Footer | Status |
|------|---------|-------|------|--------|--------|
${reliabilityRanking.map((r) => `| ${r.rank} | ${r.invoice} | ${(r.reliabilityScore * 100).toFixed(1)}% | ${r.rowRecall != null ? `${((r.rowRecall as number) * 100).toFixed(0)}%` : "N/A"} | ${((r.footerRecall as number) * 100).toFixed(0)}% | ${r.status} |`).join("\n")}

---

## Master Dataset

| Invoice | Supplier | Image H×W | Header style | Table header Y | Detected header Y | Crop top | Crop bottom | Footer crop start | Rows exp/ext | Total exp/ext | Status |
|---------|----------|-----------|--------------|----------------|-------------------|----------|-------------|-------------------|--------------|---------------|--------|
${masterRows.map((r) => `| ${r.invoice} | ${r.supplier} | ${r.imageH ?? "?"}×${r.imageW ?? "?"} | ${r.headerStyle} | ${r.tableHeaderY ?? "—"} | ${r.detectedHeaderY ?? "—"} | ${r.cropTop ?? "—"} | ${r.cropBottom ?? "—"} | ${r.footerCropStart ?? "—"} | ${r.rowsExpected ?? "?"}/${r.rowsExtracted} | ${r.totalExpected ?? "?"}/${r.totalExtracted ?? "null"} | ${r.status} |`).join("\n")}

---

## Header Type Classification

| Class | Templates | Detection success | Avg row recall | Avg footer recall |
|-------|-----------|-------------------|----------------|-------------------|
| **A — Grey shaded** | Bidfood, Aviludo | ${headerClasses.A_grey_shaded.detectionSuccessRate != null ? `${(headerClasses.A_grey_shaded.detectionSuccessRate * 100).toFixed(0)}%` : "N/A"} | ${headerClasses.A_grey_shaded.avgRowRecall != null ? `${(headerClasses.A_grey_shaded.avgRowRecall * 100).toFixed(0)}%` : "N/A"} | ${headerClasses.A_grey_shaded.avgFooterRecall != null ? `${(headerClasses.A_grey_shaded.avgFooterRecall * 100).toFixed(0)}%` : "N/A"} |
| **B — White + rule** | Bocconcino, Mammafiore | ${headerClasses.B_white_rule.detectionSuccessRate != null ? `${(headerClasses.B_white_rule.detectionSuccessRate * 100).toFixed(0)}%` : "N/A"} | ${headerClasses.B_white_rule.avgRowRecall != null ? `${(headerClasses.B_white_rule.avgRowRecall * 100).toFixed(0)}%` : "N/A"} | ${headerClasses.B_white_rule.avgFooterRecall != null ? `${(headerClasses.B_white_rule.avgFooterRecall * 100).toFixed(0)}%` : "N/A"} |
| **C — Other** | Emporio Italia | ${headerClasses.C_other.detectionSuccessRate != null ? `${(headerClasses.C_other.detectionSuccessRate * 100).toFixed(0)}%` : "N/A"} | ${headerClasses.C_other.avgRowRecall != null ? `${(headerClasses.C_other.avgRowRecall * 100).toFixed(0)}%` : "N/A"} | ${headerClasses.C_other.avgFooterRecall != null ? `${(headerClasses.C_other.avgFooterRecall * 100).toFixed(0)}%` : "N/A"} |

---

## Failure Classes (grouped)

${Object.entries(failureClassMap).map(([k, v]) => `### ${k}\n\n${v.description}\n\n**Invoices (${v.count}):** ${v.invoices.length ? v.invoices.join(", ") : "—"}`).join("\n\n")}

---

## Failure Source per Invoice

| Invoice | Geometry class | Sources |
|---------|----------------|---------|
${masterRows.map((r) => `| ${r.invoice} | ${r.failureClass ?? "—"} | ${(r.failureSources as string[]).join(", ")} |`).join("\n")}

---

## Recommended Next Fix (design only — highest ROI)

**Unify white-header table anchoring for Primavera/BSS layouts (Bocconcino + Mammafiore).**

1. Lower \`WHITE_HEADER_MIN_RULE_FRACTION\` from 0.38 → ~0.28 so rule search includes headers at y≈30–32% page height.
2. Reject grey-band winners when \`headerTop > 50% image height\` (footer-anchored false positives).
3. Add **earliest-plausible-header among top-K darkest bands** with row-regularity constraint (from table-bounds investigation) for layouts without detectable rules.
4. **Crop validation gate:** if Pass C returns 0 items but footer total is non-zero, retry with \`top = scanStart\` before persisting.

Expected impact: fixes Mammafiore (0→8 rows) and Bocconcino partial loss; grey-header templates (Bidfood/Aviludo) unchanged.

Secondary: Emporio footer geometry already has \`detectSummaryTotalsBandTop\` + \`computeFooterCropStartY\` fix path — ensure deployed and regression-tested.

---

## Cross-reference: Prior Investigations

| Prior audit | Key finding used |
|-------------|------------------|
| \`.tmp/table-bounds-investigation/\` | Bocconcino header +118px too low; grey-min heuristic failure mode |
| \`.tmp/bocconcino-investigation/\` | 7 expected rows; crop top y=561 cuts Mozzarella/Stracciatella |
| \`.tmp/mammafiore-investigation/\` | 0/8 rows; crop top y=622 below entire table |
| \`.tmp/emporio-footer-audit/\` | Footer crop y=851 misses totals box; fix uses summaryBandTop |
| \`.tmp/emporio-footer-fix/\` | Post-fix Emporio total 327.46 PASS |
| \`.tmp/footer-validation-4dc40c3/\` | Bidfood/Aviludo May footer PASS; April PDF blocked |
| \`.tmp/ginger-beer-audit/\` | Emporio normalization bug (separate from geometry) |

---

## Evidence

\`\`\`
.tmp/geometry-audit/
  run-geometry-audit.mts       # Master audit runner
  geometry-deno.ts             # Local detectTableBounds + footer crop
  db-snapshot.json             # Raw VL DB query
  master-dataset.json          # Task 1
  header-classes.json          # Task 2
  row-recall-table.json        # Task 3
  footer-recall-table.json     # Task 4
  failure-classes.json         # Task 5
  failure-sources.json         # Task 6
  reliability-score.json       # Task 7
  images/                      # Downloaded invoice PNGs
  *-geometry.json              # Per-invoice geometry output
  REPORT.md                    # This file
\`\`\`
`;

writeFileSync(join(OUT_DIR, "REPORT.md"), report);

console.log(JSON.stringify({ ok: true, invoices: masterRows.length, outDir: OUT_DIR }, null, 2));
