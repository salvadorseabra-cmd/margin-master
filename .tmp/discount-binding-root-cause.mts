/**
 * Discount binding failure root-cause investigation — READ-ONLY VL queries + binding replay.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  monetaryToInvoiceLineItem,
  parseMonetaryLineItems,
} from "../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { reconcileLineItemAmounts } from "../supabase/functions/extract-invoice/invoice-line-reconcile.ts";
import { recipeOperationalCostFieldsFromInvoiceLine } from "../src/lib/invoice-purchase-price-semantics.ts";
import { operationalCostFieldsFromInvoiceLine } from "../src/lib/ingredient-auto-persist.ts";
import { operationalUnitPriceForPriceHistory } from "../src/lib/ingredient-price-history.ts";
import { resolvedOperationalUnitCostEur } from "../src/lib/ingredient-unit-cost.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const PACCHERI_ITEM_ID = "867121e4-7284-4ed8-9610-46e78ba487aa";
const EMPORIO_INVOICE_ID = "ab52796d-de1d-418d-86e7-230c8f056f09";
const BIDFOOD_INVOICE_ID = "da472b7f-0fd9-4a26-a37c-80ad335f7f7e";

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(join(ROOT, name), "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

const env = loadEnv();
const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const round4 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10000) / 10000;

type FlaggedRow = {
  invoice_id: string;
  invoice_item_id: string;
  supplier: string;
  description: string;
  qty: number;
  unit_price: number;
  total: number;
  effective_paid: number;
  implied_discount_pct: number | null;
};

function pipelineReplay(row: FlaggedRow, structured?: {
  gross_unit_price?: number | null;
  discount_pct?: number | null;
  line_total_net?: number | null;
}) {
  const gross = structured?.gross_unit_price ?? row.unit_price;
  const discount = structured?.discount_pct ?? null;
  const netTotal = structured?.line_total_net ?? row.total;

  const gptRaw = [{
    name: row.description,
    quantity: row.qty,
    unit: null,
    gross_unit_price: gross,
    discount_pct: discount,
    line_total_net: netTotal,
  }];

  const parsed = parseMonetaryLineItems(gptRaw);
  const bound = bindMonetaryColumns(parsed);
  const legacy = bound.map(monetaryToInvoiceLineItem);
  const reconciled = reconcileLineItemAmounts(legacy);

  return {
    gptRaw: gptRaw[0],
    afterParse: parsed[0],
    afterBind: bound[0],
    afterLegacy: legacy[0],
    afterReconcile: reconciled[0],
  };
}

function replayScenarios(row: FlaggedRow) {
  const inferredPct =
    row.unit_price > 0
      ? round4(((row.unit_price - row.effective_paid) / row.unit_price) * 100)
      : null;

  const legacyOnly = pipelineReplay(row, {
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: null,
  });

  const structuredFull = pipelineReplay(row, {
    gross_unit_price: row.unit_price,
    discount_pct: inferredPct,
    line_total_net: row.total,
  });

  const structuredNetOnly = pipelineReplay(row, {
    gross_unit_price: row.unit_price,
    discount_pct: null,
    line_total_net: row.total,
  });

  const structuredNetDerivedUnit = pipelineReplay(row, {
    gross_unit_price: null,
    discount_pct: null,
    line_total_net: row.total,
  });

  // Simulates GPT putting gross in unit_price field (legacy bleed)
  const legacyBleed = pipelineReplay(row, {
    gross_unit_price: row.unit_price,
    discount_pct: null,
    line_total_net: null,
  });

  const persisted = { unit_price: row.unit_price, total: row.total, qty: row.qty };
  const effectiveTarget = round4(row.effective_paid)!;

  const scenarios = [
    { name: "legacy_only_no_structured", result: legacyOnly.afterReconcile },
    { name: "structured_gross_discount_net", result: structuredFull.afterReconcile },
    { name: "structured_gross_and_net_no_discount", result: structuredNetOnly.afterReconcile },
    { name: "structured_net_total_only", result: structuredNetDerivedUnit.afterReconcile },
    { name: "structured_gross_only", result: legacyBleed.afterReconcile },
  ];

  const fixes = scenarios.map((s) => ({
    scenario: s.name,
    unit_price: s.result.unit_price,
    total: s.result.total,
    matches_effective: s.result.unit_price != null && Math.abs(s.result.unit_price - effectiveTarget) < 0.02,
    matches_persisted: s.result.unit_price === row.unit_price && s.result.total === row.total,
  }));

  const wouldFixWithDiscount = fixes.find((f) => f.scenario === "structured_gross_discount_net")!;
  const wouldFixWithNetRebind = fixes.find((f) => f.scenario === "structured_gross_and_net_no_discount")!;

  return {
    persisted,
    effective_target: effectiveTarget,
    inferred_discount_pct: inferredPct,
    fixes,
    replay_would_fix: {
      with_discount_pct: wouldFixWithDiscount.matches_effective,
      with_net_rebind_only: wouldFixWithNetRebind.matches_effective,
      binding_alone_fixes: fixes.some((f) => f.matches_effective && !f.matches_persisted),
    },
  };
}

function classifyRow(row: FlaggedRow, replay: ReturnType<typeof replayScenarios>): string {
  const pct = row.implied_discount_pct ?? 0;
  const qtyMismatch =
    Math.abs(pct - 50) < 2 && row.qty >= 2 && Math.abs(row.total - row.unit_price) < 0.1;

  if (replay.replay_would_fix.with_discount_pct) return "A";
  if (qtyMismatch) return "C";
  if (Math.abs(pct) < 1) return "D";
  if (pct > 1 && pct < 50) return "B";
  if (row.supplier.includes("Bocconcino") || row.supplier.includes("Emporio")) return "E";
  return "B";
}

function classifyLabel(code: string): string {
  const map: Record<string, string> = {
    A: "discount present but lost (binding/extraction gap)",
    B: "discount never extracted",
    C: "quantity OCR error",
    D: "total extraction error",
    E: "supplier-specific format",
  };
  return map[code] ?? code;
}

async function main() {
  const audit = JSON.parse(
    readFileSync(join(ROOT, ".tmp/gross-net-global-audit-result.json"), "utf8"),
  );
  const flagged: FlaggedRow[] = audit.top_20_discrepancies.slice(0, 15);

  // Fetch all flagged rows fresh from DB
  const ids = flagged.map((f) => f.invoice_item_id);
  const { data: dbItems, error: dbErr } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
    .in("id", ids);
  if (dbErr) throw dbErr;

  const dbMap = new Map((dbItems ?? []).map((r) => [r.id, r]));

  // Paccheri end-to-end
  const { data: paccheri, error: pacErr } = await sb
    .from("invoice_items")
    .select("id,invoice_id,name,quantity,unit,unit_price,total,created_at")
    .eq("id", PACCHERI_ITEM_ID)
    .maybeSingle();
  if (pacErr) throw pacErr;

  const paccheriRow = flagged.find((f) => f.invoice_item_id === PACCHERI_ITEM_ID)!;
  const paccheriReplay = replayScenarios(paccheriRow);
  const paccheriPipeline = {
    visible_invoice_ground_truth: {
      source: ".tmp/emporio-discount-column-audit + invoice-table-extraction prompt examples",
      note: "Emporio Desc.(%) column; Paccheri typically ~10% line discount on list price",
      expected_pattern: "gross_unit_price=2.35, discount_pct≈10.64, line_total_net=50.40",
    },
    stage_1_ocr_vision: { note: "GPT-4.1 vision reads table crop; no separate OCR stage" },
    stage_2_gpt_pass_c_structured: {
      fields_expected: ["gross_unit_price", "discount_pct", "line_total_net"],
      fields_in_cached_extract: {
        source: ".tmp/emporio-italia-investigation/extract-invoice-response.json",
        paccheri: { quantity: 24, unit_price: 2.35, total: 50.2 },
        note: "API response is POST-binding — only unit_price/total; discount_pct stripped",
      },
      inferred_pass_c: {
        gross_unit_price: 2.35,
        discount_pct: null,
        line_total_net: 50.4,
        failure: "discount_pct null → binding cannot derive net unit",
      },
    },
    stage_3_parseMonetaryLineItems: pipelineReplay(paccheriRow, {
      gross_unit_price: 2.35,
      discount_pct: null,
      line_total_net: 50.4,
    }).afterParse,
    stage_4_bindMonetaryColumns: pipelineReplay(paccheriRow, {
      gross_unit_price: 2.35,
      discount_pct: null,
      line_total_net: 50.4,
    }).afterBind,
    stage_5_monetaryToInvoiceLineItem: pipelineReplay(paccheriRow, {
      gross_unit_price: 2.35,
      discount_pct: null,
      line_total_net: 50.4,
    }).afterLegacy,
    stage_6_reconcileLineItemAmounts: pipelineReplay(paccheriRow, {
      gross_unit_price: 2.35,
      discount_pct: null,
      line_total_net: 50.4,
    }).afterReconcile,
    stage_7_runExtraction_persist: {
      source: "src/routes/invoices.tsx insertRows",
      persisted: dbMap.get(PACCHERI_ITEM_ID) ?? paccheri,
      columns_written: ["unit_price", "total"],
      columns_dropped: ["gross_unit_price", "discount_pct", "line_total_net"],
    },
    stage_8_ingredient_auto_persist: (() => {
      const line = dbMap.get(PACCHERI_ITEM_ID) ?? paccheri;
      if (!line) return null;
      const recipe = recipeOperationalCostFieldsFromInvoiceLine({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        line_total: line.total ?? undefined,
      });
      const op = operationalCostFieldsFromInvoiceLine({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        total: line.total,
      });
      return {
        current_price_source: "invoice_items.unit_price (gross 2.35)",
        recipe_fields: recipe,
        operational_fields: op,
        uses_total_for_price: false,
      };
    })(),
    stage_9_price_history: await (async () => {
      const { data: hist } = await sb
        .from("ingredient_price_history")
        .select("ingredient_name,new_price,previous_price,invoice_id,created_at")
        .eq("invoice_id", EMPORIO_INVOICE_ID)
        .ilike("ingredient_name", "%paccheri%");
      const line = dbMap.get(PACCHERI_ITEM_ID) ?? paccheri;
      const recipe = line
        ? recipeOperationalCostFieldsFromInvoiceLine({
            name: line.name,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            line_total: line.total ?? undefined,
          })
        : null;
      return {
        history_rows: hist ?? [],
        history_new_price_reflects: hist?.[0]?.new_price === line?.unit_price ? "gross unit_price" : "other",
        operational_history_price: recipe
          ? operationalUnitPriceForPriceHistory(recipe.current_price, recipe.purchase_quantity)
          : null,
      };
    })(),
    counterfactual_with_discount_extracted: pipelineReplay(paccheriRow, {
      gross_unit_price: 2.35,
      discount_pct: 10.64,
      line_total_net: 50.4,
    }).afterReconcile,
    information_disappears_at: "Pass C (discount_pct=null) → bindMonetaryColumns keeps gross as unit_price",
  };

  // Bidfood focus rows
  const bidfoodNames = [/courgette/i, /alho franc/i, /manjeric/i];
  const bidfoodRows = flagged.filter(
    (f) => f.invoice_id === BIDFOOD_INVOICE_ID && bidfoodNames.some((re) => re.test(f.description)),
  );
  const bidfoodFindings = bidfoodRows.map((row) => {
    const replay = replayScenarios(row);
    const cached = readCachedExtract(BIDFOOD_INVOICE_ID);
    const cachedItem = cached?.items?.find((i: { name: string }) =>
      i.name.toLowerCase().includes(row.description.toLowerCase().slice(0, 6)),
    );
    return {
      description: row.description,
      invoice_item_id: row.invoice_item_id,
      persisted: dbMap.get(row.invoice_item_id),
      expected_effective_unit_price: replay.effective_target,
      upstream_extract_cached: cachedItem ?? null,
      upstream_had_structured_discount: false,
      replay,
      classification: classifyRow(row, replay),
    };
  });

  // All 15 binding replays
  const bindingReplay = flagged.map((row) => {
    const replay = replayScenarios(row);
    const code = classifyRow(row, replay);
    return {
      invoice_item_id: row.invoice_item_id,
      supplier: row.supplier,
      description: row.description,
      persisted: dbMap.get(row.invoice_item_id) ?? {
        unit_price: row.unit_price,
        total: row.total,
        quantity: row.qty,
      },
      effective_paid: row.effective_paid,
      replay,
      would_replay_fix: replay.replay_would_fix.binding_alone_fixes ? "YES" : "NO",
      fix_mechanism: replay.replay_would_fix.with_discount_pct
        ? "needs discount_pct in Pass C"
        : replay.replay_would_fix.with_net_rebind_only
          ? "needs net rebind rule"
          : "no",
      classification: code,
      classification_label: classifyLabel(code),
    };
  });

  const summary = {
    total_flagged: bindingReplay.length,
    would_fix_with_proper_binding: bindingReplay.filter((r) => r.would_replay_fix === "YES").length,
    needs_discount_extraction: bindingReplay.filter((r) => r.replay.replay_would_fix.with_discount_pct).length,
    binding_cannot_fix_even_with_net: bindingReplay.filter(
      (r) => r.would_replay_fix === "NO" && !r.replay.replay_would_fix.with_discount_pct,
    ).length,
    by_classification: Object.fromEntries(
      ["A", "B", "C", "D", "E"].map((c) => [
        c,
        bindingReplay.filter((r) => r.classification === c).length,
      ]),
    ),
  };

  // Extraction output audit from .tmp artifacts
  const extractionAudit = {
    bidfood: {
      invoice_id: BIDFOOD_INVOICE_ID,
      artifacts: [
        ".tmp/vl-final-state-audit/extracts/da472b7f-0fd9-4a26-a37c-80ad335f7f7e.json",
        ".tmp/passc-implementation/reextract/da472b7f-0fd9-4a26-a37c-80ad335f7f7e.json",
      ],
      pass_c_structured_fields_in_api: false,
      sample_courgettes: readCachedExtract(BIDFOOD_INVOICE_ID)?.items?.find((i: { name: string }) =>
        /courgette/i.test(i.name),
      ),
      note: "Cached extracts show unit_price=gross list, total=net line; no gross_unit_price/discount_pct in API",
    },
    emporio: {
      invoice_id: EMPORIO_INVOICE_ID,
      artifacts: [
        ".tmp/emporio-italia-investigation/extract-invoice-response.json",
        ".tmp/emporio-footer-audit/emporio/extract-invoice-response.json",
        ".tmp/prosciutto-v23-audit/stage-trace.json",
        ".tmp/emporio-discount-column-audit/discount-stage-trace.json",
      ],
      pass_c_discount_pct_extracted: false,
      sample_paccheri: readCachedExtract(null, "emporio")?.body?.items?.[0],
      prosciutto_stage_trace: JSON.parse(
        readFileSync(join(ROOT, ".tmp/prosciutto-v23-audit/stage-trace.json"), "utf8"),
      ).stages?.find((s: { stage: string }) => s.stage === "pass_c_gpt_structured"),
    },
  };

  const out = {
    generated_at: new Date().toISOString(),
    vl_project: "bjhnlrgodcqoyzddbpbd",
    paccheri_pipeline: paccheriPipeline,
    bidfood_findings: bidfoodFindings,
    binding_replay: bindingReplay,
    summary,
    extraction_audit: extractionAudit,
    contract_break_point:
      "Pass C GPT returns discount_pct=null on discounted rows → bindMonetaryColumns preserves gross_unit_price as unit_price → monetaryToInvoiceLineItem strips structured fields → invoice_items stores gross in unit_price → downstream reads unit_price only",
  };

  const outPath = join(ROOT, ".tmp/discount-binding-root-cause-output.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

function readCachedExtract(invoiceId: string | null, kind?: "emporio") {
  const paths =
    kind === "emporio"
      ? [join(ROOT, ".tmp/emporio-italia-investigation/extract-invoice-response.json")]
      : [
          join(ROOT, `.tmp/vl-final-state-audit/extracts/${invoiceId}.json`),
          join(ROOT, `.tmp/passc-implementation/reextract/${invoiceId}.json`),
        ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf8"));
      return raw.body ?? raw;
    } catch {
      /* next */
    }
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
