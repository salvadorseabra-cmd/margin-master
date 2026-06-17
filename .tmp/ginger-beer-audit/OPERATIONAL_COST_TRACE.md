# Operational Cost Trace — UI numbers

**Reported UI:** Pack €10.85 · Unit ml · Usable 2 ml · **€5,425 / L usable**

---

## Path to €5,425/L (matches qty=2 @ €10.85 extract)

| Step | Function | Input | Output |
|------|----------|-------|--------|
| 1 | `detectVolume(name)` | `0.20cl` | **2 ml**/unit |
| 2 | `parsePurchaseStructureFromText` | full name | bare_measure, 2 ml |
| 3 | `resolveUsablePerPricedUnit` | qty=2 | **2 ml** per priced unit |
| 4 | `recipeOperationalCostFieldsFromInvoiceLine` | unit_price=10.85 | current_price=10.85, pq=2, base=ml |
| 5 | `computeEffectiveUsableCost` | €10.85, 2 ml | **€10.85 ÷ 0.002 L = €5,425/L** |

```
liters_per_unit = 2 ml / 1000 = 0.002 L
€/L = €10.85 / 0.002 = €5,425/L
```

---

## Visible invoice path (qty=24 @ €0.85)

| Step | Output |
|------|--------|
| Per-unit usable | 2 ml |
| Total usable | 48 ml |
| €/L | **€0.85 / 0.002 = €425/L** |

---

## Live DB row (qty=2 cx @ €9.69)

`isCaseRowWithEmbeddedPieceWeightOnly` → suppresses ml €/L; UI shows **€9.69 / case**.

**Conclusion:** €5,425/L requires **€10.85** pack price (qty=2 extract variant), not visible column €0.85.
