# Created_at Corruption Repair Plan — Historical Pricing Repair Phase 3

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Mode:** Repair plan only (no data changes, no commits)

---

## Scope (live-confirmed)

Invoice `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` · `invoice_date=2026-05-19` · uploaded `2026-06-07`

| History ID | Ingredient | Ingredient ID | `created_at` (wrong) | Prices OK? |
|---|---|---|---|---|
| `edc6c627-d934-40de-8eb8-cc0a25d36755` | Arroz agulha | `07a55cf5-b98d-4aae-b330-b4944882e4d3` | `2023-05-19` | ✅ |
| `14330aad-cce1-4569-aa2f-4976dd1ac336` | Nata culinária | `3d1af48c-be3c-494a-9e0f-be267fc9388b` | `2023-05-19` | ✅ |
| `908de185-e61a-4f41-af4c-3b70f69bd08f` | Anchoas | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` | `2023-05-19` | ✅ |
| `1d9d5133-724b-461c-b141-605392f2b64d` | Açúcar branco | `c46db69a-e4ae-4be8-abb8-d7708de12f3d` | `2023-05-19` | ✅ |
| `781ab1ac-39d2-4462-9106-635e5603c466` | Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` | `2023-05-19` | ⚠️ delta chain wrong |
| `e143080d-511b-4c37-9018-11949343aedc` | Gema líquida | `32dbf47d-347c-45f3-bd9f-c6e90640e767` | `2023-05-19` | ⚠️ denominator wrong |
| `bf250ee4-388a-480f-96d7-e8c0e8e8dfb2` | Chocolate culinária | `43cba6b0-880e-4760-ab78-8d9a9c1b6f86` | `2023-05-19` | ✅ |

**Correct (no repair):** `5bd9a4e1-713f-4474-9985-f46bdb1b36b0` (Pepino) · `created_at=2026-05-19` — inserted after invoice date correction.

**Global:** All 7 corrupted rows are on this single invoice. No other year-mismatch rows on VL.

Phase 2 reported 4 corrupted sample-ingredient rows; live DB shows **7 corrupted + 1 correct** on invoice `3b4cb21f`, adding Chocolate, Nata, and Açúcar.

---

## Code path

1. **First insert** stamps `created_at` from `resolveIngredientPriceHistoryCreatedAt` → `invoice_date` at insert time:

```103:116:src/lib/ingredient-price-history.ts
export function resolveIngredientPriceHistoryCreatedAt(params: {
  invoiceDate?: string | null;
  invoiceCreatedAt?: string | null;
}): string {
  const { displayDateIso } = resolveInvoiceChronology({
    invoice_date: params.invoiceDate ?? null,
    created_at: params.invoiceCreatedAt ?? null,
  });
  if (displayDateIso) {
    return `${displayDateIso}T12:00:00.000Z`;
  }
```

2. Extract passes normalized date from `invoices.tsx` → `syncOperationalIngredientCostsFromInvoiceLines` → `appendIngredientPriceHistoryFromInvoiceLine`.

3. **Re-extract refresh preserves `created_at`** (comment at line 456; update path at 531–543 skips `created_at`).

---

## Why 2023 persisted

1. Invoice initially stored with `invoice_date=2023-05-19` (OCR/manual year error — likely `19/05/23` → `2023-05-19` via `normalizeInvoiceDate` PT parser).
2. Extract/backfill on ~2026-06-07 stamped history at `2023-05-19T12:00:00Z`.
3. User corrected invoice to `2026-05-19`.
4. Re-extract refreshed prices/deltas but **froze** wrong `created_at`.
5. Pepino row inserted later → correct `2026-05-19`.

---

## Active vs artifact

| Layer | Verdict |
|---|---|
| Frozen DB timestamps | **Historical artifact** |
| `fetchLatestHistoryNewPrice`, `priceActivity`, alerts, `getIngredientPriceTrend`, `revertIngredientCurrentPriceFromHistory` | **Active contamination** |
| New inserts with correct `invoice_date` | **Safe to ignore** (Pepino proves path) |

**Atum ordering proof:** May row sorts *before* April because `2023-05-19 < 2026-04-17` — `created_at DESC` returns April `3.145`, not May `13.10`.

---

## Repair SQL (document only — DO NOT EXECUTE)

```sql
-- CREATED_AT REPAIR — invoice 3b4cb21f (7 rows)
UPDATE ingredient_price_history
SET created_at = '2026-05-19T12:00:00.000Z'
WHERE id IN (
  'edc6c627-d934-40de-8eb8-cc0a25d36755',
  '14330aad-cce1-4569-aa2f-4976dd1ac336',
  '908de185-e61a-4f41-af4c-3b70f69bd08f',
  '1d9d5133-724b-461c-b141-605392f2b64d',
  '781ab1ac-39d2-4462-9106-635e5603c466',
  'e143080d-511b-4c37-9018-11949343aedc',
  'bf250ee4-388a-480f-96d7-e8c0e8e8dfb2'
)
AND invoice_id = '3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2';
```

**Validate:** Re-run `scripts/validate-historical-pricing.mts`; confirm `created_at` year = invoice year for all 8 rows on `3b4cb21f`.

**Rollback:** Restore original `created_at` values (prices unchanged).
