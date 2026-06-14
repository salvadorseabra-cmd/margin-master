# Pepino Trace — Virtual vs Persisted Classification

**Generated:** 2026-06-14

---

## Reference IDs

| Entity | ID |
|--------|-----|
| Bidfood invoice | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| Pepino item (prior audit) | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` |
| Pepino item (Jun 14 10:39 re-read) | `dd539785-6267-437e-b2e1-34e2debc532e` |
| Pepino item (Jun 14 10:53 re-read, LIVE) | `514feb41-6cd4-44f1-abc8-344f0c0dfc23` |
| Wrong ingredient | `635a1189-36ea-4ff2-9012-8172ab1ab81d` (Pepino conserva) |
| Poisoned history | `a689bd91-5b83-41d9-b060-b5a63ccfb3b4` |

---

## Virtual Classification (Live Matcher)

| Field | Value |
|-------|-------|
| Line text | "Pepino" |
| Supplier | Bidfood Portugal |
| `match.kind` | `exact` |
| `displayState` | **confirmed** (`isConfirmedIngredientMatch` includes `exact`) |
| `ingredient_id` | `635a1189` (Pepino conserva) |
| Alias for "Pepino" alone | **None** — 6 aliases are jar SKUs only (Aviludo) |
| Extract cost sync (gate OFF) | **Ran** — wrote `current_price: 1.77`, `purchase_quantity: 1000` |

---

## Expected Persisted Classification (Shadow Seed / Backfill)

| Field | Value |
|-------|-------|
| `status` | **suggested** |
| `match_kind` | `exact` |
| `ingredient_id` | `635a1189` |
| `confirmed_at` | null |

---

## Exact Divergence Reason

1. **Virtual path** (`ingredient-match-explanation.ts:26-35`): `exact` ∈ confirmed kinds → UI shows "Matched to: Pepino conserva"
2. **Persisted path** (`invoice-item-match-helpers.ts:98-114`): only `confirmed-alias` / `confirmed-override` → `confirmed`; bare `exact` → `suggested`
3. **No alias** for line text "Pepino" at Bidfood supplier scope → cannot be `confirmed-alias`
4. **Intentional Pepino fix** (Phase 2 `SHADOW_POPULATION_FLOW.md`) — prevents auto-confirmed contamination in persisted SoT

---

## Contamination Timeline (Context)

- Price history `a689bd91` written 2026-05-25 with `new_price: 0.00177` (unit-scaled poison)
- Jun 14 re-read re-contaminated `ingredients.current_price` (21.99 → 1.77) per `before-after-comparison.json`
- Persisted `suggested` would **not** authorize extract cost sync under Phase 1 gate — but virtual `confirmed` still does today

---

## Persisted Row Status

**No row exists** — table absent on VL.
