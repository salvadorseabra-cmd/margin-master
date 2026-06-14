# Aviludo April v27 Validation

**Invoice:** `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Deploy:** extract-invoice v27 (1781306375803)  
**Validated:** 2026-06-12T23:20:53.840Z

## Prompt change
TOTAL COLUMN ISOLATION — `line_total_net` from VALOR only; never copy `gross_unit_price`. When qty > 1, line total must exceed unit price.

## Stability (5 runs)
| Metric | Result |
|--------|--------|
| Perfect multi-qty runs | **5/5** |
| Column-bleed runs (total = unit_price) | 0/5 |
| Avg € error (5 target rows) | **€0** |

### Per-row total correctness
| Row | Correct |
|-----|---------|
| Nata Reny Picot | 5/5 |
| Ovo Líquido | 5/5 |
| Chocolate Pantagruel | 5/5 |
| Filete Anchovas | 5/5 |
| Atum Catrineta | 5/5 |

## Financial impact
| Scope | Before (v26) | After (v27 avg) |
|-------|--------------|-----------------|
| Aviludo April (5 rows) | €169.08 | €0 |
| Global VL estimate | €220.27 | ~€51.19 |

## Verdict
**Aviludo April: CLOSED**

All 5 multi-qty rows correct on every run — total column isolation fix stable.
