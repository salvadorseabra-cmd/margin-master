# First Appearance of €13.10

| Surface | €13.10? |
|---------|---------|
| `invoice_items.unit_price` (May) | ✅ **First** — 2026-05-19 |
| `invoice_items.total` (May) | ✅ Same (qty=1) |
| `ingredient_price_history.new_price` | ✅ 13.10 |
| `ingredients.current_price` (live) | ❌ 6.29 (stale) |
| Purchase History UI | ✅ From unit_price |

April never has €13.10 — only €6.29 unit / €12.58 line.

**Not unit-vs-line-total contamination** — May qty=1 makes them equal.
