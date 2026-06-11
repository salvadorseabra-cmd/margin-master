/**
 * Ginger Beer fix verification — read-only (commit 9d21b8a repairDecimalClBeverageVolume)
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  detectVolume,
  extractSkuClueVolumeMl,
  repairDecimalClBeverageVolume,
} from "../../src/lib/ingredient-unit-inference";
import {
  computeEffectiveUsableCost,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
  recipeOperationalCostFieldsFromInvoiceLine,
} from "../../src/lib/invoice-purchase-price-semantics";
import {
  isCaseRowWithEmbeddedPieceWeightOnly,
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
  resolveStructuredPurchaseForDisplay,
} from "../../src/lib/invoice-purchase-format";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const INVOICE_ID = "17aa3591-ec98-4c21-89c9-5ae946bc97bb";
const OUT_DIR = ".tmp/ginger-beer-fix-validation";
const SKU_NAME = "BBB-GINGER33ITA Baladin - Ginger Beer 0.20cl";

mkdirSync(OUT_DIR, { recursive: true });

function projectKey(name: "service_role"): string {
  const fromEnv = process.env.SR_KEY ?? process.env.VL_SR ?? process.env.VL_KEY;
  if (fromEnv) return fromEnv;
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
    timeout: 15_000,
  });
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name);
  if (!row?.api_key) throw new Error(`missing ${name} key`);
  return row.api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"), {
  auth: { persistSession: false },
});

const [{ data: invoice }, { data: items }, { data: ingredients }, { data: aliases }] =
  await Promise.all([
    sb
      .from("invoices")
      .select("id, supplier_name, total, invoice_date, created_at")
      .eq("id", INVOICE_ID)
      .maybeSingle(),
    sb.from("invoice_items").select("*").eq("invoice_id", INVOICE_ID).ilike("name", "%ginger%"),
    sb
      .from("ingredients")
      .select("id,name,normalized_name,unit,current_price,purchase_quantity,base_unit")
      .or("name.ilike.%ginger%,name.ilike.%baladin%,normalized_name.ilike.%ginger%"),
    sb
      .from("ingredient_aliases")
      .select("id,ingredient_id,alias_name,normalized_alias,supplier_name,confirmed_by_user")
      .or("alias_name.ilike.%ginger%,alias_name.ilike.%baladin%,normalized_alias.ilike.%ginger%"),
  ]);

const liveRow = items?.[0] ?? null;
if (!liveRow) throw new Error("Ginger Beer row not found");

type LineMeta = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total?: number | null;
  matchedIngredientName?: string | null;
};

function traceRepair(name: string, volumeMl: number) {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
    originalWarn(...args);
  };
  const result = repairDecimalClBeverageVolume(name, volumeMl);
  console.warn = originalWarn;
  const executed = warnings.some((w) => w.includes("[volume-sanity]"));
  let decision: "repaired" | "warning-only" | "skipped" = "skipped";
  if (result.repaired) decision = "repaired";
  else if (result.warning || warnings.length > 0) decision = "warning-only";
  return { result, warnings, executed, decision };
}

function traceScenario(label: string, meta: LineMeta) {
  const name = meta.name;
  const volumeDetection = detectVolume(name);
  const rawVolumeMl = volumeDetection?.milliliters ?? null;
  const repairTrace =
    rawVolumeMl != null ? traceRepair(name, rawVolumeMl) : { result: null, warnings: [], executed: false, decision: "skipped" as const };

  const purchaseFormat = resolveInvoiceLinePurchaseFormat(meta);
  const displayFormat = resolveStructuredPurchaseForDisplay(meta);
  const stockPresentation = resolveInvoiceLineStockPresentation(meta, label);
  const pricingPresentation = resolveInvoiceLinePricingPresentation(meta);
  const usablePerPriced = resolveUsablePerPricedUnit(meta, displayFormat);
  const unitPrice = meta.unit_price == null ? null : Number(meta.unit_price);
  const effectiveCost =
    unitPrice != null && Number.isFinite(unitPrice)
      ? computeEffectiveUsableCost(unitPrice, meta, displayFormat, name)
      : null;
  const recipeCost = recipeOperationalCostFieldsFromInvoiceLine(meta);
  const casePieceWeightOnly = isCaseRowWithEmbeddedPieceWeightOnly(name, meta.unit);

  return {
    label,
    input: meta,
    volume: {
      detectVolume: volumeDetection,
      extractSkuClue: extractSkuClueVolumeMl(name),
      rawVolumeMlPerUnit: rawVolumeMl,
      postDetectVolumeMlPerUnit: volumeDetection?.milliliters ?? null,
    },
    repair: {
      repairDecimalClBeverageVolumeExecuted: repairTrace.executed,
      repairDecision: repairTrace.decision,
      repairResult: repairTrace.result,
      consoleWarnings: repairTrace.warnings,
    },
    structured: {
      purchaseFormat: {
        kind: purchaseFormat.kind,
        packageQuantity: purchaseFormat.packageQuantity,
        packageMeasurementUnit: purchaseFormat.packageMeasurementUnit,
        normalizedUsableQuantity: purchaseFormat.normalizedUsableQuantity,
        usableQuantityUnit: purchaseFormat.usableQuantityUnit,
        purchaseContainerCount: purchaseFormat.purchaseContainerCount,
        purchaseContainerUnit: purchaseFormat.purchaseContainerUnit,
      },
      displayFormat: {
        normalizedUsableQuantity: displayFormat.normalizedUsableQuantity,
        usableQuantityUnit: displayFormat.usableQuantityUnit,
        reason: displayFormat.reason,
      },
      isCaseRowWithEmbeddedPieceWeightOnly: casePieceWeightOnly,
    },
    pricing: {
      usablePerPricedUnit: usablePerPriced,
      effectiveUsableCost: effectiveCost,
      recipeOperationalCostFields: recipeCost,
    },
    ui: {
      stockPresentation: {
        quantityLabel: stockPresentation.quantityLabel,
        usableQuantity: stockPresentation.usableQuantity,
        usableUnit: stockPresentation.usableUnit,
      },
      pricingCard: pricingPresentation.card,
      effectiveUsableCostLabel: pricingPresentation.effectiveUsableCostLabel,
      usableStockLabel: pricingPresentation.usableStockLabel,
    },
    summary: {
      parsedVolumeMlPerUnit: volumeDetection?.milliliters ?? null,
      totalUsableMl: purchaseFormat.normalizedUsableQuantity,
      displayTotalUsableMl: displayFormat.normalizedUsableQuantity,
      eurPerLUsable: effectiveCost?.unit === "L" ? effectiveCost.cost : null,
      eurPerCaseUsable: effectiveCost?.unit === "case" ? effectiveCost.cost : null,
    },
  };
}

const liveMeta: LineMeta = {
  name: String(liveRow.name),
  quantity: liveRow.quantity == null ? null : Number(liveRow.quantity),
  unit: liveRow.unit,
  unit_price: liveRow.unit_price == null ? null : Number(liveRow.unit_price),
  line_total: liveRow.total == null ? null : Number(liveRow.total),
};

const beforeAuditMeta: LineMeta = {
  name: "Baladin - Ginger Beer 0.20cl",
  quantity: 24,
  unit: "un",
  unit_price: 0.85,
  line_total: 19.38,
};

const liveSkuMeta: LineMeta = { ...liveMeta, name: SKU_NAME };
const beforeSkuMeta: LineMeta = { ...beforeAuditMeta, name: SKU_NAME };

const scenarios = [
  traceScenario("before-audit-24un", beforeAuditMeta),
  traceScenario("after-live-db-row", liveMeta),
  traceScenario("after-live-with-sku", liveSkuMeta),
  traceScenario("before-audit-with-sku", beforeSkuMeta),
];

const dbQuery = {
  invoice,
  gingerBeerItem: liveRow,
  allInvoiceItemsCount: items?.length ?? 0,
  ingredientMatches: {
    ingredients: ingredients ?? [],
    aliases: aliases ?? [],
    note: "invoice_items has no ingredient_id FK; matching is client-side at render time",
  },
};

writeFileSync(`${OUT_DIR}/db-query.json`, JSON.stringify(dbQuery, null, 2));
writeFileSync(`${OUT_DIR}/trace-results.json`, JSON.stringify(scenarios, null, 2));

const afterLive = scenarios.find((s) => s.label === "after-live-db-row")!;
const afterSku = scenarios.find((s) => s.label === "after-live-with-sku")!;
const beforeAudit = scenarios.find((s) => s.label === "before-audit-24un")!;

const report = `# Ginger Beer Fix Verification

**Invoice:** Emporio Italia \`${INVOICE_ID}\`  
**Fix:** commit 9d21b8a — \`repairDecimalClBeverageVolume()\` via \`detectVolume()\` when beverage + decimal CL + volume < 50ml  
**Generated:** ${new Date().toISOString()}

## Live DB row (queried ${new Date().toISOString().slice(0, 10)})

| Field | Value |
|-------|-------|
| id | \`${liveRow.id}\` |
| name | \`${liveRow.name}\` |
| qty | ${liveRow.quantity} |
| unit | ${liveRow.unit} |
| unit_price | €${liveRow.unit_price} |
| total | €${liveRow.total} |
| ingredient link | none in schema (no \`ingredient_id\` on \`invoice_items\`) |
| matched ingredients | ${(ingredients ?? []).length} ginger/baladin rows |
| matched aliases | ${(aliases ?? []).length} ginger/baladin aliases |

> **Note:** Prior audit used qty=24 unit=un @ €0.85. Live row is now **2 cx @ €9.69** (same line total €19.38).

---

## BEFORE (pre-fix baseline from audits — 24 un @ €0.85)

| Metric | Value |
|--------|-------|
| Parsed volume (ml/unit) | ${beforeAudit.summary.parsedVolumeMlPerUnit} ml |
| Usable qty (total ml) | ${beforeAudit.summary.totalUsableMl} ml |
| €/L usable | €${beforeAudit.summary.eurPerLUsable?.toFixed(2) ?? "n/a"} |
| repair executed | ${beforeAudit.repair.repairDecimalClBeverageVolumeExecuted ? "YES" : "NO"} |
| repair decision | ${beforeAudit.repair.repairDecision} |
| UI normalized line | ${beforeAudit.ui.usableStockLabel ?? "—"} |
| UI usable cost line | ${beforeAudit.ui.pricingCard.usableCostLine ?? "—"} |

---

## AFTER (current live row — ${liveMeta.quantity} ${liveMeta.unit} @ €${liveMeta.unit_price})

| Metric | Value |
|--------|-------|
| Parsed volume (ml/unit) | ${afterLive.summary.parsedVolumeMlPerUnit} ml |
| Usable qty — costing path (total ml) | ${afterLive.summary.totalUsableMl ?? "null"} ml |
| Usable qty — display path | ${afterLive.summary.displayTotalUsableMl ?? "null (suppressed)"} |
| €/L usable (display structured) | ${afterLive.summary.eurPerLUsable != null ? `€${afterLive.summary.eurPerLUsable.toFixed(2)}` : "n/a"} |
| €/case (if case-piece-weight path) | ${afterLive.summary.eurPerCaseUsable != null ? `€${afterLive.summary.eurPerCaseUsable.toFixed(2)}` : "n/a"} |
| \`repairDecimalClBeverageVolume\` executed? | **${afterLive.repair.repairDecimalClBeverageVolumeExecuted ? "YES" : "NO"}** |
| repair decision | **${afterLive.repair.repairDecision}** |
| \`isCaseRowWithEmbeddedPieceWeightOnly\` | ${afterLive.structured.isCaseRowWithEmbeddedPieceWeightOnly} |
| UI normalized line | ${afterLive.ui.usableStockLabel ?? "—"} |
| UI usable cost line | ${afterLive.ui.pricingCard.usableCostLine ?? "—"} |

---

## AFTER (simulated — SKU in name: \`${SKU_NAME}\`)

| Metric | Value |
|--------|-------|
| Parsed volume (ml/unit) | ${afterSku.summary.parsedVolumeMlPerUnit} ml |
| Usable qty (total ml) | ${afterSku.summary.totalUsableMl ?? "null"} ml |
| €/L usable | ${afterSku.summary.eurPerLUsable != null ? `€${afterSku.summary.eurPerLUsable.toFixed(2)}` : "n/a"} |
| repair executed | ${afterSku.repair.repairDecimalClBeverageVolumeExecuted ? "YES" : "NO"} |
| repair decision | ${afterSku.repair.repairDecision} (${afterSku.repair.repairResult?.reason ?? "n/a"}) |

---

## Did the real bug disappear?

**NO** — for the stored DB name \`Baladin - Ginger Beer 0.20cl\` (no product code).

- \`detectVolume\` still parses **0.20cl → 2 ml/unit** (repair does not change output without SKU clue).
- \`repairDecimalClBeverageVolume\` **runs** (console warning) but returns **warning-only** (\`decimal-cl-beverage-anomaly\`), not repaired.
- With **GINGER33** in the name, repair **does** fire → **330 ml/unit** and ~**€2.58/L** (24 un scenario) or proportional totals for cx row.

### UI display for current live row

The invoice UI uses \`resolveInvoiceLinePricingPresentation\` → \`resolveStructuredPurchaseForDisplay\`, which **suppresses** ml totals for \`cx\` rows where the name embeds only per-piece volume (\`isCaseRowWithEmbeddedPieceWeightOnly\`). So the UI **does not** show 48 ml / €425/L on the current **2 cx** row — it shows **€/case** pricing instead.

For the historical **24 un** shape (still useful as bug baseline), the UI **would still show ~48 ml total and ~€425/L usable** because countable \`un\` rows are not suppressed.

---

## Evidence files

- \`${OUT_DIR}/db-query.json\`
- \`${OUT_DIR}/trace-results.json\`
- \`${OUT_DIR}/REPORT.md\`
`;

writeFileSync(`${OUT_DIR}/REPORT.md`, report);

console.log(JSON.stringify({ liveRow, scenarios: scenarios.map((s) => ({ label: s.label, summary: s.summary, repair: s.repair, ui: s.ui.pricingCard })) }, null, 2));
