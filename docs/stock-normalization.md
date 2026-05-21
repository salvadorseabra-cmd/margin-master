# Stock normalization (purchase → usable)

Marginly separates **what you bought** (invoice purchase label) from **usable stock** (normalized g / ml / un for costing and inventory hints).

## Pipeline

```
PURCHASED (line name + row qty/unit)
  → pack phrase parsing (container × size, embedded weight/volume)
  → unit family (mass / volume / count)
  → base units (g, ml, un)
  → usable quantity
```

Implementation: `src/lib/stock-normalization.ts` (core math and phrase selection), composed by `src/lib/invoice-purchase-format.ts` (regex parsing + invoice display).

## Dev logging

In development builds, steps log as:

```
[stock_normalize] <step> { ... }
[stock_normalization_source] { rowKey, pipelineId, ... }
```

`pipelineId` is `unified` when `normalizePurchasedToUsableStock` resolved usable qty, `suppressed` after `sanitizeStructuredUsable` clears a collapsed/impossible value, or `none` when no usable could be derived.

## Root cause: tiny g/ml usable (fixed)

| Symptom | Typical invoice row | Name carries real size | What went wrong |
|--------|---------------------|-------------------------|-----------------|
| `4 ml` instead of `450 ml` | `qty=4`, `unit=ml` | `1 bottle x 450 ml` | Row `4 ml` treated as **content size**; OCR conflated **pack count** with **ml** |
| `3 g` instead of `250 g` | `qty=3`, `unit=g` | `1 pack x 250 g` | Same: row qty used as grams, not packs |
| `2 g` instead of `875 g` | `qty=2`, `unit=g` | `1 pack x 875 g` | Same |

**Fix:** `isWeakInvoiceRowContentMeasure` — when the name has `container × size` and the row measure is the same unit family but orders of magnitude smaller than the pack size, the row is treated as **purchase count**, not content. Usable comes from the name phrase (`450 ml`, `250 g`, …).

## Other fallback paths

| Path | When | Usable behavior |
|------|------|-----------------|
| Explicit `container × size` in name | High-confidence regex match | Pack size → g/ml; optional multiply by row qty when row unit is generic (`un`, `cx`, …) |
| Inference (`PACK24`, `450ML` in title) | No explicit phrase | `normalized_stock_quantity × row qty` |
| `conversion_hint` (lettuce, herbs) | Produce tokens | Estimated yield (review badge); low confidence |
| `row_only` | Only qty+unit, weak name | Often **no** usable (avoids `1 g` / `1 ml` collapse) |
| `sanitizeStructuredUsable` | `1 g`, `1 ml`, `1 un` with weak confidence | Usable cleared — fail loud-ish (no fake tiny stock) |
| Invoice UI fallback | Structured usable null | May show row qty; guards block meaningless `1 g usable` labels |

## API (stock-normalization)

- `normalizePurchasedToUsableStock(input)` — full resolution from parsed phrases + inference hints
- `pickExplicitPackPhrase(input)` — choose name vs row phrase
- `deriveUsableFromPackPhrase(phrase, rowQty, rowUnit)` — pack → usable
- `isWeakInvoiceRowContentMeasure(rowPhrase, rowQty, namePhrase)` — OCR row guard
- `measureToBase(qty, unit)` — kg/L → g/ml

## Tests

- `src/lib/stock-normalization.test.ts` — deterministic pack → usable cases (including former regressions)
- `src/lib/invoice-purchase-format.test.ts` — display + invoice integration
