# Search Validation — Produto de Stock

**Date:** 2026-06-15

## Command

```bash
rg -i "produto de stock" --glob '!.tmp/**'
```

## Remaining occurrences (src only)

| File | Role |
|------|------|
| `src/lib/invoice-item-fields.ts` | Cleanup regex constant |
| `src/lib/normalize-ingredient-name.ts` | `COMMERCIAL_PHRASES` entry |
| `src/lib/canonical-ingredient-display-name.ts` | `CATALOG_NOISE_PHRASES` entry |
| `src/lib/invoice-item-fields.test.ts` | Test fixtures |
| `src/lib/canonical-ingredient-create.test.ts` | Test fixtures |

## Verdict

All remaining occurrences are implementation or test noise lists — no production logic propagates the phrase.

Historical audit artifacts under `.tmp/` retain contaminated examples for reference only.
