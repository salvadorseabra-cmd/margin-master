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
[stock_usable_source] { structure, numericTokens, multiplierChain, structureTotal, computedTotal, usableSource, weak_scalar_activated, fallbackReason, ... }
[purchase_structure_parse] { text, numericTokens, parsed, multiplierChain, totalUsableAmount, tierAttempted }
[stock_normalization_source] { rowKey, pipelineId, totalUsableAmount, purchaseStructure, ... }
[stock_render_source] { rowKey, renderSource, quantityLabel, ... }
[stock_residual_source] { rowKey, source: live_engine, ... }  // invoice stock column always recomputes from line name/qty/unit
[stock_gram_ml_trace] { step, beforeQty, afterQty, unit, ... }  // each g/ml transform in the structure pipeline
[single_container_trace] { step, containerCount, unitSize, structureTotal, finalUsable, weak_scalar_activated, ... }  // `1 pack/bottle x SIZE` only
```

`usableSource` on the structure path is usually `structure_total` (name `totalUsableAmount`) or `structure_scaled_outer` when the invoice row supplies a different outer purchase count. Weak OCR row g/ml (`3 g` on a `250 g` pack) sets `fallbackReason` to *weak invoice row g/ml; using name structure total* — row qty is never copied into usable grams.

`pipelineId` is `unified` when `normalizePurchasedToUsableStock` resolved usable qty, `suppressed` after `sanitizeStructuredUsable` clears a collapsed/impossible value, or `none` when no usable could be derived.

## Root cause: tiny g/ml usable (fixed)

| Symptom | Typical invoice row | Name carries real size | What went wrong |
|--------|---------------------|-------------------------|-----------------|
| `4 ml` instead of `450 ml` | `qty=4`, `unit=ml` | `1 bottle x 450 ml` | Row `4 ml` treated as **content size**; OCR conflated **pack count** with **ml** |
| `3 g` instead of `250 g` | `qty=3`, `unit=g` | `1 pack x 250 g` | Same: row qty used as grams, not packs |
| `2 g` instead of `875 g` | `qty=2`, `unit=g` | `1 pack x 875 g` | Same |
| `2 g` instead of `2 kg` | `qty=2`, `unit=g` | `BATATA PALHA 2KG` (title embeds size) | Row `2 g` beat embedded `2KG` on phrase confidence |
| `1 g` instead of `1 kg` | `qty=1`, `unit=g` | `CHEDDAR 1KG` / `BACON … 1KG` | Same |

**Fix (two layers):**

1. **Parser** — `findBestRegexMatch` + `scoreContainerSizeMatch` in `parsePurchaseStructureFromText` (`stock-normalization.ts`): when OCR appends a weak duplicate (`1 pack x 3 g` after `1 pack x 250 g`), the highest-scoring match (250 g) wins, not the last regex hit.
2. **Usable math** — `computeUsableFromPurchaseStructure` + `isWeakRowAgainstStructure`: invoice row `qty=3 unit=g` is flagged `weak_scalar_activated`; usable stays `structure.totalUsableAmount` (250), never `rowQuantity`.
3. **Display** — `resolveInvoiceLineStockPresentation` renders only `formatCanonicalUsableStockLabel(structured.normalizedUsableQuantity)`; no `rowQuantity × conversion_hint` fallback for unified lines.

## Other fallback paths

| Path | When | Usable behavior |
|------|------|-----------------|
| Explicit `container × size` in name | High-confidence regex match | Pack size → g/ml; optional multiply by row qty when row unit is generic (`un`, `cx`, …) |
| Inference (`PACK24`, `450ML` in title) | No explicit phrase | `normalized_stock_quantity × row qty` |
| `conversion_hint` (lettuce, herbs) | Produce tokens | Estimated yield (review badge); low confidence |
| `row_only` | Only qty+unit, weak name | Often **no** usable (avoids `1 g` / `1 ml` collapse) |
| `sanitizeStructuredUsable` | `1 g`, `1 ml`, `1 un` with weak confidence | Usable cleared — fail loud-ish (no fake tiny stock) |
| Stock added column | `pipelineId === unified` | Renders only `formatCanonicalUsableStockLabel(totalUsableAmount, usableUnit)` — no row qty×hint fallback |
| Stock added column | Structured usable null | UI shows “Same as purchased”; guards block meaningless `1 g usable` labels |

## API (stock-normalization)

- `normalizePurchasedToUsableStock(input)` — full resolution from parsed phrases + inference hints
- `pickExplicitPackPhrase(input)` — choose name vs row phrase
- `deriveUsableFromPackPhrase(phrase, rowQty, rowUnit)` — pack → usable
- `isWeakInvoiceRowContentMeasure(rowPhrase, rowQty, namePhrase)` — OCR row guard
- `measureToBase(qty, unit)` — kg/L → g/ml

## Tests

- `src/lib/stock-normalization.test.ts` — deterministic pack → usable cases (including former regressions)
- `src/lib/invoice-purchase-format.test.ts` — display + invoice integration
