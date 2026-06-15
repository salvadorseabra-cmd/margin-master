# Final Verdict — Purchase Unit Intelligence Audit (VL Post 4C/4D)

**Mode:** Read-only · **VL:** `bjhnlrgodcqoyzddbpbd` · **Queried:** 2026-06-15 (live)

---

## Verdict: CLEAN ON CONFIRMED DATA — NO HIDDEN ATUM

| Question | Answer |
|---|---|
| Remaining purchase-unit bugs on confirmed VL? | **No** |
| INCORRECT rows? | **0** (confirmed) |
| SUSPICIOUS rows? | **2 unmatched** Mammafiore volume lines (cosmetic heuristic; math OK) |
| Active contamination? | **None** (4D cleared Nata orphan) |
| Safe for Review & Create (Aviludo confirmed)? | **Yes** |
| Safe for Review & Create (Bocconcino/Emporio/Mammafiore)? | **Caution** — re-extract or manual review first |
| Safe for Canonical Identity (repaired ingredients)? | **Yes** — Atum, Anchoas, Gema, Pepino, Arroz, Nata, Mozzarella |

---

## Executive answer

**Is there another hidden Atum?** **No.**

On confirmed VL data, the Phase 4C `isUnitPricePerPricedUnit` fix eliminated all double-divide bugs. Live validation shows:

| Check | Result |
|---|---|
| `suspect_double_divide` on multi-`un` lines | **0 / 5** |
| `validate-historical-pricing.mts` (6 core ingredients) | **All aligned** |
| `suggested_match_history_count` (post-4D) | **0** |
| History ≠ pipeline on confirmed lines | **0 mismatches** |
| Active `current_price` contamination | **None** on confirmed ingredients |

`confirmed_multi_un_count: 5` in `validate-repair-scope.mts` is an inventory count, not a bug count. All five are VALID with `purchase_qty=1` and correct operational prices.

---

## Validation script results (live)

### `validate-repair-scope.mts`

- `fix_3_multi_un.confirmed_multi_un_count`: **5** (all `suspect_double_divide: false`)
- `suggested_match_history_count`: **0** (Nata orphan `14330aad` deleted in 4D)
- `duplicate_groups_count`: **0**
- Mozzarella poison rows: **deleted** (1 clean row remains)

### `validate-historical-pricing.mts`

| Ingredient | Catalog op | Latest hist | Aligned | Multi-un lines |
|---|---|---|---|---|
| Anchoas | 9.99 | 9.99 | ✅ | pq=1, op=unit_price |
| Pepino conserva | 3.748 | 3.748 | ✅ | cx→pq=6 |
| Arroz agulha | 1.162 | 1.162 | ✅ | cx→pq=12 |
| Atum em óleo | 13.10 | 13.10 | ✅ | Apr op=6.29, May op=13.10 |
| Mozzarella | 13.69 | 13.69 | ✅ | — |
| Gema líquida | 10.49 | 10.49 | ✅ | pq=1, op=unit_price |

---

## Cosmetic (non-blocking)

- Anchoas, Gema, Atum stamp `ingredient_unit=g` while operational values are €/tin (per-item). Math is correct; label only.

---

## Caution items (unmatched, not active bugs)

1. **Emporio `g`/`ml` OCR** — 8 lines with qty/unit swap. **HIGH risk** if confirmed without re-extract.
2. **Emporio Ginger Beer `0.20cl`** — known volume parse bug. Watch at confirm.
3. **Mammafiore Peroni + Balsamic** — 2 SUSPICIOUS unmatched lines (volume-cost routing; math OK).

---

## Recommendation before Review & Create

1. **Proceed** on Aviludo confirmed lines — purchase unit intelligence is sound post-4C.
2. **Do not bulk-confirm** Bocconcino / Emporio / Mammafiore without re-extract or line-level review (OCR `g`/`ml` units, Ginger Beer `0.20cl`).
3. **Optional P2:** Deploy suggested-match backfill gate (already identified in 4D).
4. **Optional P3:** Confirm May Nata match if user wants catalog at 3.148 vs 3.048.

---

## Phase lineage

| Phase | Purchase-unit outcome |
|---|---|
| 4C | Fixed `resolveCountablePurchaseQuantityForCost`; 6 history rows + Anchoas/Gema catalog |
| 4D | Cleared Nata orphan; `suggested_match_history_count: 0` |
| This audit | **No additional Atum-class bugs found** |

---

## Deliverables

| File | Summary |
|---|---|
| `PURCHASE_UNIT_CLASSIFICATION.md` | 51 items, 5 classes |
| `COUNTABLE_AUDIT.md` | 5 multi-`un` VALID post-4C; 0 INCORRECT confirmed |
| `MULTIPACK_AUDIT.md` | 11 lines, all VALID |
| `CASE_AUDIT.md` | 3 case lines, all VALID |
| `EDGE_CASE_AUDIT.md` | Emporio g/ml OCR risk HIGH |
| `BLAST_RADIUS_SEARCH.md` | No hidden Atum; `suspect_double_divide: 0` |
| `FINAL_VERDICT.md` | CLEAN on confirmed data; safe for Review & Create on Aviludo |
