/**
 * Read-only diagnostic for detectTableBounds header-band selection.
 * Replicates production logic + logs all candidates + generates overlay PNGs.
 *
 * Usage:
 *   deno run --allow-read --allow-write .tmp/table-bounds-investigation/detect-table-bounds-diagnostic.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { detectTableBounds } from "../../supabase/functions/extract-invoice/invoice-image-crop.ts";

const OUT_DIR = join(Deno.cwd(), ".tmp/table-bounds-investigation");
mkdirSync(OUT_DIR, { recursive: true });

const HEADER_BAND_ROWS = 18;
const TOP_MARGIN = 10;
const MIN_TABLE_HEIGHT = 170;

type InvoiceCase = {
  id: string;
  label: string;
  imagePath: string;
  /** Annotated true column-header band top (from prior VL/OCR audits). */
  expectedHeaderTop: number;
  expectedRows: number | null;
  rowsLost: boolean | null;
};

const CASES: InvoiceCase[] = [
  {
    id: "f0aa5a08-86a3-4938-99f0-711e86073968",
    label: "Bocconcino",
    imagePath: ".tmp/bocconcino-investigation/invoice-full.png",
    expectedHeaderTop: 430,
    expectedRows: 7,
    rowsLost: true,
  },
  {
    id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
    label: "Bidfood",
    imagePath: ".tmp/bidfood-ovo.png",
    expectedHeaderTop: 280,
    expectedRows: null,
    rowsLost: null,
  },
  {
    id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
    label: "Aviludo May",
    imagePath: ".tmp/aviludo-investigation/reference_3b4cb21f_scan.png",
    expectedHeaderTop: 228,
    expectedRows: 8,
    rowsLost: false,
  },
  {
    id: "c2f52357-0f80-491a-ba14-c97ff4837472",
    label: "Aviludo April",
    imagePath: ".tmp/aviludo-investigation/Aviludo_Historico_2026_04_with_total.pdf.png",
    expectedHeaderTop: 228,
    expectedRows: 9,
    rowsLost: null,
  },
];

function pixelLuminance(pixel: number): number {
  const r = (pixel >> 24) & 0xff;
  const g = (pixel >> 16) & 0xff;
  const b = (pixel >> 8) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rowMeanLuminance(image: Image, y: number): number {
  let sum = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x++) {
    sum += pixelLuminance(image.getPixelAt(x, row));
  }
  return sum / image.width;
}

function rowEdgeScore(image: Image, y: number): number {
  if (y < 0 || y >= image.height - 1) return 0;
  let score = 0;
  const step = Math.max(1, Math.floor(image.width / 120));
  let samples = 0;
  const row = y + 1;
  for (let x = 1; x <= image.width; x += step) {
    const l1 = pixelLuminance(image.getPixelAt(x, row));
    const l2 = pixelLuminance(image.getPixelAt(x, row + 1));
    score += Math.abs(l1 - l2);
    samples++;
  }
  return samples > 0 ? score / samples : 0;
}

type Candidate = {
  y: number;
  bandAverage: number;
  isWinner: boolean;
  rank: number;
  deltaFromWinner: number;
  atExpected: boolean;
};

function scanHeaderCandidates(image: Image, winnerY: number): {
  scanStart: number;
  scanEnd: number;
  candidates: Candidate[];
  winnerBandAverage: number;
} {
  const height = image.height;
  const scanStart = Math.floor(height * 0.12);
  const scanEnd = Math.floor(height * 0.55);

  const raw: { y: number; bandAverage: number }[] = [];
  for (let y = scanStart; y < scanEnd - HEADER_BAND_ROWS; y++) {
    let bandSum = 0;
    for (let dy = 0; dy < HEADER_BAND_ROWS; dy++) {
      bandSum += rowMeanLuminance(image, y + dy);
    }
    raw.push({ y, bandAverage: bandSum / HEADER_BAND_ROWS });
  }

  const sorted = [...raw].sort((a, b) => a.bandAverage - b.bandAverage);
  const winnerBandAverage = sorted[0]?.bandAverage ?? NaN;
  const rankByY = new Map(sorted.map((c, i) => [c.y, i + 1]));

  const candidates: Candidate[] = raw.map((c) => ({
    y: c.y,
    bandAverage: Math.round(c.bandAverage * 100) / 100,
    isWinner: c.y === winnerY,
    rank: rankByY.get(c.y) ?? 0,
    deltaFromWinner: Math.round((c.bandAverage - winnerBandAverage) * 100) / 100,
    atExpected: false,
  }));

  return { scanStart, scanEnd, candidates, winnerBandAverage };
}

function bandAverageAt(image: Image, y: number): number {
  let bandSum = 0;
  for (let dy = 0; dy < HEADER_BAND_ROWS; dy++) {
    bandSum += rowMeanLuminance(image, y + dy);
  }
  return bandSum / HEADER_BAND_ROWS;
}

