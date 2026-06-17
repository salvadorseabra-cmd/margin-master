# Improvement Opportunities — Canonical Semantic Audit

**Date:** 2026-06-15

## Ranked (algorithm scope only — not implemented)

| Rank | Opportunity | Rows | Impact | Effort |
|------|-------------|-----:|--------|--------|
| 1 | Charcuterie/cheese `Brand - Product` prefix strip | 5 | High | Low |
| 2 | Wheel fractions 1/2, 1/8 | 3 | High | Low |
| 3 | Marketing lines + codes (Assaporami, Formaggi, Castello, HC) | 2 | High | Low |
| 4 | Peroni PNA + duplicate dedupe | 1 | Med | Low |
| 5 | Pellegrino Emporio: strip 15ud, fix OCR | 1 | Med | Low |
| 6 | Guanciale Sorrentino + `+/` artifact | 1 | Med | Low |
| 7 | Amoruso distributor | 1 | Med | Low |
| 8 | Anchovas alconfirsta/L1/495g | 1 | Med | Med |
| **Defer** | Mancini, Stracciatella 250gr, Farina `do` OCR | 3 | Low | — |

## What NOT to change

- Beverage brands (Peroni, San Pellegrino)
- DOP/IGP, culinary grades (oro, scelto, massima)
- fior di latte variants
- Full Italian ontology
- Speculative OCR (`do`→`da`)

## Expected lift

Semantic GOOD ~63% → ~85–90% with ~2–3 days in `canonical-ingredient-display-name.ts`.
