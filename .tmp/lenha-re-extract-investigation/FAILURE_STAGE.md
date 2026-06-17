# Failure Stage — Lenha Re-Extract

**Date:** 2026-06-15

| Stage | Result |
|-------|--------|
| Edge function Pass D crop | **FAIL** — footer IVA band selected |
| GPT table pass | Returns `items: []` (correct for empty crop) |
| Client normalization | Not reached meaningfully — `data.items` already `[]` |
| `shouldRejectInvoiceIngredientRow` | N/A — no items to filter |
| Persistence | Skipped — `normalizedItems.length === 0` |
| UI toast | Symptom — "Extraction returned no line items" |

**Exact stage:** Edge function / Pass D crop geometry, before client.
