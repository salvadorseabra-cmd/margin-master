# Blast Radius Search — VL Post Phase 4C/4D

**Mode:** Read-only · **VL:** `bjhnlrgodcqoyzddbpbd` · **Queried:** 2026-06-15 (live)  
**Question:** Is there another hidden Atum? Any additional affected ingredients/rows? `current_price` contamination?

---

## Atum-like pattern scan

```
Pattern: qty>1 + unit=un + per-item unit_price + op ≈ unit_price/qty
```

| Scan | Result |
|---|---|
| `suspect_double_divide` | **0** |
| History `new_price` ≠ pipeline op | **0** on 6 core + Nata/Açúcar/Chocolate |
| Catalog op ≠ latest history | **0** |
| Additional affected ingredients | **0** beyond Atum/Anchoas/Gema (already repaired) |
| `suggested_match_history_count` (post-4D) | **0** |
| Active `current_price` contamination | **None** on confirmed ingredients |

**No hidden Atum.** Phase 4C `isUnitPricePerPricedUnit` fix eliminated all double-divide bugs on confirmed data.

---

## Confirmed multi-`un` inventory (post-4C)

`validate-repair-scope.mts` reports `confirmed_multi_un_count: 5`. This is an **inventory count** (lines with `qty>1` + `unit=un`), not a bug count. All five are now VALID:

| Line | Pre-4C op | Post-4C op | `suspect_double_divide` |
|---|---|---|---|
| Anchovas Apr (qty=2) | 4.745 | **9.49** | false |
| Gema Apr (qty=6) | 1.698 | **10.19** | false |
| Atum Apr (qty=2) | 3.145 | **6.29** | false |
| Anchovas May (qty=2) | 4.995 | **9.99** | false |
| Gema May (qty=6) | 1.748 | **10.49** | false |

---

## Historical pricing alignment (6 core ingredients)

`validate-historical-pricing.mts`:

| Ingredient | Catalog op | Latest hist | Aligned |
|---|---|---|---|
| Anchoas | 9.99 | 9.99 | ✅ |
| Pepino conserva | 3.748 | 3.748 | ✅ |
| Arroz agulha | 1.162 | 1.162 | ✅ |
| Atum em óleo | 13.10 | 13.10 | ✅ |
| Mozzarella | 13.69 | 13.69 | ✅ |
| Gema líquida | 10.49 | 10.49 | ✅ |

Atum April op=6.29 vs May op=13.10 (Δ%=108.3%) — legitimate price change, not a divide bug.

---

## Control cases (never affected)

| Ingredient | Reason |
|---|---|
| Pepino | `cx` + pack semantics → `resolveUnitsPerPack`, not `rowQty` |
| Arroz | Same — carton/pack path |
| Nata | `cx` multipack path |
| Açúcar / Chocolate | `cx` multipack path |

---

## Unmatched future-risk lines (not active contamination)

| Line | Risk type | Severity |
|---|---|---|
| Emporio Ginger Beer `24 ml @ 0.85` | Volume parse (`0.20cl` → 2ml usable) | Watch at confirm |
| Emporio 7× `g`/`ml` row units | OCR qty/unit swap | Watch at confirm |
| Mammafiore Peroni/Balsamic | ml-cost routing on multipack names | Low — math correct |
| Bocconcino RICOTTA 2un pq=2 | Needs `total` check at confirm | Low |

**No `current_price` contamination** on any confirmed ingredient. Phase 4D cleared Nata orphan (`14330aad`).

---

## Verdict

**Blast radius fully contained.** No additional Atum-class bugs found beyond the three ingredients repaired in Phase 4C (Atum, Anchoas, Gema). `suspect_double_divide: 0` on all confirmed multi-`un` lines.
