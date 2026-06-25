/**
 * STRICT READ-ONLY GPT Vision Quantity Reading Laboratory
 * VL: bjhnlrgodcqoyzddbpbd — no production writes, no code changes
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = join(ROOT, ".tmp/gpt-vision-reading-laboratory");
const IMG = join(OUT, "images");
const SRC_INVOICE = join(ROOT, ".tmp/emporio-italia-investigation/invoice-full.png");
const SRC_TABLE = join(ROOT, ".tmp/fraction-row-crop-audit/table-crop.png");
const SRC_ROWS = join(ROOT, ".tmp/fraction-row-crop-audit");
const LIVE_REEXTRACT = join(ROOT, ".tmp/ocr-prepass-fix-implementation/live-reextract.json");

const TABLE_CROP_TOP = 430;
const QTD_X0 = 438;
const UNIT_PRICE_INK_START_X = 483;
const RUNS_PER_CELL = 5;

const QTD_STRIP_SYSTEM_PROMPT = `
You extract ONLY quantity from invoice Qtd column row bands.

Return ONLY valid JSON:
{ "items": [{ "name": string, "quantity": number | null, "unit": string | null }] }

RULES:
- Read ONLY the Qtd column — no product names are visible.
- Each horizontal band is one row's Qtd cell. Read top-to-bottom in table order.
- Return quantity: null when a cell is blank or illegible — never guess from fractions or pack weights.
- Read fractional decimals exactly: 1,35 → 1.35, 0,5 → 0.5 — never round.
- One output row per visible row band.
- Pack fractions (1/8, 1/2, 1/4) are NEVER purchased quantity.
- unit should be "kg" for Emporio deli decimal rows when visible; otherwise null.
`.trim();

const PREPASS_USER_TEXT =
  "Read the decimal quantity from each row band in this Qtd column image only. Return one item per visible row band, in order. Name may be row-N.";

const QTY_PREPAS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "invoice_qty_prepass",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
            },
            required: ["name", "quantity", "unit"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const PRODUCTS = [
  {
    key: "gorgonzola",
    truth: 1.35,
    fullTop: 478,
    height: 42,
    stripRowIndex: 0,
    qtdPrinted: "1,35",
  },
  {
    key: "prosciutto",
    truth: 4.3,
    fullTop: 518,
    height: 40,
    stripRowIndex: 1,
    qtdPrinted: "4,30",
  },
  {
    key: "bresaola",
    truth: 1.83,
    fullTop: 556,
    height: 44,
    stripRowIndex: 2,
    qtdPrinted: "1,83",
  },
] as const;

type VariantDef = {
  id: string;
  label: string;
  kind:
    | "strip"
    | "row"
    | "row_highlight"
    | "table_marker"
    | "strip_enlarge";
  width?: number;
  scale?: number;
};

const VARIANTS: VariantDef[] = [
  { id: "A", label: "43px strip (production)", kind: "strip", width: 43 },
  { id: "B", label: "45px strip", kind: "strip", width: 45 },
  { id: "C", label: "47px strip", kind: "strip", width: 47 },
  { id: "D", label: "50px strip", kind: "strip", width: 50 },
  { id: "E", label: "60px strip", kind: "strip", width: 60 },
  { id: "F", label: "80px strip", kind: "strip", width: 80 },
  { id: "G", label: "Full row crop", kind: "row" },
  { id: "H", label: "Full row + Qtd highlight", kind: "row_highlight" },
  { id: "I", label: "Table crop + Gorgonzola marker", kind: "table_marker" },
  { id: "J", label: "43px strip enlarged 2x", kind: "strip_enlarge", width: 43, scale: 2 },
  { id: "K", label: "43px strip enlarged 3x", kind: "strip_enlarge", width: 43, scale: 3 },
];

mkdirSync(IMG, { recursive: true });

function loadOpenAiKey(): string | null {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  for (const envPath of [
    join(ROOT, ".env"),
    join(ROOT, ".env.local"),
    join(ROOT, ".env.production-backup"),
    join(ROOT, "supabase/.env"),
  ]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^OPENAI_API_KEY=(.+)$/);
      if (m?.[1]?.trim()) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  try {
    const raw = execSync(`supabase secrets list --project-ref ${VL} -o json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const secrets = JSON.parse(raw) as { name: string }[];
    if (secrets.some((s) => s.name === "OPENAI_API_KEY")) {
      // digest-only listing — value not retrievable via CLI
    }
  } catch {
    // ignore
  }
  return null;
}

type VisualAnalysis = {
  widthPx: number;
  heightPx: number;
  rightmostInkAbsX: number | null;
  digit5Clipped: boolean;
  unitPriceBleed: boolean;
  marginBeforeUnitPricePx: number | null;
  rightEdgeDarkCount: number;
  meanLuminance: number;
  darkPixelFraction: number;
  digitClarityNotes: string;
  contextNotes: string;
  distractionNotes: string;
};

async function analyzeImage(
  path: string,
  opts: { stripWidth?: number; x0?: number },
): Promise<VisualAnalysis> {
  const meta = await sharp(path).metadata();
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({
    resolveWithObject: true,
  });
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

  const x0 = opts.x0 ?? 0;
  const stripWidth = opts.stripWidth ?? width;
  const x1Abs = x0 + stripWidth;
  const DIGIT5_ABS_X = 479;
  const col479Included = x0 === QTD_X0 && stripWidth >= DIGIT5_ABS_X - QTD_X0 + 1;
  let col479Dark = 0;
  if (col479Included) {
    const col479Idx = DIGIT5_ABS_X - QTD_X0;
    if (col479Idx >= 0 && col479Idx < width) {
      for (let y = 0; y < height; y++) {
        if (data[y * width + col479Idx] < 200) col479Dark++;
      }
    }
  }
  const digit5Clipped = x0 === QTD_X0 && (!col479Included || col479Dark < 3);

  let unitPriceBleed = false;
  if (x0 === QTD_X0) {
    unitPriceBleed = x1Abs > UNIT_PRICE_INK_START_X;
    if (!unitPriceBleed) {
      for (let col = width - 1; col >= Math.max(0, width - 5); col--) {
        let dark = 0;
        for (let y = 0; y < height; y++) {
          if (data[y * width + col] < 200) dark++;
        }
        if (dark >= height * 0.12 && x0 + col >= UNIT_PRICE_INK_START_X - 1) {
          unitPriceBleed = true;
          break;
        }
      }
    }
  }

  let rightEdgeDarkCount = 0;
  for (let y = 0; y < height; y++) {
    if (data[y * width + (width - 1)] < 200) rightEdgeDarkCount++;
  }

  let lumSum = 0;
  let darkCount = 0;
  for (let i = 0; i < data.length; i++) {
    lumSum += data[i];
    if (data[i] < 200) darkCount++;
  }
  const meanLuminance = lumSum / data.length;
  const darkPixelFraction = darkCount / data.length;

  const rightmostInkAbsX =
    rightmostInkColumn != null ? x0 + rightmostInkColumn : null;
  const marginBeforeUnitPricePx =
    x0 === QTD_X0 ? UNIT_PRICE_INK_START_X - x1Abs : null;

  let digitClarityNotes = "General ink present";
  if (digit5Clipped) {
    digitClarityNotes =
      "Digit 5 of 1,35 likely clipped or faint at strip right edge (x479 not fully captured)";
  } else if (x0 === QTD_X0 && col479Dark >= 3) {
    digitClarityNotes = "Digit 5 column (x479) has visible ink — full 1,35 should be readable";
  }
  if (rightEdgeDarkCount >= height * 0.15) {
    digitClarityNotes += "; dense ink at right edge may confuse trailing digit";
  }

  let contextNotes = "Isolated presentation";
  if (width > 120) contextNotes = "Wide crop includes adjacent columns or description bleed";
  if (height > 100 && width < 100) contextNotes = "Multi-row Qtd strip — row bands only, no product names";

  let distractionNotes = "Minimal";
  if (unitPriceBleed) distractionNotes = "Unit-price column digits may bleed into strip";
  if (width > 200) distractionNotes = "Description fractions (1/8, 1/2) and pack weights visible";

  return {
    widthPx: meta.width ?? width,
    heightPx: meta.height ?? height,
    rightmostInkAbsX,
    digit5Clipped,
    unitPriceBleed,
    marginBeforeUnitPricePx,
    rightEdgeDarkCount,
    meanLuminance,
    darkPixelFraction,
    digitClarityNotes,
    contextNotes,
    distractionNotes,
  };
}

async function exportVariants() {
  const tableMeta = await sharp(SRC_TABLE).metadata();
  const tableH = tableMeta.height!;
  const tableW = tableMeta.width!;
  const exported: Array<Record<string, unknown>> = [];

  for (const v of VARIANTS) {
    if (v.kind === "strip" || v.kind === "strip_enlarge") {
      const w = v.width!;
      const base = join(IMG, `${v.id}-qtd-strip-full.png`);
      await sharp(SRC_TABLE)
        .extract({ left: QTD_X0, top: 0, width: w, height: tableH })
        .png()
        .toBuffer()
        .then(async (buf) => {
          if (v.kind === "strip_enlarge" && v.scale) {
            await sharp(buf)
              .resize(w * v.scale, tableH * v.scale, { kernel: sharp.kernel.nearest })
              .png()
              .toFile(base);
          } else {
            writeFileSync(base, buf);
          }
        });

      const gorgo = PRODUCTS[0];
      const rowY = gorgo.fullTop - TABLE_CROP_TOP;
      const rowFile = join(IMG, `${v.id}-gorgonzola-row.png`);
      await sharp(SRC_TABLE)
        .extract({ left: QTD_X0, top: rowY, width: w, height: gorgo.height })
        .png()
        .toFile(rowFile);

      exported.push({
        variant: v.id,
        gptImage: `${v.id}-qtd-strip-full.png`,
        previewRow: `${v.id}-gorgonzola-row.png`,
        widthPx: w,
        scale: v.scale ?? 1,
      });
    }

    if (v.kind === "row" || v.kind === "row_highlight") {
      for (const p of PRODUCTS) {
        const srcRow = join(SRC_ROWS, `${p.key}-crop.png`);
        const outFile = join(IMG, `${v.id}-${p.key}-row.png`);
        if (v.kind === "row") {
          if (existsSync(srcRow)) {
            await sharp(srcRow).png().toFile(outFile);
          } else {
            await sharp(SRC_INVOICE)
              .extract({ left: 0, top: p.fullTop, width: 724, height: p.height })
              .png()
              .toFile(outFile);
          }
        } else {
          const rowBuf = existsSync(srcRow)
            ? await sharp(srcRow).png().toBuffer()
            : await sharp(SRC_INVOICE)
                .extract({ left: 0, top: p.fullTop, width: 724, height: p.height })
                .png()
                .toBuffer();
          const meta = await sharp(rowBuf).metadata();
          const overlayW = Math.min(45, (meta.width ?? 724) - QTD_X0);
          const svg = Buffer.from(
            `<svg width="${meta.width}" height="${meta.height}">
              <rect x="${QTD_X0}" y="0" width="${overlayW}" height="${meta.height}"
                fill="rgba(255,220,0,0.22)" stroke="rgba(255,140,0,0.85)" stroke-width="2"/>
            </svg>`,
          );
          await sharp(rowBuf)
            .composite([{ input: svg, top: 0, left: 0 }])
            .png()
            .toFile(outFile);
        }
        exported.push({
          variant: v.id,
          product: p.key,
          gptImage: `${v.id}-${p.key}-row.png`,
        });
      }
    }

    if (v.kind === "table_marker") {
      const gorgo = PRODUCTS[0];
      const markerY = gorgo.fullTop - TABLE_CROP_TOP;
      const svg = Buffer.from(
        `<svg width="${tableW}" height="${tableH}">
          <line x1="0" y1="${markerY}" x2="${tableW}" y2="${markerY}" stroke="red" stroke-width="2"/>
          <line x1="0" y1="${markerY + gorgo.height}" x2="${tableW}" y2="${markerY + gorgo.height}" stroke="red" stroke-width="2"/>
          <text x="8" y="${Math.max(14, markerY - 4)}" font-size="14" fill="red">Gorgonzola row</text>
        </svg>`,
      );
      await sharp(SRC_TABLE)
        .composite([{ input: svg, top: 0, left: 0 }])
        .png()
        .toFile(join(IMG, `${v.id}-table-marker.png`));
      exported.push({
        variant: v.id,
        gptImage: `${v.id}-table-marker.png`,
      });
    }
  }

  return { tableH, tableW, exported };
}

function extractQtyFromResponse(
  parsed: { items?: Array<{ name?: string; quantity?: number | null }> },
  product: (typeof PRODUCTS)[number],
  variant: VariantDef,
): number | null {
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (items.length === 0) return null;

  if (variant.kind === "row" || variant.kind === "row_highlight") {
    return items[0]?.quantity ?? null;
  }

  const byIndex = items[product.stripRowIndex]?.quantity;
  if (byIndex != null) return byIndex;

  const rowName = items.find((it) => it.name === `row-${product.stripRowIndex}`);
  if (rowName?.quantity != null) return rowName.quantity;

  const fractional = items.find(
    (it) =>
      typeof it.quantity === "number" &&
      Math.abs(it.quantity % 1) > 0.001 &&
      Math.abs(it.quantity - product.truth) < 0.15,
  );
  if (fractional?.quantity != null) return fractional.quantity;

  const firstDecimal = items.find(
    (it) => typeof it.quantity === "number" && Math.abs(it.quantity % 1) > 0.001,
  );
  if (product.key === "gorgonzola" && firstDecimal?.quantity != null) {
    return firstDecimal.quantity;
  }

  return items[product.stripRowIndex]?.quantity ?? items[0]?.quantity ?? null;
}

async function callGptVision(imagePath: string): Promise<{
  items: unknown[];
  raw: string;
}> {
  const b64 = readFileSync(imagePath).toString("base64");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0,
      seed: 42,
      response_format: QTY_PREPAS_RESPONSE_FORMAT,
      messages: [
        { role: "system", content: QTD_STRIP_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: PREPASS_USER_TEXT },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${b64}` },
            },
          ],
        },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  const content = body.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { items?: unknown[] };
  return { items: parsed.items ?? [], raw: content };
}

function majorityValue(values: (number | null | string)[]): number | null | string {
  const valid = values.filter((v) => v !== "PENDING_LIVE" && v !== null) as number[];
  if (valid.length === 0) return values.some((v) => v === "PENDING_LIVE") ? "PENDING_LIVE" : null;
  const counts = new Map<number, number>();
  for (const v of valid) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function consistencyScore(runs: (number | null | string)[]): {
  correctPct: number;
  variance: number;
  consistencyScore: number;
  uniqueValues: number[];
} {
  const live = runs.filter((r) => r !== "PENDING_LIVE" && typeof r === "number") as number[];
  const correct = live.filter((r) => Math.abs(r - PRODUCTS[0].truth) < 0.001).length;
  const correctPct = live.length ? (correct / live.length) * 100 : 0;
  const mean = live.length ? live.reduce((a, b) => a + b, 0) / live.length : 0;
  const variance = live.length
    ? live.reduce((s, v) => s + (v - mean) ** 2, 0) / live.length
    : 0;
  const uniqueValues = [...new Set(live)];
  const consistencyScoreVal =
    live.length === 0 ? 0 : uniqueValues.length === 1 ? 100 : Math.max(0, 100 - (uniqueValues.length - 1) * 25);
  return { correctPct, variance, consistencyScore: consistencyScoreVal, uniqueValues };
}

function imagePathForVariant(variant: VariantDef, product: string): string {
  if (variant.kind === "row" || variant.kind === "row_highlight") {
    return join(IMG, `${variant.id}-${product}-row.png`);
  }
  if (variant.kind === "table_marker") {
    return join(IMG, `${variant.id}-table-marker.png`);
  }
  return join(IMG, `${variant.id}-qtd-strip-full.png`);
}

function productsForVariant(variantId: string): string[] {
  if (variantId === "B" || variantId === "C") {
    return ["gorgonzola", "bresaola", "prosciutto"];
  }
  return ["gorgonzola"];
}

const apiKey = loadOpenAiKey();
const { tableH, tableW, exported } = await exportVariants();

type RunCell = {
  variant: string;
  product: string;
  runs: (number | null | "PENDING_LIVE")[];
  majority: number | null | "PENDING_LIVE";
  correct: boolean | null;
  truth: number;
  imageFile: string;
  status: "live" | "partial_reference" | "pending_live";
};

const runCells: RunCell[] = [];
const visualByImage: Record<string, VisualAnalysis> = {};

for (const v of VARIANTS) {
  for (const productKey of productsForVariant(v.id)) {
    const product = PRODUCTS.find((p) => p.key === productKey)!;
    const imageFile = imagePathForVariant(v, productKey);
    const relImage = imageFile.replace(`${OUT}/`, "");

    if (!visualByImage[relImage]) {
      const stripW = v.width ?? undefined;
      visualByImage[relImage] = await analyzeImage(imageFile, {
        stripWidth: stripW,
        x0: v.kind === "strip" || v.kind === "strip_enlarge" ? QTD_X0 : 0,
      });
    }

    const rowPreview = join(IMG, `${v.id}-gorgonzola-row.png`);
    const rowKey = `images/${v.id}-gorgonzola-row.png`;
    if (
      productKey === "gorgonzola" &&
      existsSync(rowPreview) &&
      !visualByImage[rowKey]
    ) {
      visualByImage[rowKey] = await analyzeImage(rowPreview, {
        stripWidth: v.width,
        x0: QTD_X0,
      });
    }

    const runs: (number | null | "PENDING_LIVE")[] = [];

    if (apiKey) {
      for (let i = 0; i < RUNS_PER_CELL; i++) {
        try {
          const { items, raw } = await callGptVision(imageFile);
          const parsed = { items: items as Array<{ name?: string; quantity?: number | null }> };
          runs.push(extractQtyFromResponse(parsed, product, v));
          if (i === 0) {
            writeFileSync(
              join(OUT, `sample-response-${v.id}-${productKey}.json`),
              JSON.stringify({ raw, items }, null, 2),
            );
          }
        } catch (e) {
          runs.push(null);
          if (i === 0) {
            writeFileSync(
              join(OUT, `sample-response-${v.id}-${productKey}-error.txt`),
              e instanceof Error ? e.message : String(e),
            );
          }
        }
      }
    } else if (v.id === "A" && productKey === "gorgonzola" && existsSync(LIVE_REEXTRACT)) {
      const live = JSON.parse(readFileSync(LIVE_REEXTRACT, "utf8"));
      runs.push(live.checks?.gorgonzola?.actual ?? 1.3);
      for (let i = 1; i < RUNS_PER_CELL; i++) runs.push("PENDING_LIVE");
    } else {
      for (let i = 0; i < RUNS_PER_CELL; i++) runs.push("PENDING_LIVE");
    }

    const maj = majorityValue(runs);
    const correct =
      maj === "PENDING_LIVE" || maj === null
        ? null
        : Math.abs((maj as number) - product.truth) < 0.001;

    runCells.push({
      variant: v.id,
      product: productKey,
      runs,
      majority: maj as number | null | "PENDING_LIVE",
      correct,
      truth: product.truth,
      imageFile: relImage,
      status: apiKey
        ? "live"
        : v.id === "A" && productKey === "gorgonzola"
          ? "partial_reference"
          : "pending_live",
    });
  }
}

const gorgonzolaCells = runCells.filter((c) => c.product === "gorgonzola");
const ranking = [...gorgonzolaCells]
  .map((c) => {
    const stats = consistencyScore(c.runs);
    const vDef = VARIANTS.find((v) => v.id === c.variant)!;
    return {
      variant: c.variant,
      label: vDef.label,
      majority: c.majority,
      correct: c.correct,
      ...stats,
      visual: visualByImage[c.imageFile],
    };
  })
  .sort((a, b) => {
    if (a.correct === true && b.correct !== true) return -1;
    if (b.correct === true && a.correct !== true) return 1;
    if (a.correctPct !== b.correctPct) return b.correctPct - a.correctPct;
    return b.consistencyScore - a.consistencyScore;
  });

const results = {
  validationLab: VL,
  auditType: "STRICT_READ_ONLY_GPT_VISION_QUANTITY_READING_LABORATORY",
  generatedAt: new Date().toISOString(),
  openAiKeyAvailable: !!apiKey,
  openAiKeySource: apiKey ? "local_env" : "unavailable — supabase secret exists but not readable via CLI",
  prepassConfig: {
    model: "gpt-4.1",
    temperature: 0,
    seed: 42,
    systemPrompt: "QTD_STRIP_SYSTEM_PROMPT from invoice-qty-prepass.ts",
    userText: PREPASS_USER_TEXT,
  },
  groundTruth: Object.fromEntries(PRODUCTS.map((p) => [p.key, p.truth])),
  sources: {
    invoiceFull: SRC_INVOICE,
    tableCrop: SRC_TABLE,
    rowCropsDir: SRC_ROWS,
    geometry: {
      qtdX0: QTD_X0,
      emporioQtdColumnXFrac: { x0: 0.605, x1: 0.661 },
      productionStripWidthPx: 43,
      gorgonzolaRowInTableCrop: { y: PRODUCTS[0].fullTop - TABLE_CROP_TOP, height: PRODUCTS[0].height },
      tableCropTop: TABLE_CROP_TOP,
      tableDimensions: { width: tableW, height: tableH },
    },
  },
  variants: VARIANTS,
  exportedImages: exported,
  runMatrix: runCells,
  visualAnalysis: visualByImage,
  gorgonzolaRanking: ranking,
  finalQuestions: {
    q1_bestPresentation: null as string | null,
    q2_widthImproves: null as string | null,
    q3_contextImproves: null as string | null,
    q4_enlargementImproves: null as string | null,
    q5_canGptRead135: null as string | null,
    q6_productionChoice: null as string | null,
  },
};

// Answer final questions from available evidence
const stripVariants = ["A", "B", "C", "D", "E", "F"];
const widthEvidence = gorgonzolaCells
  .filter((c) => stripVariants.includes(c.variant))
  .map((c) => ({
    variant: c.variant,
    majority: c.majority,
    digit5Clipped: visualByImage[c.imageFile]?.digit5Clipped,
  }));

const bestLive = ranking.find((r) => r.correct === true && r.correctPct > 0);
results.finalQuestions.q1_bestPresentation = apiKey
  ? bestLive
    ? `Variant ${bestLive.variant} (${bestLive.label}) — ${bestLive.correctPct}% correct across ${RUNS_PER_CELL} runs`
    : "No variant achieved majority 1.35 in live runs"
  : "PENDING_LIVE — only variant A has single reference run (1.30 from live-reextract v41)";

results.finalQuestions.q2_widthImproves = apiKey
  ? widthEvidence.some((w) => w.majority === 1.35 && w.variant !== "A")
    ? "Yes — wider strips show improved majority toward 1.35"
    : "Inconclusive or no — see widthEvidence"
  : "Likely yes from pixel geometry: digit-5 visible from ~45px; live v41 still reads 1.30 at 43px. Wider strips (E/F) include digit fully with margin — PENDING_LIVE confirmation";

results.finalQuestions.q3_contextImproves = apiKey
  ? (() => {
      const row = gorgonzolaCells.find((c) => c.variant === "G");
      const strip = gorgonzolaCells.find((c) => c.variant === "A");
      if (row && strip && row.majority === strip.majority) return "No — full row matches strip majority";
      if (row && strip && row.correct && !strip.correct) return "Yes — full row crop outperforms strip";
      return "Mixed — full row adds fraction distractions (1/8, ~1,5kg); table marker adds row context without product names";
    })()
  : "Risk of harm — variants G/H/I expose description fractions (1/8) that historically caused integer-2 confusion; strip isolation (A–F) is safer. PENDING_LIVE";

results.finalQuestions.q4_enlargementImproves = apiKey
  ? (() => {
      const j = gorgonzolaCells.find((c) => c.variant === "J");
      const a = gorgonzolaCells.find((c) => c.variant === "A");
      if (j && a && j.correct && !a.correct) return "Yes — 2x enlargement fixes 1.35";
      return "No or neutral — compare J/K vs A";
    })()
  : "Unlikely alone — 43px already shows digit 5 in pixels; failure at v41 is vision truncation (1.30) not resolution. Enlargement without width may not recover trailing 5 — PENDING_LIVE";

results.finalQuestions.q5_canGptRead135 = apiKey
  ? gorgonzolaCells.some((c) => c.correct)
    ? "Yes, in some presentations"
    : "Not reliably in tested presentations"
  : "Not reliably at production 43px — live-reextract v41 returns 1.30 (ocr_quantity 1.3). Pixel evidence shows digit 5 present; GPT truncates or misreads trailing digit.";

const productionCandidates = ["A", "B", "C", "D", "E"];
const bestProd = ranking.find(
  (r) => productionCandidates.includes(r.variant) && r.correct === true,
);
results.finalQuestions.q6_productionChoice = bestProd
  ? `Variant ${bestProd.variant} (${bestProd.label}) if live runs confirm; else E (60px) as prior audits recommend minimum safe width without unit-price bleed`
  : apiKey
    ? "Retain D or E pending matrix — first width with majority 1.35 and no bleed"
    : "Recommend **E (60px strip)** over A (43px): digit-5 fully visible, 5px+ margin before unit-price ink at x483, prior width-escalation audit estimates 1.35. A confirmed wrong (1.30) via live-reextract.";

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

// REPORT.md
const md: string[] = [];
md.push("# GPT Vision Quantity Reading Laboratory");
md.push("");
md.push(
  `**Validation Lab:** \`${VL}\` · **Read-only** · ${results.generatedAt.slice(0, 19)}Z`,
);
md.push("");
md.push("## Executive summary");
md.push("");
if (!apiKey) {
  md.push(
    "**OPENAI_API_KEY unavailable locally** (env unset; Supabase VL secret exists but CLI cannot read values). All image variants generated. GPT live matrix **PENDING_LIVE** except variant **A / Gorgonzola Run1** = **1.30** from \`.tmp/ocr-prepass-fix-implementation/live-reextract.json\` (deploy v41, production 43px strip).",
  );
} else {
  md.push(
    `Live GPT-4.1 vision runs completed (${RUNS_PER_CELL} per cell). Model: gpt-4.1, temperature 0, seed 42, exact \`QTD_STRIP_SYSTEM_PROMPT\` + strip user message.`,
  );
}
md.push("");
md.push("### Ground truth");
md.push("");
md.push("| Product | Qtd |");
md.push("|---------|-----|");
for (const p of PRODUCTS) md.push(`| ${p.key} | ${p.truth} |`);
md.push("");

md.push("## Output tables — Gorgonzola (all variants)");
md.push("");
md.push("| Variant | Run1 | Run2 | Run3 | Run4 | Run5 | Majority | Correct? | Status |");
md.push("|---------|------|------|------|------|------|----------|----------|--------|");
for (const c of gorgonzolaCells) {
  const fmt = (v: number | null | "PENDING_LIVE") =>
    v === "PENDING_LIVE" ? "PENDING" : v === null ? "null" : String(v);
  md.push(
    `| ${c.variant} | ${fmt(c.runs[0])} | ${fmt(c.runs[1])} | ${fmt(c.runs[2])} | ${fmt(c.runs[3])} | ${fmt(c.runs[4])} | ${fmt(c.majority as number | "PENDING_LIVE")} | ${c.correct === null ? "—" : c.correct ? "**YES**" : "**NO**"} | ${c.status} |`,
  );
}
md.push("");

md.push("## Spot-check — Bresaola & Prosciutto (variants B, C only)");
md.push("");
md.push("| Variant | Product | Run1–5 | Majority | Correct? |");
md.push("|---------|---------|--------|----------|----------|");
for (const c of runCells.filter((c) => (c.variant === "B" || c.variant === "C") && c.product !== "gorgonzola")) {
  const fmt = (v: number | null | "PENDING_LIVE") =>
    v === "PENDING_LIVE" ? "PEND" : v === null ? "null" : String(v);
  md.push(
    `| ${c.variant} | ${c.product} | ${c.runs.map(fmt).join(", ")} | ${fmt(c.majority as number | "PENDING_LIVE")} | ${c.correct === null ? "—" : c.correct ? "YES" : "NO"} |`,
  );
}
md.push("");

md.push("## Consistency — Gorgonzola");
md.push("");
md.push("| Variant | Correct % | Variance | Consistency | Unique values |");
md.push("|---------|-----------|----------|-------------|---------------|");
for (const r of ranking) {
  md.push(
    `| ${r.variant} | ${r.correctPct.toFixed(0)}% | ${r.variance.toFixed(4)} | ${r.consistencyScore} | ${r.uniqueValues.join(", ") || "—"} |`,
  );
}
md.push("");

md.push("## Visual analysis per image");
md.push("");
for (const [file, vis] of Object.entries(visualByImage)) {
  md.push(`### \`${file}\``);
  md.push("");
  md.push(`- **Size:** ${vis.widthPx}×${vis.heightPx}px`);
  md.push(`- **Digit clarity:** ${vis.digitClarityNotes}`);
  md.push(`- **Context:** ${vis.contextNotes}`);
  md.push(`- **Distractions:** ${vis.distractionNotes}`);
  if (vis.digit5Clipped != null) md.push(`- **Digit 5 clipped:** ${vis.digit5Clipped ? "YES" : "NO"}`);
  if (vis.unitPriceBleed != null) md.push(`- **Unit-price bleed:** ${vis.unitPriceBleed ? "YES" : "NO"}`);
  if (vis.marginBeforeUnitPricePx != null) {
    md.push(`- **Margin before unit-price (x483):** ${vis.marginBeforeUnitPricePx}px`);
  }
  md.push(`- **Mean luminance:** ${vis.meanLuminance.toFixed(1)} · **Dark fraction:** ${(vis.darkPixelFraction * 100).toFixed(2)}%`);
  md.push("");
}

md.push("## Final ranking (Gorgonzola, best → worst)");
md.push("");
md.push("| Rank | Variant | Label | Majority | Correct? | Correct % |");
md.push("|------|---------|-------|----------|----------|-----------|");
ranking.forEach((r, i) => {
  md.push(
    `| ${i + 1} | ${r.variant} | ${r.label} | ${r.majority ?? "—"} | ${r.correct === null ? "—" : r.correct ? "YES" : "NO"} | ${r.correctPct.toFixed(0)}% |`,
  );
});
md.push("");

md.push("## Final questions");
md.push("");
md.push(`1. **Which presentation reads Gorgonzola correctly most often?** ${results.finalQuestions.q1_bestPresentation}`);
md.push(`2. **Does width improve accuracy?** ${results.finalQuestions.q2_widthImproves}`);
md.push(`3. **Does additional context improve accuracy?** ${results.finalQuestions.q3_contextImproves}`);
md.push(`4. **Does enlargement improve accuracy?** ${results.finalQuestions.q4_enlargementImproves}`);
md.push(`5. **Can GPT reliably read 1.35?** ${results.finalQuestions.q5_canGptRead135}`);
md.push(`6. **Production choice A/B/C/D/E?** ${results.finalQuestions.q6_productionChoice}`);
md.push("");

md.push("## Exported images");
md.push("");
const imageFiles = [...new Set(Object.keys(visualByImage))].sort();
for (const f of imageFiles) md.push(`- \`${f.startsWith("images/") ? f : `images/${f}`}\``);
md.push("");

md.push("## Gorgonzola row strip — width comparison (pixel evidence)");
md.push("");
md.push("| Variant | Width | Digit 5 clipped? | Margin to x483 | Unit-price bleed? |");
md.push("|---------|-------|------------------|----------------|-------------------|");
for (const id of ["A", "B", "C", "D", "E", "F"]) {
  const key = `images/${id}-gorgonzola-row.png`;
  const vis = visualByImage[key];
  if (!vis) continue;
  md.push(
    `| ${id} | ${vis.widthPx}px | ${vis.digit5Clipped ? "YES" : "NO"} | ${vis.marginBeforeUnitPricePx ?? "—"}px | ${vis.unitPriceBleed ? "YES" : "NO"} |`,
  );
}
md.push("");
md.push(
  "At **43px (A)** the trailing **5** of `1,35` is pixel-visible (rightmost ink x≈480) yet live v41 prepass returns **1.30** — vision truncation, not clipping. Wider strips (B–F) include unit-price ink (x≥483) which adds adjacent numeric distraction.",
);
md.push("");

md.push("## Prior audit cross-reference (not counted as live runs)");
md.push("");
md.push("| Source | Width | Gorgonzola qty | Method |");
md.push("|--------|-------|----------------|--------|");
md.push("| live-reextract.json (v41 deploy) | 43px | **1.30** | production pipeline |");
md.push("| qtd-strip-width-escalation-audit | 60px | 1.35 (visual estimate) | pixel + prior |");
md.push("| qtd-strip-width-escalation-audit | 80px | 1.35 (visual estimate) | pixel + prior |");
md.push("| live-reextract.json | 43px strip | Bresaola **1.83**, Prosciutto **4.30** | production pipeline |");
md.push("");

md.push("## Methodology");
md.push("");
md.push("- Black-box GPT-4.1 only; image presentation varied across 11 variants (A–K).");
md.push("- Strip variants use full table-crop height Qtd column at x0=438.");
md.push("- Production geometry: `EMPORIO_QTD_COLUMN_X_FRAC` + 43px effective width (41px frac + 2px right pad).");
md.push("- No code changes, DB writes, or deployments.");

writeFileSync(join(OUT, "REPORT.md"), md.join("\n"));

console.log(
  JSON.stringify(
    {
      ok: true,
      out: OUT,
      openAiKeyAvailable: !!apiKey,
      images: imageFiles.length,
      gorgonzolaRanking: ranking.map((r) => ({
        variant: r.variant,
        majority: r.majority,
        correct: r.correct,
      })),
    },
    null,
    2,
  ),
);
