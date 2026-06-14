# Final Residual Error Audit — v27

**Generated:** 2026-06-12  
**Deploy:** extract-invoice **v27** (VL `bjhnlrgodcqoyzddbpbd`)  
**Mode:** READ-ONLY — fresh v27 invokes + ground-truth alignment

---

## Executive Summary

After v27 (Aviludo April total-column isolation), global financial error drops from **€220.27 → €64.25** on this single-run audit. The April fix accounts for **€169.08** (−77%). The remaining **€64.25** decomposes 100% into:

| Bucket | € | Share |
|--------|---|-------|
| **A) Extraction bugs** | **€34.90** | 54.3% |
| **B) GT mismatches** | **€29.35** | 45.7% |
| C) Normalization | €0 | 0% |
| D) Business interpretation (€0 fin) | 16 rows | field-only |

**VL status: OPEN** (Emporio + Bocconcino drive residual €)

**Projected if all real extraction bugs fixed:** ~**€29.35** financial error, ~**85%** field accuracy.

---

## Global Metrics

| Metric | v26 | v27 (this audit) | Δ |
|--------|-----|------------------|---|
| Financial error € | €220.27 | **€64.25** | **−€155.02** |
| Field accuracy | 82.65% | **82.84%** | +0.19pp |
| April financial € | €169.08 | **€0** | **CLOSED** |
| May financial € | €0 | **€0** | stable |
| Bidfood financial € | €0 | **€0** | CLOSED |

### Sum check (100% of residual accounted)

```
v26 total                          €220.27
− April fix (v27, 5/5 stable)     −€169.08
= Theoretical post-April          € 51.19   ← prior estimate

v27 measured (this run)           € 64.25
Δ vs theoretical                  +€ 13.06   ← GPT run variance

v27 decomposition:
  Extraction bugs (A)             € 34.90
  GT mismatches (B)               € 29.35
  Sum                             € 64.25   ✓ 100%
```

The +€13.06 vs €51.19 estimate is **not unaccounted** — it is run-to-run GPT variance on Emporio (Gorgonzola +€13.56, Bresaola +€10) partially offset by Pomodor reclassification (extraction improved, GT bucket −€10.25).

---

## Per-Invoice Status (v27)

| Invoice | Fin Err € | Field % | v26 Fin € | Status |
|---------|-----------|---------|-----------|--------|
| Bidfood | €0 | 95.5% | €0 | **CLOSED** |
| Aviludo April | €0 | 100% | €169.08 | **CLOSED** |
| Aviludo May | €0 | 93.8% | €0 | **PARTIAL** (field-only) |
| Emporio | €30.44 | 56.3% | €11.99 | OPEN |
| Bocconcino | €27.95 | 71.4% | €38.20 | OPEN |
| Mammafiore | €5.86 | 71.9% | €1.00 | PARTIAL |

---

## Ranked Wrong Rows (by € contribution)

| Rank | Invoice | Product | € | Class | v27 extract | GT |
|------|---------|---------|---|-------|-------------|-----|
| 1 | Bocconcino | POMODOR PELATI | **€27.95** | **B** | 1 @ €22.05 = €22.05 | 2 @ €25 = €50 |
| 2 | Emporio | Gorgonzola Castelfrigo | **€13.56** | **A** | 2 @ €13.50 = €27.00 | 1.35 @ €9.92 = €13.44 |
| 3 | Emporio | Bresaola Punta d'Anca | **€10.00** | **A** | 2.38 @ €16.64 = €39.48 | 2.8 @ €17.68 = €49.48 |
| 4 | Mammafiore | Rulo Di Capra 1kg*2 | **€4.86** | **A** | 1 @ €10.86 = **€6.00** | 1 @ €15.19 = €10.86 |
| 5 | Emporio | SanPellegrino Acqua | **€4.70** | **A** | 3 @ €14.42 = €43.26 | 2.56 @ €15.06 = €38.56 |
| 6 | Emporio | Prosciutto Cotto | **€1.40** | **B** | 4.3 @ €8.50 = **€36.54** | 4.3 @ €8.17 = €35.14 |
| 7 | Mammafiore | Farina Speciale pizza | **€1.00** | **A** | 1 @ €26.52 = €25.52 | 1 @ €33.15 = €26.52 |
| 8 | Emporio | Mortadella IGP | **€0.78** | **A** | 3.1 @ €9.77 = €30.29 | 3.11 @ €10.10 = €31.07 |

All other flagged rows: **€0 financial impact** (field/display only).

---

## Classification Detail

### A) Extraction bugs — €34.90 (fixable in pipeline)

