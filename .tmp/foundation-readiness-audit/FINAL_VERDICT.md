# Final Verdict — Foundation Readiness Audit

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** Read-only validation — no fixes executed

---

## Verdict: **NOT_READY_FOR_RECIPES**

Phase 4A/4B/4C repairs are successful for the originally failed sample (6/6 clean). Three additional VL ingredients (Açúcar branco, Chocolate culinária, Nata culinária) were also checked. **8 of 9** audit ingredients are foundation-ready.

**Blocker:** Nata culinária — suggested-match history row `14330aad` creates active contamination and a catalog vs latest-history mismatch.

**Unblock by:** delete orphan history row `14330aad` **or** confirm the May match and reconcile catalog to 18.89 (op 3.148).

After Nata fix + code gate for suggested backfill → **READY_FOR_RECIPES**.

---

## Answers to the 5 Questions

### 1. Any ingredient still INCORRECT?

**No.**

The three Phase 1 INCORRECT ingredients are now clean:

- **Atum em óleo** — April `new_price` corrected to 6.29; May Δ +108.3% (was +316.5%)
- **Mozzarella fior di latte** — 4A deleted 2 poison/duplicate rows; 1 clean history row remains
- **Anchoas / Gema** — 4C fixed multi-`un` double-divide; catalog refreshed

No ingredient retains economically wrong pricing math.

---

### 2. Any ingredient still SUSPICIOUS?

**Yes — Nata culinária only.**

- Suggested-match history row `14330aad` exists without a confirmed match
- Catalog vs latest-history operational price divergence (3.048 vs 3.148)

**Minor (non-blocking):** Anchoas, Gema, and Atum still stamp `ingredient_unit=g` on €/un operational values. Cosmetic label issue; math is correct post-4C.

---

### 3. Any `current_price` mismatch?

**Yes — Nata culinária only.**

| Field | Value |
|---|---|
| Catalog operational | **3.048** (18.29 ÷ 6, April confirmed) |
| Latest history operational | **3.148** (18.89 ÷ 6, May suggested row) |
| All other 8 ingredients | ✅ aligned |

---

### 4. Any `ingredient_price_history` mismatch?

**Yes — Nata culinária only.**

- May invoice `3b4cb21f`: match status is **`suggested`**, not `confirmed`
- History row **`14330aad`** exists anyway with `new_price=3.148`
- All confirmed purchases across the other 8 ingredients have matching history rows with correct operational prices

---

### 5. Any active contamination remaining?

**Yes — 1 row.**

| Row | Ingredient | Invoice | Issue |
|---|---|---|---|
| `14330aad` | Nata culinária | `3b4cb21f` | History written from unconfirmed suggested match |

Same contamination class as pre-4A Mozzarella poison row. No other active contamination detected in the 9-ingredient audit sample.

`validate-repair-scope.mts` confirms: `suggested_match_history_count: 1` (Nata `14330aad`).

---

## Repair Phase Outcomes (for context)

| Phase | Scope | Outcome |
|---|---|---|
| 4A | Mozzarella poison delete | ✅ 2 rows deleted, catalog 13.69 |
| 4B | `created_at` year corruption | ✅ `global_corrupted_count: 0` |
| 4C | Multi-`un` denominator + catalog refresh | ✅ 0 suspect divides, Anchoas/Gema/Atum corrected |

---

## Path to READY_FOR_RECIPES

1. **Fix Nata** — delete `14330aad` or confirm May match + refresh catalog
2. **Deploy backfill gate** — prevent suggested matches from writing history (P2)
3. Re-run `validate-historical-pricing.mts` + `validate-repair-scope.mts` and confirm `suggested_match_history_count: 0`
