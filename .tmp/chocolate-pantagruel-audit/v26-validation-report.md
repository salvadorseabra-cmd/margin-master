# Aviludo May v26 Validation — Chocolate Price Isolation

**Invoice:** `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2`  
**Deploy:** extract-invoice **v26**  
**Validated:** 2026-06-12T23:10:16.940Z

## Stability (5/5 Chocolate correct)

| Run | Chocolate unit_price | Chocolate total | Choc OK? | Açúcar qty | Açúcar price | Açúcar OK? |
|-----|---------------------|-----------------|----------|------------|--------------|------------|
| 1 | 29.99 | 59.98 | ✅ | 1 | 9.99 | ✅ |
| 2 | 29.99 | 59.98 | ✅ | 1 | 9.99 | ✅ |
| 3 | 29.99 | 59.98 | ✅ | 1 | 9.99 | ✅ |
| 4 | 29.99 | 59.98 | ✅ | 1 | 9.99 | ✅ |
| 5 | 29.99 | 59.98 | ✅ | 1 | 9.99 | ✅ |

## vs v25 Baseline

| Metric | v25 | v26 |
|--------|-----|--------|
| Chocolate unit_price | 9.99 (3/3 wrong) | 29.99, 29.99, 29.99, 29.99, 29.99 |
| Chocolate total | 19.98 | 59.98, 59.98, 59.98, 59.98, 59.98 |
| € error (Chocolate) | €40.00 | avg €0 |
| Financial improvement | — | **€40** |
| Açúcar preserved | yes | **5/5** |

## Aviludo May Status: **CLOSED**

Remaining May € error: **€0** (Chocolate only)
