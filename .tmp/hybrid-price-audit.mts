import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { operationalCostFieldsFromInvoiceLine, defaultIsGenericUnit } from "@/lib/ingredient-auto-persist";
import { operationalUnitPriceForPriceHistory } from "@/lib/ingredient-price-history";
import { purchaseQuantityDenom } from "@/lib/ingredient-unit-cost";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;
const sb = createClient(`https://${VL_REF}.supabase.co`, key, { auth: { persistSession: false } });

const TARGET_PATTERNS = [
  { key: "peroni", pattern: /peroni/i },
  { key: "san_pellegrino", pattern: /san pellegrino|água san pellegrino|agua san pellegrino/i },
  { key: "aceto", pattern: /aceto balsamico/i },
  { key: "courgettes", pattern: /courgette/i },
  { key: "alho", pattern: /alho franc/i },
  { key: "atum", pattern: /atum em óleo|atum em oleo/i },
  { key: "gema", pattern: /gema líquida|gema liquida/i },
  { key: "anchoas", pattern: /anchoas/i },
];

const [{ data: ings }, { data: items }, { data: hist }] = await Promise.all([
  sb.from("ingredients").select("id,name,unit,current_price,purchase_quantity,purchase_unit,base_unit").order("name"),
  sb.from("invoice_items").select("id,invoice_id,name,quantity,unit,unit_price,total,ingredient_id,invoices(invoice_date,supplier_name,created_at)"),
  sb.from("ingredient_price_history").select("id,ingredient_id,invoice_id,ingredient_name,previous_price,new_price,delta,delta_percent,created_at,invoices(invoice_date,created_at)").order("created_at", { ascending: true }),
]);

const matched = TARGET_PATTERNS.map((t) => {
  const hit = (ings ?? []).find((i) => t.pattern.test(i.name));
  return hit ? { target: t.key, ...hit } : { target: t.key, missing: true };
});

function latestLinkedHistory(ingredientId: string) {
  const rows = (hist ?? []).filter((h) => h.ingredient_id === ingredientId && h.invoice_id);
  return rows[rows.length - 1] ?? null;
}

function analyzeTarget(ing: (typeof matched)[0]) {
  if ("missing" in ing) return { target: ing.target, missing: true };
  const catalogPq = purchaseQuantityDenom(ing.purchase_quantity);
  const dbCurrent = ing.current_price == null ? null : Number(ing.current_price);
  const latest = latestLinkedHistory(ing.id);
  const latestOp = latest ? Number(latest.new_price) : null;

  const linkedItems = (items ?? []).filter((it) => it.ingredient_id === ing.id);
  const itemAnalyses = linkedItems.map((item) => {
    const opFields = operationalCostFieldsFromInvoiceLine({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.total,
    }, { isGenericUnit: defaultIsGenericUnit });
    const storedNew = opFields ? operationalUnitPriceForPriceHistory(opFields.current_price, opFields.purchase_quantity) : null;
    const histRow = (hist ?? []).find((h) => h.invoice_id === item.invoice_id && h.ingredient_id === ing.id) ?? null;
    return {
      invoice_id: item.invoice_id,
      invoice_date: (item.invoices as { invoice_date?: string })?.invoice_date ?? null,
      line: { name: item.name, qty: item.quantity, unit: item.unit, unit_price: item.unit_price, total: item.total },
      operationalFields: opFields,
      expectedHistoryNewPrice: storedNew,
      actualHistoryNewPrice: histRow ? Number(histRow.new_price) : null,
      historyMatchesExpected: storedNew != null && histRow ? Math.abs(storedNew - Number(histRow.new_price)) < 1e-6 : null,
    };
  }).sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)));

  const latestItem = itemAnalyses[itemAnalyses.length - 1] ?? null;
  const opFields = latestItem?.operationalFields ?? null;
  const opPq = opFields ? purchaseQuantityDenom(opFields.purchase_quantity) : null;

  return {
    target: ing.target,
    name: ing.name,
    db: { current_price: dbCurrent, purchase_quantity: catalogPq, purchase_unit: ing.purchase_unit, base_unit: ing.base_unit },
    latest_history: latest,
    latest_invoice: latestItem,
    all_invoice_lines: itemAnalyses,
    hybrid: opPq != null && catalogPq !== opPq,
    catalog_pq: catalogPq,
    operational_pq: opPq,
    history_write: latestItem && opFields ? {
      invoice_pack_price: opFields.current_price,
      operational_pq: opFields.purchase_quantity,
      new_price_stored: latestOp,
      arithmetic: `${opFields.current_price} ÷ ${opFields.purchase_quantity} = ${operationalUnitPriceForPriceHistory(opFields.current_price, opFields.purchase_quantity)?.toFixed(8)}`,
    } : null,
    current_price_contract: {
      db_pack_price: dbCurrent,
      db_operational_via_catalog_pq: dbCurrent != null ? dbCurrent / catalogPq : null,
      history_operational: latestOp,
    },
    formulas: {
      A_history_x_catalog_pq: latestOp != null ? latestOp * catalogPq : null,
      B_history_x_operational_pq: latestOp != null && opPq != null ? latestOp * opPq : null,
      C_invoice_pack_price: opFields?.current_price ?? null,
    },
    matches_db_current_price: {
      A: latestOp != null && dbCurrent != null && Math.abs(latestOp * catalogPq - dbCurrent) < 0.02,
      B: latestOp != null && opPq != null && dbCurrent != null && Math.abs(latestOp * opPq - dbCurrent) < 0.02,
      C: opFields?.current_price != null && dbCurrent != null && Math.abs(opFields.current_price - dbCurrent) < 0.02,
    },
  };
}

console.log(JSON.stringify({ targets: matched.map(analyzeTarget) }, null, 2));
