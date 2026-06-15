# Historical Pricing Integrity Audit

**Generated:** 2026-06-15  
**Mode:** READ-ONLY — DB + code replay

---

## Final Answer

**Can Marginly safely use historical pricing and opportunity calculations in production today?**

**YES WITH CAVEATS** — Core €/base-unit pipeline trusted; isolated stale rows and unmatched lines remain.

**Historical Pricing Status:** **PARTIAL** (82% confidence)

---

## Summary

| Metric | Count |
|--------|-------|
| Line audits | 51 |
| Trusted | 2 |
| Not trusted | 1 |
| Stale | 2 |
| Unmatched (no ingredient) | 46 |
| Price history rows | 16 |
| History trusted | 2 |
| History stale | 5 |
| History ghost | 9 |
| History not trusted | 0 |

---

## Problem Class Breakdown

| Class | Count |
|-------|-------|
| Math/logic bugs | 1 |
| Stale DB data | 0 |
| Extraction residue | 0 |
| GT catalog issues | 0 |
| Gross vs net display | 0 |
| No price_history | 2 |

---

## Fully Trusted (2)

- **Mozzarella fior di latte** (Aviludo April) — Mozzarella Flor di Latte 2Kg
- **Chocolate culinária** (Aviludo May) — Chocolate Culinaria Pantagruel 10x200 g

---

## Not Trusted (1)

- **—** (Emporio (live)): No catalog ingredient match — no price_history sync

---

## Stale (2)

- **Pepino conserva** (Bidfood): pack_qty_mismatch, no_price_history
- **Mozzarella fior di latte** (Bocconcino): no_price_history

---

## Known Issue: Ginger Beer Volume Parse

From [ginger-beer-audit](.tmp/ginger-beer-audit/): `0.20cl` → 2ml/bottle → €425/L usable cost when logic runs on that token. **Math in code is consistent but semantically wrong** for beverage SKUs.

---

## Known Issue: Pepino (Bidfood) — NOT a scaling bug

`unit_price=€1.77/kg` → operational `€0.00177/g` via `purchase_quantity=1000`. History stores operational €/g; **math is correct**.

---

## Emporio Note

VL UUID `17aa3591` deleted; live invoice `ab52796d` has 8 items, **0 price_history** — opportunities cannot fire from Emporio until ingredients matched + re-read sync.

---

## Code Pipeline (verified read-only)

1. **Invoice line** → `recipeOperationalCostFieldsFromInvoiceLine` → pack price + purchase_quantity
2. **Persist** → `operationalUnitPriceForPriceHistory(pack, pq)` → €/base-unit stored in `ingredient_price_history.new_price`
3. **Opportunities** → `priceHistoryDeltaPct` on linked rows; recipe impact uses `resolvePreviousUnitPriceEur`
4. **Equivalent units** → same `purchase_quantity` denominator throughout; mismatches flagged

---

## Recommendations

- Re-read VL invoices to refresh stale invoice_items + price_history
- Fix or guard 0.20cl volume token parse before trusting beverage €/L opportunities
- Investigate ghost price_history on Aviludo April/May (14 rows from prior extractions)
- Update VL harness Emporio ID to ab52796d

---

## Artifacts

| File | Contents |
|------|----------|
| `findings.json` | Full structured results |
| `executive-summary.json` | Production safety verdict |
| `affected-ingredients.json` | Trusted / not trusted lists |
| `per-ingredient/*.json` | Per-ingredient audit |
| `run-audit.mts` | Reproducible harness |
