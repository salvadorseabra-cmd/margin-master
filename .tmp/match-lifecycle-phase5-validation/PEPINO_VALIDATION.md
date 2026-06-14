# Phase 5 — Pepino Validation

**Generated:** 2026-06-14 · Scenario: `.tmp/pepino-contamination-timeline/`

## Workflow Under Test

```
Pepino (Bidfood line) → matched Pepino conserva (confirmed)
  → user selects "No match"
```

## Identifiers (production audit)

| Entity | ID |
|--------|-----|
| Ingredient | `635a1189-36ea-4ff2-9012-8172ab1ab81d` (Pepino conserva) |
| Invoice | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` (Bidfood) |
| Line | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` |
| Poison history | `a689bd91-5b83-41d9-b060-b5a63ccfb3b4` |

## Unit Test Replay (`match-lifecycle-unmatch.test.ts`)

| Check | Result |
|-------|--------|
| `unmatchInvoiceLineMatch` returns `ok: true` | PASS |
| `invoice_item_matches.status` → `unmatched` | PASS |
| `ingredient_id` → `null` | PASS |
| `previous_ingredient_id` → conserva id | PASS |
| Poison history row deleted | PASS |
| Surviving jar history row retained | PASS |
| `rejectIngredientMatchPair` called for conserva | PASS |
| `historyDeleted: true`, `pricingCleaned: true` | PASS |

## Expected Post-Unmatch Behavior

| Surface | Expected |
|---------|----------|
| `displayState` (read cutover) | `unmatched` |
| Matcher re-suggestion | Blocked for Pepino → conserva pair |
| `ingredient_price_history` | No `(Bidfood invoice, conserva)` row |
| Conserva chain | Jar-only rows after reconcile |

## Suggested → Unmatched (T4)

Second test: no history rows → no pricing cleanup, lifecycle tombstone only. **PASS**

## Live VL Replay

Not executed in this harness (requires Supabase + flags). Interactive replay:

1. Enable `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true`
2. Open Bidfood invoice → Pepino line → picker → **No match**
3. Verify UI shows unmatched; conserva not re-suggested
