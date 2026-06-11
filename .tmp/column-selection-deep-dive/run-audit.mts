/**
 * Column selection failure deep dive — generates JSON artifacts from column-shift-audit evidence.
 * Read-only; no API calls.
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/Users/salvadorseabra1/margin-master";
const OUT = join(ROOT, ".tmp/column-selection-deep-dive");
const SHIFT = join(ROOT, ".tmp/column-shift-audit");

mkdirSync(OUT, { recursive: true });

const load = <T>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), "utf8")) as T;

// Copy reference row crops
for (const f of [
  "emporio-prosciutto-row-crop.png",
  "emporio-prosciutto-row-annotated.png",
  "bocconcino-pomodor-row-crop.png",
  "bocconcino-pomodor-row-annotated.png",
]) {
  const src = join(SHIFT, f);
  if (existsSync(src)) copyFileSync(src, join(OUT, f));
}

const layout = load<typeof import("./column-reconstruction.json")>(
  ".tmp/column-shift-audit/column-layout.json",
);
const stability = load<{ invoices: Array<{ runs: Array<{ run: number; quantity: number; unit_price: number; total: number }> }> }>(
  ".tmp/column-shift-audit/run-stability.json",
);

const columnReconstruction = {
  generated_at: new Date().toISOString(),
  method: "Image-only transcription from row crops + full invoice; x-coordinates from column-shift-audit/column-layout.json",
  emporio_prosciutto: {
    invoice: "Emporio Italia",
    row: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC ~4,25KG",
    columns: [
      { column: "codigo", header: "Código", value: "UO502", xStart: 0, xEnd: 52 },
      { column: "lotes", header: "Lotes/Séries", value: "03-12-2026", xStart: 52, xEnd: 108 },
      { column: "designacao", header: "Designação", value: "Rovagnati - Assaporami Prosciutto Cotto Scelto HC ~4,25KG / Produto de Stock", xStart: 108, xEnd: 392 },
      { column: "imposto", header: "Imposto", value: "IVA23", xStart: 392, xEnd: 438 },
      { column: "qty", header: "Qtd.", value: "4,30", xStart: 438, xEnd: 478 },
      { column: "unit_price", header: "Preço Unit.", value: "10,30 €", xStart: 478, xEnd: 548 },
      { column: "discount_pct", header: "Desc.(%)", value: "17,50", xStart: 548, xEnd: 612 },
      { column: "line_total", header: "Preço Total", value: "36,54 €", xStart: 612, xEnd: 724 },
    ],
  },
  bocconcino_pomodor: {
    invoice: "IL Bocconcino",
    row: "POMODORI PELATI (CX 2,5KG*6)",
    columns: [
      { column: "referencia", header: "REFERÊNCIA", value: "VG0026", xStart: 0, xEnd: 72 },
      { column: "descricao", header: "DESCRIÇÃO", value: "POMODORI PELATI (CX 2,5KG*6)", xStart: 72, xEnd: 292 },
      { column: "qty", header: "QUANT.", value: "1,000", xStart: 292, xEnd: 358 },
      { column: "cxs", header: "CXs", value: "(blank)", xStart: 358, xEnd: 392 },
      { column: "unit", header: "UNI", value: "UNI", xStart: 392, xEnd: 424 },
      { column: "unit_price", header: "P.VENDA S/IVA", value: "27,560 EUR", xStart: 424, xEnd: 518 },
      { column: "discount_pct", header: "DESC", value: "20,00%", xStart: 518, xEnd: 578 },
      { column: "line_total", header: "VALOR LIQUIDO", value: "22,05 EUR", xStart: 578, xEnd: 668 },
      { column: "vat", header: "IVA", value: "23%", xStart: 668, xEnd: 752 },
    ],
  },
};

const monetaryCandidates = {
  generated_at: new Date().toISOString(),
  emporio_prosciutto: [
    { value: "4,30", numeric: 4.3, sourceColumn: "Qtd.", hasCurrency: false, hasPercent: false },
    { value: "10,30 €", numeric: 10.3, sourceColumn: "Preço Unit.", hasCurrency: true, hasPercent: false },
    { value: "17,50", numeric: 17.5, sourceColumn: "Desc.(%)", hasCurrency: false, hasPercent: false },
    { value: "36,54 €", numeric: 36.54, sourceColumn: "Preço Total", hasCurrency: true, hasPercent: false },
  ],
  bocconcino_pomodor: [
    { value: "1,000", numeric: 1, sourceColumn: "QUANT.", hasCurrency: false, hasPercent: false },
    { value: "27,560 EUR", numeric: 27.56, sourceColumn: "P.VENDA S/IVA", hasCurrency: true, hasPercent: false },
    { value: "20,00%", numeric: 20, sourceColumn: "DESC", hasCurrency: false, hasPercent: true },
    { value: "22,05 EUR", numeric: 22.05, sourceColumn: "VALOR LIQUIDO", hasCurrency: true, hasPercent: false },
    { value: "23%", numeric: 23, sourceColumn: "IVA", hasCurrency: false, hasPercent: true },
  ],
};

function mapProsciutto(run: { run: number; quantity: number; unit_price: number; total: number }) {
  const maps: Array<{ field: string; gptValue: number; sourceColumn: string; match: string }> = [];
  const up = run.unit_price;
  if (Math.abs(up - 17) < 0.5) maps.push({ field: "unit_price", gptValue: up, sourceColumn: "Desc.(%)", match: "17,50 discount column" });
  else if (Math.abs(up - 10.3) < 0.2 || Math.abs(up - 10.17) < 0.2)
    maps.push({ field: "unit_price", gptValue: up, sourceColumn: "Preço Unit.", match: "10,30 € gross list price" });
  else if (Math.abs(up - 8.17) < 0.05)
    maps.push({ field: "unit_price", gptValue: up, sourceColumn: "derived/net", match: "net unit after discount (correct VL GT)" });
  else maps.push({ field: "unit_price", gptValue: up, sourceColumn: "derived/calculated", match: `approx total÷qty (${run.total}/${run.quantity})` });

  const t = run.total;
  if (Math.abs(t - 36.54) < 0.1) maps.push({ field: "total", gptValue: t, sourceColumn: "Preço Total", match: "36,54 €" });
  else maps.push({ field: "total", gptValue: t, sourceColumn: "derived", match: "recalculated" });
  return { run: run.run, quantity: run.quantity, mappings: maps };
}

function mapPomodor(run: { run: number; quantity: number; unit_price: number; total: number }) {
  const maps: Array<{ field: string; gptValue: number; sourceColumn: string; match: string }> = [];
  const up = run.unit_price;
  if (Math.abs(up - 20) < 0.1) maps.push({ field: "unit_price", gptValue: up, sourceColumn: "DESC", match: "20,00% stripped to 20" });
  else if (Math.abs(up - 27.56) < 0.1) maps.push({ field: "unit_price", gptValue: up, sourceColumn: "P.VENDA S/IVA", match: "27,560 EUR list price" });
  else maps.push({ field: "unit_price", gptValue: up, sourceColumn: "mixed/derived", match: "unclear column" });

  const t = run.total;
  if (Math.abs(t - 40) < 0.1) maps.push({ field: "total", gptValue: t, sourceColumn: "calculated", match: "qty×unit_price (2×20)" });
  else if (Math.abs(t - 22.05) < 0.1) maps.push({ field: "total", gptValue: t, sourceColumn: "VALOR LIQUIDO", match: "22,05 EUR correct" });
  else if (Math.abs(t - 20.02) < 0.5) maps.push({ field: "total", gptValue: t, sourceColumn: "DESC", match: "discount magnitude bleed" });
  else if (Math.abs(t - 54.2) < 0.5) maps.push({ field: "total", gptValue: t, sourceColumn: "calculated", match: "2×27.56 gross" });
  else maps.push({ field: "total", gptValue: t, sourceColumn: "calculated/mixed", match: "qty×wrong price variant" });
  return { run: run.run, quantity: run.quantity, mappings: maps };
}

const passcChoiceMap = {
  generated_at: new Date().toISOString(),
  source: ".tmp/column-shift-audit/run-stability.json",
  emporio_prosciutto: stability.invoices[0].runs.map(mapProsciutto),
  bocconcino_pomodor: stability.invoices[1].runs.map(mapPomodor),
};

const headerVisibility = {
  generated_at: new Date().toISOString(),
  note: "Assessed for Pass C table crop (geometry bounds) and row-only crop",
  emporio_prosciutto: {
    fullInvoice: {
      qty: { header: "Qtd.", visibility: "visible" },
      unit_price: { header: "Preço Unit.", visibility: "visible" },
      discount_pct: { header: "Desc.(%)", visibility: "visible" },
      line_total: { header: "Preço Total", visibility: "visible" },
    },
    passCTableCrop: {
      cropBounds: "geometry top=456 — starts at first data row; headers at y≈430 clipped",
      qty: { header: "Qtd.", visibility: "cropped" },
      unit_price: { header: "Preço Unit.", visibility: "cropped" },
      discount_pct: { header: "Desc.(%)", visibility: "cropped" },
      line_total: { header: "Preço Total", visibility: "cropped" },
    },
    rowCropOnly: {
      qty: { header: "Qtd.", visibility: "cropped" },
      unit_price: { header: "Preço Unit.", visibility: "cropped" },
      discount_pct: { header: "Desc.(%)", visibility: "cropped" },
      line_total: { header: "Preço Total", visibility: "cropped" },
    },
    ambiguityNote: "Desc.(%) values use plain decimals (17,50) without % symbol — visually similar to prices",
  },
  bocconcino_pomodor: {
    fullInvoice: {
      qty: { header: "QUANT.", visibility: "visible" },
      unit_price: { header: "P.VENDA S/IVA", visibility: "visible" },
      discount_pct: { header: "DESC", visibility: "visible" },
      line_total: { header: "VALOR LIQUIDO", visibility: "visible" },
    },
    passCTableCrop: {
      cropBounds: "geometry top=433 — includes header row",
      qty: { header: "QUANT.", visibility: "visible" },
      unit_price: { header: "P.VENDA S/IVA", visibility: "visible" },
      discount_pct: { header: "DESC", visibility: "visible" },
      line_total: { header: "VALOR LIQUIDO", visibility: "visible" },
    },
    rowCropOnly: {
      qty: { header: "QUANT.", visibility: "cropped" },
      unit_price: { header: "P.VENDA S/IVA", visibility: "cropped" },
      discount_pct: { header: "DESC", visibility: "cropped" },
      line_total: { header: "VALOR LIQUIDO", visibility: "cropped" },
    },
    ambiguityNote: "DESC shows explicit % symbol; EUR suffix on price columns — strong format anchors",
  },
};

const cropContext = {
  generated_at: new Date().toISOString(),
  emporio_prosciutto: {
    passCInput: "Full-width table crop (~724×395px), horizontal context complete",
    headersInPassCCrop: false,
    rowCropHorizontal: "complete — all 8 columns visible",
    humanFromRowCropAlone: "MARGINAL",
    humanFromPassCTableCrop: "MARGINAL — headers clipped; € symbols distinguish price vs discount partially",
    humanFromFullInvoice: "YES",
    evidence: ["emporio-table-crop-simulated.png lacks headers", "emporio-probe-430.png shows headers at y≈430"],
  },
  bocconcino_pomodor: {
    passCInput: "Full-width table crop (~752×448px), headers included",
    headersInPassCCrop: true,
    rowCropHorizontal: "complete — all 9 columns visible",
    humanFromRowCropAlone: "YES — EUR vs % symbols anchor columns",
    humanFromPassCTableCrop: "YES — headers + symbols",
    humanFromFullInvoice: "YES",
    evidence: ["bocconcino-table-crop-simulated.png shows P.VENDA/DESC/VALOR headers"],
  },
};

const humanSimulation = {
  generated_at: new Date().toISOString(),
  method: "Blind identification using row crop only (no headers), as worst-case Pass C context",
  emporio_prosciutto: {
    qty: { identified: "4,30", difficulty: "easy", cue: "leftmost numeric cluster after IVA23" },
    unit_price: { identified: "10,30 €", difficulty: "moderate", cue: "first value with € after qty" },
    discount: { identified: "17,50", difficulty: "hard", cue: "no % symbol; could be mistaken for price" },
    total: { identified: "36,54 €", difficulty: "easy", cue: "rightmost € value" },
    overallDifficulty: "moderate-hard",
    errorRisk: "High confusion between 17,50 (discount) and 10,30/36,54 (prices) without headers",
  },
  bocconcino_pomodor: {
    qty: { identified: "1,000", difficulty: "easy", cue: "after description, before UNI" },
    unit_price: { identified: "27,560 EUR", difficulty: "easy", cue: "first EUR value in price cluster" },
    discount: { identified: "20,00%", difficulty: "easy", cue: "explicit % symbol" },
    total: { identified: "22,05 EUR", difficulty: "easy", cue: "second EUR value after discount" },
    overallDifficulty: "easy",
    errorRisk: "Low for human; math confirms 27.56×0.8≈22.05",
  },
};

const failureMechanism = {
  generated_at: new Date().toISOString(),
  classification: "E — Mixed",
  components: {
    A_headerAmbiguity: {
      applies: true,
      weight: "medium",
      evidence: "Emporio Pass C crop clips column headers (top=456 vs headers at y≈430)",
    },
    B_columnProximity: {
      applies: true,
      weight: "high",
      evidence: "Preço Unit / Desc / Preço Total within ~134px on Emporio; P.VENDA/DESC/VALOR within ~154px on Bocconcino",
    },
    C_cropTooTight: {
      applies: false,
      weight: "low",
      evidence: "Horizontal width preserved in Pass C table crop; not a narrow sub-column crop",
    },
    D_visionModelLimitation: {
      applies: true,
      weight: "high",
      evidence: "Bocconcino has visible headers + EUR/% symbols yet GPT reads DESC as unit_price in run 1; prompt mandates column-faithful copy but model violates",
    },
  },
  perRow: {
    prosciutto: "B + A + D — proximity + missing headers in crop + model does not anchor to € symbol",
    pomodor: "B + D — proximity + model ignores header labels and % suffix despite visibility",
  },
};

const fixabilityAssessment = {
  generated_at: new Date().toISOString(),
  canErrorClassBeEliminated: {
    verdict: "MEDIUM confidence — theoretically yes, practically requires column anchoring beyond current vision-only Pass C",
    rationale: [
      "Bocconcino crop contains sufficient discriminators (headers, EUR, %)",
      "Emporio crop lacks headers; discount column lacks % — harder case",
      "5-run variance shows model sometimes finds correct column (Prosciutto run 4: €8.17)",
      "Prompt already mandates column-faithful extraction; violations persist",
    ],
  },
  enoughInfoInCrop: {
    bocconcino: { verdict: "YES", confidence: "HIGH", note: "Headers + EUR/% unambiguous" },
    emporio: { verdict: "MARGINAL", confidence: "MEDIUM", note: "Headers clipped in geometry crop; discount lacks % symbol" },
    overall: "MARGINAL — sufficient on Bocconcino, insufficient on Emporio without header inclusion",
  },
  eliminationBlockers: [
    "GPT does not reliably bind unit_price to column with EUR suffix",
    "GPT treats plain decimal discount values as euro amounts",
    "Emporio geometry crop may exclude header row",
    "Prompt negative example for POMODOR uses qty=2/€25/€50 — mismatches visible row (qty=1/€27.56/€22.05)",
  ],
};

writeFileSync(join(OUT, "column-reconstruction.json"), JSON.stringify(columnReconstruction, null, 2));
writeFileSync(join(OUT, "monetary-candidates.json"), JSON.stringify(monetaryCandidates, null, 2));
writeFileSync(join(OUT, "passc-choice-map.json"), JSON.stringify(passcChoiceMap, null, 2));
writeFileSync(join(OUT, "header-visibility.json"), JSON.stringify(headerVisibility, null, 2));
writeFileSync(join(OUT, "crop-context.json"), JSON.stringify(cropContext, null, 2));
writeFileSync(join(OUT, "human-simulation.json"), JSON.stringify(humanSimulation, null, 2));
writeFileSync(join(OUT, "failure-mechanism.json"), JSON.stringify(failureMechanism, null, 2));
writeFileSync(join(OUT, "fixability-assessment.json"), JSON.stringify(fixabilityAssessment, null, 2));

console.log("Artifacts written to", OUT);
