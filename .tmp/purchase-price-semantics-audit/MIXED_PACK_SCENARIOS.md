# Mixed Pack Scenarios

When the same ingredient appears with different pack sizes, quantities, or suppliers, only normalized metrics allow fair comparison.

---

## Scenario 1: Same SKU, different invoice quantity

**Product:** San Pellegrino 75cl × 15  
**Evidence:** `.tmp/emporio-duplicate-audit/REPORT.md`

| Purchase | Qty | Line total | Per case |
|----------|-----|------------|----------|
| 1 case | 1 cx | €25.74 | €25.74 |
| 2 cases | 2 cx | €38.56 | €19.28 |

**Fair comparator:** per case, per bottle, or €/L — **not** line total.

---

## Scenario 2: Same product, different pack text

**Product:** Peroni `33cl*24` vs hypothetical `33cl*12`

| Pack | Line total (example) | Per bottle |
|------|---------------------|------------|
| 24-pack | €25.69 | €1.07 |
| 12-pack | €14.00 | €1.17 |

Line total comparison favors the 12-pack (€14 < €25.69) even if per-bottle cost is worse.

**Fair comparator:** per bottle or €/L.

---

## Scenario 3: Weight products

**Product:** Gorgonzola (from `.tmp/historical-pricing-integrity-audit/affected-ingredients.json`)

| Line | Qty | Line total | €/kg |
|------|-----|------------|------|
| 1.35 kg @ €9.96/kg | 1.35 kg | €13.44 | €9.96 |

When qty is in kg and unit_price is €/kg, `unit_price` already is the comparable metric. Line total (€13.44) is not comparable across different weights.

**Fair comparator:** €/kg (`unit_price` when unit is kg).

---

## Scenario 4: Multi-unit count lines

**Product:** De Cecco pasta — qty 24 @ €50.20 total (from purchase-unit intelligence audits)

| Metric | Value |
|--------|-------|
| Line total | €50.20 |
| Per pack | €2.09 |

Comparing €50.20 against a single-pack purchase at €25.69 inverts ranking.

**Fair comparator:** per pack (€/unit of the priced quantity).

---

## Scenario 5: Cross-supplier same pack

**Product:** Bacon — Metro vs Auchan (from operational signal tests / VL patterns)

| Supplier | Line total | €/kg |
|----------|------------|------|
| Metro | €50.20 (bulk) | €8.50 |
| Auchan | €9.99 (small) | €9.99 |

Line total makes Metro look worst; per-kg makes Metro best value.

**Fair comparator:** €/kg.

---

## Summary: which metric when?

| Situation | Fair comparator |
|-----------|-----------------|
| Validating invoice | Line total |
| Comparing across purchases | Normalized unit economics |
| Same pack, same qty every time | Line total *may* rank correctly by accident |
| Different qty on same SKU | Per-case or per-priced-unit |
| Different pack sizes | Per bottle/can or €/L or €/kg |
| Weight products | €/kg |

**Test evidence:** `ingredient-detail-panel.test.ts` exercises min/max ranking via `buildIngredientPurchaseInsights`; ranking inverts when comparable unit differs from line total semantics.
