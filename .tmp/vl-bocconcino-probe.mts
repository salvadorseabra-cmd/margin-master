import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
}

loadEnv();
const key = process.env.VL_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("Missing VL_KEY or SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient("https://bjhnlrgodcqoyzddbpbd.supabase.co", key, {
  auth: { persistSession: false },
});

const { data: invoices, error } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,total_amount,file_url,created_at,user_id,status")
  .gte("invoice_date", "2026-05-07")
  .lte("invoice_date", "2026-05-09");

if (error) console.error("invoice error:", error);

const bocconcino = (invoices ?? []).filter((inv) => {
  const sup = (inv.supplier_name ?? "").toUpperCase();
  return sup.includes("BOCCONCINO") || sup.includes("BOCCON");
});

console.log("=== BOCCONCINO matches (May 8 window) ===");
console.log(JSON.stringify(bocconcino, null, 2));

const { data: byTotal } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,total_amount,file_url")
  .gte("total_amount", 290.5)
  .lte("total_amount", 290.8)
  .gte("invoice_date", "2026-05-01")
  .lte("invoice_date", "2026-05-31");

console.log("\n=== Total ~290.64 in May 2026 ===");
console.log(JSON.stringify(byTotal, null, 2));

// Broader supplier search
const { data: broad } = await sb
  .from("invoices")
  .select("id,supplier_name,invoice_date,total_amount,file_url")
  .ilike("supplier_name", "%boccon%");

console.log("\n=== ilike %boccon% ===");
console.log(JSON.stringify(broad, null, 2));
