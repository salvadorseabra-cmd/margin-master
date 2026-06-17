# Impact Analysis — Supplier Identity Foundation (No Backfill)

**Date:** 2026-06-16  
**Scope:** Validation Lab (5 real suppliers, 6 invoices)

## VL data snapshot (from supplier-catalog-quality-audit)

| Entity | Count | Fragmentation |
|---|---|---|
| Invoice rows | 6 | 6 distinct `supplier_name` strings |
| Real suppliers (human) | 5 | 1 HIGH duplicate cluster (Aviludo) |
| `ingredient_aliases` Aviludo spellings | 3 | AVILUDO, Aviludo, Avijudo |
| Material casing issues | 4 | Per CASING_ISSUES.md |

## Impact by surface (this change only — no DB rewrite)

### Invoices (`invoices.supplier_name`)

| Metric | Before | After (new writes) | After (existing rows) |
|---|---|---|---|
| AVILUDO display | `AVILUDO` preserved | `Aviludo` | Unchanged until backfill |
| Rows affected on read | 6 raw strings | — | 6 (no migration) |
| New upload/re-extract | inconsistent | normalized DISPLAY | — |

**Estimated VL invoice rows needing backfill:** 2 (`AVILUDO` variants)

### Ingredient aliases (`ingredient_aliases.supplier_name`)

| Metric | Before | After |
|---|---|---|
| Lookup key in memory | case-sensitive display | KEY (`aviludo`) |
| DB stored value | 3 spellings | unchanged |
| Cross-spelling alias hit | miss | **hit** (in-memory map) |
| New confirm writes | mixed casing | `Aviludo` DISPLAY |
| Dedup on re-confirm | misses across spellings | still misses DB-level until backfill |

**Estimated VL alias rows with Aviludo fragmentation:** ≥3 (Pepino cluster)

### Supplier intelligence / watchlist

| Metric | Before | After |
|---|---|---|
| `buildSupplierWatchlist` clusters | 2+ for Aviludo casing | 1 (`aviludo` key) |
| Display label | first-seen RAW | prefers title-cased DISPLAY |
| Spend synthesis (`operational-intelligence-synthesis`) | still RAW equality | unchanged — may still split until backfill |

### Price history (`ingredient_price_history.supplier_name`)

| Metric | Before | After |
|---|---|---|
| Stored supplier on rows | RAW (e.g. `AVILUDO`) | unchanged |
| Watchlist price notes | merged on lowercase | merged on KEY + typo map |
| Alert supplier filters | RAW trim equality | unchanged |

**Estimated VL price-history rows with Aviludo casing:** subset tied to Aviludo invoices

## Quantified backfill debt (not executed)

| Table / field | Rows to normalize (VL est.) | Target |
|---|---|---|
| `invoices.supplier_name` | 2–4 | DISPLAY canonical |
| `ingredient_aliases.supplier_name` | 3+ | DISPLAY canonical |
| `ingredient_price_history.supplier_name` | low single digits | DISPLAY canonical |

## What improves immediately (no backfill)

1. **New invoice extractions** → `Aviludo`, `Il Bocconcino…`, `Bidfood Portugal`
2. **Alias in-memory lookup** → AVILUDO / Aviludo / Avijudo share `aviludo::` keys
3. **Fuzzy alias recovery** → Avijudo OCR lines match Aviludo alias cluster
4. **Supplier watchlist UI** → single Aviludo entry with proper casing

## What does NOT improve until backfill

1. Invoice list still shows historical `AVILUDO` strings
2. DB alias dedup still case/typo sensitive
3. Operational spend synthesis exact-match filters
4. Price history row labels in detail views

## Risk surface

| Risk | Severity | Mitigation |
|---|---|---|
| KEY typo map too aggressive | Low | Only `avijudo→aviludo` (VL-proven) |
| KEY collision across distinct suppliers | Low | VL has 5 suppliers; suffix strip is conservative |
| DB/display vs KEY mismatch in logs | Low | Trace fields still show DISPLAY where unchanged |
| Fuzzy cross-supplier bleed | None | Still blocked except intentional Avijudo merge |
