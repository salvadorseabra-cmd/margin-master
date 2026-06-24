/**
 * Invoice Review purchase/operational display simplification — validation replay.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  computeEffectiveUsableCost,
  resolveInvoiceLinePricingPresentation,
  shouldCollapseInvoiceOperationalDisplay,
} from "../../src/lib/invoice-purchase-price-semantics.ts";
import {
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLineStockPresentation,
} from "../../src/lib/invoice-purchase-format.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/invoice-review-display-simplification";

type MatrixRow = {
  id: string;
  product: string;
  designCase?: string;
  mustCollapse: boolean;
  meta: {
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total?: number;
    matchedIngredientName?: string;
  };
};

const MATRIX: MatrixRow[] = [
  {
    id: "A-pera",
    product: "Pêra Abacate Hasse",
    designCase: "A",
    mustCollapse: true,
    meta: {
      name: "Pêra Abacate Hasse",
      quantity: 3.28,
      unit: "kg",
      unit_price: 4.26,
      line_total: 13.96,
    },
  },
  {
    id: "B-salada",
    product: "Salada Ibérica",
    designCase: "B",
    mustCollapse: false,
    meta: {
      name: "Salada Ibérica FSTK EMB. 250g",
      quantity: 4,
      unit: "em",
      unit_price: 2.19,
      line_total: 8.76,
    },
  },
  {
    id: "C-ovo",
    product: "Ovo classe M",
    designCase: "C",
    mustCollapse: false,
    meta: {
      name: "Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)",
      quantity: 1,
      unit: "cx",
      unit_price: 38.44,
    },
  },
  {
    id: "D-tomilho",
    product: "Tomilho",
    designCase: "D",
    mustCollapse: false,
    meta: { name: "Tomilho", quantity: 1, unit: "mo", unit_price: 2.06 },
  },
  {
    id: "E-manjericao",
    product: "Manjericão",
    designCase: "E",
    mustCollapse: false,
    meta: {
      name: "Manjericão",
      quantity: 5,
      unit: "mo",
      unit_price: 2.06,
      line_total: 10.28,
    },
  },
  {
    id: "same-unit-hortela",
    product: "Hortelã (kg row)",
    mustCollapse: true,
    meta: { name: "Hortelã", quantity: 0.5, unit: "kg", unit_price: 6.74 },
  },
  {
    id: "angus-case",
    product: "Angus burger case",
    mustCollapse: false,
    meta: {
      name: "Burger Angus 180gr (Caixa 40 un)",
      quantity: 2,
      unit: "cx",
      unit_price: 46,
      line_total: 92,
    },
  },
  {
    id: "angus-shortcut",
    product: "Angus case shortcut",
    mustCollapse: true,
    meta: {
      name: "CARNE HAMBURGUER ANGUS 180G",
      quantity: 1,
      unit: "cx",
      unit_price: 24.9,
    },
  },
  {
    id: "bac-strk",
    product: "BAC STRK (unit vs kg)",
    mustCollapse: false,
    meta: {
      name: "BAC STRK",
      quantity: 6,
      unit: "un",
      unit_price: 8.95,
      matchedIngredientName: "Bacon Burger Premium Fatiado 1kg",
    },
  },
  {
    id: "batata-name-2kg",
    product: "BATATA PALHA 2KG (row 1 kg, usable 2 kg)",
    mustCollapse: false,
    meta: { name: "BATATA PALHA 2KG", quantity: 1, unit: "kg", unit_price: 14.5 },
  },
];

function replayRow(row: MatrixRow) {
  const { meta } = row;
  const structured = resolveInvoiceLinePurchaseFormat(meta);
  const stock = resolveInvoiceLineStockPresentation(meta);
  const presentation = resolveInvoiceLinePricingPresentation(meta);
  const effective = computeEffectiveUsableCost(meta.unit_price, meta, structured, meta.name);
  const collapsed =
    !presentation.card.normalizedLine && !presentation.card.usableCostLine;
  const collapseRule = shouldCollapseInvoiceOperationalDisplay({
    metadata: meta,
    stock,
    unitPrice: meta.unit_price,
    priceSuffix: presentation.priceDisplay?.split(" / ")[1] ?? null,
    effective,
    usableStockLabel: presentation.usableStockLabel,
  });

  return {
    id: row.id,
    product: row.product,
    designCase: row.designCase ?? null,
    mustCollapse: row.mustCollapse,
    before: {
      normalizedLine: presentation.usableStockLabel,
      usableCostLine: presentation.effectiveUsableCostLabel
        ? `${presentation.effectiveUsableCostLabel.replace(/\s*\/\s*\S+$/, "").trim()} / ${effective?.unit ?? "?"} usable`
        : null,
    },
    after: {
      card: presentation.card,
      priceDisplay: presentation.priceDisplay,
      effectiveUsableCostLabel: presentation.effectiveUsableCostLabel,
      collapsed,
      collapseRule,
    },
    pass: collapsed === row.mustCollapse && collapseRule === row.mustCollapse,
  };
}

const matrix = MATRIX.map(replayRow);
const allPass = matrix.every((r) => r.pass);

let testOutput = "";
try {
  testOutput = execSync("npm test -- src/lib/invoice-purchase-price-semantics.test.ts 2>&1", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (e: unknown) {
  testOutput = e instanceof Error && "stdout" in e ? String((e as { stdout: string }).stdout) : String(e);
}

const testPass = /Tests\s+\d+\s+passed/.test(testOutput) && !/failed/.test(testOutput);

const results = {
  validationLab: VL,
  generatedAt: new Date().toISOString(),
  verdict: allPass && testPass ? "A) Safe to merge" : allPass ? "B) Needs adjustment" : "C) Rejected",
  comparisonRule: {
    collapseWhenAllTrue: [
      "usable quantity == purchase quantity (normalized to g/ml/un base)",
      "operational unit == procurement unit (price suffix)",
      "effective operational cost == procurement unit_price (±0.005)",
    ],
    specialCase:
      "When usableStockLabel is null but cost+unit match (Angus case shortcut), collapse operational block.",
    implementation: "shouldCollapseInvoiceOperationalDisplay in invoice-purchase-price-semantics.ts",
  },
  filesChanged: [
    "src/lib/invoice-purchase-price-semantics.ts",
    "src/lib/invoice-purchase-price-semantics.test.ts",
  ],
  blastRadius: {
    scope: "Invoice Review presentation only (InvoiceNormalizationCardCell via resolveInvoiceLinePricingPresentation)",
    unchanged: [
      "persistence",
      "recipe costing",
      "ingredient detail modal",
      "computeEffectiveUsableCost",
      "recipeOperationalCostFieldsFromInvoiceLine",
    ],
  },
  regressionMatrix: matrix,
  matrixSummary: {
    total: matrix.length,
    passed: matrix.filter((r) => r.pass).length,
    failed: matrix.filter((r) => !r.pass).length,
  },
  tests: {
    suite: "invoice-purchase-price-semantics.test.ts",
    pass: testPass,
    excerpt: testOutput.split("\n").slice(-6).join("\n"),
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const report = `# Invoice Review Purchase/Operational Display Simplification

**Validation Lab:** \`${VL}\`  
**Generated:** ${results.generatedAt}

---

## Verdict: ${results.verdict}

---

## Goal

Reduce duplication in Invoice Review when procurement and operational semantics are identical.

**Example fix (Pêra Abacate):**
- Before: \`3.28 kg\` + \`€4.26 / kg · €13.96 total\` + \`3.28 kg usable\` + \`€4.26 / kg usable\`
- After: \`3.28 kg\` + \`€4.26 / kg · €13.96 total\` only

---

## Comparison Rule

Hide operational block (\`normalizedLine\` + \`usableCostLine\`) when **all** of:

1. **Quantity:** usable quantity equals purchase quantity after normalization to the same base unit (\`g\`, \`ml\`, or \`un\`) from \`resolveInvoiceLineStockPresentation\`
2. **Unit:** operational cost unit equals procurement price suffix from \`resolvePriceSuffix\`
3. **Cost:** \`computeEffectiveUsableCost\` result equals \`unit_price\` (±€0.005)

**Special case:** when \`usableStockLabel\` is null but cost+unit already match (Angus case shortcut), collapse the redundant \`usableCostLine\`.

Implemented in \`shouldCollapseInvoiceOperationalDisplay\` — applied inside \`buildNormalizationCard\` only.

---

## Files Changed

| File | Change |
|------|--------|
| \`src/lib/invoice-purchase-price-semantics.ts\` | Added collapse rule + wired into card builder |
| \`src/lib/invoice-purchase-price-semantics.test.ts\` | Pêra/collapse tests + design-case matrix assertions |

**Not changed:** \`src/routes/invoices.tsx\` (already renders \`card.*\` via \`InvoiceNormalizationCardCell\`), persistence, recipe costing, ingredient detail modal.

---

## Design Case Matrix

| Case | Product | Must collapse | Pass | After (card) |
|------|---------|:-------------:|:----:|--------------|
${matrix
  .map((r) => {
    const card = r.after.card;
    const display = [
      card.purchaseQuantityLine,
      card.purchasePriceLine,
      card.normalizedLine,
      card.usableCostLine,
    ]
      .filter(Boolean)
      .join(" \\| ");
    return `| ${r.designCase ?? "—"} | ${r.product} | ${r.mustCollapse ? "yes" : "no"} | ${r.pass ? "✓" : "✗"} | ${display.replace(/\|/g, "\\|")} |`;
  })
  .join("\n")}

**${results.matrixSummary.passed}/${results.matrixSummary.total} matrix rows passed**

---

## Before / After Highlights

| Product | Before (operational lines) | After |
|---------|---------------------------|-------|
| Pêra Abacate | 3.28 kg usable + €4.26/kg usable | *(collapsed)* |
| Salada Ibérica | 250 g usable + €8.76/kg usable | unchanged |
| Ovo classe M | 180 un usable + €0.2136/egg usable | unchanged |
| Tomilho | 100 g usable + €20.60/kg usable | unchanged |
| Manjericão | 500 g usable + €20.60/kg usable | unchanged |
| Hortelã 0.5 kg | 500 g usable + €6.74/kg usable | *(collapsed)* |
| Angus case shortcut | €24.90/case usable | *(collapsed)* |

---

## Blast Radius

- **Scope:** Invoice Review row right column only (\`InvoiceNormalizationCardCell\`)
- **Unchanged:** \`effectiveUsableCostLabel\` still computed (tests/API), \`recipeOperationalCostFieldsFromInvoiceLine\`, persistence paths, ingredient detail modal
- **Risk:** Low — display-only gate on existing normalized values

---

## Tests

\`\`\`
${results.tests.excerpt}
\`\`\`

---

## Audit: Duplication Origin

Rendering path:

1. \`ItemsTable\` → \`resolveInvoiceLinePricingPresentation(metadata)\`
2. \`buildNormalizationCard\` always populated \`normalizedLine\` from \`usableStockLabel\` and \`usableCostLine\` from \`effectiveUsableCostLabel\`
3. \`InvoiceNormalizationCardCell\` renders all four card lines independently

For kg-priced bulk rows (Pêra, Pepino, Hortelã), stock normalization yields the same weight and \`computeEffectiveUsableCost\` returns identical €/kg — causing duplicate display with no added information.
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log(`Wrote ${OUT}/results.json and REPORT.md — verdict: ${results.verdict}`);
