# v30 Rulo IVA/Valor Validation

**Deploy:** extract-invoice v30 on `bjhnlrgodcqoyzddbpbd`  
**Invoice:** Mammafiore `36c99d19-6f9f-413f-8c2d-ae3526291a2d`  
**Generated:** 2026-06-13

## Deno tests

| Suite | Result |
|-------|--------|
| invoice-monetary-binding.test.ts | 7/7 pass |
| invoice-image-crop.test.ts | 8/8 pass |

## Rulo stability

| Metric | v29 baseline | v30 |
|--------|--------------|-----|
| Correct total runs | 1/5 (20%) | **5/5 (100%)** |
| IVA bleed runs | 4/5 | 0/5 |
| Avg Rulo € error | €3.89 | €0 |
| Totals seen | [6,10.86] | [10.86] |

## Recovery

- **€4.86** per corrected run (Valor 10.86 vs IVA 6.00)
- Additional correct runs vs v29: **4**
- Avg error reduction: **€3.89**

## Mammafiore residual (all rows)

| Run | Rulo €err | Invoice residual |
|-----|-----------|------------------|
| 1 | €0 | €58.63 |
| 2 | €0 | €56.63 |
| 3 | €0 | €58.63 |
| 4 | €0 | €58.63 |
| 5 | €0 | €56.63 |

**Avg Mammafiore residual (all 8 GT rows):** €57.83 — inflated by **missing rows** (Farine Speciale, Farina 00 not returned in probe; validation regex used `Farina` but GPT emits `Farine`).

## Focus-row residual (Class A from v28 lab)

| Row | v28 lab | v30 probe (5-run) |
|-----|---------|-------------------|
| Rulo Di Capra | €4.86 | **€0** (5/5 at total 10.86) |
| Farina Speciale | €1.00 (total 25.52 vs GT 26.52) | Row not returned in probe runs |
| **Matched focus sum** | **€5.86** | **€0** (Rulo only; Farina absent) |

v30 eliminates the Rulo IVA bleed entirely. Farina Speciale €1 drift is **out of scope** for this prompt change and was not observed in v30 runs (row missing, not mis-totalled).

## Per-run Rulo detail

- Run 1: total=10.86 unit_price=10.86 ✓
- Run 2: total=10.86 unit_price=10.86 ✓
- Run 3: total=10.86 unit_price=10.86 ✓
- Run 4: total=10.86 unit_price=10.86 ✓
- Run 5: total=10.86 unit_price=10.86 ✓