/** Draw horizontal line (2px thick) on image copy. */
async function drawOverlay(
  image: Image,
  lines: { y: number; color: number; label: string }[],
): Promise<Uint8Array> {
  const overlay = image.clone();
  for (const { y, color } of lines) {
    if (y < 0 || y >= overlay.height) continue;
    for (let dy = 0; dy < 2; dy++) {
      const row = y + dy + 1;
      if (row > overlay.height) continue;
      for (let x = 1; x <= overlay.width; x++) {
        overlay.setPixelAt(x, row, color);
      }
    }
  }
  // Semi-transparent band for expected header region
  return await overlay.encode();
}

// colors: RGBA as ImageScript packed int
const RED = 0xff0000ff;
const GREEN = 0x00ff00ff;
const BLUE = 0x0000ffff;
const MAGENTA = 0xff00ffff;
const YELLOW = 0xffff00ff;

type CaseResult = {
  id: string;
  label: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  constants: {
    HEADER_BAND_ROWS: number;
    TOP_MARGIN: number;
    scanStartFraction: number;
    scanEndFraction: number;
    scanStart: number;
    scanEnd: number;
    bandThresholdDelta: number;
    MIN_TABLE_HEIGHT: number;
  };
  productionBounds: ReturnType<typeof detectTableBounds>;
  expectedHeaderTop: number;
  expectedCropTop: number;
  detectedCropTop: number;
  deltaHeaderPx: number;
  deltaCropTopPx: number;
  expectedBandAverage: number;
  winnerBandAverage: number;
  expectedBandRank: number;
  topCandidates: Candidate[];
  allCandidatesPath: string;
  overlayPath: string;
  heuristicExplanation: string;
  rowsLost: boolean | null;
  expectedRows: number | null;
};

const allResults: CaseResult[] = [];

for (const c of CASES) {
  const bytes = readFileSync(join(Deno.cwd(), c.imagePath));
  const image = await Image.decode(bytes);
  const bounds = detectTableBounds(image);
  const { scanStart, scanEnd, candidates, winnerBandAverage } = scanHeaderCandidates(
    image,
    bounds.headerTop,
  );

  // Mark expected position in candidate list
  for (const cand of candidates) {
    if (Math.abs(cand.y - c.expectedHeaderTop) <= 2) cand.atExpected = true;
  }

  const expectedBandAverage = bandAverageAt(image, c.expectedHeaderTop);
  const expectedRank = [...candidates]
    .sort((a, b) => a.bandAverage - b.bandAverage)
    .findIndex((x) => Math.abs(x.y - c.expectedHeaderTop) <= 2) + 1;

  const topCandidates = [...candidates]
    .sort((a, b) => a.bandAverage - b.bandAverage)
    .slice(0, 15)
    .map((x) => ({ ...x, atExpected: Math.abs(x.y - c.expectedHeaderTop) <= 2 }));

  const allCandidatesPath = join(OUT_DIR, `${c.label.toLowerCase().replace(/\s+/g, "-")}-candidates.json`);
  writeFileSync(allCandidatesPath, JSON.stringify({
    label: c.label,
    scanStart,
    scanEnd,
    winnerY: bounds.headerTop,
    winnerBandAverage: Math.round(winnerBandAverage * 100) / 100,
    expectedHeaderTop: c.expectedHeaderTop,
    expectedBandAverage: Math.round(expectedBandAverage * 100) / 100,
    expectedRank,
    candidates: candidates.sort((a, b) => a.bandAverage - b.bandAverage),
  }, null, 2));

  const overlayPath = join(OUT_DIR, `${c.label.toLowerCase().replace(/\s+/g, "-")}-overlay.png`);
  const overlayBytes = await drawOverlay(image, [
    { y: bounds.top, color: YELLOW, label: "cropTop" },
    { y: bounds.headerTop, color: RED, label: "detected headerTop" },
    { y: bounds.headerBottom, color: RED, label: "detected headerBottom" },
    { y: bounds.bottom, color: BLUE, label: "detected bottom" },
    { y: c.expectedHeaderTop, color: GREEN, label: "expected headerTop" },
    { y: c.expectedHeaderTop - TOP_MARGIN, color: MAGENTA, label: "expected cropTop" },
  ]);
  writeFileSync(overlayPath, overlayBytes);

  // Row-by-row luminance in winner band vs expected band (for Bocconcino deep-dive)
  const winnerBandRows = Array.from({ length: HEADER_BAND_ROWS }, (_, dy) => ({
    y: bounds.headerTop + dy,
    luminance: Math.round(rowMeanLuminance(image, bounds.headerTop + dy) * 100) / 100,
  }));
  const expectedBandRows = Array.from({ length: HEADER_BAND_ROWS }, (_, dy) => ({
    y: c.expectedHeaderTop + dy,
    luminance: Math.round(rowMeanLuminance(image, c.expectedHeaderTop + dy) * 100) / 100,
  }));

  const bandDetailPath = join(OUT_DIR, `${c.label.toLowerCase().replace(/\s+/g, "-")}-band-detail.json`);
  writeFileSync(bandDetailPath, JSON.stringify({
    winnerBandRows,
    expectedBandRows,
    totalsEdgePeak: bounds.totalsStart != null
      ? {
        y: bounds.totalsStart,
        edge: Math.round(rowEdgeScore(image, bounds.totalsStart) * 100) / 100,
      }
      : null,
  }, null, 2));

  let heuristicExplanation = "";
  if (c.label === "Bocconcino") {
    const gap = expectedBandAverage - winnerBandAverage;
    heuristicExplanation = [
      `Global minimum 18-row mean luminance in scan band [12%,55%] = y=${bounds.headerTop} (avg=${winnerBandAverage.toFixed(2)}).`,
      `True grey header at y≈${c.expectedHeaderTop} has avg=${expectedBandAverage.toFixed(2)} (rank #${expectedRank}, +${gap.toFixed(2)} vs winner).`,
      `Band at y=571 spans Stracciatella metadata / inter-row gap — darker than column header because multi-line product rows + QR/certification blocks above leave the real header band lighter.`,
      `cropTop = headerTop - ${TOP_MARGIN} = ${bounds.top} cuts between Stracciatella and Mezzi Paccheri.`,
    ].join(" ");
  } else if (expectedRank === 1) {
    heuristicExplanation = `Expected header at y=${c.expectedHeaderTop} is the global minimum grey band (rank #1). Detection correct.`;
  } else {
    heuristicExplanation = `Detected y=${bounds.headerTop} (rank #1, avg=${winnerBandAverage.toFixed(2)}); expected y=${c.expectedHeaderTop} is rank #${expectedRank} (avg=${expectedBandAverage.toFixed(2)}).`;
  }

  allResults.push({
    id: c.id,
    label: c.label,
    imagePath: c.imagePath,
    imageWidth: image.width,
    imageHeight: image.height,
    constants: {
      HEADER_BAND_ROWS,
      TOP_MARGIN,
      scanStartFraction: 0.12,
      scanEndFraction: 0.55,
      scanStart,
      scanEnd,
      bandThresholdDelta: 12,
      MIN_TABLE_HEIGHT,
    },
    productionBounds: bounds,
    expectedHeaderTop: c.expectedHeaderTop,
    expectedCropTop: c.expectedHeaderTop - TOP_MARGIN,
    detectedCropTop: bounds.top,
    deltaHeaderPx: bounds.headerTop - c.expectedHeaderTop,
    deltaCropTopPx: bounds.top - (c.expectedHeaderTop - TOP_MARGIN),
    expectedBandAverage: Math.round(expectedBandAverage * 100) / 100,
    winnerBandAverage: Math.round(winnerBandAverage * 100) / 100,
    expectedBandRank: expectedRank,
    topCandidates,
    allCandidatesPath,
    overlayPath,
    heuristicExplanation,
    rowsLost: c.rowsLost,
    expectedRows: c.expectedRows,
  });
}

