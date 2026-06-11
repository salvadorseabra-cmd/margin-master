/**
 * Read-only: query VL + production for decimal CL / similar OCR patterns.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const PROD_REF = "lhackrnlnrsiamorzmkb";
const OUT_DIR = ".tmp/decimal-cl-audit";

const DECIMAL_CL_RE = /0\.[0-9]+\s*cl\b/i;
const DECIMAL_CL_SPACED_RE = /0\.[0-9]+\s+cl\b/i;
const DECIMAL_L_RE = /0\.[0-9]+\s*(?:l|lt|lts|ltr|ltrs)\b/i;
const DECIMAL_L_TIGHT_RE = /0\.[0-9]+l\b/i;

const BEVERAGE_RE =
  /pellegrino|acqua|water|beer|ginger|cola|suco|sumo|juice|vinho|wine|cerveja|lager|ipa|soda|drink|bebida|champagne|prosecco|spritz|tonic|fever.?tree|fanta|pepsi|coca|baladin|aperol|campari|monin|schweppes|red\s*bull|monster|heineken|corona|stella|guinness|peroni|san\s*pellegrino/i;

function serviceKey(ref: string): string {
  const env =
    ref === VL_REF
      ? process.env.VL_SR ?? process.env.VL_KEY ?? process.env.SR_KEY
      : process.env.PROD_KEY ?? process.env.PROD_SR;
  if (env) return env;
  const raw = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, {
    encoding: "utf8",
    timeout: 20_000,
  });
  const row = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  );
  if (!row?.api_key) throw new Error(`missing service_role for ${ref}`);
  return row.api_key;
}

async function fetchAllItems(ref: string) {
  const key = serviceKey(ref);
  const sb = createClient<Database>(`https://${ref}.supabase.co`, key, {
    auth: { persistSession: false },
  });
  const pageSize = 1000;
  const all: Array<{
    id: string;
    invoice_id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total: number | null;
    invoices: { supplier_name: string | null; invoice_date: string | null } | null;
  }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("invoice_items")
      .select("id,invoice_id,name,quantity,unit,unit_price,total,invoices!inner(supplier_name,invoice_date)")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as typeof all));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function classifyPattern(name: string): string[] {
  const patterns: string[] = [];
  if (DECIMAL_CL_RE.test(name)) patterns.push("0.xxcl");
  if (DECIMAL_CL_SPACED_RE.test(name)) patterns.push("0.xx cl");
  if (DECIMAL_L_RE.test(name)) patterns.push("0.xx L");
  if (DECIMAL_L_TIGHT_RE.test(name)) patterns.push("0.xxL");
  return patterns;
}

function matchesDecimalCl(name: string): boolean {
  return DECIMAL_CL_RE.test(name) || DECIMAL_CL_SPACED_RE.test(name);
}

mkdirSync(OUT_DIR, { recursive: true });

const [vlAll, prodItems] = await Promise.all([fetchAllItems(VL_REF), fetchAllItems(PROD_REF)]);

const vlDecimalCl = vlAll.filter((r) => matchesDecimalCl(r.name ?? ""));
const prodDecimalCl = prodItems.filter((r) => matchesDecimalCl(r.name ?? ""));

function toQueryRow(r: (typeof vlAll)[number]) {
  return {
    id: r.id,
    invoice_id: r.invoice_id,
    name: r.name,
    quantity: r.quantity,
    unit: r.unit,
    unit_price: r.unit_price,
    total: r.total,
    supplier_name: r.invoices?.supplier_name,
    invoice_date: r.invoices?.invoice_date,
  };
}

// Broader patterns — both datasets
const broaderVl = vlAll.filter((r) => {
  const n = r.name ?? "";
  return classifyPattern(n).length > 0 && !matchesDecimalCl(n);
});
const broaderProd = prodItems.filter((r) => {
  const n = r.name ?? "";
  return classifyPattern(n).length > 0 && !matchesDecimalCl(n);
});

// Small ml beverage heuristic on all items
const smallMlBeveragesVl = vlAll.filter((r) => {
  const n = r.name ?? "";
  if (!BEVERAGE_RE.test(n)) return false;
  const ml = n.match(/\b(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (!ml) return false;
  const val = parseFloat(ml[1].replace(",", "."));
  return val > 0 && val < 50;
});
const smallMlBeveragesProd = prodItems.filter((r) => {
  const n = r.name ?? "";
  if (!BEVERAGE_RE.test(n)) return false;
  const ml = n.match(/\b(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (!ml) return false;
  const val = parseFloat(ml[1].replace(",", "."));
  return val > 0 && val < 50;
});

const queryResults = {
  queried_at: new Date().toISOString(),
  vl_project: VL_REF,
  prod_project: PROD_REF,
  decimal_cl: {
    vl: { count: vlDecimalCl.length, rows: vlDecimalCl.map(toQueryRow) },
    production: { count: prodDecimalCl.length, rows: prodDecimalCl.map(toQueryRow) },
  },
  broader_patterns: {
    vl: broaderVl.map((r) => ({
      id: r.id,
      name: r.name,
      patterns: classifyPattern(r.name ?? ""),
      supplier: r.invoices?.supplier_name,
    })),
    production: broaderProd.map((r) => ({
      id: r.id,
      name: r.name,
      patterns: classifyPattern(r.name ?? ""),
      supplier: r.invoices?.supplier_name,
    })),
  },
  small_ml_beverages: {
    vl: smallMlBeveragesVl.map((r) => ({ id: r.id, name: r.name, supplier: r.invoices?.supplier_name })),
    production: smallMlBeveragesProd.map((r) => ({
      id: r.id,
      name: r.name,
      supplier: r.invoices?.supplier_name,
    })),
  },
  totals: {
    vl_invoice_items: vlAll.length,
    prod_invoice_items: prodItems.length,
  },
};

writeFileSync(`${OUT_DIR}/query-results.json`, JSON.stringify(queryResults, null, 2));
console.log(
  JSON.stringify(
    {
      vl_decimal_cl: queryResults.decimal_cl.vl.count,
      prod_decimal_cl: queryResults.decimal_cl.production.count,
      broader_vl: broaderVl.length,
      broader_prod: broaderProd.length,
    },
    null,
    2,
  ),
);
