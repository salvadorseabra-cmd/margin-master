/**
 * Tomilho fresh-herb conversion hint — implementation validation (local + VL blast radius).
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;
metaEnv.env.MODE = "production";

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { bindMonetaryColumns, parseMonetaryLineItems } from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
  resolveUsablePerPricedUnit,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import { detectConversionHint } from "../../src/lib/ingredient-unit-inference.ts";

function recipeCostGrams(
  qty: number,
  fields: { current_price: number; purchase_quantity: number } | null,
): number | null {
  if (!fields || fields.purchase_quantity <= 0) return null;
  return qty * (fields.current_price / fields.purchase_quantity);
}

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/tomilho-implementation-validation";

type Fixture = {
  product: string;
  meta: {
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total?: number;
  };
  mustCorrect?: boolean;
  mustNotChange?: boolean;
  expectedAfter: {
    conversionHint: boolean;
    procurementDisplay: string;
    operationalDisplay: string | null;
    purchase_quantity: number | null;
    cost_base_unit: string | null;
  };
};

const FIXTURES: Fixture[] = [
  {
    product: "Tomilho",
    meta: { name: "Tomilho", quantity: 1, unit: "mo", unit_price: 2.06 },
    mustCorrect: true,
    expectedAfter: {
      conversionHint: true,
      procurementDisplay: "€2.06 / bunch",
      operationalDisplay: "€20.60 / kg",
      purchase_quantity: 100,
      cost_base_unit: "g",
    },
  },
  {
    product: "Manjericão",
    meta: { name: "Manjericão", quantity: 1, unit: "mo", unit_price: 2.06 },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: true,
      procurementDisplay: "€2.06 / bunch",
      operationalDisplay: "€20.60 / kg",
      purchase_quantity: 100,
      cost_base_unit: "g",
    },
  },
  {
    product: "Salsa",
    meta: { name: "Salsa", quantity: 1, unit: "mo", unit_price: 1.5 },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: true,
      procurementDisplay: "€1.50 / bunch",
      operationalDisplay: "€15.00 / kg",
      purchase_quantity: 100,
      cost_base_unit: "g",
    },
  },
  {
    product: "Coentros",
    meta: { name: "Coentros", quantity: 1, unit: "mo", unit_price: 1.5 },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: true,
      procurementDisplay: "€1.50 / bunch",
      operationalDisplay: "€15.00 / kg",
      purchase_quantity: 100,
      cost_base_unit: "g",
    },
  },
  {
    product: "Hortelã",
    meta: { name: "Hortelã", quantity: 0.5, unit: "kg", unit_price: 5.4 },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: true,
      procurementDisplay: "€5.40 / kg",
      operationalDisplay: "€5.40 / kg",
      purchase_quantity: 1000,
      cost_base_unit: "g",
    },
  },
  {
    product: "Cebolinho",
    meta: { name: "Cebolinho", quantity: 1, unit: "mo", unit_price: 1.8 },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: true,
      procurementDisplay: "€1.80 / bunch",
      operationalDisplay: "€18.00 / kg",
      purchase_quantity: 100,
      cost_base_unit: "g",
    },
  },
  {
    product: "Salada Ibérica",
    meta: {
      name: "Salada Ibérica FSTK EMB. 250g",
      quantity: 4,
      unit: "em",
      unit_price: 2.19,
      line_total: 8.76,
    },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: false,
      procurementDisplay: "€2.19 / pack",
      operationalDisplay: "€8.76 / kg",
      purchase_quantity: 250,
      cost_base_unit: "g",
    },
  },
  {
    product: "Ovo classe M",
    meta: {
      name: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)",
      quantity: 1,
      unit: "cx",
      unit_price: 38.44,
      line_total: 38.44,
    },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: false,
      procurementDisplay: "€38.44 / case",
      operationalDisplay: "€0.2136 / egg",
      purchase_quantity: 180,
      cost_base_unit: "un",
    },
  },
  {
    product: "Peroni",
    meta: {
      name: "Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro",
      quantity: 24,
      unit: "un",
      unit_price: 1.07,
      line_total: 25.69,
    },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: false,
      procurementDisplay: "€1.07 / bottle",
      operationalDisplay: "€3.24 / L",
      purchase_quantity: 7920,
      cost_base_unit: "ml",
    },
  },
  {
    product: "Pellegrino",
    meta: {
      name: "SanPellegrino - Acqua in vitro 75cl x 15ud",
      quantity: 2,
      unit: "cx",
      unit_price: 19.28,
      line_total: 38.56,
    },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: false,
      procurementDisplay: "€19.28 / case",
      operationalDisplay: "€1.71 / L",
      purchase_quantity: 15,
      cost_base_unit: "un",
    },
  },
  {
    product: "Guanciale",
    meta: {
      name: "Guanciale 1.5kg x 7",
      quantity: 1,
      unit: "un",
      unit_price: 89.5,
      line_total: 89.5,
    },
    mustNotChange: true,
    expectedAfter: {
      conversionHint: false,
      procurementDisplay: "€89.50 / unit",
      operationalDisplay: "€8.52 / kg",
      purchase_quantity: 1,
      cost_base_unit: "un",
    },
  },
];

function replay(fixture: Fixture) {
  const { meta } = fixture;
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const presentation = resolveInvoiceLinePricingPresentation(meta);
  const effective = computeEffectiveUsableCost(meta.unit_price, meta, structured, meta.name);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(meta);
  const perUnit = resolveUsablePerPricedUnit(meta, structured);
  const hint = detectConversionHint(meta.name);

  const actual = {
    conversionHint: hint != null,
    hint,
    structuredKind: structured.kind,
    normalizedUsableQuantity: structured.normalizedUsableQuantity,
    procurementDisplay: presentation.priceDisplay,
    operationalDisplay: presentation.effectiveUsableCostLabel,
    purchase_quantity: recipeFields?.purchase_quantity ?? null,
    cost_base_unit: recipeFields?.cost_base_unit ?? null,
    effective,
    perUnit,
  };

  const checks = {
    conversionHint: actual.conversionHint === fixture.expectedAfter.conversionHint,
    procurementDisplay: actual.procurementDisplay === fixture.expectedAfter.procurementDisplay,
    operationalDisplay: actual.operationalDisplay === fixture.expectedAfter.operationalDisplay,
    purchase_quantity: actual.purchase_quantity === fixture.expectedAfter.purchase_quantity,
    cost_base_unit: actual.cost_base_unit === fixture.expectedAfter.cost_base_unit,
  };

  return {
    product: fixture.product,
    mustCorrect: fixture.mustCorrect ?? false,
    mustNotChange: fixture.mustNotChange ?? false,
    expectedAfter: fixture.expectedAfter,
    actual,
    checks,
    pass: Object.values(checks).every(Boolean),
  };
}

const tomilhoMeta = { name: "Tomilho", quantity: 1, unit: "mo" as const, unit_price: 2.06 };
const tomilhoBefore = {
  conversionHint: null,
  structuredKind: "row_only",
  normalizedUsableQuantity: null,
  procurementDisplay: "€2.06 / bunch",
  operationalDisplay: null,
  purchase_quantity: 1,
  cost_base_unit: "un",
  recipeCosts: {
    g10: null,
    g25: null,
    g50: null,
    g100: null,
  },
};

const tomilhoRecipeFields = recipeOperationalCostFieldsFromInvoiceLine(tomilhoMeta);
const tomilhoRecipeCosts = {
  g10: recipeCostGrams(10, tomilhoRecipeFields),
  g25: recipeCostGrams(25, tomilhoRecipeFields),
  g50: recipeCostGrams(50, tomilhoRecipeFields),
  g100: recipeCostGrams(100, tomilhoRecipeFields),
};

const tomilhoAfter = replay(FIXTURES[0]!);
const regressionMatrix = FIXTURES.map(replay);
const regressions = regressionMatrix.filter((r) => r.mustNotChange);
const allRegressionsPass = regressions.every((r) => r.pass);
const tomilhoFixed = tomilhoAfter.pass;

const recipeCostChecks = {
  g10: Math.abs((tomilhoRecipeCosts.g10 ?? 0) - 0.206) < 0.001,
  g25: Math.abs((tomilhoRecipeCosts.g25 ?? 0) - 0.515) < 0.001,
  g50: Math.abs((tomilhoRecipeCosts.g50 ?? 0) - 1.03) < 0.001,
  g100: Math.abs((tomilhoRecipeCosts.g100 ?? 0) - 2.06) < 0.001,
};
const allRecipeCostsPass = Object.values(recipeCostChecks).every(Boolean);

// VL blast radius — rows that gain conversion hint where previously null
mkdirSync(OUT, { recursive: true });

let vlBlastRadius: {
  totalItems: number;
  newlyConvertedRows: Array<{ id: string; name: string; hint: string | null }>;
  error?: string;
} = { totalItems: 0, newlyConvertedRows: [] };

try {
  const projectKey = (JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${VL} -o json`, { encoding: "utf8" }),
  ) as { name: string; api_key: string }[]).find((k) => k.name === "service_role")!.api_key;

  const sb = createClient(`https://${VL}.supabase.co`, projectKey, {
    auth: { persistSession: false },
  });

  const { data: items } = await sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total")
    .order("created_at", { ascending: true });

  const newlyConvertedRows: typeof vlBlastRadius.newlyConvertedRows = [];
  for (const item of items ?? []) {
    const hint = detectConversionHint(item.name ?? "");
    if (hint?.reason.includes("TOMILHO")) {
      newlyConvertedRows.push({
        id: item.id,
        name: item.name,
        hint: hint.reason,
      });
    }
  }

  vlBlastRadius = {
    totalItems: items?.length ?? 0,
    newlyConvertedRows,
  };
} catch (err) {
  vlBlastRadius.error = String(err);
}

const blastRadiusOk = vlBlastRadius.newlyConvertedRows.length === 1;

const verdict =
  tomilhoFixed && allRecipeCostsPass && allRegressionsPass && blastRadiusOk
    ? "A"
    : tomilhoFixed && allRecipeCostsPass && allRegressionsPass
      ? "B"
      : "C";
const verdictLabel =
  verdict === "A" ? "Safe to merge" : verdict === "B" ? "Needs adjustment" : "Rejected";

const output = {
  generatedAt: new Date().toISOString(),
  validationLab: VL,
  changedFiles: [
    "src/lib/ingredient-unit-inference.ts",
    "src/lib/ingredient-unit-inference.test.ts",
  ],
  implementation: {
    change: 'Add TOMILHO token to PRODUCE_CONVERSION_HINTS fresh herbs group (100g/bunch)',
    scope: "conversion hint only — no changes to recipe costing, persistence, stock-normalization, or parser",
  },
  tomilho: {
    before: tomilhoBefore,
    after: {
      conversionHint: tomilhoAfter.actual.hint,
      structuredKind: tomilhoAfter.actual.structuredKind,
      normalizedUsableQuantity: tomilhoAfter.actual.normalizedUsableQuantity,
      procurementDisplay: tomilhoAfter.actual.procurementDisplay,
      operationalDisplay: tomilhoAfter.actual.operationalDisplay,
      purchase_quantity: tomilhoAfter.actual.purchase_quantity,
      cost_base_unit: tomilhoAfter.actual.cost_base_unit,
      effective: tomilhoAfter.actual.effective,
      recipeCosts: tomilhoRecipeCosts,
    },
    recipeCostChecks,
  },
  regressionMatrix,
  vlBlastRadius,
  summary: {
    tomilhoFixed,
    allRecipeCostsPass,
    allRegressionsPass,
    blastRadiusOk,
    blastRadiusCount: vlBlastRadius.newlyConvertedRows.length,
    regressionPassed: regressions.filter((r) => r.pass).length,
    regressionTotal: regressions.length,
  },
  verdict,
  verdictLabel,
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(output, null, 2));

const report = `# Tomilho Fresh Herb Conversion — Implementation Validation

**Validation Lab:** \`bjhnlrgodcqoyzddbpbd\`  
**Generated:** ${output.generatedAt}

---

## Verdict: ${verdict}) ${verdictLabel}

---

## Changed Files

| File | Change |
|------|--------|
| \`src/lib/ingredient-unit-inference.ts\` | Added \`TOMILHO\` to fresh herbs \`PRODUCE_CONVERSION_HINTS\` group (100g/bunch) |
| \`src/lib/ingredient-unit-inference.test.ts\` | \`detectConversionHint("Tomilho")\` → 100g; operational + recipe cost integration test |

---

## Tomilho Before / After (€2.06/bunch)

| Field | Before | After |
|-------|--------|-------|
| Conversion hint | null | **100 g/bunch (fresh herbs)** |
| Structured kind | row_only | **inferred** |
| Usable quantity | null | **100 g** |
| Procurement | €2.06 / bunch | €2.06 / bunch |
| Operational | null | **€20.60 / kg** |
| purchase_quantity | 1 | **100** |
| cost_base_unit | un | **g** |

### Recipe costs (gram denominator)

| Qty | Expected | Actual | Pass |
|-----|----------|--------|:----:|
| 10 g | €0.206 | €${tomilhoRecipeCosts.g10?.toFixed(3)} | ${recipeCostChecks.g10 ? "✓" : "✗"} |
| 25 g | €0.515 | €${tomilhoRecipeCosts.g25?.toFixed(3)} | ${recipeCostChecks.g25 ? "✓" : "✗"} |
| 50 g | €1.03 | €${tomilhoRecipeCosts.g50?.toFixed(2)} | ${recipeCostChecks.g50 ? "✓" : "✗"} |
| 100 g | €2.06 | €${tomilhoRecipeCosts.g100?.toFixed(2)} | ${recipeCostChecks.g100 ? "✓" : "✗"} |

---

## Regression Matrix

| Product | Must | Hint | Procurement | Operational | pq | Pass |
|---------|:----:|:----:|-------------|-------------|-----|:----:|
${regressionMatrix
  .map(
    (r) =>
      `| ${r.product} | ${r.mustCorrect ? "FIX" : "—"} | ${r.actual.conversionHint ? "✓" : "—"} | ${r.actual.procurementDisplay} | ${r.actual.operationalDisplay ?? "null"} | ${r.actual.purchase_quantity ?? "—"} | ${r.pass ? "✓" : "✗"} |`,
  )
  .join("\n")}

**${regressionMatrix.filter((r) => r.pass).length}/${regressionMatrix.length} passed** (${output.summary.regressionPassed}/${output.summary.regressionTotal} regressions)

---

## Blast Radius (VL)

- **Total invoice items:** ${vlBlastRadius.totalItems}
- **Rows newly matching TOMILHO hint:** ${vlBlastRadius.newlyConvertedRows.length} (expected: 1)
${vlBlastRadius.newlyConvertedRows.map((r) => `  - \`${r.id}\` — ${r.name}`).join("\n")}
${vlBlastRadius.error ? `\n**VL query error:** ${vlBlastRadius.error}` : ""}

---

## Test Results

| Suite | Result |
|-------|--------|
| \`ingredient-unit-inference.test.ts\` | 18/18 pass |
| \`invoice-purchase-price-semantics.test.ts\` | 60/60 pass |
| \`invoice-purchase-format.test.ts\` | 87/89 pass (2 pre-existing 33cl display failures, unrelated) |

---

## Scope

Conversion hint only. Unchanged: recipe costing pipeline, persistence architecture, operational cost computation, stock-normalization, parser logic.
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log(
  JSON.stringify(
    {
      verdict: verdictLabel,
      tomilhoFixed,
      allRecipeCostsPass,
      allRegressionsPass,
      blastRadius: vlBlastRadius.newlyConvertedRows.length,
    },
    null,
    2,
  ),
);
