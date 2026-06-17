# Ingredient State — Ginger Beer

| Query | Result |
|-------|--------|
| `ingredients` matching ginger/baladin | **0 rows** |
| `ingredient_aliases` matching ginger/baladin | **0 rows** |
| Persisted operational cost | **none** |

---

## Hypothetical catalog create (if ingredient were created)

From `buildIngredientInsertPayload` with qty=2, unit_price=10.85, name containing `0.20cl`:

| Field | Value |
|-------|-------|
| `current_price` (pack price) | 10.85 |
| `unit` / `base_unit` | ml |
| `purchase_quantity` | **2** |
| `usable_volume_ml` | 2 |

All UI intelligence for unmatched invoice rows is **read-time** from `name` + `invoice_items` scalars.
