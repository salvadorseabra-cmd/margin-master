# Current Price Audit — Nata Culinária

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Ingredient:** Nata culinária `3d1af48c-be3c-494a-9e0f-be267fc9388b`  
**Mode:** Read-only

---

## The mismatch

| Source | Pack € | Op €/un | Authoritative? |
|---|---|---|---|
| Catalog (`current_price` ÷ 6) | 18.29 | **3.048** | ✅ Latest **confirmed** purchase (April) |
| Latest history (`14330aad`) | 18.89 | **3.148** | ❌ Unconfirmed May suggested match |
| May invoice line (if confirmed) | 18.89 | **3.148** | Would become correct **after user confirms** |

**Gap:** 3.048 vs 3.148 (+€0.10/un, +3.28%)

---

## Why 3.048 vs 3.148?

1. **Real price increase** on May invoice: pack price rose from 18.29 → 18.89 (+€0.60/cx, +3.3%)
2. **April purchase was confirmed** → `persistOperationalIngredientCostFromInvoiceLine` updated catalog to 18.29 (op 3.048)
3. **May purchase was suggested only** → backfill wrote history at 18.89 (op 3.148) but did **not** update catalog
4. Catalog still reflects last confirmed persist (April). History reflects unconfirmed May backfill write.

---

## Which is correct?

| Question | Answer |
|---|---|
| Is the math wrong? | **No** — both operational prices are correctly computed (pack ÷ 6) |
| Is 3.048 wrong economically? | **No** — it is the last confirmed purchase price |
| Is 3.148 wrong economically? | **No** — it reflects the actual May invoice line price |
| Is the **state** wrong? | **Yes** — unconfirmed history row pollutes latest-history queries |

The blocker is not wrong math. It is an **unconfirmed history row** making latest-history (3.148) diverge from catalog (3.048).

---

## Which should drive `current_price`?

| State | Correct driver | Op €/un |
|---|---|---|
| **Today (pre-confirm)** | Last **confirmed** purchase (April) | **3.048** |
| **After May confirm** | May invoice (newer confirmed purchase) | **3.148** |

Foundation readiness rule: catalog and latest confirmed history must align. An unconfirmed suggested row must not be the latest history source.

---

## Validator impact

| Check | Current result | Expected after repair |
|---|---|---|
| `current_price_from_latest_history` | **false** | **true** |
| Catalog op | 3.048 | 3.048 (delete) or 3.148 (confirm May) |
| Latest history op | 3.148 | 3.048 (delete) or 3.148 (confirm May) |

---

## Comparison to other audit ingredients

All **8 other** foundation-audit ingredients have aligned catalog and latest-history operational prices. Nata culinária is the **sole** `current_price` mismatch in the 9-ingredient sample.

---

## Post-repair expectations

### Option A — Delete `14330aad` (recommended)

| Field | Value |
|---|---|
| Catalog op | 3.048 |
| Latest history op | 3.048 (row `2767b722`) |
| `current_price_from_latest_history` | **true** |

### Option B — Confirm May match + refresh catalog

| Field | Value |
|---|---|
| Catalog op | 3.148 |
| Latest history op | 3.148 (row `14330aad`, now backed by confirmed match) |
| `current_price_from_latest_history` | **true** |

Both options unblock foundation readiness. Option A is lower risk (mirrors 4A Mozzarella delete pattern). Option B requires explicit user acceptance of the May price increase.
