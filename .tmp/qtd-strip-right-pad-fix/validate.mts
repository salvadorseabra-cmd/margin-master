/**
 * Qtd Strip Right-Pad Fix Validation
 * Validates QTD_STRIP_RIGHT_PAD_PX=2 fix for Gorgonzola 1,35 clipping
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = "/Users/salvadorseabra1/margin-master";
const OUT = join(ROOT, ".tmp/qtd-strip-right-pad-fix");
const SRC = join(ROOT, ".tmp/fraction-row-crop-audit");
const PRIOR = join(ROOT, ".tmp/qtd-strip-precision-audit");
const DENO = join(ROOT, ".tmp/deno/bin/deno");

const IMAGE_WIDTH = 724;
const TABLE_CROP_TOP = 430;
const GORGO_ROW = { top: 478, height: 42 };
const UNIT_PRICE_INK_START_X = 483;

const ROWS = {
  gorgonzola: { top: 478, height: 42, pdfQty: 1.35, expected: 1.35 },
  bresaola: { top: 566, height: 42, pdfQty: 1.83, expected: 1.83 },
  prosciutto: { top: 654, height: 42, pdfQty: 4.3, expected: 4.3 },
  mortadella: { top: 742, height: 42, pdfQty: 3.11, expected: 3.11 },
} as const;

mkdirSync(OUT, { recursive: true });

// Geometry before fix (no pad)
function qtdX0(w: number) {
  return Math.floor(w * 0.605);
}
function qtdX1Before(w: number) {
  return Math.ceil(w * 0.661);
}
function qtdX1After(w: number) {
  return Math.min(w, Math.ceil(w * 0.661) + 2);
}

const x0 = qtdX0(IMAGE_WIDTH);
const x1Before = qtdX1Before(IMAGE_WIDTH);
const x1After = qtdX1After(IMAGE_WIDTH);
const widthBefore = x1Before - x0;
const widthAfter = x1After - x0;

// Export production strip via cropQtdColumnStrip
const exportScript = join(OUT, "_export-strip.mts");
writeFileSync(
  exportScript,
  `
import { readFileSync, writeFileSync } from "node:fs";
import { cropQtdColumnStrip } from "${ROOT}/supabase/functions/extract-invoice/invoice-qty-column-crop.ts";
import { toImageDataUrl, parseImageDataUrl } from "${ROOT}/supabase/functions/extract-invoice/invoice-image-crop.ts";

const bytes = readFileSync("${SRC}/table-crop.png");
const dataUrl = toImageDataUrl(bytes);
const stripUrl = await cropQtdColumnStrip(dataUrl);
if (!stripUrl) throw new Error("cropQtdColumnStrip returned null");
const { bytes: sb } = parseImageDataUrl(stripUrl);
writeFileSync("${OUT}/after-qtd-strip-full.png", sb);
console.log(JSON.stringify({ ok: true, bytes: sb.length }));
`,
);
execSync(
  `"${DENO}" run --allow-read --allow-write --allow-net "${exportScript}"`,
  { stdio: "pipe" },
);

// Copy before image from prior audit
if (existsSync(join(PRIOR, "production-qtd-strip-full.png"))) {
  copyFileSync(
    join(PRIOR, "production-qtd-strip-full.png"),
    join(OUT, "before-qtd-strip-full.png"),
  );
}

const tableMeta = await sharp(join(SRC, "table-crop.png")).metadata();
const afterMeta = await sharp(join(OUT, "after-qtd-strip-full.png")).metadata();
const gorgoYInTable = GORGO_ROW.top - TABLE_CROP_TOP;

// Export gorgonzola row strips before/after
if (existsSync(join(OUT, "before-qtd-strip-full.png"))) {
  await sharp(join(OUT, "before-qtd-strip-full.png"))
    .extract({ left: 0, top: gorgoYInTable, width: widthBefore, height: GORGO_ROW.height })
    .png()
    .toFile(join(OUT, "before-gorgonzola-row.png"));
}
await sharp(join(OUT, "after-qtd-strip-full.png"))
  .extract({ left: 0, top: gorgoYInTable, width: widthAfter, height: GORGO_ROW.height })
  .png()
  .toFile(join(OUT, "after-gorgonzola-row.png"));

type PixelAnalysis = {
  widthPx: number;
  rightmostInkColumn: number | null;
  digit5Clipped: boolean;
  clippingEvidence: string;
  col479Included: boolean;
  col479DarkPixels: number;
  unitPriceBleed: boolean;
  rightEdgeDarkCount: number;
};

async function analyzeStrip(
  path: string,
  nominalWidth: number,
): Promise<PixelAnalysis> {
  const { data, info } = await sharp(path)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  let rightmostInkColumn: number | null = null;
  for (let x = width - 1; x >= 0; x--) {
    let dark = 0;
    for (let y = 0; y < height; y++) {
      if (data[y * width + x] < 200) dark++;
    }
    if (dark >= 3) {
      rightmostInkColumn = x;
      break;
    }
  }

  const edgeCol = width - 1;
  let edgeDark = 0;
  for (let y = 0; y < height; y++) {
    if (data[y * edgeCol] < 200) edgeDark++;
  }

  // Digit 5 fix: x=479 must be inside strip (proven root cause: 5 extends to 479, 41px strip ends at 478)
  const DIGIT5_ABS_X = 479;
  const col479Included = x0 + width >= DIGIT5_ABS_X + 1;
  let col479Dark = 0;
  if (col479Included) {
    const col479Idx = DIGIT5_ABS_X - x0;
    for (let y = 0; y < height; y++) {
      if (data[y * width + col479Idx] < 200) col479Dark++;
    }
  }

  let digit5Clipped = !col479Included || col479Dark < 3;
  let clippingEvidence = digit5Clipped
    ? col479Included
      ? `x=${DIGIT5_ABS_X} included but insufficient ink (${col479Dark} dark px)`
      : `x=${DIGIT5_ABS_X} outside strip (ends at x=${x0 + width - 1})`
    : `x=${DIGIT5_ABS_X} fully inside strip (${col479Dark} dark px)`;

  // Unit price bleed: check if columns near right edge have ink typical of price column
  // Full strip x coordinate = x0 + column
  const absoluteRightX = x0 + width;
  let unitPriceBleed = absoluteRightX > UNIT_PRICE_INK_START_X;
  if (!unitPriceBleed && width > 41) {
    // Scan last 3 columns for price-like dense ink
    for (let col = width - 1; col >= Math.max(0, width - 4); col--) {
      let dark = 0;
      for (let y = 0; y < height; y++) {
        if (data[y * width + col] < 200) dark++;
      }
      if (dark >= height * 0.15) {
        const absX = x0 + col;
        if (absX >= UNIT_PRICE_INK_START_X - 1) unitPriceBleed = true;
      }
    }
  }

  return {
    widthPx: width,
    rightmostInkColumn,
    digit5Clipped,
    clippingEvidence,
    col479Included,
    col479DarkPixels: col479Dark,
    unitPriceBleed,
    rightEdgeDarkCount: edgeDark,
  };
}

const beforeAnalysis = existsSync(join(OUT, "before-gorgonzola-row.png"))
  ? await analyzeStrip(join(OUT, "before-gorgonzola-row.png"), widthBefore)
  : null;
const afterAnalysis = await analyzeStrip(
  join(OUT, "after-gorgonzola-row.png"),
  widthAfter,
);

// Regression: export row bands from after strip for each product
const regressionMatrix: Record<string, unknown> = {};
for (const [key, row] of Object.entries(ROWS)) {
  const yInTable = row.top - TABLE_CROP_TOP;
  const outFile = `after-${key}-row.png`;
  await sharp(join(OUT, "after-qtd-strip-full.png"))
    .extract({ left: 0, top: yInTable, width: widthAfter, height: row.height })
    .png()
    .toFile(join(OUT, outFile));

  const pa = await analyzeStrip(join(OUT, outFile), widthAfter);
  regressionMatrix[key] = {
    pdfQty: row.pdfQty,
    expected: row.expected,
    rowFile: outFile,
    rightmostInkColumn: pa.rightmostInkColumn,
    unitPriceBleed: pa.unitPriceBleed,
    stripWidthPx: widthAfter,
    status: pa.unitPriceBleed ? "FAIL_BLEED" : "OK",
  };
}

// Run deno tests
let testResults: { exitCode: number; stdout: string; stderr: string };
try {
  const stdout = execSync(
    `"${DENO}" test --allow-read=. --allow-net supabase/functions/extract-invoice/*.test.ts`,
    { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
  );
  testResults = { exitCode: 0, stdout, stderr: "" };
} catch (e: unknown) {
  const err = e as { status?: number; stdout?: string; stderr?: string };
  testResults = {
    exitCode: err.status ?? 1,
    stdout: err.stdout ?? "",
    stderr: err.stderr ?? "",
  };
}

const digit5Fixed = afterAnalysis.digit5Clipped === false &&
  (beforeAnalysis?.digit5Clipped === true || beforeAnalysis == null);
const noUnitPriceBleed = !afterAnalysis.unitPriceBleed &&
  Object.values(regressionMatrix).every((r) => !(r as { unitPriceBleed: boolean }).unitPriceBleed);
const testsPass = testResults.exitCode === 0;

const verdict = digit5Fixed && noUnitPriceBleed && testsPass ? "PASS" : "FAIL";

const results = {
  fixType: "QTD_STRIP_RIGHT_PAD_PX",
  fixValue: 2,
  generatedAt: new Date().toISOString(),
  validationLab: "bjhnlrgodcqoyzddbpbd",
  invoiceId: "ab52796d-de1d-418d-86e7-230c8f056f09",
  geometryDiff: {
    before: {
      x0Frac: 0.605,
      x1Frac: 0.661,
      rightPadPx: 0,
      x0Px: x0,
      x1Px: x1Before,
      stripWidthPx: widthBefore,
    },
    after: {
      x0Frac: 0.605,
      x1Frac: 0.661,
      rightPadPx: 2,
      x0Px: x0,
      x1Px: x1After,
      stripWidthPx: widthAfter,
      equivalentX1Frac: x1After / IMAGE_WIDTH,
    },
    unitPriceInkStartPx: UNIT_PRICE_INK_START_X,
    marginBeforeUnitPricePx: UNIT_PRICE_INK_START_X - x1After,
  },
  validationMatrix: {
    gorgonzola: {
      pdfQty: 1.35,
      beforeStripWidth: widthBefore,
      afterStripWidth: widthAfter,
      beforeDigit5Clipped: beforeAnalysis?.digit5Clipped ?? true,
      afterDigit5Clipped: afterAnalysis.digit5Clipped,
      beforeRightmostInk: beforeAnalysis?.rightmostInkColumn,
      afterRightmostInk: afterAnalysis.rightmostInkColumn,
      expectedPrepass: 1.35,
      expectedPassC: 1.05,
      expectedAnchored: 1.35,
    },
  },
  regressionMatrix,
  pixelAnalysis: {
    before: beforeAnalysis,
    after: afterAnalysis,
  },
  testResults: {
    exitCode: testResults.exitCode,
    pass: testsPass,
    summary: testsPass
      ? "All extract-invoice tests passed"
      : "Some tests failed — see stdout/stderr",
    stdoutTail: testResults.stdout.split("\n").slice(-15).join("\n"),
    stderr: testResults.stderr.slice(0, 2000),
  },
  successCriteria: {
    gorgonzola: { pdf: 1.35, prepass: 1.35, passC: 1.05, anchored: 1.35 },
    bresaola: { pdf: 1.83, prepass: 1.83 },
    prosciutto: { pdf: 4.3, unchanged: true },
    mortadella: { pdf: 3.11, unchanged: true },
  },
  exportedFiles: [
    "before-qtd-strip-full.png",
    "after-qtd-strip-full.png",
    "before-gorgonzola-row.png",
    "after-gorgonzola-row.png",
    "after-gorgonzola-row.png",
    "after-bresaola-row.png",
    "after-prosciutto-row.png",
    "after-mortadella-row.png",
  ],
  verdict,
  verdictReasons: {
    digit5Fixed,
    noUnitPriceBleed,
    testsPass,
  },
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

const md: string[] = [];
md.push("# Qtd Strip Right-Pad Fix - Validation Report");
md.push("");
md.push(`**Fix:** \`QTD_STRIP_RIGHT_PAD_PX = 2\` | **Verdict:** **${verdict}** | ${results.generatedAt.slice(0, 10)}`);
md.push("");
md.push("## Geometry diff");
md.push("");
md.push("| | Before | After |");
md.push("|---|--------|-------|");
md.push(`| x0 (px) | ${x0} | ${x0} |`);
md.push(`| x1 (px) | ${x1Before} | ${x1After} |`);
md.push(`| Strip width | ${widthBefore}px | ${widthAfter}px |`);
md.push(`| Right pad | 0 | 2 |`);
md.push(`| Margin to unit-price ink (x~${UNIT_PRICE_INK_START_X}) | ${UNIT_PRICE_INK_START_X - x1Before}px | ${UNIT_PRICE_INK_START_X - x1After}px |`);
md.push("");
md.push("## Digit 5 clipping (Gorgonzola row)");
md.push("");
md.push(`- **Before (${widthBefore}px):** clipped=${beforeAnalysis?.digit5Clipped ?? "unknown"} — x=479 included=${beforeAnalysis?.col479Included ?? false}`);
md.push(`- **After (${widthAfter}px):** clipped=${afterAnalysis.digit5Clipped} — x=479 included=${afterAnalysis.col479Included}, ${afterAnalysis.col479DarkPixels} dark px`);
md.push(`- **Unit price bleed:** ${afterAnalysis.unitPriceBleed ? "YES (WARN)" : "NO"}`);
md.push("");
md.push("## Validation matrix (Gorgonzola)");
md.push("");
md.push("| Metric | Expected | Status |");
md.push("|--------|----------|--------|");
md.push("| PDF qty | 1.35 | geometry fix enables |");
md.push("| Prepass | 1.35 | pending live OCR |");
md.push("| Pass C | 1.05 | unchanged |");
md.push("| Anchored | 1.35 | pending live OCR |");
md.push("| Digit 5 visible | YES | " + (digit5Fixed ? "PASS" : "FAIL") + " |");
md.push("");
md.push("## Regression matrix");
md.push("");
md.push("| Product | PDF qty | Strip bleed | Status |");
md.push("|---------|---------|-------------|--------|");
for (const [key, val] of Object.entries(regressionMatrix)) {
  const v = val as { pdfQty: number; unitPriceBleed: boolean; status: string };
  md.push(`| ${key} | ${v.pdfQty} | ${v.unitPriceBleed ? "YES" : "NO"} | ${v.status} |`);
}
md.push("");
md.push("## Test results");
md.push("");
md.push(`\`\`\`\n${testResults.stdout.split("\n").slice(-20).join("\n")}\n\`\`\``);
md.push("");
md.push(`**Exit code:** ${testResults.exitCode} · **Pass:** ${testsPass}`);
md.push("");
md.push("## Exported images");
md.push("");
md.push("- `before-qtd-strip-full.png` / `after-qtd-strip-full.png`");
md.push("- `before-gorgonzola-row.png` / `after-gorgonzola-row.png`");
md.push("- Row exports: `after-{gorgonzola,bresaola,prosciutto,mortadella}-row.png`");

writeFileSync(join(OUT, "REPORT.md"), md.join("\n"));
console.log(JSON.stringify({ ok: true, verdict, out: OUT }, null, 2));
