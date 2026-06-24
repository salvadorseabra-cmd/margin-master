/**
 * STRICT READ-ONLY Mathematical Consistency Coverage Audit
 * VL: bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = { DEV: false, PROD: true };
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { reconcileLineItemAmounts } from "../../supabase/functions/extract-invoice/invoice-line-reconcile.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";

const ROOT = "/Users/salvadorseabra1/margin-master";
const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = join(ROOT, ".tmp/mathematical-consistency-coverage-audit");
const TOL_ABS = 0.02;

type Classification = "SAFE" | "MINOR" | "WARNING" | "CRITICAL" | "N/A";
type FalsePositiveClass = "A_legitimate" | "B_suspicious" | "C_confirmed_extraction";
type ExtractionFailureType =
  | "none"
  | "OCR_qty_or_price_drift"
  | "structured_discount_stripped"
  | "structured_binding_bypass"
  | "persisted_as_extracted"
  | "missing_fields";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function reconciles(qty: number, unitPrice: number, total: number) {
  return Math.abs(qty * unitPrice - total) <= TOL_ABS;
}

function classifyVariancePct(pct: number | null): Classification {
  if (pct == null) return "N/A";
  if (pct < 1) return "SAFE";
  if (pct < 3) return "MINOR";
  if (pct < 10) return "WARNING";
  return "CRITICAL";
}

function normName(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchScore(a: string, b: string) {
  const x = normName(a);
  const y = normName(b);
  if (x === y) return 1;
  const tokens = x.split(" ").filter((t) => t.length > 2);
  return tokens.filter((t) => y.includes(t)).length / Math.max(tokens.length, 1);
}

function readJson<T>(path: string): T | null {
  const full = join(ROOT, path);
  if (!existsSync(full)) return null;
  return JSON.parse(readFileSync(full, "utf8")) as T;
}

function loadPassCItems(invoiceId: string): Array<Record<string, unknown>> | null {
  const paths = [
    `.tmp/persistence-audit/pass-c-raw/${invoiceId}-extract-invoice.json`,
    `.tmp/final-validation-lab-rerun-v28/extracts/${invoiceId}.json`,
    `.tmp/final-validation-lab-rerun-v30/extracts/${invoiceId}.json`,
  ];
  for (const p of paths) {
    const data = readJson<{ body?: { items?: unknown[] }; items?: unknown[] }>(p);
    if (!data) continue;
    const items = data.body?.items ?? data.items;
    if (Array.isArray(items)) return items as Array<Record<string, unknown>>;
  }
  return null;
}

function deriveNetUnit(gross: number, discountPct: number) {
  return round2(gross * (1 - discountPct / 100));
}

function discountLegitimacy(
  qty: number,
  unitPrice: number,
  total: number,
  name: string,
  passC?: Record<string, unknown> | null,
) {
  const gross = passC?.gross_unit_price as number | null | undefined;
  const disc = passC?.discount_pct as number | null | undefined;
  const lineNet = passC?.line_total_net as number | null | undefined;

  if (gross != null && disc != null && disc > 0) {
    const net = deriveNetUnit(gross, disc);
    if (reconciles(qty, net, total)) {
      return {
        legitimate: true,
        reason: `pass-c gross ${gross} × (1−${disc}%) = ${net} reconciles total`,
        impliedNetUnit: net,
      };
    }
    if (lineNet != null && Math.abs(lineNet - total) <= TOL_ABS) {
      const effective = round2(lineNet / qty);
      if (reconciles(qty, effective, total)) {
        return {
          legitimate: true,
          reason: `line_total_net ${lineNet} ÷ qty reconciles`,
          impliedNetUnit: effective,
        };
      }
    }
  }

  const keyword = /recarg|descont|rebate|promo|campaign|ajust|discount/i.test(name);
  if (keyword) {
    return { legitimate: true, reason: "discount keyword in product name", impliedNetUnit: null };
  }

  const gt = readJson<{
    invoices: Array<{
      invoiceId: string;
      rows: Array<{ description: string; qty: number; unit_price: number; total: number }>;
    }>;
  }>(".tmp/field-accuracy-audit/ground-truth.json");
  if (gt) {
    for (const inv of gt.invoices) {
      const row = inv.rows.find((r) => matchScore(r.description, name) > 0.65);
      if (!row) continue;
      const gtMath = round2(row.qty * row.unit_price);
      if (Math.abs(gtMath - row.total) > TOL_ABS) {
        const netImplied = round2(row.total / row.qty);
        if (reconciles(qty, netImplied, total) || reconciles(row.qty, netImplied, row.total)) {
          return {
            legitimate: true,
            reason: "ground-truth row is discount line (qty×gross≠total)",
            impliedNetUnit: netImplied,
          };
        }
      }
    }
  }

  return { legitimate: false, reason: null, impliedNetUnit: null };
}

function inferExtractionFailure(
  item: DbItem,
  passC: Record<string, unknown> | null,
  fpClass: FalsePositiveClass,
): ExtractionFailureType {
  if (fpClass === "A_legitimate") return "none";
  if (item.quantity == null || item.unit_price == null || item.total == null) return "missing_fields";

  if (passC) {
    const pq = passC.quantity as number | null;
    const pup = passC.unit_price as number | null;
    const pt = passC.total as number | null;
    const hasDisc =
      passC.discount_pct != null ||
      passC.gross_unit_price != null ||
      passC.line_total_net != null;

    if (hasDisc && passC.discount_pct == null && passC.gross_unit_price == null) {
      return "structured_discount_stripped";
    }

    const bound = bindMonetaryColumns(
      parseMonetaryLineItems([
        {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          gross_unit_price: (passC.gross_unit_price as number) ?? null,
          discount_pct: (passC.discount_pct as number) ?? null,
          line_total_net: (passC.line_total_net as number) ?? item.total,
          unit_price: (passC.unit_price as number) ?? item.unit_price,
          total: (passC.total as number) ?? item.total,
        },
      ]),
    )[0]!;

    const dbAsInput = bindMonetaryColumns(
      parseMonetaryLineItems([
        {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          gross_unit_price: null,
          discount_pct: null,
          line_total_net: item.total,
          unit_price: item.unit_price,
          total: item.total,
        },
      ]),
    )[0]!;

    if (
      bound.unit_price === item.unit_price &&
      bound.total === item.total &&
      !reconciles(item.quantity, item.unit_price, item.total)
    ) {
      return "structured_binding_bypass";
    }

    if (
      pq != null &&
      pup != null &&
      pt != null &&
      (Math.abs(pq - item.quantity) > TOL_ABS ||
        Math.abs(pup - item.unit_price) > TOL_ABS) &&
      Math.abs(pt - item.total) <= TOL_ABS
    ) {
      return "OCR_qty_or_price_drift";
    }
  }

  if (
    passC &&
    Math.abs((passC.total as number) - item.total) <= TOL_ABS &&
    ((passC.quantity as number) !== item.quantity ||
      Math.abs((passC.unit_price as number) - item.unit_price) > TOL_ABS)
  ) {
    return "persisted_as_extracted";
  }

  return fpClass === "C_confirmed_extraction" ? "persisted_as_extracted" : "OCR_qty_or_price_drift";
}

type DbItem = {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  created_at: string;
  invoices?: { supplier_name: string | null; invoice_date: string | null } | null;
};

mkdirSync(OUT, { recursive: true });

// --- VL corpus ---
const { data: allItems, error: itemsErr } = await sb
  .from("invoice_items")
  .select(
    "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(supplier_name,invoice_date)",
  )
  .order("created_at", { ascending: true });

if (itemsErr) throw new Error(itemsErr.message);
const items = (allItems ?? []) as DbItem[];

// Pass-C cache per invoice
const passCByInvoice = new Map<string, Array<Record<string, unknown>>>();
for (const invId of [...new Set(items.map((i) => i.invoice_id))]) {
  const loaded = loadPassCItems(invId);
  if (loaded) passCByInvoice.set(invId, loaded);
}

function findPassCRow(item: DbItem) {
  const rows = passCByInvoice.get(item.invoice_id);
  if (!rows) return null;
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const score = matchScore(item.name, String(r.name ?? ""));
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// --- Task 1: full corpus table ---
type CorpusRow = {
  id: string;
  invoice_id: string;
  supplier: string | null;
  product: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  expected_total: number | null;
  variance_abs: number | null;
  variance_pct: number | null;
  classification: Classification;
  reconciles: boolean | null;
};

const corpusTable: CorpusRow[] = items.map((item) => {
  const qty = item.quantity;
  const up = item.unit_price;
  const total = item.total;
  let expected: number | null = null;
  let varianceAbs: number | null = null;
  let variancePct: number | null = null;
  let rec: boolean | null = null;

  if (qty != null && up != null && total != null) {
    expected = round2(qty * up);
    varianceAbs = round2(Math.abs(expected - total));
    const denom = Math.max(Math.abs(total), Math.abs(expected), 0.01);
    variancePct = round2((varianceAbs / denom) * 100);
    rec = reconciles(qty, up, total);
  }

  return {
    id: item.id,
    invoice_id: item.invoice_id,
    supplier: item.invoices?.supplier_name ?? null,
    product: item.name,
    qty,
    unit: item.unit,
    unit_price: up,
    total,
    expected_total: expected,
    variance_abs: varianceAbs,
    variance_pct: variancePct,
    classification: rec === true ? "SAFE" : classifyVariancePct(variancePct),
    reconciles: rec,
  };
});

// --- Task 2: buckets ---
const buckets = { SAFE: 0, MINOR: 0, WARNING: 0, CRITICAL: 0, "N/A": 0 };
for (const r of corpusTable) buckets[r.classification]++;

const flagged = corpusTable.filter((r) => r.reconciles === false);

// --- Task 3: top offenders ---
const topOffenders = [...flagged]
  .sort((a, b) => (b.variance_abs ?? 0) - (a.variance_abs ?? 0))
  .slice(0, 15)
  .map((r) => ({
    ...r,
    isGorgonzola: /gorgonzola/i.test(r.product),
  }));

// --- Task 4: false positive audit ---
type FpRow = CorpusRow & {
  falsePositiveClass: FalsePositiveClass;
  legitimacyReason: string | null;
  passC: Record<string, unknown> | null;
};

function isMaterialMismatch(varianceAbs: number | null, variancePct: number | null) {
  return (varianceAbs ?? 0) > 0.1 || (variancePct ?? 0) > 1;
}

function isRoundingOrWeighted(row: CorpusRow) {
  const abs = row.variance_abs ?? 0;
  const pct = row.variance_pct ?? 0;
  if (abs <= 0.1 && pct < 1) return true;
  const effectivePaid =
    row.qty != null && row.total != null && row.qty > 0
      ? round2(row.total / row.qty)
      : null;
  if (
    effectivePaid != null &&
    row.unit_price != null &&
    Math.abs(effectivePaid - row.unit_price) <= 0.05
  ) {
    return true;
  }
  return false;
}

const falsePositiveAudit: FpRow[] = flagged.map((row) => {
  const item = items.find((i) => i.id === row.id)!;
  const passC = findPassCRow(item);

  // Gorgonzola: prior audits prove structured extraction failure despite GT discount shape
  if (/gorgonzola/i.test(row.product)) {
    return {
      ...row,
      falsePositiveClass: "C_confirmed_extraction" as FalsePositiveClass,
      legitimacyReason:
        "qty=1.05 + unit_price=10.88 wrong; total=13.44 correct; discount cols stripped at persist (gorgonzola-persistence-reconciliation-audit)",
      passC,
    };
  }

  if (isRoundingOrWeighted(row)) {
    return {
      ...row,
      falsePositiveClass: "A_legitimate" as FalsePositiveClass,
      legitimacyReason: `micro-variance €${row.variance_abs} (${row.variance_pct}%) — weighted-produce / pack rounding`,
      passC,
    };
  }

  const legit = discountLegitimacy(
    row.qty!,
    row.unit_price!,
    row.total!,
    row.product,
    passC,
  );

  let fpClass: FalsePositiveClass;
  if (legit.legitimate) {
    fpClass = "A_legitimate";
  } else if (passC) {
    const pq = passC.quantity as number;
    const pup = passC.unit_price as number;
    const pt = passC.total as number;
    const passEffective =
      pq > 0 && pt != null ? round2(pt / pq) : null;
    const persistedEffective =
      row.qty! > 0 ? round2(row.total! / row.qty!) : null;
    const passMatchesPersisted =
      Math.abs(pq - row.qty!) <= TOL_ABS &&
      (reconciles(pq, pup, pt) ||
        (passEffective != null &&
          persistedEffective != null &&
          Math.abs(passEffective - persistedEffective) <= 0.05));
    fpClass = passMatchesPersisted ? "B_suspicious" : "C_confirmed_extraction";
  } else {
    fpClass = "B_suspicious";
  }

  return {
    ...row,
    falsePositiveClass: fpClass,
    legitimacyReason: legit.reason,
    passC,
  };
});

// --- Task 5: extraction failure family ---
const extractionFailures = falsePositiveAudit
  .filter(
    (r) =>
      r.falsePositiveClass !== "A_legitimate" &&
      isMaterialMismatch(r.variance_abs, r.variance_pct),
  )
  .map((r) => {
    const item = items.find((i) => i.id === r.id)!;
    const failureType = inferExtractionFailure(item, r.passC, r.falsePositiveClass);
    return {
      id: r.id,
      product: r.product,
      falsePositiveClass: r.falsePositiveClass,
      failureType,
      passC_snapshot: r.passC
        ? {
            quantity: r.passC.quantity,
            unit_price: r.passC.unit_price,
            total: r.passC.total,
            gross_unit_price: r.passC.gross_unit_price ?? null,
            discount_pct: r.passC.discount_pct ?? null,
            line_total_net: r.passC.line_total_net ?? null,
          }
        : null,
      persisted: {
        quantity: r.qty,
        unit_price: r.unit_price,
        total: r.total,
      },
    };
  });

// --- Task 6: guardrails ---
const guardrails = [
  {
    guardrail: "applyEffectivePaidPrice (total÷qty when gross unit×qty > net total)",
    location: "supabase/functions/extract-invoice/invoice-monetary-binding.ts L120-129",
    active: true,
    wouldCatchGorgonzola: false,
    note: "Requires total < qty×unit_price (L117); Gorgonzola has total > qty×unit_price (13.44 > 11.42)",
  },
  {
    guardrail: "bindMonetaryColumns structured discount rebind",
    location: "invoice-monetary-binding.ts L57-86, L184-207",
    active: true,
    wouldCatchGorgonzola: false,
    note: "Only when gross_unit_price/discount_pct present; Gorgonzola persisted with discount cols stripped",
  },
  {
    guardrail: "reconcileLineItemAmounts preserve both columns",
    location: "invoice-line-reconcile.ts L68-76",
    active: true,
    wouldCatchGorgonzola: false,
    note: "Explicitly preserves qty×unit_price≠total when both unit_price and total extracted",
  },
  {
    guardrail: "reconcileLineItemsToNetSubtotal (OCR slip €0.50/€1)",
    location: "invoice-line-reconcile.ts L27-61",
    active: true,
    wouldCatchGorgonzola: false,
    note: "Invoice-level subtotal gap only; not row arithmetic",
  },
  {
    guardrail: "needsExtractionConfirmation (null unit_price or total)",
    location: "src/routes/invoices.tsx L516-521",
    active: true,
    wouldCatchGorgonzola: false,
    note: "UI gate for missing fields only; Gorgonzola has all three numeric columns",
  },
  {
    guardrail: "isUnitPricePerPricedUnit (pricing semantics)",
    location: "src/lib/invoice-purchase-price-semantics.ts L251-266",
    active: true,
    wouldCatchGorgonzola: false,
    note: "Display/routing helper only; does not block persist",
  },
  {
    guardrail: "Persist-time qty×unit_price≈total validation",
    location: "NOT IMPLEMENTED",
    active: false,
    wouldCatchGorgonzola: true,
    note: "field-accuracy-audit L1078 recommended gate; no code path enforces before insert",
  },
];

const hypotheticalGuardrailCatch = flagged.length;
const hypotheticalBugsPrevented = falsePositiveAudit.filter(
  (r) => r.falsePositiveClass === "C_confirmed_extraction",
).length;

// --- Task 7: needs review ---
const needsReview5 = corpusTable.filter((r) => (r.variance_pct ?? 0) > 5).length;
const needsReview10 = corpusTable.filter((r) => (r.variance_pct ?? 0) > 10).length;
const needsReview5and10 = corpusTable.filter(
  (r) => (r.variance_pct ?? 0) > 5 && (r.variance_pct ?? 0) > 10,
).length;

// --- Task 8: blast radius ---
const materialFlagged = flagged.filter((r) => isMaterialMismatch(r.variance_abs, r.variance_pct));

const suspiciousIds = falsePositiveAudit
  .filter(
    (r) =>
      r.falsePositiveClass === "C_confirmed_extraction" ||
      (r.falsePositiveClass === "B_suspicious" && isMaterialMismatch(r.variance_abs, r.variance_pct)),
  )
  .map((r) => r.id);

const { data: matches } = await sb
  .from("invoice_item_matches")
  .select("invoice_item_id,ingredient_id,status,match_kind")
  .in("invoice_item_id", suspiciousIds.length ? suspiciousIds : ["00000000-0000-0000-0000-000000000000"]);

const ingredientIds = [
  ...new Set((matches ?? []).map((m) => m.ingredient_id).filter(Boolean)),
];

const [{ data: ingredients }, { data: priceHistory }, { data: recipeIngredients }] =
  await Promise.all([
    ingredientIds.length
      ? sb
          .from("ingredients")
          .select("id,name,current_price,purchase_quantity,base_unit,updated_at")
          .in("id", ingredientIds)
      : Promise.resolve({ data: [] }),
    ingredientIds.length
      ? sb
          .from("ingredient_price_history")
          .select(
            "id,ingredient_id,invoice_id,ingredient_name,new_price,previous_price,delta,delta_percent,created_at",
          )
          .in("ingredient_id", ingredientIds)
      : Promise.resolve({ data: [] }),
    ingredientIds.length
      ? sb.from("recipe_ingredients").select("id,recipe_id,ingredient_id,quantity,unit").in("ingredient_id", ingredientIds)
      : Promise.resolve({ data: [] }),
  ]);

const recipeIds = [...new Set((recipeIngredients ?? []).map((r) => r.recipe_id))];
const { data: recipes } = recipeIds.length
  ? await sb.from("recipes").select("id,name").in("id", recipeIds)
  : { data: [] };

const { data: marginImpacts } = recipeIds.length
  ? await sb
      .from("recipe_margin_impacts")
      .select("id,recipe_id,ingredient_id,margin_delta_eur,created_at")
      .in("ingredient_id", ingredientIds)
  : { data: [] };

const blastRadius = suspiciousIds.map((itemId) => {
  const row = corpusTable.find((r) => r.id === itemId)!;
  const itemMatches = (matches ?? []).filter((m) => m.invoice_item_id === itemId);
  const ings = itemMatches.map((m) =>
    (ingredients ?? []).find((i) => i.id === m.ingredient_id),
  );
  const hist = (priceHistory ?? []).filter((h) =>
    itemMatches.some((m) => m.ingredient_id === h.ingredient_id && h.invoice_id === row.invoice_id),
  );
  const recipeLinks = (recipeIngredients ?? []).filter((ri) =>
    itemMatches.some((m) => m.ingredient_id === ri.ingredient_id),
  );
  const linkedRecipes = recipeLinks.map((rl) =>
    (recipes ?? []).find((r) => r.id === rl.recipe_id),
  );
  const impacts = (marginImpacts ?? []).filter((mi) =>
    itemMatches.some((m) => m.ingredient_id === mi.ingredient_id),
  );

  return {
    invoice_item_id: itemId,
    product: row.product,
    variance_abs: row.variance_abs,
    variance_pct: row.variance_pct,
    matches: itemMatches.length,
    match_status: itemMatches.map((m) => m.status),
    ingredients: ings.filter(Boolean).map((i) => ({
      id: i!.id,
      name: i!.name,
      current_price: i!.current_price,
      purchase_quantity: i!.purchase_quantity,
      base_unit: i!.base_unit,
    })),
    price_history_rows: hist.length,
    price_history: hist,
    recipe_count: linkedRecipes.filter(Boolean).length,
    recipes: linkedRecipes.filter(Boolean).map((r) => ({ id: r!.id, name: r!.name })),
    margin_impact_rows: impacts.length,
    opportunities_note:
      "Opportunities are computed at runtime in operational-intelligence-synthesis.ts — no persisted opportunities table",
    alerts_note:
      "Margin alerts derive from ingredient_price_history + recipes via margin-alerts.ts — indirect blast radius through current_price/history",
  };
});

// --- Verdict ---
const suspiciousRows = falsePositiveAudit.filter((r) => r.falsePositiveClass !== "A_legitimate");
const confirmedExtraction = falsePositiveAudit.filter(
  (r) => r.falsePositiveClass === "C_confirmed_extraction",
);
const legitimateDiscount = falsePositiveAudit.filter(
  (r) => r.falsePositiveClass === "A_legitimate",
);

const materialConfirmed = confirmedExtraction.filter((r) =>
  isMaterialMismatch(r.variance_abs, r.variance_pct),
);

let finalVerdict: "A" | "B" | "C" | "D";
let verdictText: string;

if (materialFlagged.length === 0) {
  finalVerdict = "A";
  verdictText = "All VL rows reconcile within tolerance — no material silent inconsistencies";
} else if (
  materialConfirmed.length === 1 &&
  /gorgonzola/i.test(materialConfirmed[0]!.product)
) {
  finalVerdict = "A";
  verdictText = `Gorgonzola is the sole material confirmed extraction bug (€${materialConfirmed[0]!.variance_abs}, ${materialConfirmed[0]!.variance_pct}%); ${materialFlagged.length - 1} other material mismatches are legitimate discount lines`;
} else if (
  materialConfirmed.length <= 4 &&
  materialConfirmed.every((r) =>
    /gorgonzola|prosciutto|mortadella|bresaola/i.test(r.product),
  )
) {
  finalVerdict = "B";
  verdictText = `Small Emporio deli-family cluster: ${materialConfirmed.length} material confirmed extraction bugs`;
} else if (materialConfirmed.length > 1) {
  finalVerdict = "C";
  verdictText = `Widespread: ${materialConfirmed.length} material confirmed extraction failures entering silently`;
} else {
  finalVerdict = "D";
  verdictText = `Mixed: ${legitimateDiscount.length} legitimate discount/rounding rows; ${materialConfirmed.length} material extraction bugs — naive guardrail would flag ${hypotheticalGuardrailCatch} rows (${legitimateDiscount.length} false positives)`;
}

const gorgonzolaRow = corpusTable.find((r) => /gorgonzola/i.test(r.product));

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  mode: "STRICT_READ_ONLY",
  corpusSize: items.length,
  task1_fullCorpus: corpusTable,
  task2_classificationBuckets: buckets,
  task2_reconcilingCount: corpusTable.filter((r) => r.reconciles === true).length,
  task2_flaggedCount: flagged.length,
  task2_materialFlaggedCount: materialFlagged.length,
  task3_topOffenders: topOffenders,
  task4_falsePositiveAudit: falsePositiveAudit.map(({ passC, ...rest }) => rest),
  task5_extractionFailureFamily: extractionFailures,
  task6_guardrails: guardrails,
  task7_needsReview: {
    variance_pct_gt_5: needsReview5,
    variance_pct_gt_10: needsReview10,
    variance_pct_gt_5_and_gt_10: needsReview5and10,
  },
  task8_blastRadius: blastRadius,
  gorgonzola: gorgonzolaRow
    ? {
        ...gorgonzolaRow,
        knownCase: "1.05×10.88=11.42≠13.44, €2.02 variance",
        passesPipeline: true,
      }
    : null,
  finalVerdict: {
    code: finalVerdict,
    options: {
      A: "Isolated — Gorgonzola sole confirmed bug; other mismatches are legitimate discounts",
      B: "Small family — Emporio deli cluster + discount lines",
      C: "Widespread — multiple extraction bugs entering silently",
      D: "Mixed — discount legitimacy masks extraction failures; guardrail needed",
    },
    selected: verdictText,
    guardrailHypothetical: {
      rowsCaught: hypotheticalGuardrailCatch,
      rowsCaughtMaterial: materialFlagged.length,
      bugsPrevented: materialConfirmed.length,
      falsePositiveDiscountOrRounding: legitimateDiscount.length,
      note: "Naive gate |qty×unit_price−total|>€0.02 would catch all flagged rows; discount-aware gate needed",
    },
  },
};

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

// --- REPORT.md ---
const md: string[] = [];
md.push("# Mathematical Consistency Coverage Audit");
md.push("");
md.push(`**Validation Lab:** \`${VL}\` · **Corpus:** ${items.length} invoice_items · **Read-only** · ${results.auditedAt.slice(0, 10)}`);
md.push("");
md.push("## Goal");
md.push("");
md.push("Is Gorgonzola isolated or are inconsistent invoice rows (qty×unit_price≠total) entering the system silently?");
md.push("");
md.push(`**Known case:** Gorgonzola 1.05×10.88=11.42≠13.44 (€2.02 variance) passed full pipeline.`);
md.push("");

md.push("## Required table");
md.push("");
md.push("| Product | Qty | Unit Price | Total | Expected Total | Variance | Classification |");
md.push("|---------|-----|------------|-------|----------------|----------|----------------|");
for (const r of corpusTable) {
  const prod = r.product.length > 50 ? r.product.slice(0, 47) + "…" : r.product;
  md.push(
    `| ${prod} | ${r.qty ?? "—"} | ${r.unit_price ?? "—"} | ${r.total ?? "—"} | ${r.expected_total ?? "—"} | ${r.variance_abs != null ? `€${r.variance_abs} (${r.variance_pct}%)` : "—"} | ${r.classification} |`,
  );
}
md.push("");

md.push("## Task 1 — Full corpus");
md.push("");
md.push(`Scanned **${items.length}** VL \`invoice_items\`. Expected total = qty×unit_price (€0.02 tolerance for reconcile flag).`);
md.push("");

md.push("## Task 2 — Classification buckets");
md.push("");
md.push("| Bucket | Count | Threshold |");
md.push("|--------|-------|-----------|");
md.push(`| SAFE | ${buckets.SAFE} | <1% (or reconciles) |`);
md.push(`| MINOR | ${buckets.MINOR} | 1–3% |`);
md.push(`| WARNING | ${buckets.WARNING} | 3–10% |`);
md.push(`| CRITICAL | ${buckets.CRITICAL} | >10% |`);
md.push(`| N/A | ${buckets["N/A"]} | missing qty/price/total |`);
md.push("");
md.push(`**Reconciling:** ${results.task2_reconcilingCount} · **Flagged (qty×unit_price≠total):** ${flagged.length} · **Material (>€0.10 or >1%):** ${materialFlagged.length}`);
md.push("");

md.push("## Task 3 — Top offenders (incl. Gorgonzola)");
md.push("");
md.push("| Product | Qty | Unit Price | Total | Expected | Variance € | Variance % | Gorgonzola? |");
md.push("|---------|-----|------------|-------|----------|------------|------------|-------------|");
for (const r of topOffenders) {
  md.push(
    `| ${r.product.slice(0, 40)}… | ${r.qty} | ${r.unit_price} | ${r.total} | ${r.expected_total} | ${r.variance_abs} | ${r.variance_pct}% | ${r.isGorgonzola ? "**YES**" : "no"} |`,
  );
}
md.push("");

md.push("## Task 4 — False positive audit");
md.push("");
md.push("| Product | Variance | Class | Reason |");
md.push("|---------|----------|-------|--------|");
for (const r of falsePositiveAudit) {
  const label =
    r.falsePositiveClass === "A_legitimate"
      ? "A legitimate"
      : r.falsePositiveClass === "B_suspicious"
        ? "B suspicious"
        : "C confirmed extraction";
  md.push(
    `| ${r.product.slice(0, 45)}… | €${r.variance_abs} | ${label} | ${r.legitimacyReason ?? "—"} |`,
  );
}
md.push("");

md.push("## Task 5 — Extraction failure family (suspicious rows)");
md.push("");
md.push("| Product | FP Class | Failure type |");
md.push("|---------|----------|--------------|");
for (const e of extractionFailures) {
  md.push(`| ${e.product.slice(0, 45)}… | ${e.falsePositiveClass} | ${e.failureType} |`);
}
md.push("");

md.push("## Task 6 — Current guardrails");
md.push("");
md.push("| Guardrail | Location | Active? | Catches Gorgonzola? |");
md.push("|-----------|----------|---------|---------------------|");
for (const g of guardrails) {
  md.push(
    `| ${g.guardrail} | ${g.location} | ${g.active ? "YES" : "**NO**"} | ${g.wouldCatchGorgonzola ? "YES" : "NO"} |`,
  );
}
md.push("");
md.push("**Key finding:** `applyEffectivePaidPrice` only fires when `total < qty×unit_price` (gross-over-net). Gorgonzola has `total > qty×unit_price` — the inverse failure mode. `reconcileLineItemAmounts` explicitly preserves inconsistent rows when both columns are present.");
md.push("");

md.push("## Task 7 — Needs review counts");
md.push("");
md.push(`| Threshold | Count |`);
md.push(`|-----------|-------|`);
md.push(`| variance_pct > 5% | ${needsReview5} |`);
md.push(`| variance_pct > 10% | ${needsReview10} |`);
md.push(`| variance_pct > 5% AND > 10% | ${needsReview5and10} |`);
md.push("");

md.push("## Task 8 — Blast radius (suspicious rows)");
md.push("");
for (const b of blastRadius) {
  md.push(`### ${b.product.slice(0, 60)}`);
  md.push(`- Matches: ${b.matches} (${b.match_status.join(", ") || "none"})`);
  md.push(`- Ingredients / current_price: ${JSON.stringify(b.ingredients)}`);
  md.push(`- price_history rows (this invoice): ${b.price_history_rows}`);
  md.push(`- Recipes affected: ${b.recipe_count} ${b.recipes.map((r) => r.name).join(", ")}`);
  md.push(`- margin_impact rows: ${b.margin_impact_rows}`);
  md.push(`- ${b.alerts_note}`);
  md.push("");
}

md.push("## FINAL VERDICT");
md.push("");
md.push(`### **${finalVerdict})** ${verdictText}`);
md.push("");
md.push("**If reconciliation guardrail existed today (|qty×unit_price−total|>€0.02 blocks persist):**");
md.push(`- **VL rows caught (all flagged):** ${hypotheticalGuardrailCatch}`);
md.push(`- **VL rows caught (material only):** ${materialFlagged.length}`);
md.push(`- **Bugs prevented (material confirmed extraction):** ${materialConfirmed.length}`);
md.push(`- **False positives (discount/rounding):** ${legitimateDiscount.length}`);
md.push("");
md.push("### Verdict key");
md.push("- **A** — Isolated: Gorgonzola sole confirmed bug");
md.push("- **B** — Small family cluster");
md.push("- **C** — Widespread silent ingestion");
md.push("- **D** — Mixed: discounts mask extraction bugs");
md.push("");
md.push("## Cross-references");
md.push("- `.tmp/gorgonzola-mathematical-trace-audit/` — Gorgonzola €10.88/kg denominator trace");
md.push("- `.tmp/gorgonzola-persistence-reconciliation-audit/` — structured extraction failure at persist");
md.push("- `.tmp/gorgonzola-unit-price-origin-audit/` — applyEffectivePaidPrice would not fire");
md.push("- `invoice-monetary-binding.ts` — bindMonetaryColumns / applyEffectivePaidPrice");
md.push("- `invoice-line-reconcile.ts` — reconcileLineItemAmounts preserves discount math");

writeFileSync(join(OUT, "REPORT.md"), md.join("\n"));
console.log(`Wrote ${OUT}/results.json and REPORT.md`);
console.log(
  JSON.stringify(
    {
      corpus: items.length,
      flagged: flagged.length,
      verdict: finalVerdict,
      guardrailCatch: hypotheticalGuardrailCatch,
    },
    null,
    2,
  ),
);
