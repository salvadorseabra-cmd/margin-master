# Anchoas Recovery — Phase 1B Results

**Date:** 2026-06-14  
**Ingredient ID:** `c811f67f-df4d-4194-ba8b-7a15d4af38bd`  
**Supplier:** AVILUDO

## Before / After

| Metric | Phase 1 (whitespace) | Phase 1B (+ fuzzy) |
|--------|---------------------|-------------------|
| Anchoas matcher (7 variants) | 3/7 | **6/7** |
| Fuzzy simulation (ed≤2) | 6/7 | 6/7 (now in production) |

## Variant Results

| # | OCR Variant | Phase 1 | Phase 1B | Match path |
|---|-------------|---------|----------|------------|
| 1 | Alconfirosa LI 495 g | ❌ | ✅ | Fuzzy → alconfiosa (ed=1) |
| 2 | Alconfrista Lt 495 g | ✅ | ✅ | Exact |
| 3 | Alconfi sta Lt 495 g | ✅ | ✅ | Exact (collapsed to alconfista) |
| 4 | Alconfrisa Lt 495 g | ✅ | ✅ | Exact |
| 5 | Alconfirsta L1 495 g | ❌ | ✅ | Fuzzy → alconfista (ed=1) |
| 6 | Alconfi osa LI 495 g | ❌ | ✅ | Fuzzy → alconfiosa (ed=0) |
| 7 | Alcofiorisa Lt 495 g | ❌ | ❌ | ed=3+ from all stored stems |

## Remaining Miss

**Alcofiorisa** — character transposition (`fior` vs `fri`) pushes edit distance beyond 2 from all stored AVILUDO brand stems. Would require ed≤3 or explicit token swap (Phase 2).

## Fuzzy Recovery Log Samples

```
[fuzzy-alias-recovery] supplier=AVILUDO candidateKey=filete de anchoas alconfirosa li 495
  matchedKey=Aviludo::filete de anchovas alconfiosa 495 distance=1

[fuzzy-alias-recovery] supplier=AVILUDO candidateKey=filete de anchovas alconfirsta 495
  matchedKey=AVILUDO::filete de anchovas alconfista 495 distance=1
```