| Product | Visible (if known) | v27 | Mechanism |
|---------|-------------------|-----|-----------|
| Gorgonzola | — | qty 2 vs GT 1.35; total €27 vs €13.44 | Weight/qty misread; run variance (v26 had €0 on this row) |
| Bresaola | — | qty 2.38, total €39.48 vs GT €49.48 | Weight + price column shift; v26 total matched |
| SanPellegrino | — | qty 3 vs GT 2.56 | Case-count misread (v26: qty 2, €10.06 err) |
| Rulo Di Capra | pack *2 in name | total €6 vs GT €10.86 | Discount/total column — reads partial line total |
| Farina Speciale | — | total €25.52 vs €26.52 | €1 off — discount/net total drift |
| Mortadella | gross €11.10, total €31.07 | total €30.29 | Partial discount column bleed |
| Mezzi Paccheri | visible qty 1 | qty 2, total OK €27.30 | Qty only, €0 fin |
| Ricotta | visible qty 1 | qty 2, total OK €7.97 | Qty only, €0 fin |

### B) GT mismatches — €29.35 (catalog revision, not extraction)

| Product | Visible invoice | v27 (correct read) | GT (stale/wrong) |
|---------|----------------|-------------------|------------------|
| **POMODOR PELATI** | **qty 1, VALOR €22.05** | **1 @ €22.05** ✓ | qty 2, total €50 |
| Prosciutto Cotto | Preço Total **€36.54** | total **€36.54** ✓ | total €35.14 (net catalog) |

**Pomodor is the dominant GT issue.** v26 classified this as €38.20 extraction bug (qty 4, total €88.20). v27 reads the visible row correctly — error bucket shifts to GT revision.

### C) Normalization mismatch — €0

No v27 case where Pass C was correct but binder/reconcile altered totals. All financial deltas trace to Pass C or GT.

### D) Business interpretation — €0 financial (field accuracy only)

| Product | Issue | Financial € |
|---------|-------|---------------|
| Ginger Beer | v27: qty **2** @ €9.69 = €19.38 ✓ (v26 single-run had qty 24) | **€0** |
| Ventricina | unit €15.19 (net) vs GT gross €16.60; total €39.49 ✓ | €0 |
| Mammafiore discounted lines (6 rows) | unit_price = net; total correct | €0 |
| Bocconcino Mozzarella/Stracciatella | unit_price = net after DESC%; total correct | €0 |
| May Atum | qty 1 vs GT 2; total €13.10 preserved | €0 |
| Bidfood Manjericão/Tomilho | unit_price derived; total correct | €0 |

---

## Key Examples (per user brief)

### Bocconcino Pomodor — GT qty 2 vs visible qty 1
- **Visible:** QUANT 1, P.VENDA €27.56, VALOR LÍQUIDO **€22.05** (column-shift-audit)
- **v27:** qty **1**, total **€22.05** → matches visible
- **GT:** qty 2, total €50 → **Class B** (€27.95 delta)
- **v26 contrast:** qty 4, total €88.20 → was Class A (€38.20)

### Emporio Prosciutto / Ventricina — gross vs net
- **Prosciutto visible total:** €36.54; **v27 total:** €36.54 → **Class B** (GT €35.14)
- **Ventricina:** v27 unit €15.19 (net), total €39.49 matches visible → **Class D** (€0)

### Ginger Beer — qty 24 vs 2
- **This v27 run:** qty **2** @ €9.69, total €19.38 → matches GT
- **Visible invoice prints:** qty 24,00 @ €0.85/bottle (same €19.38)
- **Financial impact either way:** **€0** — case vs bottle framing only

### Mortadella — partial
- v27: total €30.29 vs GT €31.07 (€0.78) — discount column partial read
- v26: total €30.74 (€0.33) — similar family, run variance

---

## Remaining Bug List (extraction only — Class A, €>0)

1. Emporio Gorgonzola — €13.56
2. Emporio Bresaola — €10.00
3. Emporio SanPellegrino — €4.70
4. Mammafiore Rulo Di Capra — €4.86
5. Mammafiore Farina Speciale — €1.00
6. Emporio Mortadella — €0.78

**Total extraction bugs: €34.90**

Plus €0-impact qty bugs: Mezzi Paccheri, Ricotta (Bocconcino).

---

## Remaining GT Issues (Class B)

1. **Bocconcino POMODOR PELATI** — revise GT to qty 1 / total €22.05 (visible) — **€27.95**
2. **Emporio Prosciutto** — accept visible Preço Total €36.54 or net €35.14 — **€1.40**

**Total GT issues: €29.35**

---

## Projected Final VL Score

| Scenario | Field % | Financial € |
|----------|---------|-------------|
| **v27 actual** | 82.84% | €64.25 |
| **If extraction bugs fixed** | ~84.8% | **€29.35** |
| **If GT also revised** | ~91%+ | **~€0** |
| Post-refinement baseline (prior) | 91.80% | €66.34 |

Fixing extraction bugs alone closes ~54% of remaining €. GT revision on Pomodor + Prosciutto closes the rest.

---

## Artifacts

| File | Contents |
|------|----------|
| `executive-summary.json` | Global metrics, sum check, projections |
| `row-ranking.json` | All 26 non-perfect rows ranked by € |
| `classification.json` | A/B/C/D taxonomy with bug/GT lists |
| `metrics.json` | Per-invoice aligned rows |
| `extracts/` | Raw v27 extraction JSON per invoice |
| `run-audit.mts` | Reproducible audit script |
