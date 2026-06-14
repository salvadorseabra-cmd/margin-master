# Created_at Corruption — Historical Pricing Validation Phase 2

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Read-only validation (no code fixes, no commits)

---

## Affected rows (year mismatch: invoice 2026, `created_at` 2023)

| Ingredient | History ID | Invoice | `invoice_date` | `created_at` |
|---|---|---|---|---|
| Atum em óleo | `781ab1ac` | `3b4cb21f` | 2026-05-19 | **2023-05-19** |
| Anchoas | `908de185` | `3b4cb21f` | 2026-05-19 | **2023-05-19** |
| Arroz agulha | `edc6c627` | `3b4cb21f` | 2026-05-19 | **2023-05-19** |
| Gema líquida | `e143080d` | `3b4cb21f` | 2026-05-19 | **2023-05-19** |
| Pepino conserva | `5bd9a4e1` | `3b4cb21f` | 2026-05-19 | **2026-05-19** ✓ |

**4 of 5** May-Aviludo history rows corrupted. Pepino is the exception (inserted after date correction).

---

## Source invoice

| Field | Value |
|---|---|
| Invoice ID | `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` |
| Current `invoice_date` | `2026-05-19` |
| Uploaded | `2026-06-07T22:08:48Z` |

---

## Creation path

On first insert, `created_at` = normalized `invoice_date` at that moment:

```103:116:src/lib/ingredient-price-history.ts
export function resolveIngredientPriceHistoryCreatedAt(params) {
  const { displayDateIso } = resolveInvoiceChronology({ invoice_date, created_at });
  if (displayDateIso) return `${displayDateIso}T12:00:00.000Z`;
```

Invoice date passed from extract route:

```1483:1504:src/routes/invoices.tsx
const invoiceDateForHistory = normalizeInvoiceDate(rawInvoiceDateForHistory);
// passed to syncOperationalIngredientCostsFromInvoiceLines → appendIngredientPriceHistoryFromInvoiceLine
```

On **refresh**, `created_at` is **preserved** (line 456 comment in `ingredient-price-history.ts`).

---

## Root cause (confirmed by evidence)

1. May invoice initially had `invoice_date` resolving to **2023-05-19** (likely OCR `19/05/23` → `2023-05-19` via `normalizeInvoiceDate` PT parser).
2. Extract/backfill on ~2026-06-07 stamped history with `2023-05-19`.
3. User corrected invoice to `2026-05-19`.
4. Re-extract **refreshed prices/deltas** but **preserved** wrong `created_at`.
5. Pepino May row inserted later (after correction) → correct `2026-05-19`.

---

## Historical artifact or active contamination?

| Aspect | Verdict |
|---|---|
| Frozen 2023 timestamps in DB | **Historical artifact** |
| `fetchLatestHistoryNewPrice`, `priceActivity`, alerts using `created_at DESC` | **Active contamination** |
| New inserts today | **Safe to ignore** if `invoice_date` is correct (Pepino proves path works) |

---

## Impact on Phase 2 ingredients

### Atum em óleo

- May row `781ab1ac` has `created_at=2023-05-19` while April row `61c51696` has `2026-04-17`.
- `fetchLatestHistoryNewPrice` (`created_at DESC`) returns April **3.145** instead of May **13.10**.
- Catalog **13.10** remains correct; history ordering is wrong.

### Mozzarella fior di latte

- Mozzarella rows unaffected by 2023 stamp (Aviludo Apr + Bocconcino May both have plausible dates).
- Ordering issue here is poison row content, not year mismatch.

---

## Recommended repair (guidance only)

1. **Data repair:** Update 4 rows → `created_at = 2026-05-19T12:00:00.000Z`.
2. **Code:** Sort by `resolveInvoiceChronology` in `fetchLatestHistoryNewPrice`, revert, `priceActivity`.

**Overall verdict:** **Historical artifact** + **Active contamination** · **Requires fix**
