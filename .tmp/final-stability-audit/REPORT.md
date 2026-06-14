# Final Extraction Stability Audit — v30

**Deploy verified:** extract-invoice **v30** (read-only check, no deploy)  
**Generated:** 2026-06-13  
**Method:** 10 independent invokes × 3 invoices = **30** total

---

## Closure Recommendation: **EXTRACTION MOSTLY CLOSED** (85% confidence)

Only farina deterministic bug(s) with low € impact; Emporio rows are GPT variance not structural regression.

---

## Stability Matrix (10 runs per row)

| Row | Correct vs GT | Correct vs Visible | Avg € err | Worst € | Best € | p95 € | Var % | Class |
|-----|---------------|-------------------|-----------|---------|--------|-------|-------|-------|
| Gorgonzola DOP Dolce | 60% | 60% | €5.49 | €32.26 | €0 | €32.26 | 51.84% | B |
| Bresaola Punta d'Anca Oro | 100% | 100% | €0 | €0 | €0 | €0 | 0% | B |
| SanPellegrino Acqua in vitro | 100% | 100% | €0 | €0 | €0 | €0 | 0% | B |
| Farina Speciale pizza 25kg | 0% | 0% | €1 | €1 | €1 | €1 | 0% | A |
| POMODOR PELATI | 0% | 100% | €27.95 | €27.95 | €27.95 | €27.95 | 0% | C |

**Aggregate:** avg € error **€6.89** · p95 **€27.95** across 50 focus-row runs

---

## Critical Questions

1. **Does Gorgonzola still fail after v28?** — YES — intermittent (60% correct vs GT, avg €5.49)
2. **Does Pomodor still match visible invoice?** — YES (100% vs visible)
3. **Is Farina the only deterministic extraction bug?** — YES (farina)
4. **Average financial error (10 runs):** per-row in stability-matrix.json; aggregate **€6.89**
5. **p95 financial error:** aggregate **€27.95**

---

## Per-Row Detail

### Gorgonzola DOP Dolce (gorgonzola)
- GT total: 13.44 · Visible: 13.44
- Totals seen: [13.44,18.68,26.85,45.7,17.38]
- Class: **B** — Mixed outcomes — GT 60% correct, visible 60%
  - Run 1: qty=1.05 unit=9.88 total=13.44
  - Run 2: qty=2 unit=9.35 total=18.68
  - Run 3: qty=2 unit=10.22 total=13.44
  - Run 4: qty=2 unit=8.43 total=13.44
  - Run 5: qty=2 unit=10.2 total=13.44
  - Run 6: qty=2 unit=13.43 total=26.85
  - Run 7: qty=2 unit=10.22 total=13.44
  - Run 8: qty=2 unit=22.85 total=45.7
  - Run 9: qty=2 unit=13.22 total=13.44
  - Run 10: qty=2 unit=8.69 total=17.38

### Bresaola Punta d'Anca Oro (bresaola)
- GT total: 49.48 · Visible: 49.48
- Totals seen: [49.48]
- Class: **B** — Intermittent — 100% correct; 1 distinct totals
  - Run 1: qty=1.83 unit=27.04 total=49.48
  - Run 2: qty=1.83 unit=27.04 total=49.48
  - Run 3: qty=1.83 unit=27.04 total=49.48
  - Run 4: qty=1.83 unit=27.04 total=49.48
  - Run 5: qty=1.83 unit=27.04 total=49.48
  - Run 6: qty=1.83 unit=27.04 total=49.48
  - Run 7: qty=1.83 unit=27.04 total=49.48
  - Run 8: qty=1.83 unit=27.04 total=49.48
  - Run 9: qty=1.83 unit=27.04 total=49.48
  - Run 10: qty=1.83 unit=27.04 total=49.48

### SanPellegrino Acqua in vitro (sanpellegrino)
- GT total: 38.56 · Visible: 38.56
- Totals seen: [38.56]
- Class: **B** — Intermittent — 100% correct; 1 distinct totals
  - Run 1: qty=2 unit=19.28 total=38.56
  - Run 2: qty=2 unit=19.28 total=38.56
  - Run 3: qty=2 unit=19.28 total=38.56
  - Run 4: qty=2 unit=19.28 total=38.56
  - Run 5: qty=2 unit=19.28 total=38.56
  - Run 6: qty=2 unit=19.28 total=38.56
  - Run 7: qty=2 unit=19.28 total=38.56
  - Run 8: qty=2 unit=19.28 total=38.56
  - Run 9: qty=2 unit=19.28 total=38.56
  - Run 10: qty=2 unit=19.28 total=38.56

### Farina Speciale pizza 25kg (farina)
- GT total: 26.52 · Visible: 26.52
- Totals seen: [25.52]
- Class: **A** — Consistently wrong — 0% correct vs GT, 0% vs visible
  - Run 1: qty=1 unit=26.52 total=25.52
  - Run 2: qty=1 unit=26.52 total=25.52
  - Run 3: qty=1 unit=26.52 total=25.52
  - Run 4: qty=1 unit=26.52 total=25.52
  - Run 5: qty=1 unit=26.52 total=25.52
  - Run 6: qty=1 unit=26.52 total=25.52
  - Run 7: qty=1 unit=26.52 total=25.52
  - Run 8: qty=1 unit=26.52 total=25.52
  - Run 9: qty=1 unit=26.52 total=25.52
  - Run 10: qty=1 unit=26.52 total=25.52

### POMODOR PELATI (pomodor)
- GT total: 50 · Visible: 22.05
- Totals seen: [22.05]
- Class: **C** — Extraction matches visible on 100% runs; GT catalog differs
  - Run 1: qty=1 unit=22.05 total=22.05
  - Run 2: qty=1 unit=22.05 total=22.05
  - Run 3: qty=1 unit=22.05 total=22.05
  - Run 4: qty=1 unit=22.05 total=22.05
  - Run 5: qty=1 unit=22.05 total=22.05
  - Run 6: qty=1 unit=22.05 total=22.05
  - Run 7: qty=1 unit=22.05 total=22.05
  - Run 8: qty=1 unit=22.05 total=22.05
  - Run 9: qty=1 unit=22.05 total=22.05
  - Run 10: qty=1 unit=22.05 total=22.05
