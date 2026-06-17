# Dataset Trust Assessment

| Surface | Trust? |
|---------|--------|
| Historical ingredient_price_history | **NO** — 37% contaminated; repair undone |
| Price delta chains | **NO** |
| Invoice unit alerts | **YES** — raw unit_price |
| cx/pack paths (Pepino, Arroz) | **YES** |
| New history writes post-repair | **UNPROVEN** — 0 inserts |
| Catalog purchase_quantity | **NO** — re-sync wrote wrong denominators |

**New invoices:** Trust only pack/cx/kg lines until `total` wired through persist callers.

**Historical chains:** Not trustworthy — backfill still required after code fix.
