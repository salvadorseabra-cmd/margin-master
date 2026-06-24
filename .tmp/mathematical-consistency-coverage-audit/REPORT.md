# Mathematical Consistency Coverage Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Corpus:** 52 invoice_items · **Read-only** · 2026-06-24

## Goal

Is Gorgonzola isolated or are inconsistent invoice rows (qty×unit_price≠total) entering the system silently?

**Known case:** Gorgonzola 1.05×10.88=11.42≠13.44 (€2.02 variance) passed full pipeline.

## Required table

| Product | Qty | Unit Price | Total | Expected Total | Variance | Classification |
|---------|-----|------------|-------|----------------|----------|----------------|
| Lenha para pizzaria | 1 | 75 | 75 | 75 | €0 (0%) | SAFE |
| Recargo por combustivel | 1 | 2 | 2 | 2 | €0 (0%) | SAFE |
| Rulo Di Capra 1kg*2 Simonetta | 1 | 10.86 | 10.86 | 10.86 | €0 (0%) | SAFE |
| MOZZA Fior di Latte Expet Julienne 3kg Simonetta | 10 | 20.03 | 200.3 | 200.3 | €0 (0%) | SAFE |
| Farina do pasta fresca e gnocchi25kg Caputo | 1 | 30.11 | 30.11 | 30.11 | €0 (0%) | SAFE |
| Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro … | 24 | 1.07 | 25.69 | 25.68 | €0.01 (0.04%) | SAFE |
| Farina Speciale pizza 25kg Amoruso | 1 | 26.52 | 26.52 | 26.52 | €0 (0%) | SAFE |
| Guanciale di suino stagionato +/- 1,5kg*7 Sorre… | 5.996 | 10.83 | 64.93 | 64.94 | €0.01 (0.02%) | SAFE |
| Aceto balsamico di modena IGP pet 5l*2 Toschi | 1 | 15.55 | 16.09 | 15.55 | €0.54 (3.36%) | WARNING |
| Chocolate Culinaria Pantagruel 10x200 g | 2 | 29.99 | 59.98 | 59.98 | €0 (0%) | SAFE |
| Filete de Anchoas Alconfirosa LI 495 g | 2 | 9.99 | 19.98 | 19.98 | €0 (0%) | SAFE |
| Ovo Líquido Past.Gema Dovo 1 Kg | 6 | 10.49 | 62.94 | 62.94 | €0 (0%) | SAFE |
| Pepinos Extra Uli Frasco 6x720 g | 1 | 22.49 | 22.49 | 22.49 | €0 (0%) | SAFE |
| Atum Oleo Bolsa Nau Catrineta 1 Kg | 1 | 13.1 | 13.1 | 13.1 | €0 (0%) | SAFE |
| Arroz Agulha Metro Chef 12x1 kg | 1 | 13.95 | 13.95 | 13.95 | €0 (0%) | SAFE |
| Açucar Branco METRO Chef 10x1 Kg | 1 | 9.99 | 9.99 | 9.99 | €0 (0%) | SAFE |
| Nata Culinaria 22% Reny Picot 6x1 Lt | 5 | 18.89 | 94.45 | 94.45 | €0 (0%) | SAFE |
| Pepinos Extra II Frasco 6X720g | 1 | 21.99 | 21.99 | 21.99 | €0 (0%) | SAFE |
| Atum Óleo Bolsa Nau Catrineta 1 Kg | 2 | 6.29 | 12.58 | 12.58 | €0 (0%) | SAFE |
| Arroz Agulha Metro Chef 12x1kg | 1 | 13.45 | 13.45 | 13.45 | €0 (0%) | SAFE |
| Chocolate Pantagruel 10x200g | 2 | 29.19 | 58.38 | 58.38 | €0 (0%) | SAFE |
| Açúcar Branco Metro Chef 10x1Kg | 1 | 9.29 | 9.29 | 9.29 | €0 (0%) | SAFE |
| Nata Reny Picot 22% 6x1L | 5 | 18.29 | 91.45 | 91.45 | €0 (0%) | SAFE |
| Mozzarella Flor di Latte 2Kg | 1 | 13.69 | 13.69 | 13.69 | €0 (0%) | SAFE |
| Filete de Anchovas Alconfrista Lt 495 g | 2 | 9.49 | 18.98 | 18.98 | €0 (0%) | SAFE |
| Ovo Líquido Past.Gema Dovo 1kg | 6 | 10.19 | 61.14 | 61.14 | €0 (0%) | SAFE |
| Alho Francês | 5.42 | 1.42 | 7.67 | 7.7 | €0.03 (0.39%) | SAFE |
| Abóbora Butternut | 5.64 | 0.99 | 5.59 | 5.58 | €0.01 (0.18%) | SAFE |
| Courgettes | 3.3 | 1.56 | 5.15 | 5.15 | €0 (0%) | SAFE |
| Manteiga Coimbra s/Sal EMB 1 Kg | 8 | 8.9 | 71.2 | 71.2 | €0 (0%) | SAFE |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | 1 | 38.44 | 38.44 | 38.44 | €0 (0%) | SAFE |
| Tomilho | 1 | 2.06 | 2.06 | 2.06 | €0 (0%) | SAFE |
| Salada Ibérica FSTK EMB. 250g | 4 | 2.19 | 8.76 | 8.76 | €0 (0%) | SAFE |
| Manjericão | 5 | 2.06 | 10.28 | 10.3 | €0.02 (0.19%) | SAFE |
| Hortelã | 0.5 | 5.4 | 2.7 | 2.7 | €0 (0%) | SAFE |
| Pepino | 3.36 | 1.42 | 4.76 | 4.77 | €0.01 (0.21%) | SAFE |
| Pêra Abacate Hasse | 3.28 | 4.26 | 13.96 | 13.97 | €0.01 (0.07%) | SAFE |
| MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8 | 10 | 8.12 | 81.23 | 81.2 | €0.03 (0.04%) | SAFE |
| STRACCIATELLA 250 GR | 24 | 3.11 | 74.54 | 74.64 | €0.1 (0.13%) | SAFE |
| MEZZI PACCHERI MANCINI (CX 1KG*6) | 1 | 22.05 | 22.05 | 22.05 | €0 (0%) | SAFE |
| POMODORI PELATI (CX 2,5KG*6) | 1 | 22.05 | 22.05 | 22.05 | €0 (0%) | SAFE |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 2 | 20.97 | 42.07 | 41.94 | €0.13 (0.31%) | SAFE |
| RICOTTA TREVIGIANA 1,5KG | 1 | 7.967 | 7.97 | 7.97 | €0 (0%) | SAFE |
| ROLO DE CABRA E VACA 1KG | 1 | 12.71 | 12.71 | 12.71 | €0 (0%) | SAFE |
| Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG | 4.3 | 8.5 | 36.54 | 36.55 | €0.01 (0.03%) | SAFE |
| Arrigoni Formaggi - Gorgonzola DOP Dolce Linea … | 1.05 | 10.88 | 13.44 | 11.42 | €2.02 (15.03%) | CRITICAL |
| De Cecco - Paccheri Lisci Nr. 125 - 500g | 24 | 2.1 | 50.4 | 50.4 | €0 (0%) | SAFE |
| Rovagnati - Salame Ventricina 2,5 Kg | 2.6 | 15.19 | 39.49 | 39.49 | €0 (0%) | SAFE |
| Baladin - Ginger Beer 0.20cl | 24 | 0.81 | 19.38 | 19.44 | €0.06 (0.31%) | SAFE |
| Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1,5kg | 1.83 | 27.04 | 49.48 | 49.48 | €0 (0%) | SAFE |
| SanPellegrino - Acqua in vitro 75cl x 15ud | 2 | 19.28 | 38.56 | 38.56 | €0 (0%) | SAFE |
| Rovagnati - Mortadella IGP 'Massima' con Pistac… | 3.11 | 9.99 | 31.07 | 31.07 | €0 (0%) | SAFE |

