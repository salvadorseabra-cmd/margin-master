# OCR Validation — Lenha Invoice

**Date:** 2026-06-15

## Verdict: **OCR_SUCCESS (metadata) / OCR_FAILURE (line items — crop-induced)**

| Field | Detected? |
|-------|-----------|
| Supplier "Mais Lenhas & Carvão" | ✅ Yes |
| Date 2026-05-23 | ✅ Yes |
| Total €75 | ✅ Yes |
| "Lenha para pizzaria" | ❌ Not in table crop sent to Pass D |
| Quantity 1,00 M3 | ❌ Outside crop |
| Price €75 | ❌ Outside crop |

Product text is visible on full image but **outside the cropped region** (bounds.top ≈ 585; product row above y≈585).
