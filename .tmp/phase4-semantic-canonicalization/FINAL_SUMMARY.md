# Final Summary — Phase 4 Semantic Canonicalization

**Date:** 2026-06-16  
**Verdict:** **READY_FOR_MATCH_TO**

## Outcome

Scoped deterministic rules in `canonical-ingredient-display-name.ts` raised semantic GOOD quality from **62.5% → 93.8%** (20/32 → 30/32), exceeding the 85–90% target without ontology, AI, or schema changes.

## What shipped

1. Charcuterie/cheese invoice brand prefix strip (Rovagnati, Rigamonti, Arrigoni Formaggi)
2. Procurement debris removal (wheel fractions, HC, PNA, 15ud, weight ranges)
3. Commercial descriptor strip (Assaporami, Formaggi, linea castello, l1)
4. Distributor noise (Sorrentino, Amoruso, Alconfirsta)
5. Duplicate token collapse (Peroni nastro azzurro)
6. 106/106 canonical tests passing

## Remaining debt (2 rows, manual-edit acceptable)

- **San Pellegrino Emporio:** OCR `in vitro` survives (pack count 15ud fixed)
- **Anchovas Aviludo:** 495g pack weight survives (supplier brand/code fixed)

## Not in scope (by design)

- Mancini pasta mill identity
- Stracciatella 250gr kitchen weight
- Italian→Portuguese ontology (cerveja, farinha)
- Matching / pricing / purchase-unit architecture

## Parent handoff

| Item | Value |
|------|-------|
| Files changed | `canonical-ingredient-display-name.ts`, `canonical-ingredient-display-name.test.ts`, `canonical-ingredient-create.test.ts` |
| Rules added | 4 brand prefixes, 9 noise tokens, 1 noise phrase, wheel fraction + weight-range regex, ud pack counts, duplicate collapse, San Pellegrino dash-prefix normalize |
| Tests added | Phase 4 describe block (display-name) + 2 create-defaults cases |
| Semantic score | 62.5% → **93.8%** GOOD |
| Remaining problematic | 2 (San Pellegrino OCR, Anchovas 495g) |
| Status | **READY_FOR_MATCH_TO** |
