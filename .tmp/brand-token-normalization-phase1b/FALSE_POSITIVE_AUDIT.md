# False Positive Audit — Phase 1B

**Date:** 2026-06-14

## Test Cases

| Line | Supplier | Must NOT match | Result |
|------|----------|----------------|--------|
| Pepino | BIDFOOD | pepino conserva | ✅ No hit |
| Pepinos Extra ULI | BIDFOOD | pepino (fresh) | ✅ No hit |
| Atum | NAU | atum em óleo | ✅ No hit |
| Arroz | METRO | arroz agulha | ✅ No hit |

**False positives: 0 / 4**

## Guard Mechanisms

1. **Product prefix gate** — `pepino` ≠ `pepinos extra`; `atum` ≠ `atum oleo`; bare `arroz` ≠ `arroz agulha`
2. **Minimum fingerprint length (4)** — short queries like `pepino` (fp="") and `atum` (fp="atum" but wrong prefix) blocked
3. **Supplier scope** — fuzzy only considers `SUPPLIER::` keys for the invoice supplier
4. **Ambiguity rejection** — if two ingredient_ids tie at best distance, no match returned

## Cross-Ingredient Collision Audit

Full alias map replay: every confirmed alias row looked up against itself.

| Metric | Value |
|--------|-------|
| Total aliases tested | 36 |
| Cross-ingredient collisions | **0** |

All 36 stored aliases resolve to their own `ingredient_id` — no fuzzy drift to sibling ingredients.

## Pepino Matcher (unchanged)

Pepino invoice lines still 0/4 exact hits — character garbling (pepinoso, vii/uli) is outside ed≤2 scope. No false positives introduced.
