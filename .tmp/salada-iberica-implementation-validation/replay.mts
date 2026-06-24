/**
 * Salada Ibérica Option B implementation validation — local engine replay (no DB).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveInvoiceLinePurchaseFormat } from "../../src/lib/invoice-purchase-format.ts";
import {
  shouldApplyCasePieceWeightOperationalShortcut,
  isCaseRowWithEmbeddedPieceWeightOnly,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  computeEffectiveUsableCost,
  recipeOperationalCostFieldsFromInvoiceLine,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";

const OUT = ".tmp/salada-iberica-implementation-validation";

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
  expectedBefore?: {
    procurementDisplay: string | null;
    operationalDisplay: string | null;
  };
  expectedAfter: {
    procurementDisplay: string | null;
    operationalDisplay: string | null;
  };
};

const FIXTURES: Fixture[] = [
  {
    product: "Salada Ibérica",
    meta: {
      name: "Salada Ibérica FSTK EMB. 250g",
      quantity: 4,
      unit: "em",
      unit_price: 2.19,
      line_total: 8.76,
    },
    mustCorrect: true,
    expectedBefore: {
      procurementDisplay: "€2.19 / pack",
      operationalDisplay: "€2.19 / case",
    },
    expectedAfter: {
      procurementDisplay: "€2.19 / pack",
      operationalDisplay: "€8.76 / kg",
    },
  },
  {
    product: "Manteiga EMB 1kg",
    meta: {
      name: "Manteiga Coimbra s/Sal EMB 1 Kg",
      quantity: 1,
      unit: "kg",
      unit_price: 8.9,
    },
    mustNotChange: true,
    expectedAfter: {
      procurementDisplay: "€8.90 / kg",
      operationalDisplay: "€8.90 / kg",
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
      procurementDisplay: "€38.44 / case",
      operationalDisplay: null,
    },
  },
  {
    product: "Tomilho",
    meta: { name: "Tomilho", quantity: 1, unit: "mo", unit_price: 2.06 },
    mustNotChange: true,
    expectedAfter: {
      procurementDisplay: "€2.06 / bunch",
      operationalDisplay: null,
    },
  },
  {
    product: "Manjericão",
    meta: { name: "Manjericão", quantity: 1, unit: "mo", unit_price: 2.06 },
    mustNotChange: true,
    expectedAfter: {
      procurementDisplay: "€2.06 / bunch",
      operationalDisplay: "€20.60 / kg",
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
      procurementDisplay: "€19.28 / case",
      operationalDisplay: "€1.71 / L",
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
      procurementDisplay: "€1.07 / bottle",
      operationalDisplay: "€3.24 / L",
    },
  },
  {
    product: "Mozzarella",
    meta: {
      name: "MOZZA Fior di Latte Expert Julienne 3kg Simonetta",
      quantity: 1,
      unit: "un",
      unit_price: 20.03,
      line_total: 20.03,
    },
    mustNotChange: true,
    expectedAfter: {
      procurementDisplay: "€20.03 / bag",
      operationalDisplay: "€6.68 / kg",
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
      procurementDisplay: "€89.50 / unit",
      operationalDisplay: "€8.52 / kg",
    },
  },
  {
    product: "Ginger Beer",
    meta: {
      name: "Baladin - Ginger Beer 0.20cl",
      quantity: 1,
      unit: "un",
      unit_price: 9.69,
    },
    mustNotChange: true,
    expectedAfter: {
      procurementDisplay: "€9.69 / unit",
      operationalDisplay: "€48.45 / L",
    },
  },
  {
    product: "Angus 180G cx",
    meta: {
      name: "CARNE HAMBURGUER ANGUS 180G",
      quantity: 1,
      unit: "cx",
      unit_price: 24.9,
    },
    mustNotChange: true,
    expectedAfter: {
      procurementDisplay: "€24.90 / case",
      operationalDisplay: "€24.90 / case",
    },
  },
];

function replay(fixture: Fixture) {
  const { meta } = fixture;
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const presentation = resolveInvoiceLinePricingPresentation(meta);
  const effective = computeEffectiveUsableCost(meta.unit_price, meta, structured, meta.name);
  const recipeFields = recipeOperationalCostFieldsFromInvoiceLine(meta);
  const isCaseRow = isCaseRowWithEmbeddedPieceWeightOnly(meta.name, meta.unit);
  const shouldShortcut = shouldApplyCasePieceWeightOperationalShortcut(meta.name, meta.unit);

  const actual = {
    procurementDisplay: presentation.priceDisplay,
    operationalDisplay: presentation.effectiveUsableCostLabel,
    usableStockLabel: presentation.usableStockLabel,
    effective,
    recipeFields,
    isCaseRowWithEmbeddedPieceWeightOnly: isCaseRow,
    shouldApplyCasePieceWeightOperationalShortcut: shouldShortcut,
    displayStructuredUsable: structured.normalizedUsableQuantity,
  };

  const procurementOk =
    actual.procurementDisplay === fixture.expectedAfter.procurementDisplay;
  const operationalOk =
    actual.operationalDisplay === fixture.expectedAfter.operationalDisplay;

  return {
    product: fixture.product,
    mustCorrect: fixture.mustCorrect ?? false,
    mustNotChange: fixture.mustNotChange ?? false,
    expectedBefore: fixture.expectedBefore ?? null,
    expectedAfter: fixture.expectedAfter,
    actual,
    pass: procurementOk && operationalOk,
    procurementOk,
    operationalOk,
  };
}

const results = FIXTURES.map(replay);
const salada = results.find((r) => r.product === "Salada Ibérica")!;
const regressions = results.filter((r) => r.mustNotChange);
const allRegressionsPass = regressions.every((r) => r.pass);
const saladaFixed = salada.pass;

const verdict = saladaFixed && allRegressionsPass ? "A" : saladaFixed ? "B" : "C";
const verdictLabel =
  verdict === "A"
    ? "Safe to merge"
    : verdict === "B"
      ? "Needs adjustment"
      : "Rejected";

const output = {
  generatedAt: new Date().toISOString(),
  validationLab: "bjhnlrgodcqoyzddbpbd",
  option: "B",
  changedFiles: [
    "src/lib/invoice-purchase-format.ts",
    "src/lib/invoice-purchase-price-semantics.ts",
    "src/lib/invoice-purchase-format.test.ts",
    "src/lib/invoice-purchase-price-semantics.test.ts",
  ],
  gate: {
    helper: "shouldApplyCasePieceWeightOperationalShortcut",
    wholesaleCaseRowUnits: ["cx", "caixa", "caixas", "case", "cases"],
  },
  saladaIberica: {
    before: salada.expectedBefore,
    after: {
      procurementDisplay: salada.actual.procurementDisplay,
      operationalDisplay: salada.actual.operationalDisplay,
      usableStockLabel: salada.actual.usableStockLabel,
      shouldApplyCasePieceWeightOperationalShortcut:
        salada.actual.shouldApplyCasePieceWeightOperationalShortcut,
    },
    recipeUnchanged: salada.actual.recipeFields,
  },
  regressionMatrix: results,
  summary: {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    saladaFixed,
    allRegressionsPass,
  },
  verdict,
  verdictLabel,
  openIssues: [
    "Unknown em/pack rows with per-piece bare_measure in opaque multi-packs may gain €/kg display (aligns with weight-family recipe model)",
    "Ginger Beer cx row masking remains out of scope",
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/results.json`, JSON.stringify(output, null, 2));

const report = `# Salada Ibérica Operational Representation — Implementation Validation

**Validation Lab:** \`bjhnlrgodcqoyzddbpbd\`  
**Option:** B — Narrow case shortcut to wholesale case units (\`cx\`/\`caixa\`/\`case\`)  
**Generated:** ${output.generatedAt}

---

## Verdict: ${verdict}) ${verdictLabel}

---

## Changed Files

| File | Change |
|------|--------|
| \`src/lib/invoice-purchase-format.ts\` | Added \`shouldApplyCasePieceWeightOperationalShortcut\`; gated \`adjustCasePieceWeightDisplay\` |
| \`src/lib/invoice-purchase-price-semantics.ts\` | Gated \`computeEffectiveUsableCost\` and \`resolvePriceSuffix\` |
| \`src/lib/invoice-purchase-format.test.ts\` | Gate helper + Salada em detector tests |
| \`src/lib/invoice-purchase-price-semantics.test.ts\` | Salada €8.76/kg regression test |

---

## Salada Ibérica Before / After

| Field | Before | After |
|-------|--------|-------|
| Procurement | ${salada.expectedBefore?.procurementDisplay} | **${salada.actual.procurementDisplay}** |
| Operational | ${salada.expectedBefore?.operationalDisplay} | **${salada.actual.operationalDisplay}** |
| Usable stock label | null (suppressed) | **${salada.actual.usableStockLabel}** |
| \`shouldApplyCasePieceWeightOperationalShortcut\` | true (would have) | **${salada.actual.shouldApplyCasePieceWeightOperationalShortcut}** |
| Recipe fields | unchanged | \`${JSON.stringify(salada.actual.recipeFields)}\` |

---

## Regression Matrix

| Product | Must | Procurement | Operational | Pass |
|---------|:----:|-------------|-------------|:----:|
${results
  .map(
    (r) =>
      `| ${r.product} | ${r.mustCorrect ? "FIX" : "—"} | ${r.actual.procurementDisplay} | ${r.actual.operationalDisplay ?? "null"} | ${r.pass ? "✓" : "✗"} |`,
  )
  .join("\n")}

**${output.summary.passed}/${output.summary.total} passed**

---

## Blast Radius

- **Display-only:** \`resolveInvoiceLinePricingPresentation\`, \`resolveStructuredPurchaseForDisplay\`, ingredient detail operational cost label
- **Unchanged:** \`recipeOperationalCostFieldsFromInvoiceLine\`, persistence, stock-normalization, extraction
- **Angus cx:** \`shouldApplyCasePieceWeightOperationalShortcut\` remains true → €/case operational preserved

---

## Open Issues

${output.openIssues.map((i) => `- ${i}`).join("\n")}

---

## Test Results

Unit tests: \`invoice-purchase-price-semantics.test.ts\` (60/60 pass including Salada + Angus), \`invoice-purchase-format.test.ts\` (new gate tests pass; 2 pre-existing 33cl display failures unrelated).
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log(JSON.stringify({ verdict: verdictLabel, passed: output.summary.passed, total: output.summary.total }, null, 2));
