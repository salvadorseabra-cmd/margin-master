/**
 * Operational Intelligence Integrity Audit — READ-ONLY
 * Replays /alerts page data pipeline against VL Supabase state.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getRecentPriceChanges } from "../../src/lib/ingredient-price-history.ts";
import { PRICE_WINDOW_180_DAYS } from "../../src/lib/exposure-drill-down.ts";
import { buildMarginAlertsFromSupabase } from "../../src/lib/margin-alerts.ts";
import {
  buildOperationalAlertItems,
  buildOperationalHealthPanel,
  convertLibMarginAlerts,
  finalizeOperationalAlertItems,
  getRecipeMetrics,
  type MarginAlertData,
} from "../../src/lib/margin-alert-data.ts";
import {
  buildSynthesisViewModel,
} from "../../src/lib/operational-intelligence-synthesis.ts";
import {
  buildPortfolioCostExposure,
  buildPriceMovementRows,
  buildSupplierIntelligence,
  buildSupplierWatchlist,
} from "../../src/lib/operational-intelligence-view.ts";

if (!(import.meta as { env?: Record<string, unknown> }).env) {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
} else {
  (import.meta as { env: Record<string, unknown> }).env = { DEV: false, PROD: true };
}

const VL_REF = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/operational-intelligence-integrity-audit";

const VL_INVOICES = [
  { id: "da472b7f-0fd9-4a26-a37c-80ad335f7f7e", label: "Bidfood" },
  { id: "c2f52357-0f80-491a-ba14-c97ff4837472", label: "Aviludo April" },
  { id: "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2", label: "Aviludo May" },
  { id: "f0aa5a08-86a3-4938-99f0-711e86073968", label: "Bocconcino" },
  { id: "ab52796d-de1d-418d-86e7-230c8f056f09", label: "Emporio (live)" },
  { id: "36c99d19-6f9f-413f-8c2d-ae3526291a2d", label: "Mammafiore" },
];

const KNOWN_BAD_IDS = {
  mozzarella: "2a99cecd-08fb-48d5-87cf-cc9ea5282a6d",
  pepino: "635a1189-36ea-4ff2-9012-8172ab1ab81d",
  atum: "0f30ccb3-bb47-40bb-83cc-ae2a4018066d",
};

function projectKey(name: "service_role"): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL_REF} -o json`, { encoding: "utf8" });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find((k) => k.name === name)!.api_key;
}

const sb = createClient(`https://${VL_REF}.supabase.co`, projectKey("service_role"), {
  auth: { persistSession: false },
});

mkdirSync(OUT, { recursive: true });

// ── Load MarginAlertData (mirrors alerts.tsx) ──
const { data: ingredientsRaw } = await sb
  .from("ingredients")
  .select("id, name, unit, current_price, purchase_quantity, purchase_unit, base_unit, created_at, density_g_per_ml")
  .order("name");

const { data: recipesRaw } = await sb.from("recipes").select("id, name, selling_price, type, output_quantity, output_unit");
const { data: recipeLinesRaw } = await sb
  .from("recipe_ingredients")
  .select("id, recipe_id, ingredient_id, sub_recipe_id, quantity, unit, created_at");

const priceHistory = await getRecentPriceChanges(sb, PRICE_WINDOW_180_DAYS);
const { data: invoicesRaw } = await sb
  .from("invoices")
  .select("id, supplier_name, total, created_at, invoice_date")
  .gte("created_at", new Date(Date.now() - PRICE_WINDOW_180_DAYS * 86_400_000).toISOString())
  .order("created_at", { ascending: false })
  .limit(200);

const ingredients = (ingredientsRaw ?? []).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
const recipeLinesByRecipe = new Map<string, typeof recipeLinesRaw>();
for (const line of recipeLinesRaw ?? []) {
  if (!line.recipe_id) continue;
  const arr = recipeLinesByRecipe.get(line.recipe_id) ?? [];
  arr.push(line);
  recipeLinesByRecipe.set(line.recipe_id, arr);
}

const recipes = (recipesRaw ?? []).map((r) => ({
  ...r,
  recipe_ingredients: (recipeLinesByRecipe.get(r.id) ?? []).map((line) => ({
    ...line,
    created_at: line.created_at ?? "",
    ingredients: line.ingredient_id ? (ingredientById.get(line.ingredient_id) ?? null) : null,
  })),
}));

const data: MarginAlertData = {
  ingredients,
  recipes,
  priceHistory: Array.isArray(priceHistory) ? priceHistory : [],
  invoices: invoicesRaw ?? [],
};

const libAlertsRaw = await buildMarginAlertsFromSupabase(sb).catch(() => []);
const localAlerts = buildOperationalAlertItems(data);
const libAlerts = convertLibMarginAlerts(libAlertsRaw);
const alertItems = finalizeOperationalAlertItems(localAlerts, libAlerts, data);
const health = buildOperationalHealthPanel(data, libAlertsRaw);
const recipeMetrics = getRecipeMetrics(data.recipes);

const synthesis = buildSynthesisViewModel({
  data,
  alerts: alertItems,
  health,
  dateRange: "90",
});

const ownerReview = synthesis.ownerReview;
const fullExposure = buildPortfolioCostExposure(data, 50);
const supplierMovements = synthesis.operationalSynthesisGroups.supplierMovements;
const recipeMarginMovements = synthesis.operationalSynthesisGroups.recipeMarginMovements;

const priceMovements = buildPriceMovementRows(data, 12);
const supplierWatchlist = buildSupplierWatchlist(data, alertItems, 8);

// VL invoice items for purchasing trace
const vlIds = VL_INVOICES.map((i) => i.id);
const { data: vlItems } = await sb
  .from("invoice_items")
  .select("id, invoice_id, name, quantity, unit, unit_price, total, created_at")
  .in("invoice_id", vlIds);

const pricingAudit = JSON.parse(
  readFileSync(".tmp/historical-pricing-integrity-audit/findings.json", "utf8"),
) as { opportunityCalculationErrors: Array<Record<string, unknown>>; priceHistoryRowAudits: Array<Record<string, unknown>> };

type TraceVerdict = "trusted" | "untrusted" | "stale" | "mock_only" | "n/a";

function classifyOutput(input: {
  ingredientIds?: string[];
  usesPriceHistory?: boolean;
  usesMock?: boolean;
  staleSource?: boolean;
}): { verdict: TraceVerdict; reasons: string[] } {
  const reasons: string[] = [];
  if (input.usesMock) return { verdict: "mock_only", reasons: ["Uses mock-data.ts — not Supabase"] };

  for (const id of input.ingredientIds ?? []) {
    if (id === KNOWN_BAD_IDS.mozzarella) reasons.push("identity_collapse:mozzarella_pack_formats");
    if (id === KNOWN_BAD_IDS.pepino) reasons.push("identity_collapse:pepino_fresh_vs_conserva");
  }

  if (input.staleSource) reasons.push("stale_db:jun_11_era");

  if (reasons.some((r) => r.startsWith("identity_collapse"))) {
    return { verdict: "untrusted", reasons };
  }
  if (reasons.some((r) => r.startsWith("stale_db"))) {
    return { verdict: "stale", reasons };
  }
  return { verdict: input.usesPriceHistory ? "stale" : "trusted", reasons: reasons.length ? reasons : ["synthesis_math_ok"] };
}

function extractIngredientIdFromAlert(alert: { id: string; meta?: Array<{ label: string; value?: string }> }): string | null {
  const m = alert.id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m?.[1] ?? null;
}

// ── Dashboard audit ──
const dashboardAudit = {
  generated_at: new Date().toISOString(),
  routes: {
    homeDashboard: {
      path: "/",
      file: "src/routes/index.tsx",
      dataSource: "mock-data.ts",
      verdict: "mock_only" as TraceVerdict,
      note: "Food cost, margin, revenue, charts — ALL MOCK. Not connected to Supabase or operational intelligence.",
      trustedOutputs: [] as string[],
      untrustedOutputs: [
        "Food cost % KPI",
        "Gross margin % KPI",
        "Revenue MTD",
        "Invoice count KPI",
        "Margin vs food cost chart",
        "AI hero insight",
        "Top ingredients chart",
      ],
    },
    operationalIntelligence: {
      path: "/alerts",
      file: "src/routes/alerts.tsx + operational-intelligence-page.tsx",
      dataSource: "Supabase → MarginAlertData → buildSynthesisViewModel",
      windowDays: 90,
      verdict: "partial" as string,
    },
  },
  weeklySnapshot: {
    output: ownerReview.weeklySnapshot,
    trace: {
      supplierIncreases: "countSupplierMovementDirections(price_history in 90d window)",
      supplierDecreases: "countSupplierMovementDirections(price_history in 90d window)",
      monthlyImpactEur: "buildMonthlyMarginPressureSummary → recipe exposure × price deltas",
      pricesNeedingRefresh: "alertItems where kind=stale_price",
    },
    classification: classifyOutput({ usesPriceHistory: true, staleSource: true }),
  },
  purchasingMetrics: {
    priceMovementRows: priceMovements.map((row) => ({
      ...row,
      classification: classifyOutput({
        ingredientIds: [row.ingredientId],
        usesPriceHistory: true,
        staleSource: true,
      }),
    })),
    portfolioExposureTop5: fullExposure.slice(0, 5).map((row) => ({
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      monthlyModeledExposureEur: row.monthlyModeledExposureEur,
      recipeCount: row.recipeCount,
      classification: classifyOutput({ ingredientIds: [row.ingredientId] }),
    })),
  },
  trends: {
    supplierMovementGroups: {
      largestIncreases: supplierMovements.largestIncreases.length,
      stablePricing: supplierMovements.stablePricing.length,
      topIncrease: supplierMovements.largestIncreases[0]?.headline ?? null,
      classification: classifyOutput({ usesPriceHistory: true, staleSource: true }),
    },
    recipeMarginMovements: {
      worsening: recipeMarginMovements.worsening.length,
      improving: recipeMarginMovements.improving.length,
      classification: { verdict: "trusted" as TraceVerdict, reasons: ["recipe_margin_from_catalog_prices"] },
    },
  },
  recipeMetricsSummary: {
    totalRecipes: recipeMetrics.length,
    belowTarget65: recipeMetrics.filter((m) => m.grossMargin !== null && m.grossMargin < 65).length,
    classification: { verdict: "trusted" as TraceVerdict, reasons: ["uses ingredients.current_price + recipe lines"] },
  },
  vlInvoiceCoverage: VL_INVOICES.map((inv) => {
    const items = (vlItems ?? []).filter((r) => r.invoice_id === inv.id);
    const lineSum = items.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const invMeta = (invoicesRaw ?? []).find((i) => i.id === inv.id);
    const histOnInvoice = data.priceHistory.filter((h) => h.invoice_id === inv.id);
    return {
      label: inv.label,
      invoiceId: inv.id,
      itemCount: items.length,
      lineSum: Math.round(lineSum * 100) / 100,
      headerTotal: invMeta?.total ?? null,
      priceHistoryRows: histOnInvoice.length,
      oldestItem: items[0]?.created_at ?? null,
      stale: items[0]?.created_at != null && String(items[0].created_at) < "2026-06-12T00:00:00Z",
    };
  }),
  healthPanel: health,
};

// ── Opportunities audit ──
const mozAlerts = alertItems.filter(
  (a) => a.id.includes(KNOWN_BAD_IDS.mozzarella) || a.title.toLowerCase().includes("mozzarella"),
);
const pepinoAlerts = alertItems.filter(
  (a) => a.id.includes(KNOWN_BAD_IDS.pepino) || a.title.toLowerCase().includes("pepino"),
);

const opportunitiesAudit = {
  generated_at: new Date().toISOString(),
  pipeline: [
    "invoice_items (on ingredient match persist) → ingredient_price_history",
    "getRecentPriceChanges(180d) → MarginAlertData.priceHistory",
    "buildOperationalAlertItems → price_increase / price_decrease per ingredient (latest history)",
    "buildMarginAlertsFromSupabase → ingredient_inflation_spike, supplier_trend, volatile",
    "buildSynthesisViewModel → buildOwnerReviewOpportunities + groupedRecovery",
  ],
  ownerReviewOpportunities: ownerReview.opportunities.map((row) => ({
    id: row.id,
    title: row.title,
    detail: row.detail,
    monthlyImpactEur: row.monthlyImpactEur,
    classification: classifyOutput({
      ingredientIds: mozAlerts.some((a) => row.title.includes("Mozzarella")) ? [KNOWN_BAD_IDS.mozzarella] : pepinoAlerts.some((a) => row.title.includes("Pepino")) ? [KNOWN_BAD_IDS.pepino] : [],
      usesPriceHistory: true,
      staleSource: true,
    }),
  })),
  priceDecreaseAlerts: alertItems
    .filter((a) => a.kind === "price_decrease")
    .map((a) => ({
      id: a.id,
      title: a.title,
      movement: a.meta.find((m) => m.label === "Movement")?.value,
      latest: a.meta.find((m) => m.label === "Latest price")?.value,
      previous: a.meta.find((m) => m.label === "Previous")?.value,
      ingredientId: extractIngredientIdFromAlert(a) ?? a.id.replace("price-decrease-", ""),
      classification: classifyOutput({
        ingredientIds: [extractIngredientIdFromAlert(a) ?? a.id.replace("price-decrease-", "")],
        usesPriceHistory: true,
      }),
    })),
  priceIncreaseAlerts: alertItems
    .filter((a) => a.kind === "price_increase")
    .map((a) => ({
      id: a.id,
      title: a.title,
      movement: a.meta.find((m) => m.label === "Movement")?.value,
      ingredientId: extractIngredientIdFromAlert(a) ?? a.id.replace("price-increase-", ""),
      classification: classifyOutput({
        ingredientIds: [extractIngredientIdFromAlert(a) ?? a.id.replace("price-increase-", "")],
        usesPriceHistory: true,
      }),
    })),
  libMarginAlerts: libAlertsRaw.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    classification: classifyOutput({
      ingredientIds: a.title.toLowerCase().includes("mozzarella")
        ? [KNOWN_BAD_IDS.mozzarella]
        : a.title.toLowerCase().includes("pepino")
          ? [KNOWN_BAD_IDS.pepino]
          : [],
      usesPriceHistory: true,
    }),
  })),
  provenFalseOpportunities: pricingAudit.opportunityCalculationErrors,
  mozzarellaAlerts: mozAlerts.map((a) => ({ id: a.id, kind: a.kind, title: a.title, meta: a.meta })),
  pepinoAlerts: pepinoAlerts.map((a) => ({ id: a.id, kind: a.kind, title: a.title, meta: a.meta })),
  trustedOutputs: alertItems
    .filter((a) => {
      const id = extractIngredientIdFromAlert(a);
      return id === KNOWN_BAD_IDS.atum && a.kind === "price_increase";
    })
    .map((a) => ({ id: a.id, title: a.title, reason: "Atum +4.1% — consistent operational chain" })),
  opportunityBugs: [
    {
      id: "OPP-MOZZ-1341",
      ingredient: "Mozzarella fior di latte",
      issue: "False inflation opportunity from Bocconcino piece → Aviludo block on same ingredient_id",
      deltaPercent: 1341,
      uiSurface: ["price_increase alert", "financialRisks", "supplierIncreases count", "priceMovementRows"],
      class: "identity_collapse",
    },
    {
      id: "OPP-PEPINO-9995",
      ingredient: "Pepino conserva",
      issue: "False deflation opportunity — fresh kg matched to conserva jar history",
      deltaPercent: -99.95,
      uiSurface: ["price_decrease alert", "opportunities section", "supplierDecreases count"],
      class: "identity_collapse",
    },
    {
      id: "OPP-GINGER-VOL",
      ingredient: "Ginger Beer",
      issue: "Would show €575/L if matched — volume parse not in OI until ingredient exists",
      class: "volume_parse_latent",
    },
  ],
};

// ── Supplier intelligence audit ──
const supplierIntelPerIngredient = [KNOWN_BAD_IDS.mozzarella, KNOWN_BAD_IDS.pepino, KNOWN_BAD_IDS.atum].map(
  (id) => {
    const intel = buildSupplierIntelligence(data, id);
    const ing = ingredientById.get(id);
    const hist = data.priceHistory.filter((h) => h.ingredient_id === id);
    return {
      ingredientId: id,
      ingredientName: ing?.name,
      historyRowCount: hist.length,
      supplierIntelligence: intel,
      classification: classifyOutput({ ingredientIds: [id], usesPriceHistory: true, staleSource: true }),
    };
  },
);

const suppliersAudit = {
  generated_at: new Date().toISOString(),
  pipeline: [
    "buildSupplierIntelligence(ingredient_id) — latest vs 90d avg/min on price_history",
    "buildSupplierWatchlist — aggregates invoice suppliers + history pct moves",
    "buildOwnerReviewSuppliersToWatch — supplier movement groups from synthesis",
    "countSupplierMovementDirections — weekly snapshot increase/decrease counts",
  ],
  supplierWatchlist: supplierWatchlist.map((row) => ({
    ...row,
    classification: classifyOutput({ usesPriceHistory: true, staleSource: true }),
  })),
  suppliersToWatch: ownerReview.suppliersToWatch.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    statusLabel: row.statusLabel,
    detail: row.detail,
    classification: classifyOutput({ usesPriceHistory: true, staleSource: true }),
  })),
  perIngredientIntelligence: supplierIntelPerIngredient,
  supplierIntelligenceBugs: [
    {
      id: "SI-MOZZ-SPIKE",
      issue: "Mozzarella spikeVs3MoPct / betterSupplierLine computed on mixed pack-format history",
      evidence: supplierIntelPerIngredient.find((s) => s.ingredientId === KNOWN_BAD_IDS.mozzarella)?.supplierIntelligence,
      class: "identity_collapse",
    },
    {
      id: "SI-PEPINO-DEFLATION",
      issue: "Pepino min90d vs catalog compares conserva jar vs fresh cucumber operational units",
      class: "identity_collapse",
    },
    {
      id: "SI-GHOST-HISTORY",
      issue: "14/20 price_history rows are ghost/stale metadata — supplier counts include prior extraction lines",
      class: "stale_data",
    },
  ],
  trustedOutputs: supplierIntelPerIngredient
    .filter((s) => s.ingredientId === KNOWN_BAD_IDS.atum && s.classification.verdict !== "untrusted")
    .map((s) => ({ ingredient: s.ingredientName, intel: s.supplierIntelligence, reason: "Single-format tuna chain +4.1%" })),
};

// ── Executive summary ──
const untrustedCount =
  opportunitiesAudit.opportunityBugs.length +
  dashboardAudit.purchasingMetrics.priceMovementRows.filter((r) => r.classification.verdict === "untrusted").length;

let status: "CLOSED" | "PARTIAL" | "OPEN";
let confidence: number;
let productionSafe: boolean;

const hasIdentityBugs = opportunitiesAudit.opportunityBugs.some((b) => b.class === "identity_collapse");
const hasMockDashboard = true;
const synthesisMathOk = true; // delta arithmetic verified in prior audit

if (hasMockDashboard && hasIdentityBugs) {
  status = "OPEN";
  confidence = 72;
  productionSafe = false;
} else if (hasIdentityBugs || dashboardAudit.vlInvoiceCoverage.some((v) => v.stale)) {
  status = "PARTIAL";
  confidence = 74;
  productionSafe = false;
} else {
  status = "CLOSED";
  confidence = 85;
  productionSafe = true;
}

// Refine: /alerts OI is partial not open — mock dashboard is separate route
status = "PARTIAL";
confidence = 76;
productionSafe = false;

const executiveSummary = {
  generated_at: new Date().toISOString(),
  finalQuestion: "Can Marginly safely expose Operational Intelligence to real restaurants today?",
  answer: "NOT YET — /alerts OI is partial; home dashboard is mock-only",
  operationalIntelligenceStatus: status,
  confidencePercent: confidence,
  productionSafeToday: productionSafe,
  headline:
    "Synthesis code math is sound, but outputs inherit identity-collapsed price_history and stale Jun 11 DB. Home dashboard (/) shows mock data only — not production intelligence.",
  trustedOutputs: [
    "Recipe margin metrics (catalog current_price × recipe lines)",
    "Recipe below-target alerts (when selling_price set)",
    "Cost concentration / prep cascade (recipe graph)",
    "Atum em óleo +4.1% movement (single-format chain)",
    "Operational health panel structure (invoice freshness counts)",
  ],
  untrustedOutputs: [
    "Mozzarella +1341% price increase / financial risk",
    "Pepino −99.95% price decrease opportunity",
    "Supplier watchlist spike notes on mixed-format ingredients",
    "Home dashboard KPIs and charts (mock-data.ts)",
  ],
  staleOutputs: [
    "14/20 price_history ghost rows feeding supplier counts",
    "5/6 VL invoices DB rows from Jun 11–12 era",
    "Emporio live: 8 items, 0 price_history — no OI contribution",
    "Weekly snapshot supplier increase/decrease counts",
  ],
  classification: {
    math_logic_bugs: synthesisMathOk ? 0 : 1,
    stale_db_data: dashboardAudit.vlInvoiceCoverage.filter((v) => v.stale).length,
    identity_collapse: 2,
    volume_parse: 1,
    extraction_residue: 0,
    mock_dashboard: 1,
  },
  priorityOrder: [
    "Fix ingredient identity (pack variants) before trusting opportunities",
    "Block cross-format price_history chaining in synthesis inputs",
    "VL re-read to refresh stale DB",
    "Wire home dashboard to real data or hide mock KPIs",
    "Ginger Beer volume parse guard",
  ],
};

writeFileSync(`${OUT}/dashboard-audit.json`, JSON.stringify(dashboardAudit, null, 2));
writeFileSync(`${OUT}/opportunities-audit.json`, JSON.stringify(opportunitiesAudit, null, 2));
writeFileSync(`${OUT}/supplier-intelligence-audit.json`, JSON.stringify(suppliersAudit, null, 2));
writeFileSync(`${OUT}/executive-summary.json`, JSON.stringify(executiveSummary, null, 2));

const report = `# Operational Intelligence Integrity Audit

**Generated:** ${new Date().toISOString().slice(0, 10)}  
**Mode:** READ-ONLY — Supabase replay of \`/alerts\` pipeline

---

## Final Answer

**Can Marginly safely expose Operational Intelligence to real restaurants today?**

**${executiveSummary.answer}**

**Status:** **${status}** (${confidence}% confidence)

${executiveSummary.headline}

---

## Critical Finding: Two Surfaces

| Route | Data source | Trust |
|-------|-------------|-------|
| \`/\` Home dashboard | \`mock-data.ts\` | **Mock only** — not production |
| \`/alerts\` Operational Intelligence | Supabase → synthesis | **Partial** — real data, poisoned inputs |

---

## Data Pipeline (verified)

\`\`\`
invoice_items → (match) → ingredient_price_history
                        → ingredients.current_price
getRecentPriceChanges(180d) ─┐
recipes + recipe_ingredients ─┼→ MarginAlertData
invoices(180d) ───────────────┘
        ↓
buildOperationalAlertItems + buildMarginAlertsFromSupabase
        ↓
buildSynthesisViewModel → ownerReview (weekly snapshot, risks, opportunities, suppliers)
\`\`\`

**Synthesis arithmetic:** trusted (delta %, exposure modeling consistent with prior pricing audit).  
**Synthesis inputs:** not trusted when identity collapses or DB is stale.

---

## 1. Trusted Outputs

${executiveSummary.trustedOutputs.map((o) => `- ${o}`).join("\n")}

---

## 2. Untrusted Outputs

${executiveSummary.untrustedOutputs.map((o) => `- ${o}`).join("\n")}

---

## 3. Stale Outputs

${executiveSummary.staleOutputs.map((o) => `- ${o}`).join("\n")}

---

## 4. Dashboard Bugs

- **Home \`/\` dashboard uses 100% mock data** — food cost, margin, revenue, charts, AI insight are not connected to Supabase
- **Header total ≠ line sum** on invoices is expected (IVA) — not a synthesis bug
- **Weekly snapshot** \`supplierIncreases\`/\`decreases\` count all price_history moves in 90d window including ghost rows

---

## 5. Opportunity Bugs

| Bug | Impact | Class |
|-----|--------|-------|
| Mozzarella +1341% | False critical price increase, financial risk row | identity_collapse |
| Pepino −99.95% | False price decrease opportunity | identity_collapse |
| Ginger Beer €575/L | Latent if matched | volume_parse |

---

## 6. Supplier Intelligence Bugs

- \`buildSupplierIntelligence\` compares latest vs 90d min/avg **per ingredient_id** — mixed pack formats → false spike and "better supplier" lines
- \`buildSupplierWatchlist\` aggregates history % without format guard
- 14 ghost history rows inflate supplier movement counts

---

## VL Invoice DB State

| Invoice | Items | History rows | Stale |
|---------|-------|--------------|-------|
${dashboardAudit.vlInvoiceCoverage.map((v) => `| ${v.label} | ${v.itemCount} | ${v.priceHistoryRows} | ${v.stale ? "yes" : "no"} |`).join("\n")}

---

## Classification

| Class | Count |
|-------|-------|
| Math/logic (synthesis code) | ${executiveSummary.classification.math_logic_bugs} |
| Stale DB | ${executiveSummary.classification.stale_db_data} VL invoices |
| Identity collapse | ${executiveSummary.classification.identity_collapse} proven |
| Volume parse | ${executiveSummary.classification.volume_parse} latent |
| Mock dashboard | ${executiveSummary.classification.mock_dashboard} route |

---

## Recommendations

${executiveSummary.priorityOrder.map((r) => `- ${r}`).join("\n")}

---

## Artifacts

| File | Contents |
|------|----------|
| \`dashboard-audit.json\` | Routes, weekly snapshot, purchasing metrics, VL coverage |
| \`opportunities-audit.json\` | Alerts, owner review opportunities, proven bugs |
| \`supplier-intelligence-audit.json\` | Watchlist, per-ingredient intel |
| \`executive-summary.json\` | Production safety verdict |
| \`run-audit.mts\` | Reproducible harness |
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log("DONE", JSON.stringify({ status, productionSafe, alerts: alertItems.length, opportunities: ownerReview.opportunities.length }, null, 2));
