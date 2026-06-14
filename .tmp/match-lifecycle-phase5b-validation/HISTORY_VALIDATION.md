# Phase 5B — History Validation

**Generated:** 2026-06-14

---

## Q2: Is old ingredient history deleted?

**Yes** (when `VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE` and `VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING` are ON).

`subtractivePricingCleanupForReassign` → `deleteIngredientPriceHistoryForInvoiceIngredient(invoiceId, previousIngredientId)` before forward writes to B.

## Q6: Can history row remain attached to A after reassignment?

**No** (with flags ON). Confirmed reassign always deletes `(invoice_id, A)`.

Surviving history on other invoices for A is preserved (e.g. Pepino jar row on `inv-april`).

## Q7: Can duplicate pricing influence occur?

**No** (with flags ON). After cleanup, only B receives `(invoice_id, B)` from `persistOperationalIngredientCostFromInvoiceLine`.

## Test Evidence

| Scenario | Test | Result |
|----------|------|--------|
| Pepino conserva → fresco | `match-lifecycle-reassign.test.ts` | Poison row deleted; no dual attribution on A |
| Mozzarella A → B | `match-lifecycle-reassign.test.ts` | A invoice history removed; only B row remains |
| Unmatch regression | `match-lifecycle-unmatch.test.ts` | PASS |

## Verdict (Q2, Q6, Q7)

**FULLY_REVERSIBLE** (history on A for the reassigned invoice)