writeFileSync(join(OUT_DIR, "comparison.json"), JSON.stringify(allResults, null, 2));
writeFileSync(join(OUT_DIR, "REPORT.md"), buildReport(allResults));
console.log(JSON.stringify(allResults.map((r) => ({
  label: r.label,
  headerTop: r.productionBounds.headerTop,
  expected: r.expectedHeaderTop,
  delta: r.deltaHeaderPx,
  rank: r.expectedBandRank,
})), null, 2));

function buildReport(results: CaseResult[]): string {
  const boc = results.find((r) => r.label === "Bocconcino")!;
  const lines: string[] = [
    "# Table Bounds Root Cause Investigation",
    "",
    "## Bocconcino deep-dive",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| detected headerTop | ${boc.productionBounds.headerTop} |`,
    `| expected headerTop | ${boc.expectedHeaderTop} |`,
    `| delta (px) | ${boc.deltaHeaderPx} |`,
    `| exact heuristic responsible | Lowest 18-row mean luminance in y∈[${boc.constants.scanStart},${boc.constants.scanEnd}] (${Math.round(boc.imageHeight * 0.12)}–${Math.round(boc.imageHeight * 0.55)}px); y=571 band avg=${boc.winnerBandAverage} beats expected y=${boc.expectedHeaderTop} avg=${boc.expectedBandAverage} (rank #${boc.expectedBandRank}) |`,
    "",
    "## Comparison table",
    "",
    "| Invoice | Image height | detected top | expected top | delta | rows lost? |",
    "|---------|--------------|--------------|--------------|-------|------------|",
  ];

  for (const r of results) {
    const lost = r.rowsLost === null ? "unknown" : r.rowsLost ? "YES" : "no";
    lines.push(`| ${r.label} | ${r.imageHeight} | ${r.productionBounds.headerTop} | ${r.expectedHeaderTop} | ${r.deltaHeaderPx} | ${lost} |`);
  }

  lines.push(
    "",
    "## Evidence paths",
    "",
    "```",
    ".tmp/table-bounds-investigation/",
    "  detect-table-bounds-diagnostic.ts",
    "  comparison.json",
    "  REPORT.md",
    ...results.flatMap((r) => [
      `  ${r.label.toLowerCase().replace(/\s+/g, "-")}-candidates.json`,
      `  ${r.label.toLowerCase().replace(/\s+/g, "-")}-band-detail.json`,
      `  ${r.label.toLowerCase().replace(/\s+/g, "-")}-overlay.png`,
    ]),
    "```",
  );

  return lines.join("\n");
}
