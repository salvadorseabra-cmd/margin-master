# Code Search — Produto de Stock

**Date:** 2026-06-15

---

## Repo grep results

| Pattern | `src/` hits | Notes |
|---------|-------------|-------|
| `Produto de Stock` / `produto de stock` | **0** | Not hardcoded in application logic |
| `stock product` | **0** | — |
| `produto` in noise lists | **0** | Only unrelated test fixtures |

`.tmp/` audit files: **30 JSON files**, all Emporio `17aa3591` — no other invoice IDs.

---

## Files confirmed lacking strip logic

| File | Function |
|------|----------|
| `src/lib/invoice-item-fields.ts` | `cleanInvoiceItemDisplayName` |
| `src/lib/normalize-ingredient-name.ts` | `COMMERCIAL_PHRASES` / `COMMERCIAL_TOKENS` |
| `src/lib/canonical-ingredient-display-name.ts` | `CATALOG_NOISE_PHRASES` / `CATALOG_NOISE_TOKENS` |
| `src/lib/canonical-ingredient-create.ts` | `buildCanonicalIngredientCreateDefaults` |
