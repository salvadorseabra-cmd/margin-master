# Final Verdict — Nata Culinária Readiness Blocker

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** Read-only investigation — **no fixes executed, no commits**

---

## Verdict: **NOT_READY_FOR_RECIPES** (until Nata repaired)

Nata culinária is the **sole foundation readiness blocker** among the 9-ingredient audit sample. 8 of 9 ingredients are foundation-ready after Phase 4A/4B/4C repairs.

---

## Root cause

Same contamination class as pre-4A Mozzarella poison row:

**`backfillIngredientPriceHistoryFromInvoices` writes `ingredient_price_history` for suggested/semantic matches without requiring `invoice_item_matches.status === 'confirmed'`.**

Backfill is history-only, so catalog stays at the April confirmed price (18.29 / op 3.048) while latest history surfaces the May unconfirmed price (18.89 / op 3.148).

Phase 4B repaired `created_at` on the row but did not delete it. Phase 4A–4C never scoped this row for deletion.

---

## Rows & ingredients affected

| Scope | Count | Detail |
|---|---|---|
| **History rows** | **1** | `14330aad-cce1-4569-aa2f-4976dd1ac336` |
| **Ingredients** | **1** | Nata culinária `3d1af48c-be3c-494a-9e0f-be267fc9388b` |
| **Invoices** | **1** | May Aviludo `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` |
| **Match items** | **1** | `1826cbe9` (suggested/semantic) |

---

## Active contamination?

**Yes.**

| Row | Ingredient | Invoice | Issue |
|---|---|---|---|
| `14330aad` | Nata culinária | `3b4cb21f` May | History written from unconfirmed suggested match |

- Latest history (3.148) ≠ catalog (3.048)
- `current_price_from_latest_history: false`
- `validate-repair-scope.mts`: `suggested_match_history_count: 1`

No other active contamination in the 9-ingredient audit sample.

---

## Requires repair?

**Yes.**

---

## Safe repair path

| Action | Target | Risk | Priority |
|---|---|---|---|
| **DELETE** (recommended) | `14330aad-cce1-4569-aa2f-4976dd1ac336` | Low — mirrors 4A Mozzarella | P1 |
| **Code gate** | Skip suggested in backfill (require confirmed-only) | Prevents recurrence | P2 |
| **Optional later** | Confirm May match `1826cbe9` → refresh catalog to 18.89 | User decision on price | P3 |

### Document-only repair SQL

```sql
DELETE FROM ingredient_price_history
WHERE id = '14330aad-cce1-4569-aa2f-4976dd1ac336'
  AND ingredient_id = '3d1af48c-be3c-494a-9e0f-be267fc9388b';
-- Then: re-run validate-historical-pricing.mts + validate-repair-scope.mts
-- Expect: suggested_match_history_count = 0, Nata current_price_from_latest_history = true
```

### Alternative repair (user confirms May price)

1. Confirm match on item `1826cbe9`
2. Refresh catalog `current_price` to 18.89 (op 3.148)
3. Row `14330aad` becomes valid confirmed history

---

## Post-repair validation targets

| Check | Expected |
|---|---|
| Nata history rows | 1 (`2767b722`) — or 2 if May confirmed |
| Catalog op | 3.048 (delete) or 3.148 (confirm) |
| Latest history op | matches catalog |
| `current_price_from_latest_history` | **true** |
| `suggested_match_history_count` | **0** |
| Foundation-ready ingredients | **9/9** |

---

## READY_FOR_RECIPES

| State | Verdict |
|---|---|
| **Now** | **NO** — 1 active contamination row |
| **After delete `14330aad` + backfill gate** | **YES** |
| **After confirm May + catalog refresh instead** | **YES** (catalog and history both at 3.148) |

---

## Code path summary

| Path | Checks confirm? | Writes history? | Writes catalog? |
|---|---|---|---|
| `backfillIngredientPriceHistoryFromInvoices` | ❌ (skips only `unmatched`) | ✅ suggested OK | ❌ |
| `persistOperationalIngredientCostFromInvoiceLine` | via caller | ✅ | ✅ |
| `syncOperationalIngredientCostsFromInvoiceLines` (gate ON) | ✅ authorized kinds only | ✅ | ✅ |

The gap is exclusively in **backfill**.

---

## Related audits

- Foundation readiness: `.tmp/foundation-readiness-audit/FINAL_VERDICT.md`
- Mozzarella pattern (same issue class): `.tmp/historical-pricing-repair-phase4a/FINAL_VERDICT.md`
- Phase 4B created_at repair (retained this row): `.tmp/historical-pricing-repair-phase4b/`

---

## Investigation deliverables

| File | Purpose |
|---|---|
| `NATA_HISTORY_TRACE.md` | Every purchase, history row, catalog impact |
| `ROW_14330AAD_AUDIT.md` | Orphan row creation, classification, repair options |
| `MATCH_LIFECYCLE_AUDIT.md` | Full timeline — confirm vs suggested, MLS, backfill |
| `CURRENT_PRICE_AUDIT.md` | 3.048 vs 3.148 analysis |
| `BACKFILL_GATE_AUDIT.md` | VL systemic scan — suggested-match history |
| `FINAL_VERDICT.md` | This document |
