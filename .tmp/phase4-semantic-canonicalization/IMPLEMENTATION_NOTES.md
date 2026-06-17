# Implementation Notes — Phase 4 Semantic Canonicalization

**Date:** 2026-06-16  
**Scope:** `src/lib/canonical-ingredient-display-name.ts` only (deterministic catalog naming)

## Changes

### Task 1 — Brand prefix strip
Extended `INVOICE_BRAND_PREFIX_STRIP_RE` (longest match first):
- `arrigoni formaggi -`
- `rovagnati -`
- `rigamonti -`
- `arrigoni -`

Preserves product tokens: punta d'anca, oro, massima, scelto, dolce, con pistacchio, DOP, IGP.

### Task 2 — Procurement metadata
- **Wheel fractions:** `WHEEL_FRACTION_RE` (`1/2`, `1/4`, `1/8`) runs before weight-range regex to avoid `1/` artifacts.
- **Weight ranges:** `PURCHASE_WEIGHT_RANGE_RE` for `4,3-4,5KG` style spans.
- **Case counts:** extended `COUNT_PACK_RE` with `ud` / `uds` (e.g. `15ud`).
- **Noise tokens:** `assaporami`, `formaggi`, `hc`, `pna`, `l1`.
- **Noise phrase:** `linea castello`.
- **Decimal pack weights:** drop bare `4,3` style tokens in `shouldDropCatalogToken`.
- **San Pellegrino invoice prefix:** `sanpellegrino -` → `san pellegrino ` (brand kept, dash format removed).

### Task 3 — Distributor noise
Added to `CATALOG_NOISE_TOKENS`: `sorrentino`, `amoruso`, `alconfirsta`.

### Task 4 — Duplicate token collapse
`collapseDuplicateTokens()` — case/accent-insensitive first-occurrence dedupe (fixes Peroni `nastro azzurro` duplicate).

### Intentionally unchanged
- **Mancini** pasta mill (multi-SKU context).
- **Stracciatella 250gr** (kitchen practice).
- Beverage serving sizes **33cl**, **75cl**.
- Operational gram weights on proteins/buns.

## Bug fix during implementation
`PURCHASE_WEIGHT_RANGE_RE` was matching `8 - 1,85kg` inside `1/8 - 1,85kg`, leaving `1/`. Fixed by running `WHEEL_FRACTION_RE` first.
