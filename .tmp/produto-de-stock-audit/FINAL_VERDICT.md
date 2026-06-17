# Final Verdict — Produto de Stock Contamination

**Date:** 2026-06-15

---

## Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Exact root cause | Emporio boilerplate in Designação column → GPT copies to `items[].name` → pass-through to canonical |
| 2 | Contamination stage | **Invoice extraction (GPT/OCR)** — first in extract JSON |
| 3 | Rows affected | **7/8** Emporio product lines; **14/16** DB rows; **~80%** extraction runs. **Emporio-only.** |
| 4 | Recommended fix | `cleanInvoiceItemDisplayName` in `invoice-item-fields.ts` + noise phrase defense-in-depth |
| 5 | Confidence | **95%** |

---

## Summary

"Produto de Stock" is **not** introduced by canonical generation. It is Emporio invoice boilerplate captured by extraction and propagated unchanged. Fix upstream in invoice item cleaning — not in matching, pricing, or canonical logic alone.

**Reproduce:** Append ` Produto de Stock` to any clean invoice name → canonical suggestion includes `produto de stock`.
