# Execution Plan — Historical Pricing Repair Phase 3

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Mode:** Repair plan only (no data changes, no commits)

**Rollout order:** Fix #2 Mozzarella first (lowest risk), then Fix #1 created_at, then Fix #3 Atum denominator (highest risk).

Priority order (severity) differs from execution order (risk) — execute by risk.

---

## Fix #2 — Mozzarella validate (LOWEST RISK)

1. `DELETE` 2 rows (`9ee1b793`, `18bdb0c5`); keep `3c508a43`.
2. Validate:
   - 1 history row remains for ingredient `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`.
   - `fetchLatestHistoryNewPrice` = 13.69.
   - Catalog `current_price` = 13.69.
3. **Rollback:** Re-insert from backup if needed (no catalog impact).

```sql
-- DO NOT EXECUTE — document only
DELETE FROM ingredient_price_history
WHERE id IN (
  '9ee1b793-974d-4a6b-b656-c7b5e8febfaa',
  '18bdb0c5-0370-4bc7-878d-85957b8ba946'
);
```

---

## Fix #1 — created_at validate (LOW RISK)

1. `UPDATE` 7 rows → `2026-05-19T12:00:00.000Z` on invoice `3b4cb21f`.
2. Validate:
   - Year match on all 8 history rows for invoice `3b4cb21f` (7 repaired + Pepino already correct).
   - Atum latest-by-`created_at` = 13.10 (ordering fix; denominator still wrong until Fix #3).
   - Pepino unchanged.
   - Re-run `scripts/validate-historical-pricing.mts`.
3. **Rollback:** Restore original `created_at` values (prices unchanged).

```sql
-- DO NOT EXECUTE — document only
UPDATE ingredient_price_history
SET created_at = '2026-05-19T12:00:00.000Z'
WHERE id IN (
  'edc6c627-d934-40de-8eb8-cc0a25d36755',
  '14330aad-cce1-4569-aa2f-4976dd1ac336',
  '908de185-e61a-4f41-af4c-3b70f69bd08f',
  '1d9d5133-724b-461c-b141-605392f2b64d',
  '781ab1ac-39d2-4462-9106-635e5603c466',
  'e143080d-511b-4c37-9018-11949343aedc',
  'bf250ee4-388a-480f-96d7-e8c0e8e8dfb2'
)
AND invoice_id = '3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2';
```

---

## Fix #3 — Atum denominator validate (HIGHEST RISK)

1. **Code fix first** in `invoice-purchase-price-semantics.ts` (`resolveCountablePurchaseQuantityForCost`).
2. Data repair:
   - Update Atum April row `61c51696` (`new_price=6.29`).
   - Rechain Atum May row `781ab1ac` (prefer `reconcileIngredientPriceHistoryChain`).
   - Correct Anchoas/Gema April/May rows (4 additional multi-`un` lines).
3. Optionally refresh `ingredients.current_price` for Anchoas/Gema (catalog uses wrong denominator today).
4. Run `reconcileIngredientPriceHistoryChain` per affected ingredient.
5. Validate via `scripts/validate-historical-pricing.mts` + manual spot-checks on all 5 multi-`un` lines.
6. **Rollback:** Requires history backup + code revert.

```sql
-- DO NOT EXECUTE — document only; requires code fix first
UPDATE ingredient_price_history
SET new_price = 6.29, previous_price = NULL, delta = NULL, delta_percent = NULL
WHERE id = '61c51696-acd8-4a58-878f-a588c1878af0';

-- Then: reconcileIngredientPriceHistoryChain(client, '0f30ccb3-bb47-40bb-83cc-ae2a4018066d')
-- Repeat reconcile for Anchoas (c811f67f) and Gema líquida (32dbf47d)
```

---

## Code hardening (post-data, separate PRs)

- Gate backfill to `confirmed` only (align with extract gate).
- Unique constraint on `(invoice_id, ingredient_id)` WHERE NOT NULL.
- Sort by `resolveInvoiceChronology` in `fetchLatestHistoryNewPrice`, `getIngredientPriceTrend`, `priceActivity`.
- Strengthen chain guard for cross-pack (2kg vs 125g×8).

---

## Validation tooling

| Script | Purpose |
|---|---|
| `scripts/validate-historical-pricing.mts` | Full pipeline audit (run after each fix) |
| `scripts/validate-repair-scope.mts` | Read-only scope inventory (pre/post check) |
