# Invoice Review Purchase/Operational Display Simplification

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Generated:** 2026-06-24T02:15:25.592Z

---

## Verdict: A) Safe to merge

---

## Goal

Reduce duplication in Invoice Review when procurement and operational semantics are identical.

**Example fix (Pêra Abacate):**
- Before: `3.28 kg` + `€4.26 / kg · €13.96 total` + `3.28 kg usable` + `€4.26 / kg usable`
- After: `3.28 kg` + `€4.26 / kg · €13.96 total` only

---

## Comparison Rule

Hide operational block (`normalizedLine` + `usableCostLine`) when **all** of:

1. **Quantity:** usable quantity equals purchase quantity after normalization to the same base unit (`g`, `ml`, or `un`) from `resolveInvoiceLineStockPresentation`
2. **Unit:** operational cost unit equals procurement price suffix from `resolvePriceSuffix`
3. **Cost:** `computeEffectiveUsableCost` result equals `unit_price` (±€0.005)

**Special case:** when `usableStockLabel` is null but cost+unit already match (Angus case shortcut), collapse the redundant `usableCostLine`.

Implemented in `shouldCollapseInvoiceOperationalDisplay` — applied inside `buildNormalizationCard` only.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/invoice-purchase-price-semantics.ts` | Added collapse rule + wired into card builder |
| `src/lib/invoice-purchase-price-semantics.test.ts` | Pêra/collapse tests + design-case matrix assertions |

**Not changed:** `src/routes/invoices.tsx` (already renders `card.*` via `InvoiceNormalizationCardCell`), persistence, recipe costing, ingredient detail modal.

---

## Design Case Matrix

| Case | Product | Must collapse | Pass | After (card) |
|------|---------|:-------------:|:----:|--------------|
| A | Pêra Abacate Hasse | yes | ✓ | 3.28 kg \\| €4.26 / kg · €13.96 total |
| B | Salada Ibérica | no | ✓ | 4 packs \\| €2.19 / pack · €8.76 total \\| 250 g usable \\| €8.76 / kg usable |
| C | Ovo classe M | no | ✓ | 1 case \\| €38.44 / case \\| 180 un usable \\| €0.2136 / egg usable |
| D | Tomilho | no | ✓ | 1 bunch \\| €2.06 / bunch \\| 100 g usable \\| €20.60 / kg usable |
| E | Manjericão | no | ✓ | 5 bunches \\| €2.06 / bunch · €10.28 total \\| 500 g usable \\| €20.60 / kg usable |
| — | Hortelã (kg row) | yes | ✓ | 0.50 kg \\| €6.74 / kg |
| — | Angus burger case | no | ✓ | 2 cases · 40 × 180 g \\| €46.00 / case · €92.00 total \\| 7.2 kg usable \\| €6.39 / kg usable |
| — | Angus case shortcut | yes | ✓ | 1 case \\| €24.90 / case |
| — | BAC STRK (unit vs kg) | no | ✓ | 6 un · 6 × 1 kg \\| €8.95 / unit · €53.70 total \\| 6 kg usable \\| €8.95 / kg usable |
| — | BATATA PALHA 2KG (row 1 kg, usable 2 kg) | no | ✓ | 1 kg \\| €14.50 / kg \\| 2 kg usable \\| €14.50 / kg usable |

**10/10 matrix rows passed**

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

- **Scope:** Invoice Review row right column only (`InvoiceNormalizationCardCell`)
- **Unchanged:** `effectiveUsableCostLabel` still computed (tests/API), `recipeOperationalCostFieldsFromInvoiceLine`, persistence paths, ingredient detail modal
- **Risk:** Low — display-only gate on existing normalized values

---

## Tests

```
 Test Files  1 passed (1)
      Tests  63 passed (63)
   Start at  03:15:24
   Duration  913ms (transform 399ms, setup 0ms, collect 495ms, tests 84ms, environment 0ms, prepare 64ms)


```

---

## Audit: Duplication Origin

Rendering path:

1. `ItemsTable` → `resolveInvoiceLinePricingPresentation(metadata)`
2. `buildNormalizationCard` always populated `normalizedLine` from `usableStockLabel` and `usableCostLine` from `effectiveUsableCostLabel`
3. `InvoiceNormalizationCardCell` renders all four card lines independently

For kg-priced bulk rows (Pêra, Pepino, Hortelã), stock normalization yields the same weight and `computeEffectiveUsableCost` returns identical €/kg — causing duplicate display with no added information.
