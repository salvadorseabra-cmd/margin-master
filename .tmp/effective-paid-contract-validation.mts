/**
 * READ-ONLY end-to-end effective paid price contract validation — VL bjhnlrgodcqoyzddbpbd
 */
if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
} else {
  const meta = import.meta as { env: Record<string, unknown> };
  meta.env.DEV = false;
}

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import {
  procurementPackFieldsFromInvoiceLine,
  operationalCostFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../src/lib/ingredient-auto-persist.ts";
import {
  operationalUnitPriceForPriceHistory,
  computePriceHistoryDelta,
} from "../src/lib/ingredient-price-history.ts";
import { computeEffectiveUsableCost } from "../src/lib/invoice-purchase-price-semantics.ts";
import { resolveInvoiceLinePurchaseFormat } from "../src/lib/invoice-purchase-format.ts";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";
import { normalizeInvoiceItemFields } from "../src/lib/invoice-item-fields.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL_REF = "bjhnlrgodcqoyzddbpbd";
const TOLERANCE = 0.02;
const EPS = 1e-4;

const AFFECTED = [
  "Paccheri",
  "Courgettes",
  "Alho Francês",
  "Manjericão",
  "Gorgonzola",
];
const REGRESSION = [
  "Prosciutto",
  "San Pellegrino",
  "Mortadella",
  "Atum",
  "Anchoas",
  "Aceto",
];

function loadEnv(): { url: string; key: string } {
  for (const name of [".env", ".env.local", ".env.production-backup"]) {
    try {
      const raw = readFileSync(join(ROOT, name), "utf8");
      const vars: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      if (vars.SUPABASE_URL?.includes(VL_REF) && vars.SUPABASE_SERVICE_ROLE_KEY) {
        return { url: vars.SUPABASE_URL, key: vars.SUPABASE_SERVICE_ROLE_KEY };
      }
    } catch {
      /* skip */
    }
  }
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, {
    encoding: "utf8",
  });
  const key = (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
  return { url: `https://${VL_REF}.supabase.co`, key };
}

const round4 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10000) / 10000;

const pctDiff = (a: number | null, b: number | null) => {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) < EPS) return Math.abs(b) < EPS ? 0 : null;
  return round4(Math.abs(b - a) / Math.abs(a))!;
};

const matches = (a: number | null | undefined, b: number | null | undefined, eps = EPS) => {
  if (a == null || b == null) return a === b;
  return Math.abs(Number(a) - Number(b)) <= eps;
};

