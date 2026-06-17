# Final Verdict — Ginger Beer Unit Intelligence

**Mode:** Read-only. No fixes.

---

## Summary table

| Stage | Value |
|-------|-------|
| Invoice qty (visible) | **24** |
| Invoice unit price | **€0.85** |
| Invoice discount | 5% |
| Invoice total | **€19.38** |
| Raw description | `Baladin - Ginger Beer 0.20cl` |
| PDF SKU | `BBB-GINGER33ITA` (33cl; not persisted) |
| Parsed pack size | **2 ml**/unit (from `0.20cl`) |
| Parsed usable qty | **2 ml**/priced unit; 48 ml total @ qty=24 |
| Live DB qty / price | **2 cx @ €9.69** |
| Stored current_price | **N/A** (no ingredient) |
| Stored purchase_quantity | **N/A** |
| UI pack price (reported) | **€10.85** |
| UI operational price | **€5,425/L** (10.85 ÷ 0.002 L) |

---

## Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Invoice truth? | Qty 24 @ €0.85, 5% disc → €19.38; description says `0.20cl` |
| 2 | What was extracted? | Faithful `0.20cl`; qty drifts 24 un vs 2 cx between runs |
| 3 | First corruption? | **Volume token `0.20cl` on source document** (typo vs 33cl SKU) |
| 4 | OCR or parser? | OCR copies faithfully; **parser** applies 0.20×10 = 2 ml |
| 5 | Ingredient page wrong? | **N/A** — no catalog row |
| 6 | Operational cost wrong? | **YES** when 2 ml parse applied — €425/L @ €0.85 or €5,425/L @ €10.85 |
| 7 | Isolated or systemic? | **Isolated** — only decimal `0.XXcl` pattern in dataset |

---

## Verdict

Two compounding issues:

1. **Document/parser:** `0.20cl` → 2 ml (should be ~33cl / 330 ml per SKU)
2. **Extract variance:** qty=2 @ €10.85 drives reported UI; visible column is 24 @ €0.85

No ingredient persisted — all intelligence is read-time from `invoice_items.name`.
