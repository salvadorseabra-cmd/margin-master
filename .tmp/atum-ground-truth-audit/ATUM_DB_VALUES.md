# Atum Database Values

**Source:** VL snapshot `pre-validation-clean.json` (live VL 2026-06-14). Live query not re-run this audit (`.env` points to different project).

**Ingredient:** `0f30ccb3-bb47-40bb-83cc-ae2a4018066d`

---

## `invoice_items`

| Invoice | item_id | qty | unit | unit_price | total | Matches invoice? |
|---------|---------|-----|------|------------|-------|------------------|
| April `c2f52357` | `ff2ad683` | 2 | un | 6.29 | 12.58 | ✅ |
| May `3b4cb21f` | `6da6be6a` | 2 | un | 6.55 | 13.10 | ✅ |
| May `3b4cb21f` | `79956d1b` | 1 | un | 13.10 | 13.10 | ❌ line-total-as-unit-price |

Price-history pipeline used `79956d1b`, not the correct row `6da6be6a`.

---

## `ingredients` (VL snapshot 2026-06-14)

| Field | Value | Correct vs invoice? |
|-------|-------|---------------------|
| `current_price` | 13.10 | ❌ (should be 6.55 per bag) |
| `purchase_quantity` | 1 | ✅ if pack = per bag |
| Operational (price ÷ pq) | 13.10 | ❌ (should be 6.55) |

---

## DB vs invoice summary

| Row | Invoice match |
|-----|---------------|
| April `ff2ad683` | ✅ |
| May `6da6be6a` | ✅ |
| May `79956d1b` | ❌ mis-extraction / override |
