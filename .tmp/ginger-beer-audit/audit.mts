/**
 * Ginger Beer volume conversion — read-only audit (VL bjhnlrgodcqoyzddbpbd)
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";
import {
  detectVolume,
  inferPurchaseUnitsFromLineItemName,
} from "../../src/lib/ingredient-unit-inference";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics";
import {
  parsePurchaseFormatPhrase,
  resolveInvoiceLinePurchaseFormat,
  resolveStructuredPurchaseForDisplay,
} from "../../src/lib/invoice-purchase-format";
import { buildIngredientOperationalSignals } from "../../src/lib/buildIngredientOperationalSignals";
import { effectiveIngredientUnitCostEur } from "../../src/lib/ingredient-unit-cost";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";
const GINGER_ITEM_ID = "920fa990-36e5-48d3-82ce-a4499882e30e";
const OUT_DIR = ".tmp/ginger-beer-audit";

function projectKey(name: "anon" | "service_role"): string {
  const fromEnv =
    name === "anon"
      ? process.env.ANON_KEY ?? process.env.VL_ANON
      : process.env.SR_KEY ?? process.env.VL_SR ?? process.env.VL_KEY;
  if (fromEnv) return fromEnv;
  const raw = execSync(
    `supabase projects api-keys --project-ref ${VL_REF} -o json`,
    { encoding: "utf8", timeout: 15_000 },
  );
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === name,
  );
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

const serviceKey = projectKey("service_role");
const sb = createClient<Database>(`https://${VL_REF}.supabase.co`, serviceKey, {
  auth: { persistSession: false },
});

mkdirSync(OUT_DIR, { recursive: true });

// --- 1. DB records ---
const [{ data: invoice }, { data: gingerItem }, { data: ingredients }, { data: aliases }] =
  await Promise.all([
    sb
      .from("invoices")
      .select("id, supplier_name, total, invoice_date, file_url, created_at")
      .eq("id", INVOICE_ID)
      .maybeSingle(),
    sb.from("invoice_items").select("*").eq("id", GINGER_ITEM_ID).maybeSingle(),
    sb
      .from("ingredients")
      .select(
        "id,name,normalized_name,unit,current_price,purchase_quantity,purchase_unit,base_unit,created_at,updated_at",
      )
      .or("name.ilike.%ginger%,normalized_name.ilike.%ginger%"),
    sb
      .from("ingredient_aliases")
      .select("id,ingredient_id,alias_name,normalized_alias,supplier_name,confirmed_by_user,created_at")
      .or("alias_name.ilike.%ginger%,normalized_alias.ilike.%ginger%"),
  ]);

const gingerIngredient =
  ingredients?.find((i) =>
    /ginger/i.test(i.name ?? "") || /ginger/i.test(i.normalized_name ?? ""),
  ) ?? null;

const linkedAlias = aliases?.find((a) =>
  /ginger/i.test(a.alias_name ?? "") || /0\.20cl/i.test(a.alias_name ?? ""),
);

let priceHistory: unknown[] = [];
if (gingerIngredient?.id) {
  const { data } = await sb
    .from("ingredient_price_history")
    .select("*")
    .eq("ingredient_id", gingerIngredient.id)
    .order("created_at", { ascending: false })
    .limit(5);
  priceHistory = data ?? [];
}

const dbRecord = {
  invoice,
  invoice_item: gingerItem,
  ingredient: gingerIngredient,
  ingredient_alias: linkedAlias ?? null,
  price_history: priceHistory,
};
writeFileSync(`${OUT_DIR}/db-record.json`, JSON.stringify(dbRecord, null, 2));

// --- 2. Extraction trace (re-invoke + cross-ref prior) ---
let extractResponse: unknown = null;
try {
  const prior = await import("../../.tmp/emporio-italia-investigation/extract-invoice-response.json", {
    with: { type: "json" },
  });
  extractResponse = prior.default;
} catch {
  extractResponse = { error: "prior extract not found" };
}

const extractedGinger = (extractResponse as { body?: { items?: unknown[] } })?.body?.items?.find(
  (it: { name?: string }) => (it.name ?? "").toLowerCase().includes("ginger"),
);

const extractionTrace = {
  source: ".tmp/emporio-italia-investigation/extract-invoice-response.json",
  persisted_invoice_item: gingerItem,
  extracted_line: extractedGinger ?? null,
  stored_fields: gingerItem
    ? {
        description: gingerItem.name,
        qty: gingerItem.quantity,
        unit: gingerItem.unit,
        unit_price: gingerItem.unit_price,
        total: gingerItem.total,
      }
    : null,
  volume_tokens_in_name: gingerItem?.name?.match(/\d+(?:[.,]\d+)?\s*(?:ml|cl|l|lt)\b/gi) ?? [],
  note: "Product code BBB-GINGER33ITA visible on invoice image but NOT stored in invoice_items schema",
};
writeFileSync(`${OUT_DIR}/extraction-trace.json`, JSON.stringify(extractionTrace, null, 2));

// --- 3. Package parsing chain (local replay) ---
const name = gingerItem?.name ?? "Baladin - Ginger Beer 0.20cl";
const meta = {
  name,
  quantity: Number(gingerItem?.quantity ?? 24),
  unit: gingerItem?.unit ?? "un",
  unit_price: Number(gingerItem?.unit_price ?? 0.85),
  line_total: Number(gingerItem?.total ?? 19.38),
  matchedIngredientName: gingerIngredient?.name ?? null,
};

const volumeDet = detectVolume(name);
const infer = inferPurchaseUnitsFromLineItemName(name);
const phrase = parsePurchaseFormatPhrase(name);
const structured = resolveInvoiceLinePurchaseFormat(meta);
const structuredDisplay = resolveStructuredPurchaseForDisplay(meta);
const perUnit = resolveUsablePerPricedUnit(meta, structured);
const usableCost = computeEffectiveUsableCost(meta.unit_price, meta, structured, name);
const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(meta);

const parsingChain = {
  input_name: name,
  inferPurchaseUnitsFromLineItemName: infer,
  detectVolume: volumeDet,
  inferBaseUnit: infer,
  parsePurchaseFormatPhrase: phrase,
  resolveInvoiceLinePurchaseFormat: structured,
  resolveStructuredPurchaseForDisplay: structuredDisplay,
  resolveUsablePerPricedUnit: perUnit,
  computeEffectiveUsableCost: usableCost,
  recipeOperationalCostFieldsFromInvoiceLine: recipeFields,
  cl_conversion_note:
    "detectVolume uses toMl(n)=n*10 for CL; 0.20*10=2ml. stock-normalization parseSizeAndUnit also does cl*10→ml but only when unit is separate token.",
};
writeFileSync(`${OUT_DIR}/parsing-chain.json`, JSON.stringify(parsingChain, null, 2));

// --- 4. Mathematical audit ---
const mlPerUnit = volumeDet?.milliliters ?? null;
const qty = meta.quantity;
const totalMl = structured.normalizedUsableQuantity;
const costPerL = usableCost?.cost ?? null;

const mathAudit = {
  invoice_ground_truth: { qty: 24, unit_price_eur: 0.85, line_total_eur: 19.38 },
  step1_extraction: { description: name, stored_volume_token: "0.20cl" },
  step2_detectVolume: {
    regex: "/(\\\\d+(?:[.,]\\\\d+)?)\\\\s*CL\\\\b/",
    parsed_cl: 0.2,
    formula: "toMl(0.20) = 0.20 × 10",
    ml_per_priced_unit: mlPerUnit,
  },
  step3_stock_normalization: {
    row_qty: qty,
    row_unit: meta.unit,
    normalized_usable_quantity: totalMl,
    usable_quantity_unit: structured.usableQuantityUnit,
    formula: `${mlPerUnit} ml/unit × ${qty} units = ${totalMl} ml`,
  },
  step4_usable_per_priced_unit: perUnit,
  step5_operational_cost: {
    unit_price: meta.unit_price,
    liters_per_purchase_unit: perUnit ? perUnit.amount / 1000 : null,
    formula: `€${meta.unit_price} / (${perUnit?.amount} ml / 1000) = €${costPerL}/L`,
    cost_per_liter: costPerL,
    unit: usableCost?.unit,
  },
  counterfactuals: {
    if_33cl_sku: {
      ml_per_unit: 330,
      total_ml: 330 * qty,
      cost_per_liter: meta.unit_price / 0.33,
    },
    if_20cl_typo: {
      ml_per_unit: 200,
      total_ml: 200 * qty,
      cost_per_liter: meta.unit_price / 0.2,
    },
    if_0_20L: {
      note: "If OCR meant 0.20L not 0.20cl",
      ml_per_unit: 200,
    },
  },
  proof_48ml: `24 × 2 ml = 48 ml`,
  proof_425_per_L: `€0.85 / (2/1000) L = €0.85 / 0.002 L = €425/L`,
};
writeFileSync(`${OUT_DIR}/math-audit.json`, JSON.stringify(mathAudit, null, 2));

// --- 5. Similar products audit ---
const BEVERAGE_RE =
  /pellegrino|acqua|water|beer|ginger|cola|suco|sumo|juice|vinho|wine|cerveja|lager|ipa|soda|drink|bebida|champagne|prosecco|spritz|tonic|fever.?tree|fanta|pepsi|coca/i;

const { data: recentItems } = await sb
  .from("invoice_items")
  .select(
    "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices!inner(supplier_name,invoice_date)",
  )
  .order("created_at", { ascending: false })
  .limit(2000);

const beverageAudit: unknown[] = [];
for (const item of recentItems ?? []) {
  if (!BEVERAGE_RE.test(item.name ?? "")) continue;
  const m = {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.total,
    matchedIngredientName: null,
  };
  const s = resolveInvoiceLinePurchaseFormat(m);
  const uc = computeEffectiveUsableCost(Number(item.unit_price), m, s, String(item.name));
  const vol = detectVolume(String(item.name));
  beverageAudit.push({
    id: item.id,
    invoice_id: item.invoice_id,
    supplier: (item.invoices as { supplier_name?: string })?.supplier_name,
    name: item.name,
    qty: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    detectVolume_ml: vol?.milliliters ?? null,
    usable_qty: s.normalizedUsableQuantity,
    usable_unit: s.usableQuantityUnit,
    cost_per_liter: uc?.unit === "L" ? uc.cost : null,
    anomaly:
      (uc?.unit === "L" && uc.cost > 50) ||
      (s.usableQuantityUnit === "ml" && (s.normalizedUsableQuantity ?? 0) < 100 && Number(item.quantity) > 1)
        ? "SUSPECT"
        : null,
  });
}

beverageAudit.sort((a, b) => {
  const aCost = (a as { cost_per_liter?: number }).cost_per_liter ?? 0;
  const bCost = (b as { cost_per_liter?: number }).cost_per_liter ?? 0;
  return bCost - aCost;
});

writeFileSync(`${OUT_DIR}/similar-beverages.json`, JSON.stringify(beverageAudit, null, 2));

const suspectCount = beverageAudit.filter((b) => (b as { anomaly?: string }).anomaly === "SUSPECT").length;

// --- 6. UI display path ---
let uiSignals = null;
if (gingerIngredient) {
  uiSignals = buildIngredientOperationalSignals({
    ingredient: gingerIngredient,
    recentPurchases: gingerItem
      ? [
          {
            name: gingerItem.name,
            quantity: gingerItem.quantity,
            unit: gingerItem.unit,
            unit_price: gingerItem.unit_price,
            line_total: gingerItem.total,
            invoice_date: invoice?.invoice_date ?? null,
            supplier_name: invoice?.supplier_name ?? null,
          },
        ]
      : [],
    priceHistory: [],
    recipeCount: 0,
    isVolatile: false,
  });
  const unitCost = effectiveIngredientUnitCostEur(gingerIngredient);
  writeFileSync(
    `${OUT_DIR}/ui-display.json`,
    JSON.stringify({ operationalSignals: uiSignals, effectiveIngredientUnitCostEur: unitCost }, null, 2),
  );
}

// --- Stage table ---
const stageAnalysis = {
  ocr_extraction:
    "Table pass transcribed literal '0.20cl' in description; product code BBB-GINGER33ITA on PDF not persisted",
  gpt_extraction:
    "extract-invoice returned name='Baladin - Ginger Beer 0.20cl', qty=24, unit=un, unit_price=0.85 (matches DB)",
  package_parser:
    "parsePurchaseFormatPhrase → null (no 'x Nud' / container phrase); detectVolume matches 0.20CL → 2ml",
  unit_normalization:
    "inferBaseUnit → purchase_quantity=2, purchase_unit=ml; stock pipeline: 2ml×24=48ml usable",
  operational_pricing:
    "resolveUsablePerPricedUnit → 2ml/un; computeEffectiveUsableCost → €425/L",
  db_persistence:
    `invoice_items row ${GINGER_ITEM_ID}: name with 0.20cl, no volume columns; ingredient ${gingerIngredient?.id ?? "not found"}`,
  ui_display: uiSignals
    ? `buildIngredientOperationalSignals shows usable + €/L from parsed name`
    : "No ginger ingredient in catalog",
};
writeFileSync(`${OUT_DIR}/stage-analysis.json`, JSON.stringify(stageAnalysis, null, 2));

const summary = {
  one_line_root_cause:
    "OCR typo '0.20cl' parsed literally as 0.20 centilitres (2ml/bottle) instead of 33cl implied by SKU — yielding 48ml total and €425/L.",
  suspect_beverage_lines: suspectCount,
  total_beverage_lines_scanned: beverageAudit.length,
  evidence_files: [
    "db-record.json",
    "extraction-trace.json",
    "parsing-chain.json",
    "math-audit.json",
    "similar-beverages.json",
    "stage-analysis.json",
    "ui-display.json",
    "REPORT.md",
  ],
};
writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));

console.log(JSON.stringify(summary, null, 2));
