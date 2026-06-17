# Atum UI Validation

**Method:** Manual recalc from physical invoice values only.

---

## Expected prices (invoice truth)

```
April per-bag: €6.29
May per-bag:   €6.55
Δ%: (6.55 − 6.29) / 6.29 × 100 = +4.13% ≈ +4.1%
```

---

## UI surfaces vs truth

| Surface | Source | April | May | Correct? |
|---------|--------|-------|-----|----------|
| Purchase history | `invoice_items.unit_price` | €6.29 | €13.10 (if `79956d1b`) | Apr ✅ / May ❌ |
| Price alert | prior vs current line `unit_price` | — | +108% (6.29→13.10) | ❌ should +4.1% |
| Catalog | `ingredients.current_price` | — | €13.10 | ❌ should 6.55 |

---

## Is the UI correct?

**NO**

- April purchase display: correct (€6.29 from correct row)
- May purchase price, catalog, and spike alert: wrong (uses 1×€13.10 instead of 2×€6.55)
