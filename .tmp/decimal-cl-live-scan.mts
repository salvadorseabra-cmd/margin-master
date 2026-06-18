import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { detectVolume } from "../src/lib/ingredient-unit-inference.ts";
import { parsePurchaseStructureFromText, measureToBase } from "../src/lib/stock-normalization.ts";
import { resolveInvoiceLinePurchaseFormat } from "../src/lib/invoice-purchase-format.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" });
const key = JSON.parse(raw).find((k: { name: string }) => k.name === "service_role").api_key;
const sb = createClient(`https://${VL}.supabase.co`, key, { auth: { persistSession: false } });

const DECIMAL_CL_RE = /0\.[0-9]+\s*cl\b/i;

function repairDecimalCl(name: string): string {
  return name.replace(/\b0\.(\d+)\s*cl\b/gi, (_, digits: string) => {
    const n = Number.parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 10) return `0.${digits}cl`;
    return `${n}cl`;
  });
}

function simulate(name: string, qty: number, unit: string) {
  const before = resolveInvoiceLinePurchaseFormat({ name, quantity: qty, unit });
  const repaired = repairDecimalCl(name);
  const after =
    repaired !== name
      ? resolveInvoiceLinePurchaseFormat({ name: repaired, quantity: qty, unit })
      : null;
  return {
    before_ml: before.normalizedUsableQuantity,
    before_pack_ml: before.packageQuantity,
    after_ml: after?.normalizedUsableQuantity ?? null,
    after_pack_ml: after?.packageQuantity ?? null,
    repaired_name: repaired !== name ? repaired : null,
  };
}

const pageSize = 1000;
const all: Array<{
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  invoices: { supplier_name: string | null; invoice_date: string | null } | null;
}> = [];
let from = 0;
while (true) {
  const { data, error } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,invoices!inner(supplier_name,invoice_date)")
    .range(from, from + pageSize - 1);
  if (error) throw error;
  if (!data?.length) break;
  all.push(...(data as typeof all));
  if (data.length < pageSize) break;
  from += pageSize;
}

const decimalMatches = all.filter((r) => DECIMAL_CL_RE.test(r.name ?? ""));
const blastRadius = all
  .map((r) => {
    const repaired = repairDecimalCl(r.name ?? "");
    if (repaired === r.name) return null;
    const sim = simulate(r.name ?? "", r.quantity ?? 1, r.unit ?? "un");
    return {
      id: r.id,
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      supplier: r.invoices?.supplier_name,
      ...sim,
    };
  })
  .filter(Boolean);

console.log(
  JSON.stringify(
    {
      scanned_at: new Date().toISOString(),
      total_items: all.length,
      decimal_cl_matches: decimalMatches.map((r) => ({
        id: r.id,
        name: r.name,
        quantity: r.quantity,
        unit: r.unit,
        supplier: r.invoices?.supplier_name,
        detectVolume: detectVolume(r.name ?? ""),
        structure: parsePurchaseStructureFromText(r.name ?? ""),
      })),
      blast_radius_if_0xx_to_xx_cl: blastRadius,
      ginger_beer_trace: (() => {
        const name = "Baladin - Ginger Beer 0.20cl";
        const vol = detectVolume(name);
        const structure = parsePurchaseStructureFromText(name);
        const perItem = structure
          ? measureToBase(structure.unitSize, structure.unitMeasurement)
          : null;
        return {
          detectVolume: vol,
          parsePurchaseStructureFromText: structure,
          measureToBase: perItem,
          resolve_24un: resolveInvoiceLinePurchaseFormat({ name, quantity: 24, unit: "un" }),
          resolve_2cx: resolveInvoiceLinePurchaseFormat({ name, quantity: 2, unit: "cx" }),
        };
      })(),
    },
    null,
    2,
  ),
);
