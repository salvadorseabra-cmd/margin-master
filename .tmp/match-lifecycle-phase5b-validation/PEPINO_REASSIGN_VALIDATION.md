# Phase 5B — Pepino Reassign Validation

**Generated:** 2026-06-14 · Scenario: `.tmp/pepino-contamination-timeline/`

---

## Workflow Under Test

```
Pepino (Bidfood line) → matched Pepino conserva (confirmed)
  → user corrects to Pepino fresco
```

## Identifiers

| Entity | ID |
|--------|-----|
| Conserva | `635a1189-36ea-4ff2-9012-8172ab1ab81d` |
| Fresco (test) | `f1f0e0d0-c000-4000-8000-000000000001` |
| Invoice | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| Line | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` |
| Poison history | `a689bd91-5b83-41d9-b060-b5a63ccfb3b4` |

## Unit Test (`match-lifecycle-reassign.test.ts`)

| Check | Result |
|-------|--------|
| `subtractivePricingCleanupForReassign` deletes poison row | PASS |
| Jar history on other invoice retained | PASS |
| `reassignMatch` → `ingredient_id` = fresco | PASS |
| `previous_ingredient_id` = conserva | PASS |
| `rejectIngredientMatchPair` for conserva | PASS |
| No `(Bidfood invoice, conserva)` history after cleanup | PASS |

## Expected Post-Reassign

| Surface | Expected |
|---------|----------|
| Conserva history | No Bidfood invoice row |
| Conserva chain | Jar-only after reconcile |
| Fresco | Receives forward cost/history from line |
| Matcher | Conserva pair rejected |

## Live VL Replay

Not executed (requires Supabase). Same manual steps as Phase 5 unmatch, but select fresco instead of No match.