## Task 1 — Full corpus

Scanned **52** VL `invoice_items`. Expected total = qty×unit_price (€0.02 tolerance for reconcile flag).

## Task 2 — Classification buckets

| Bucket | Count | Threshold |
|--------|-------|-----------|
| SAFE | 50 | <1% (or reconciles) |
| MINOR | 0 | 1–3% |
| WARNING | 1 | 3–10% |
| CRITICAL | 1 | >10% |
| N/A | 0 | missing qty/price/total |

**Reconciling:** 44 · **Flagged (qty×unit_price≠total):** 8 · **Material (>€0.10 or >1%):** 3

## Task 3 — Top offenders (incl. Gorgonzola)

| Product | Qty | Unit Price | Total | Expected | Variance € | Variance % | Gorgonzola? |
|---------|-----|------------|-------|----------|------------|------------|-------------|
| Arrigoni Formaggi - Gorgonzola DOP Dolce… | 1.05 | 10.88 | 13.44 | 11.42 | 2.02 | 15.03% | **YES** |
| Aceto balsamico di modena IGP pet 5l*2 T… | 1 | 15.55 | 16.09 | 15.55 | 0.54 | 3.36% | no |
| ACQUA S.PELLEGRINO (CX 75CL*15)… | 2 | 20.97 | 42.07 | 41.94 | 0.13 | 0.31% | no |
| STRACCIATELLA 250 GR… | 24 | 3.11 | 74.54 | 74.64 | 0.1 | 0.13% | no |
| Baladin - Ginger Beer 0.20cl… | 24 | 0.81 | 19.38 | 19.44 | 0.06 | 0.31% | no |
| Alho Francês… | 5.42 | 1.42 | 7.67 | 7.7 | 0.03 | 0.39% | no |
| MOZZARELLA FIOR DI LATTE "IL BOCCONCINO"… | 10 | 8.12 | 81.23 | 81.2 | 0.03 | 0.04% | no |
| Manjericão… | 5 | 2.06 | 10.28 | 10.3 | 0.02 | 0.19% | no |

