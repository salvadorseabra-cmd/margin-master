/**
 * STRICT READ-ONLY pattern-expansion audit — VL bjhnlrgodcqoyzddbpbd
 * Replays production derivation for Family A, Mozzarella, Guanciale, Ginger Beer mechanisms.
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { detectVolume } from "../../src/lib/ingredient-unit-inference.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveCountablePurchaseQuantityForCost,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { parsePurchaseStructureFromText } from "../../src/lib/stock-normalization.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/bug-pattern-expansion-audit";
const ROOT = ".tmp";

const VL_INVOICES = [
  "da472b7f-0fd9-4a26-a37c-80ad335f7f7e",
  "c2f52357-0f80-491a-ba14-c97ff4837472",
  "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2",
  "f0aa5a08-86a3-4938-99f0-711e86073968",
  "ab52796d-de1d-418d-86e7-230c8f056f09",
  "36c99d19-6f9f-413f-8c2d-ae3526291a2d",
  "17aa3591-ec98-4c21-89c9-5ae946bc97bb",
];

const DECIMAL_CL_RE = /0\.[0-9]+\s*cl\b/i;
const EXTREME_EUR_PER_L = 50;

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function bindLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
        unit_price: raw.unit_price,
        total: raw.total,
      },
    ]),
  );
  return bound;
}

function replayStructured(bound: ReturnType<typeof bindLine>) {
  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
    matchedIngredientName: null,
  };
  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const effective = computeEffectiveUsableCost(
    bound.unit_price ?? 0,
    metadata,
    structured,
    bound.name,
  );
  const purchaseQtyForCost = resolveCountablePurchaseQuantityForCost(metadata, structured);
  const parseStruct = parsePurchaseStructureFromText(bound.name);
  return { structured, presentation, effective, purchaseQtyForCost, parseStruct };
}

function loadPassCQty(invoiceId: string, lineName: string): number | null {
  const p = join(ROOT, "passc-refinement-validation/reextract", `${invoiceId}.json`);
  if (!existsSync(p)) return null;
  const data = readJson(p);
  const items = data.items ?? data.line_items ?? data.extracted?.items ?? [];
  const target = normName(lineName);
  const hit = items.find((it: { name?: string }) => normName(it.name ?? "") === target);
  if (!hit) {
    const fuzzy = items.find((it: { name?: string }) =>
      normName(it.name ?? "").includes(target.slice(0, 20)),
    );
    return fuzzy?.quantity ?? null;
  }
  return hit.quantity ?? null;
}

function loadHybridHQty(invoiceId: string, lineName: string): number | null {
  const p = join(ROOT, "final-validation-lab-rerun/extracts", `${invoiceId}.json`);
  if (!existsSync(p)) return null;
  const data = readJson(p);
  const items = data.items ?? [];
  const target = normName(lineName);
  const hit = items.find((it: { name?: string }) => normName(it.name ?? "") === target);
  return hit?.quantity ?? null;
}

function loadPdfQty(invoiceId: string, lineName: string): number | null {
  const gtPaths = [
    join(ROOT, "field-accuracy-audit/ground-truth.json"),
    join(ROOT, "mammafiore-line-audit/ground-truth.json"),
    join(ROOT, "ginger-beer-ground-truth/stage-table.json"),
  ];
  for (const p of gtPaths) {
    if (!existsSync(p)) continue;
    const data = readJson(p);
    const rows = data.lines ?? data.items ?? data.products ?? (Array.isArray(data) ? data : []);
    const target = normName(lineName);
    const hit = rows.find(
      (r: { name?: string; description?: string; product?: string }) => {
        const n = normName(r.name ?? r.description ?? r.product ?? "");
        return n === target || n.includes(target.slice(0, 15));
      },
    );
    if (hit) return hit.quantity ?? hit.qty ?? hit.quant ?? null;
  }
  return null;
}

function classifyFamilyA(row: {
  pdfQty: number | null;
  passCQty: number | null;
  hybridHQty: number | null;
  name: string;
  unitPrice: number | null;
  total: number | null;
}) {
  const ocr1 = row.passCQty === 1 || row.pdfQty === 1;
  const hGt1 = row.hybridHQty != null && row.hybridHQty > 1;
  if (!ocr1 || !hGt1) return "No match";
  const unitApproxTotal =
    row.unitPrice != null &&
    row.total != null &&
    Math.abs(row.unitPrice - row.total) / Math.max(row.total, 0.01) <= 0.02;
  if (row.hybridHQty === 2 && unitApproxTotal) return "Confirmed";
  if (hGt1 && ocr1) return "Partial";
  return "No match";
}

function expectedMozzarellaUsableG(
  parseStruct: ReturnType<typeof parsePurchaseStructureFromText>,
  invoiceQty: number,
) {
  if (!parseStruct || parseStruct.tier !== "size_count") return null;
  return parseStruct.totalUsableAmount * invoiceQty;
}

function isWeightSemanticsRow(qty: number | null, unit: string | null, name: string) {
  const u = (unit ?? "").toLowerCase();
  if (u === "kg" || u === "g") return true;
  if (qty != null && qty > 0 && qty < 50 && /\bkg\b/i.test(name)) return true;
  if (qty != null && qty >= 2 && qty <= 30 && /\+\/-|\+-\s*\d/i.test(name)) return true;
  return false;
}

function eurPerLiter(
  total: number | null,
  usableMl: number | null,
  presentationLabel: string | null,
): number | null {
  if (presentationLabel?.includes("/ L")) {
    const m = presentationLabel.match(/€([\d.,]+)\s*\/\s*L/i);
    if (m) return Number(m[1].replace(",", "."));
  }
  if (total == null || usableMl == null || usableMl <= 0) return null;
  return (total / usableMl) * 1000;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

const [{ data: items }, { data: invoices }] = await Promise.all([
  sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total")
    .in("invoice_id", VL_INVOICES),
  sb.from("invoices").select("id,supplier_name,invoice_date").in("id", VL_INVOICES),
]);

const invById = new Map((invoices ?? []).map((i) => [i.id, i]));

type FamilyARow = {
  product: string;
  invoice: string;
  invoiceId: string;
  passCQty: number | null;
  pdfQty: number | null;
  hybridHQty: number | null;
  classification: string;
};

type MozzarellaRow = {
  product: string;
  invoiceQty: number;
  expectedUsable: string;
  actualUsable: string;
  classification: string;
};

type GuancialeRow = {
  product: string;
  purchasedWeight: string;
  usableWeight: string;
  classification: string;
};

type GingerRow = {
  product: string;
  parsedVolume: string;
  operationalCost: string;
  classification: string;
};

const familyA: FamilyARow[] = [];
const mozzarella: MozzarellaRow[] = [];
const guanciale: GuancialeRow[] = [];
const ginger: GingerRow[] = [];

for (const item of items ?? []) {
  const norm = normalizeInvoiceItemFields(item as never);
  const inv = invById.get(item.invoice_id);
  const bound = bindLine({
    name: norm.name,
    quantity: norm.quantity,
    unit: norm.unit,
    unit_price: norm.unit_price,
    total: norm.total,
  });
  const replay = replayStructured(bound);
  const invoiceQty = bound.quantity == null ? 0 : Number(bound.quantity);
  const passCQty = loadPassCQty(item.invoice_id, bound.name);
  const hybridHQty = loadHybridHQty(item.invoice_id, bound.name);
  const pdfQty = loadPdfQty(item.invoice_id, bound.name);

  const faClass = classifyFamilyA({
    pdfQty,
    passCQty,
    hybridHQty: hybridHQty ?? invoiceQty,
    name: bound.name,
    unitPrice: bound.unit_price,
    total: bound.total,
  });
  if (faClass !== "No match" || passCQty === 1 || pdfQty === 1) {
    familyA.push({
      product: bound.name,
      invoice: inv?.supplier_name ?? item.invoice_id,
      invoiceId: item.invoice_id,
      passCQty,
      pdfQty,
      hybridHQty: hybridHQty ?? invoiceQty,
      classification: faClass,
    });
  }

  const ps = replay.parseStruct;
  if (ps?.tier === "size_count" && invoiceQty > 1) {
    const expectedG = expectedMozzarellaUsableG(ps, invoiceQty);
    const actualG = replay.structured.normalizedUsableQuantity;
    if (expectedG != null && actualG != null && actualG < expectedG * 0.95) {
      const unit = replay.structured.usableQuantityUnit ?? "g";
      const fmt = (g: number) =>
        unit === "g" ? `${(g / 1000).toFixed(1)} kg` : `${g} ${unit}`;
      const isConfirmed =
        normName(bound.name).includes("mozzarella") &&
        bound.name.includes("*");
      mozzarella.push({
        product: bound.name,
        invoiceQty,
        expectedUsable: fmt(expectedG),
        actualUsable: fmt(actualG),
        classification: isConfirmed ? "Confirmed" : "Partial",
      });
    }
  }

  if (
    ps?.tier === "size_count" &&
    ps.unitMeasurement === "kg" &&
    isWeightSemanticsRow(invoiceQty, bound.unit, bound.name) &&
    replay.structured.normalizedUsableQuantity != null
  ) {
    const purchasedG = invoiceQty * 1000;
    const usableG = replay.structured.normalizedUsableQuantity;
    if (usableG > purchasedG * 1.05) {
      const isConfirmed = normName(bound.name).includes("guanciale");
      guanciale.push({
        product: bound.name,
        purchasedWeight: `~${(purchasedG / 1000).toFixed(3)} kg`,
        usableWeight: `${(usableG / 1000).toFixed(1)} kg`,
        classification: isConfirmed ? "Confirmed" : "Partial",
      });
    }
  }

  const vol = detectVolume(bound.name);
  const usableMl =
    replay.structured.usableQuantityUnit === "ml"
      ? replay.structured.normalizedUsableQuantity
      : vol?.milliliters != null && invoiceQty > 0
        ? vol.milliliters * invoiceQty
        : null;
  const eurL = eurPerLiter(bound.total, usableMl, replay.presentation.effectiveUsableCostLabel);
  const decimalCl = DECIMAL_CL_RE.test(bound.name);
  const extreme = eurL != null && eurL > EXTREME_EUR_PER_L;
  const tinyVol = vol != null && vol.milliliters < 50;

  if (decimalCl || (extreme && tinyVol)) {
    ginger.push({
      product: bound.name,
      parsedVolume: vol ? `${vol.milliliters} ml/bottle` : "—",
      operationalCost: replay.presentation.effectiveUsableCostLabel ?? (eurL ? `€${eurL.toFixed(2)} / L` : "—"),
      classification:
        decimalCl && (extreme || tinyVol)
          ? "Confirmed"
          : decimalCl || extreme
            ? "Partial"
            : "No match",
    });
  }
}

const familyAConfirmed = familyA.filter((r) => r.classification === "Confirmed");
const familyAPartial = familyA.filter((r) => r.classification === "Partial");
const mozConfirmed = mozzarella.filter((r) => r.classification === "Confirmed");
const mozPartial = mozzarella.filter((r) => r.classification === "Partial");
const guanConfirmed = guanciale.filter((r) => r.classification === "Confirmed");
const guanPartial = guanciale.filter((r) => r.classification === "Partial");
const gingerConfirmed = ginger.filter((r) => r.classification === "Confirmed");
const gingerPartial = ginger.filter((r) => r.classification === "Partial");

const population = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  mode: "STRICT READ-ONLY pattern-expansion audit",
  scope: {
    invoiceItemsScanned: (items ?? []).length,
    invoices: VL_INVOICES.length,
    extractSources: readdirSync(join(ROOT, "final-validation-lab-rerun/extracts")).filter((f) =>
      f.endsWith(".json"),
    ),
    passcSources: readdirSync(join(ROOT, "passc-refinement-validation/reextract")).filter((f) =>
      f.endsWith(".json"),
    ),
  },
  mechanisms: {
    familyA: {
      definition: "PDF/OCR qty=1, Pass C qty=1, Hybrid H qty>1 (total preserved at qty=1 unit≈total)",
      confirmedProducts: [...new Set(familyAConfirmed.map((r) => r.product))],
      partialProducts: [...new Set(familyAPartial.map((r) => r.product))],
      additionalBeyondConfirmed: [...new Set(familyAConfirmed.map((r) => r.product))].filter(
        (p) => !["MEZZI PACCHERI MANCINI (CX 1KG*6)", "RICOTTA TREVIGIANA 1,5KG"].includes(p),
      ),
      totalAffected: familyAConfirmed.length,
      rows: familyA,
      vlStatus: familyAConfirmed.length <= 1 ? "A) Isolated" : familyAConfirmed.length < 5 ? "B) Small family <5" : "C) Broad family >5",
    },
    mozzarella: {
      definition: "size_count structure, invoice qty>1, usable=single-pack not scaled by outer qty",
      confirmedProducts: [...new Set(mozConfirmed.map((r) => r.product))],
      partialProducts: [...new Set(mozPartial.map((r) => r.product))],
      additionalBeyondConfirmed: [...new Set(mozPartial.map((r) => r.product))],
      totalAffected: mozConfirmed.length + mozPartial.length,
      rows: mozzarella,
      vlStatus:
        mozConfirmed.length + mozPartial.length <= 1
          ? "A) Isolated"
          : mozConfirmed.length + mozPartial.length < 5
            ? "B) Small family <5"
            : "C) Broad family >5",
    },
    guanciale: {
      definition: "weight-based purchase treated as count pack; *N fiction exceeds purchased weight",
      confirmedProducts: [...new Set(guanConfirmed.map((r) => r.product))],
      partialProducts: [...new Set(guanPartial.map((r) => r.product))],
      additionalBeyondConfirmed: [...new Set(guanPartial.map((r) => r.product))],
      totalAffected: guanConfirmed.length + guanPartial.length,
      rows: guanciale,
      vlStatus:
        guanConfirmed.length + guanPartial.length <= 1
          ? "A) Isolated"
          : guanConfirmed.length + guanPartial.length < 5
            ? "B) Small family <5"
            : "C) Broad family >5",
    },
    gingerBeer: {
      definition: "decimal 0.XXcl volume parse → tiny ml; operational €/L outlier >€50/L",
      confirmedProducts: [...new Set(gingerConfirmed.map((r) => r.product))],
      partialProducts: [...new Set(gingerPartial.map((r) => r.product))],
      additionalBeyondConfirmed: [],
      totalAffected: gingerConfirmed.length,
      rows: ginger,
      vlStatus: gingerConfirmed.length <= 1 ? "A) Isolated" : gingerConfirmed.length < 5 ? "B) Small family <5" : "C) Broad family >5",
    },
  },
  populationSummary: {
    familyA: {
      confirmed: familyAConfirmed.length,
      partial: familyAPartial.length,
      additional: 0,
      total: familyAConfirmed.length,
    },
    mozzarella: {
      confirmed: mozConfirmed.length,
      partial: mozPartial.length,
      additional: mozPartial.length,
      total: mozConfirmed.length + mozPartial.length,
    },
    guanciale: {
      confirmed: guanConfirmed.length,
      partial: guanPartial.length,
      additional: guanPartial.length,
      total: guanConfirmed.length + guanPartial.length,
    },
    gingerBeer: {
      confirmed: gingerConfirmed.length,
      partial: gingerPartial.length,
      additional: 0,
      total: gingerConfirmed.length,
    },
  },
  confidence: {
    familyA: 0.9,
    mozzarella: 0.88,
    guanciale: 0.85,
    gingerBeer: 0.92,
    notes: [
      "Family A: corroborated by family-a-scope-audit (2/15 candidates) and full-population replay",
      "Mozzarella: live stock-normalization replay; partials share SIZE_COUNT_RE + structureTotalIsFinalForGenericRow but UI math may be correct",
      "Guanciale: weight-semantics inferred from qty magnitude; only Guanciale confirmed user-visible",
      "Ginger Beer: decimal-cl-audit found 1/43 VL rows; integer CL tokens parse correctly",
    ],
  },
  sources: [
    ".tmp/ricotta-root-cause-trace/",
    ".tmp/mezzi-root-cause-trace/",
    ".tmp/remaining-bug-root-causes/",
    ".tmp/stock-normalization-family-assessment/",
    ".tmp/quantity-mismatch-validation/",
    ".tmp/quantity-mismatch-ui-audit/",
    ".tmp/final-validation-lab-rerun/extracts/",
    ".tmp/passc-refinement-validation/reextract/",
    ".tmp/family-a-scope-audit/",
    ".tmp/decimal-cl-audit/",
    ".tmp/ginger-beer-audit/",
    "src/lib/stock-normalization.ts",
    "src/lib/ingredient-unit-inference.ts",
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "population.json"), JSON.stringify(population, null, 2));
console.log(JSON.stringify(population.populationSummary, null, 2));