function replayBinding(raw: {
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
  const oldUp = raw.unit_price == null ? null : Number(raw.unit_price);
  const newUp = bound.unit_price == null ? null : Number(bound.unit_price);
  const qty = bound.quantity == null ? null : Number(bound.quantity);
  const total = bound.total == null ? null : Number(bound.total);
  const consistent =
    qty != null && newUp != null && total != null
      ? Math.abs(qty * newUp - total) <= TOLERANCE
      : false;
  return {
    raw: {
      qty: raw.quantity,
      unit_price: oldUp,
      total: raw.total == null ? null : Number(raw.total),
    },
    bound: { qty, unit_price: newUp, total },
    binding_changed: oldUp != null && newUp != null && Math.abs(oldUp - newUp) > TOLERANCE,
    arithmetic_consistent: consistent,
    diff_pct: pctDiff(oldUp, newUp),
  };
}

function replayPipeline(line: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const binding = replayBinding(line);
  const boundLine = {
    name: line.name,
    quantity: binding.bound.qty,
    unit: line.unit,
    unit_price: binding.bound.unit_price,
    total: binding.bound.total,
  };

  const procurement = procurementPackFieldsFromInvoiceLine(boundLine, {
    isGenericUnit: defaultIsGenericUnit,
  });
  const operational = operationalCostFieldsFromInvoiceLine(boundLine, {
    isGenericUnit: defaultIsGenericUnit,
  });

  const structured = resolveInvoiceLinePurchaseFormat({
    name: boundLine.name,
    quantity: boundLine.quantity,
    unit: boundLine.unit,
  });

  const effectiveUsable =
    boundLine.unit_price != null
      ? computeEffectiveUsableCost(
          Number(boundLine.unit_price),
          {
            name: boundLine.name,
            quantity: boundLine.quantity,
            unit: boundLine.unit,
            unit_price: boundLine.unit_price,
            line_total: boundLine.total,
          },
          structured,
          boundLine.name,
        )
      : null;

  const historyNewPrice = operationalUnitPriceForPriceHistory(
    operational?.current_price,
    operational?.purchase_quantity,
  );

  return {
    binding,
    procurement: procurement
      ? {
          current_price: round4(procurement.current_price),
          purchase_quantity: procurement.purchase_quantity,
          purchase_unit: procurement.purchase_unit,
          base_unit: procurement.base_unit,
          unit: procurement.unit,
        }
      : null,
    operational: operational
      ? {
          current_price: round4(operational.current_price),
          purchase_quantity: operational.purchase_quantity,
          cost_base_unit: operational.cost_base_unit,
          operational_eur: round4(
            resolvedOperationalUnitCostEur({
              current_price: operational.current_price,
              purchase_quantity: operational.purchase_quantity,
            }),
          ),
        }
      : null,
    effective_usable: effectiveUsable
      ? { cost: round4(effectiveUsable.cost), unit: effectiveUsable.unit }
      : null,
    history: {
      new_price: round4(historyNewPrice),
    },
  };
}

type IngredientRow = {
  id: string;
  name: string;
  current_price: number | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  base_unit: string | null;
  unit: string | null;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  invoices: { supplier_name: string | null; invoice_date: string | null } | null;
};

type HistoryRow = {
  id: string;
  ingredient_id: string;
  invoice_id: string | null;
  new_price: number | null;
  previous_price: number | null;
  delta: number | null;
  delta_percent: number | null;
  created_at: string;
};

async function findIngredient(sb: ReturnType<typeof createClient>, pattern: string) {
  const { data } = await sb
    .from("ingredients")
    .select("id,name,current_price,purchase_quantity,purchase_unit,base_unit,unit")
    .ilike("name", `%${pattern}%`);
  return (data ?? []) as IngredientRow[];
}

async function findLatestMatchedItem(
  sb: ReturnType<typeof createClient>,
  ingredientId: string,
): Promise<{ item: InvoiceItemRow; matchStatus: string } | null> {
  const { data: matches } = await sb
    .from("invoice_item_matches")
    .select(
      "status,invoice_item_id,invoice_items(id,invoice_id,name,quantity,unit,unit_price,total,invoices(supplier_name,invoice_date))",
    )
    .eq("ingredient_id", ingredientId)
    .in("status", ["confirmed", "auto_confirmed"]);

  const rows = (matches ?? [])
    .map((m) => ({
      status: m.status as string,
      item: m.invoice_items as unknown as InvoiceItemRow,
    }))
    .filter((r) => r.item?.id)
    .sort((a, b) => {
      const da = a.item.invoices?.invoice_date ?? "";
      const db = b.item.invoices?.invoice_date ?? "";
      return db.localeCompare(da);
    });

  return rows[0] ?? null;
}

async function main() {
  const { url, key } = loadEnv();
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const audit = JSON.parse(
    readFileSync(join(ROOT, ".tmp/gross-net-global-audit-result.json"), "utf8"),
  );

  // --- All 15 flagged rows replay ---
  const { data: allItems } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total,invoices(supplier_name)");

  const flaggedReplay = audit.top_20_discrepancies
    .filter((r: { difference_pct: number }) => r.difference_pct > TOLERANCE)
    .slice(0, 15)
    .map((r: Record<string, unknown>) => {
      const item = (allItems ?? []).find((i) => i.id === r.invoice_item_id);
      const raw = {
        name: String(r.description),
        quantity: r.qty as number,
        unit: item?.unit ?? null,
        unit_price: r.unit_price as number,
        total: r.total as number,
      };
      const replay = replayPipeline(raw);
      const wouldFix =
        replay.binding.binding_changed &&
        replay.binding.arithmetic_consistent &&
        replay.operational?.operational_eur != null;
      return {
        invoice_item_id: r.invoice_item_id,
        description: r.description,
        effective_paid: r.effective_paid,
        ...replay,
        would_fix: wouldFix,
      };
    });

  const flaggedFixCount = flaggedReplay.filter((r: { would_fix: boolean }) => r.would_fix).length;

  // --- Affected ingredients deep dive ---
  const affectedResults: Record<string, unknown>[] = [];
  for (const pattern of AFFECTED) {
    const ings = await findIngredient(sb, pattern);
    for (const ing of ings) {
      const match = await findLatestMatchedItem(sb, ing.id);
      if (!match) {
        affectedResults.push({ pattern, ingredient: ing, error: "no_confirmed_match" });
        continue;
      }
      const norm = normalizeInvoiceItemFields(match.item);
      const replay = replayPipeline({
        name: norm.name,
        quantity: norm.quantity,
        unit: norm.unit,
        unit_price: norm.unit_price,
        total: norm.total,
      });

      const currentOp = round4(
        resolvedOperationalUnitCostEur({
          current_price: ing.current_price,
          purchase_quantity: ing.purchase_quantity,
        }),
      );

      const { data: histRows } = await sb
        .from("ingredient_price_history")
        .select("id,ingredient_id,invoice_id,new_price,previous_price,delta,delta_percent,created_at")
        .eq("ingredient_id", ing.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const linkedHist = (histRows ?? []).find(
        (h) => h.invoice_id === match.item.invoice_id,
      ) as HistoryRow | undefined;

      const { data: recipeLinks } = await sb
        .from("recipe_ingredients")
        .select("recipe_id,quantity,unit,recipes(name)")
        .eq("ingredient_id", ing.id);

      affectedResults.push({
        pattern,
        ingredient: {
          id: ing.id,
          name: ing.name,
          current_price: ing.current_price,
          purchase_quantity: ing.purchase_quantity,
          purchase_unit: ing.purchase_unit,
          base_unit: ing.base_unit,
        },
        invoice_line: {
          id: match.item.id,
          invoice_id: match.item.invoice_id,
          supplier: match.item.invoices?.supplier_name,
          invoice_date: match.item.invoices?.invoice_date,
          name: norm.name,
          qty: norm.quantity,
          unit: norm.unit,
          persisted_unit_price: norm.unit_price,
          total: norm.total,
        },
        replay,
        current: {
          operational_eur: currentOp,
          procurement: {
            current_price: ing.current_price,
            purchase_quantity: ing.purchase_quantity,
            purchase_unit: ing.purchase_unit,
          },
        },
        expected_after_reingestion: {
          operational_eur: replay.operational?.operational_eur,
          procurement: replay.procurement,
          history_new_price: replay.history.new_price,
        },
        procurement_match: {
          current_price: matches(ing.current_price, replay.procurement?.current_price),
          purchase_quantity: matches(ing.purchase_quantity, replay.procurement?.purchase_quantity),
          purchase_unit: ing.purchase_unit === replay.procurement?.purchase_unit,
        },
        operational_match: matches(currentOp, replay.operational?.operational_eur),
        history: {
          linked_row: linkedHist
            ? {
                id: linkedHist.id,
                new_price: linkedHist.new_price,
                previous_price: linkedHist.previous_price,
              }
            : null,
          expected_new_price: replay.history.new_price,
          history_would_change:
            linkedHist != null &&
            !matches(linkedHist.new_price, replay.history.new_price, 0.001),
        },
        recipe_count: (recipeLinks ?? []).length,
        recipe_impact: {
          current_operational_eur: currentOp,
          expected_operational_eur: replay.operational?.operational_eur,
          diff_pct: pctDiff(currentOp, replay.operational?.operational_eur ?? null),
        },
      });
    }
  }

  // --- Regression ---
  const regressionResults: Record<string, unknown>[] = [];
  for (const pattern of REGRESSION) {
    const ings = await findIngredient(sb, pattern);
    for (const ing of ings) {
      const match = await findLatestMatchedItem(sb, ing.id);
      if (!match) {
        regressionResults.push({ pattern, ingredient: ing.name, error: "no_match" });
        continue;
      }
      const norm = normalizeInvoiceItemFields(match.item);
      const replay = replayPipeline({
        name: norm.name,
        quantity: norm.quantity,
        unit: norm.unit,
        unit_price: norm.unit_price,
        total: norm.total,
      });
      const currentOp = round4(
        resolvedOperationalUnitCostEur({
          current_price: ing.current_price,
          purchase_quantity: ing.purchase_quantity,
        }),
      );
      regressionResults.push({
        pattern,
        ingredient: ing.name,
        invoice_line: norm.name,
        binding_changed: replay.binding.binding_changed,
        current: {
          current_price: ing.current_price,
          purchase_quantity: ing.purchase_quantity,
          operational_eur: currentOp,
        },
        expected: {
          current_price: replay.procurement?.current_price,
          purchase_quantity: replay.procurement?.purchase_quantity,
          operational_eur: replay.operational?.operational_eur,
        },
        unchanged:
          !replay.binding.binding_changed &&
          matches(ing.current_price, replay.procurement?.current_price) &&
          matches(ing.purchase_quantity, replay.procurement?.purchase_quantity) &&
          matches(currentOp, replay.operational?.operational_eur),
      });
    }
  }

  const out = {
    generated_at: new Date().toISOString(),
    vl_project: VL_REF,
    summary: {
      flagged_rows_total: 15,
      would_fix_via_binding: flaggedFixCount,
      would_not_fix: 15 - flaggedFixCount,
      affected_ingredients_found: affectedResults.length,
      regression_all_unchanged: regressionResults.every((r) => r.unchanged !== false),
    },
    flagged_all_15: flaggedReplay,
    affected: affectedResults,
    regression: regressionResults,
  };

  const outPath = join(ROOT, ".tmp/effective-paid-contract-validation-result.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