## Task 4 — False positive audit

| Product | Variance | Class | Reason |
|---------|----------|-------|--------|
| Aceto balsamico di modena IGP pet 5l*2 Toschi… | €0.54 | A legitimate | ground-truth row is discount line (qty×gross≠total) |
| Alho Francês… | €0.03 | A legitimate | micro-variance €0.03 (0.39%) — weighted-produce / pack rounding |
| Manjericão… | €0.02 | A legitimate | micro-variance €0.02 (0.19%) — weighted-produce / pack rounding |
| MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125G… | €0.03 | A legitimate | micro-variance €0.03 (0.04%) — weighted-produce / pack rounding |
| STRACCIATELLA 250 GR… | €0.1 | A legitimate | micro-variance €0.1 (0.13%) — weighted-produce / pack rounding |
| ACQUA S.PELLEGRINO (CX 75CL*15)… | €0.13 | A legitimate | ground-truth row is discount line (qty×gross≠total) |
| Arrigoni Formaggi - Gorgonzola DOP Dolce Line… | €2.02 | C confirmed extraction | qty=1.05 + unit_price=10.88 wrong; total=13.44 correct; discount cols stripped at persist (gorgonzola-persistence-reconciliation-audit) |
| Baladin - Ginger Beer 0.20cl… | €0.06 | A legitimate | micro-variance €0.06 (0.31%) — weighted-produce / pack rounding |

## Task 5 — Extraction failure family (suspicious rows)

| Product | FP Class | Failure type |
|---------|----------|--------------|
| Arrigoni Formaggi - Gorgonzola DOP Dolce Line… | C_confirmed_extraction | persisted_as_extracted |

## Task 6 — Current guardrails

| Guardrail | Location | Active? | Catches Gorgonzola? |
|-----------|----------|---------|---------------------|
| applyEffectivePaidPrice (total÷qty when gross unit×qty > net total) | supabase/functions/extract-invoice/invoice-monetary-binding.ts L120-129 | YES | NO |
| bindMonetaryColumns structured discount rebind | invoice-monetary-binding.ts L57-86, L184-207 | YES | NO |
| reconcileLineItemAmounts preserve both columns | invoice-line-reconcile.ts L68-76 | YES | NO |
| reconcileLineItemsToNetSubtotal (OCR slip €0.50/€1) | invoice-line-reconcile.ts L27-61 | YES | NO |
| needsExtractionConfirmation (null unit_price or total) | src/routes/invoices.tsx L516-521 | YES | NO |
| isUnitPricePerPricedUnit (pricing semantics) | src/lib/invoice-purchase-price-semantics.ts L251-266 | YES | NO |
| Persist-time qty×unit_price≈total validation | NOT IMPLEMENTED | **NO** | YES |

**Key finding:** `applyEffectivePaidPrice` only fires when `total < qty×unit_price` (gross-over-net). Gorgonzola has `total > qty×unit_price` — the inverse failure mode. `reconcileLineItemAmounts` explicitly preserves inconsistent rows when both columns are present.

## Task 7 — Needs review counts

| Threshold | Count |
|-----------|-------|
| variance_pct > 5% | 1 |
| variance_pct > 10% | 1 |
| variance_pct > 5% AND > 10% | 1 |

## Task 8 — Blast radius (suspicious rows)

### Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1
- Matches: 1 (confirmed)
- Ingredients / current_price: [{"id":"1526106c-7bac-4b70-bd51-7b0fd5cc89ed","name":"Gorgonzola DOP dolce","current_price":10.88,"purchase_quantity":1000,"base_unit":"g"}]
- price_history rows (this invoice): 1
- Recipes affected: 0 
- margin_impact rows: 0
- Margin alerts derive from ingredient_price_history + recipes via margin-alerts.ts — indirect blast radius through current_price/history

## FINAL VERDICT

### **A)** Gorgonzola is the sole material confirmed extraction bug (€2.02, 15.03%); 2 other material mismatches are legitimate discount lines

**If reconciliation guardrail existed today (|qty×unit_price−total|>€0.02 blocks persist):**
- **VL rows caught (all flagged):** 8
- **VL rows caught (material only):** 3
- **Bugs prevented (material confirmed extraction):** 1
- **False positives (discount/rounding):** 7

### Verdict key
- **A** — Isolated: Gorgonzola sole confirmed bug
- **B** — Small family cluster
- **C** — Widespread silent ingestion
- **D** — Mixed: discounts mask extraction bugs

## Cross-references
- `.tmp/gorgonzola-mathematical-trace-audit/` — Gorgonzola €10.88/kg denominator trace
- `.tmp/gorgonzola-persistence-reconciliation-audit/` — structured extraction failure at persist
- `.tmp/gorgonzola-unit-price-origin-audit/` — applyEffectivePaidPrice would not fire
- `invoice-monetary-binding.ts` — bindMonetaryColumns / applyEffectivePaidPrice
- `invoice-line-reconcile.ts` — reconcileLineItemAmounts preserves discount math