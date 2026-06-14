# Pepino Validation — Bidfood Canary Line

**Generated:** 2026-06-14 · **Invoice:** `da472b7f-0fd9-4a26-a37c-80ad335f7f7e`

---

## Reference IDs

| Entity | ID |
|--------|-----|
| Bidfood invoice | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| Pepino item (pre re-read sim) | `514feb41-6cd4-44f1-abc8-344f0c0dfc23` |
| Pepino item (post re-read sim) | `c715f6ad-e685-4e7b-ae9c-e369848f08a5` |
| Ingredient (Pepino conserva) | `635a1189-36ea-4ff2-9012-8172ab1ab81d` |

---

## Expected Persisted Classification

| Field | Expected | Actual (post-backfill) |
|-------|----------|--------------------------|
| Line name | Pepino | Pepino |
| `status` | **suggested** | **suggested** ✓ |
| `match_kind` | **exact** | **exact** ✓ |
| `ingredient_id` | `635a1189…` | `635a1189…` ✓ |
| `confirmed_at` | null | null ✓ |

---

## Virtual vs Persisted (Intentional Drift)

| Path | Pepino display |
|------|----------------|
| Virtual matcher | `confirmed` (`exact` ∈ confirmed kinds) |
| Persisted layer | `suggested` (only alias/override → confirmed) |

This is **by design** per `invoice-item-match-helpers.ts` conservative taxonomy.

---

## Aviludo Alias-Backed Lines (6/6 PASS)

All Aviludo April alias lines persisted as `confirmed` / `confirmed-alias`:

| Product | status | match_kind | ingredient_id |
|---------|--------|------------|---------------|
| Mozzarella Flor di Latte 2Kg | confirmed | confirmed-alias | 2a99cecd |
| Pepinos Extra II Frasco 6X720g | confirmed | confirmed-alias | 635a1189 |
| Arroz Agulha Metro Chef 12x1kg | confirmed | confirmed-alias | 07a55cf5 |
| Chocolate Pantagruel 10x200g | confirmed | confirmed-alias | 43cba6b0 |
| Açúcar Branco Metro Chef 10x1Kg | confirmed | confirmed-alias | c46db69a |
| Nata Reny Picot 22% 6x1L | confirmed | confirmed-alias | 3d1af48c |

Query source: `run-validation.mts` → `aviludoConfirmed()`.

---

## Pepino Post Re-Read Simulation

After delete+insert+shadow seed (see REREAD_VALIDATION.md):

| Field | Value |
|-------|-------|
| New `invoice_item_id` | `c715f6ad-e685-4e7b-ae9c-e369848f08a5` |
| `status` | suggested |
| `match_kind` | exact |
| `ingredient_id` | `635a1189-36ea-4ff2-9012-8172ab1ab81d` |

Old Pepino UUID (`514feb41…`) match row **CASCADE-deleted** — no orphan.

---

## Outcome

| Check | Result |
|-------|--------|
| Pepino persisted as suggested/exact | **PASS** |
| Aviludo alias lines confirmed | **PASS (6/6)** |
| Pepino re-seeds as suggested on re-read | **PASS** |

**Pepino verdict:** PASS — taxonomy behaves as designed. UX drift vs virtual matcher remains a Phase 4 cutover sign-off item, not an activation failure.
