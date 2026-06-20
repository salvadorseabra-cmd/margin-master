/** Replay bindMonetaryColumns for flagged VL rows — read-only analysis */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";

const result = JSON.parse(
  readFileSync(join("/Users/salvadorseabra1/margin-master/.tmp/gross-net-global-audit-result.json"), "utf8"),
);

function replay(row: Record<string, unknown>, structured?: Record<string, unknown>) {
  const base = {
    name: row.description,
    quantity: row.qty,
    unit: null,
    gross_unit_price: structured?.gross_unit_price ?? null,
    discount_pct: structured?.discount_pct ?? null,
    line_total_net: structured?.line_total_net ?? row.total,
    unit_price: row.unit_price,
    total: row.total,
  };
  const legacyOnly = bindMonetaryColumns(parseMonetaryLineItems([{ ...base, gross_unit_price: null, discount_pct: null, line_total_net: null }]))[0];
  const withDerivedDiscount = (() => {
    const gross = Number(row.unit_price);
    const eff = Number(row.effective_paid);
    const pct = gross > 0 ? Math.round(((gross - eff) / gross) * 10000) / 100 : null;
    return bindMonetaryColumns(parseMonetaryLineItems([{
      ...base,
      gross_unit_price: gross,
      discount_pct: pct,
      line_total_net: Number(row.total),
      unit_price: gross,
      total: Number(row.total),
    }]))[0];
  })();
  const withNetFromTotal = bindMonetaryColumns(parseMonetaryLineItems([{
    ...base,
    gross_unit_price: Number(row.unit_price),
    discount_pct: null,
    line_total_net: Number(row.total),
    unit_price: Number(row.unit_price),
    total: Number(row.total),
  }]))[0];

  return {
    description: row.description,
    supplier: row.supplier,
    persisted: { unit_price: row.unit_price, total: row.total, qty: row.qty },
    legacy_only_binding: { unit_price: legacyOnly.unit_price, total: legacyOnly.total },
    with_inferred_discount_pct: { unit_price: withDerivedDiscount.unit_price, total: withDerivedDiscount.total },
    with_line_total_net_only: { unit_price: withNetFromTotal.unit_price, total: withNetFromTotal.total },
    legacy_matches_persisted:
      legacyOnly.unit_price === row.unit_price && legacyOnly.total === row.total,
    fix_if_structured_discount: withDerivedDiscount.unit_price,
    fix_if_rebind_from_total: withNetFromTotal.unit_price,
  };
}

const replays = result.top_20_discrepancies.map((r: Record<string, unknown>) => replay(r));
console.log(JSON.stringify({ replays, summary: {
  legacy_matches_persisted: replays.filter((r: { legacy_matches_persisted: boolean }) => r.legacy_matches_persisted).length,
  fixable_with_discount_pct: replays.filter((r: { fix_if_structured_discount: number; persisted: { unit_price: number } }) =>
    Math.abs(r.fix_if_structured_discount - r.persisted.unit_price) > 0.01
  ).length,
  fixable_with_total_rebind: replays.filter((r: { fix_if_rebind_from_total: number; persisted: { unit_price: number } }) =>
    Math.abs(r.fix_if_rebind_from_total - r.persisted.unit_price) > 0.01
  ).length,
}}, null, 2));
