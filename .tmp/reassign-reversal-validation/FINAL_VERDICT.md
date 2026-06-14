# Reassign Reversal — Final Verdict

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Q10: Lifecycle Verdict

**PARTIALLY REVERSIBLE**

---

## Summary Table

| Dimension | Reassign A→B |
|-----------|--------------|
| Forward match state | Reversible — `invoice_item_matches` updated to B (`reassignMatch`) |
| Matcher blocking | Reversible — reject pair blocks A (`rejectIngredientMatchPair`) |
| Alias forward | Reversible — UPSERT to B |
| Pricing/history on A | **Not reversed** — no delete, reconcile, or revert |
| Dual attribution | **Possible** — same invoice on A and B |

Unmatch (validated Phase 5) achieves full subtractive reversal for A. Reassign shares only the reject-pair step.

---

## Ten Questions — Condensed Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | What writes on A→B? | Reject pair, alias UPSERT→B, B cost/history, lifecycle update, B cost event |
| 2 | Old history deleted? | **No** |
| 3 | Old current_price recalculated? | **No** |
| 4 | Reconcile for A? | **No** |
| 5 | Reconcile for B? | **Only on UPDATE refresh**; not on first INSERT |
| 6 | History row on A remains? | **Yes** |
| 7 | Duplicate pricing influence? | **Yes** |
| 8 | Reject pair written? | **Yes** |
| 9 | Equivalent cleanup to unmatch? | **No** |
| 10 | Verdict | **PARTIALLY REVERSIBLE** |

---

## What Unmatch Does That Reassign Does Not

1. `deleteIngredientPriceHistoryForInvoiceIngredient(invoiceId, previousIngredientId)`
2. `reconcileIngredientPriceHistoryChain(previousIngredientId)`
3. `revertIngredientCurrentPriceFromHistory(previousIngredientId)`
4. `clearIngredientMatchedInvoiceProductsCache(previousIngredientId)` (`unmatch-pricing.ts:75-77`)
5. `markUnmatched` — `ingredient_id=null`, `status=unmatched`
6. `dispatchOperationalIngredientCostChanged` for **previous** ingredient

---

## Reference Scenario Facts

**Pepino conserva → Pepino fresco:** Poison row `a689bd91` on `635a1189` would remain; fresh target gets new history via `persistOperationalIngredientCostFromInvoiceLine`. Phase 5 Pepino validation covers **unmatch only** (`.tmp/match-lifecycle-phase5-validation/PEPINO_VALIDATION.md`).

**Mozzarella A → Mozzarella B:** Same code path; no family-specific cleanup.

---

## Evidence Sources

- `src/routes/invoices.tsx` (handleSelectCorrectionIngredient, persistIngredientCorrectionForItem)
- `src/lib/match-lifecycle-unmatch.ts` / `match-lifecycle-unmatch-pricing.ts`
- `src/lib/match-lifecycle-service.ts` (reassignMatch, correctMatch)
- `.tmp/match-correction-reversal-audit/`
- `.tmp/match-lifecycle-phase5-validation/FINAL_VERDICT.md`
