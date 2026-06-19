# Historical Pricing Integrity Audit

**Generated:** 2026-06-19  
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
| Trusted | 17 |
| Not trusted | 1 |
| Stale | 8 |
| Unmatched (no ingredient) | 25 |
| Price history rows | 49 |
| History trusted | 27 |
| History stale | 13 |
| History ghost | 9 |
| History not trusted | 0 |

---

## Problem Class Breakdown

| Class | Count |
|-------|-------|
| Math/logic bugs | 1 |
| Stale DB data | 0 |
| Extraction residue | 2 |
| GT catalog issues | 0 |
| Gross vs net display | 1 |
| No price_history | 2 |

---

## Fully Trusted (17)

- **Manjericão** (Bidfood) — Manjericão
- **Tomilho** (Bidfood) — Tomilho
- **Manteiga s/sal** (Bidfood) — Manteiga Coimbra s/Sal Emb 1 Kg
- **Abóbora butternut** (Bidfood) — Abóbora Butternut
- **Alho francês** (Bidfood) — Alho Francês
- **Courgettes** (Bidfood) — Courgettes
- **Pêra abacate** (Bidfood) — Pêra Abacate Hasse
- **Hortelã** (Bidfood) — Hortelã
- **Mozzarella fior di latte** (Aviludo April) — Mozzarella Flor di Latte 2Kg
- **Chocolate culinária** (Aviludo May) — Chocolate Culinaria Pantagruel 10x200 g
- **Mezzi paccheri mancini** (Bocconcino) — MEZZI PACCHERI MANCINI (CX 1KG*6)
- **Pomodori pelati** (Bocconcino) — POMODORI PELATI (CX 2,5KG*6)
- **Ricotta trevigiana** (Bocconcino) — RICOTTA TREVIGIANA 1,5KG
- **Rovagnati salame ventricina** (Emporio (live)) — Rovagnati - Salame Ventricina 2,5 Kg
- **Rigamonti bresaola punta d'anca oro** (Emporio (live)) — Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1,5kg
- **Mortadella IGP massima con pistacchio** (Emporio (live)) — Rovagnati - Mortadella IGP "Massima" con Pistacchio 1/2 - 3,5kg
- **Rulo di capra** (Mammafiore) — Rulo Di Capra 1kg*2 Simonetta

---

## Not Trusted (1)

- **Ginger beer** (Emporio (live)): Volume parse bug: €5425/L (expected ~€2-5/L); Matched ingredient but no price_history row for this invoice

---

## Stale (8)

- **Pepino conserva** (Bidfood): pack_qty_mismatch, no_price_history
- **Stracciatella** (Bocconcino): pack_qty_mismatch, stale_price_history
- **Rolo de cabra e vaca** (Bocconcino): extraction_residue_or_stale
- **Mozzarella fior di latte** (Bocconcino): stale_price_history
- **Prosciutto cotto scelto** (Emporio (live)): pack_qty_mismatch
- **Farina do pasta fresca e gnocchi** (Mammafiore): extraction_residue_or_stale
- **Birra peroni nastro azzurro 33cl** (Mammafiore): stale_price_history
- **Aceto balsamico di modena IGP** (Mammafiore): pack_qty_mismatch

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
