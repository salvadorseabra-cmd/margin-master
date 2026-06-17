# Final Verdict — Lenha Extraction Failure

**Date:** 2026-06-15

---

## Where the line disappears

**Pass D table crop** — `detectTableBounds` anchors IVA summary band (y≈621) instead of product table (y≈430). Product row cropped out before GPT sees it.

---

## Classification

| Question | Answer |
|----------|--------|
| OCR issue? | Partial — metadata OK; line items crop-induced failure |
| AI extraction issue? | No — correctly returns [] for empty crop |
| Parsing issue? | No |
| Filtering issue? | No — filters never run |
| Persistence issue? | Secondary — header not updated when 0 items |
| UI issue? | Symptom only |
| Real bug? | **Yes** — table geometry heuristic |
| Data-foundation issue? | **No** |

---

## Impact

Any invoice where product table sits above a darker IVA/summary band. **Single-line invoices maximally fragile.** Affects operational suppliers (firewood, fuel, services) same as food.

---

## Recommended action

**Fix now (P1 backlog minimum):**

1. Add Lenha PNG to `invoice-image-crop.test.ts`
2. Reject footer-anchored grey bands / adjust `WHITE_HEADER_MIN_RULE_FRACTION`
3. Crop validation gate: if `items.length === 0 && total > 0`, retry expanded top or full image
4. Secondary: persist header metadata even when line persistence skipped
