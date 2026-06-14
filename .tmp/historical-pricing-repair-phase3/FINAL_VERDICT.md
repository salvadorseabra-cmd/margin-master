# Final Verdict — Historical Pricing Repair Phase 3

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Mode:** Repair plan only (no data changes, no commits)

---

## Executive summary

| Issue | VL scope | Classification |
|---|---|---|
| `created_at` corruption | **7 rows** on invoice `3b4cb21f` (not 4) | Historical artifact + **active ordering contamination** |
| Mozzarella contamination | **1 DUPLICATE + 1 POISON** (keep 1 VALID) | **Active contamination** in history queries |
| Atum denominator bug | **5 multi-`un` confirmed lines** on VL | **Active contamination** in history + deltas |
| Catalog `current_price` (Atum/Mozzarella) | Correct today | **Safe to ignore** (until revert/unmatch) |

---

## Issue classification

| Issue | Historical artifact | Active contamination | Requires fix | Safe to ignore |
|---|---|---|---|---|
| `created_at` 2023 (7 rows) | ✅ | ✅ ordering | ✅ | ❌ |
| Mozzarella duplicate `9ee1b793` | ✅ | ❌ | ✅ DELETE | ❌ |
| Mozzarella poison `18bdb0c5` | ❌ | ✅ | ✅ DELETE | ❌ |
| Mozzarella valid `3c508a43` | — | — | — | ✅ |
| Atum denominator `61c51696` | ❌ | ✅ | ✅ | ❌ |
| Atum delta chain `781ab1ac` | partial (`created_at`) | ✅ | ✅ | ❌ |
| Catalog `current_price` Atum/Mozzarella | — | — | — | ✅ (today) |
| Anchoas/Gema multi-`un` divide | ❌ | ✅ catalog+history | ✅ (Fix #3 scope) | ❌ |
| Phase 5B reassign | — | — | — | ✅ |
| Pepino `5bd9a4e1` created_at | — | — | — | ✅ |

---

## Affected row IDs (complete scope)

### Fix #2 — Mozzarella DELETE

- `9ee1b793-974d-4a6b-b656-c7b5e8febfaa` (DUPLICATE)
- `18bdb0c5-0370-4bc7-878d-85957b8ba946` (POISON)

### Fix #1 — created_at UPDATE (7 rows)

- `edc6c627-d934-40de-8eb8-cc0a25d36755` (Arroz agulha)
- `14330aad-cce1-4569-aa2f-4976dd1ac336` (Nata culinária)
- `908de185-e61a-4f41-af4c-3b70f69bd08f` (Anchoas)
- `1d9d5133-724b-461c-b141-605392f2b64d` (Açúcar branco)
- `781ab1ac-39d2-4462-9106-635e5603c466` (Atum em óleo)
- `e143080d-511b-4c37-9018-11949343aedc` (Gema líquida)
- `bf250ee4-388a-480f-96d7-e8c0e8e8dfb2` (Chocolate culinária)

### Fix #3 — Atum denominator (after code fix)

- `61c51696-acd8-4a58-878f-a588c1878af0` (Atum April — primary bug)
- `781ab1ac-39d2-4462-9106-635e5603c466` (Atum May — rechain)
- Plus Anchoas/Gema April/May history rows (4 multi-`un` lines)

---

## Complete repair SQL scope (document only — DO NOT EXECUTE)

```sql
-- ═══ FIX 2: Mozzarella (execute first — lowest risk) ═══
DELETE FROM ingredient_price_history
WHERE id IN (
  '9ee1b793-974d-4a6b-b656-c7b5e8febfaa',
  '18bdb0c5-0370-4bc7-878d-85957b8ba946'
);

-- ═══ FIX 1: created_at (execute second) ═══
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

-- ═══ FIX 3: Atum denominator (execute third — after code fix) ═══
UPDATE ingredient_price_history
SET new_price = 6.29, previous_price = NULL, delta = NULL, delta_percent = NULL
WHERE id = '61c51696-acd8-4a58-878f-a588c1878af0';

-- Then run reconcileIngredientPriceHistoryChain for ingredient 0f30ccb3-bb47-40bb-83cc-ae2a4018066d
-- (preferred over manual UPDATE on 781ab1ac)
```

---

## Notes

- Phase 2 reported 4 corrupted sample-ingredient rows; live DB shows **7 corrupted + 1 correct** on invoice `3b4cb21f`.
- VL has exactly **1 duplicate group** (Mozzarella) and **1 suggested-match poison row** (Mozzarella Bocconcino).
- No fixes executed in Phase 3. Proceed to execution per EXECUTION_PLAN.md.
