# Final Verdict — Historical Pricing Repair Phase 4B

**Date:** 2026-06-15  
**Checkpoint commit:** `efd89cdaf5f84a58dacd5234190bbaa37ba04281`  
**Backup:** `scripts/backups/created-at-phase4b-pre-update-2026-06-14T23-21-36.json`

---

## Verdict: **SUCCESS**

---

## Summary

| Check | Result |
|---|---|
| Scope matched Phase 3 (exactly 7 rows) | ✅ |
| Only `created_at` modified | ✅ |
| Pepino `5bd9a4e1` untouched | ✅ |
| Global year-mismatch rows | 7 → **0** |
| `current_price` unchanged (7 ingredients) | ✅ |
| Latest history selection improved (7 ingredients) | ✅ |
| Atum May sorts after April | ✅ |
| Reconciliation required | ❌ not needed |
| Mozzarella / Atum denominator / OCR touched | ❌ not touched |

---

## Before / after metrics

| Metric | Before | After |
|---|---|---|
| Corrupted `created_at` rows (VL) | 7 | 0 |
| Rows updated | — | 7 |
| Atum `fetchLatestHistoryNewPrice` | 3.145 | 13.10 |
| Atum `current_price` | 13.10 | 13.10 |
| Sample ingredients `matches_latest` | 2/6 | **6/6** |

---

## Rollback procedure (if ever needed)

1. Read backup JSON for original `created_at` per row ID.
2. `UPDATE ingredient_price_history SET created_at = '<backup>' WHERE id = '<id>'`.
3. Re-run `validate-repair-scope.mts` — expect `global_corrupted_count: 7`.

No rollback performed.

---

## Remaining work (not Phase 4B)

- **Phase 4C:** Atum/Anchoas/Gema multi-`un` denominator correction
- **Code hardening:** Sort history by `resolveInvoiceChronology` instead of raw `created_at DESC`
