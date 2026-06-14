# Final Verdict — Historical Pricing Validation Phase 1

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Mode:** Read-only validation (no code fixes, no commits)

## Executive summary

| Ingredient | ID | Classification |
|---|---|---|
| Pepino conserva | `635a1189-36ea-4ff2-9012-8172ab1ab81d` | **VALID** |
| Arroz agulha | `07a55cf5-b98d-4aae-b330-b4944882e4d3` | **VALID** |
| Anchoas | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` | **SUSPICIOUS** |
| Gema líquida | `32dbf47d-347c-45f3-bd9f-c6e90640e767` | **SUSPICIOUS** |
| Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` | **INCORRECT** |
| Mozzarella fior di latte | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` | **INCORRECT** |

Per-invoice history insert math matches the pipeline for all rows. Defects are systemic: wrong denominators, corrupted timestamps, cross-base comparisons, and ungated suggested-match backfill.

---

## Confirmed issues

1. **`created_at` year corruption** — May-2026 invoices stamped `2023-05-19` on 4/6 ingredients; breaks latest-history queries and UI activity
2. **Multi-`un` line denominator bug** — `resolveCountablePurchaseQuantityForCost` uses row qty when `unit_price` is already per item (Anchoas, Atum Apr, Gema)
3. **Weight-in-name ignored for `un` rows** — Atum 1 Kg bags costed as €/un not €/g
4. **Atum +316% spike** — valid arithmetic on invalid operational bases; true kg move ~+108%
5. **Mozzarella suggested-match history** — backfill/sync path allows `suggested` bucket; 125g×8 pricing on 2kg canonical
6. **Duplicate history rows** — two rows for same `(invoice, Mozzarella Aviludo)`
7. **`ingredient_unit` mislabeling** — catalog `g` stamped on €/un operational values

## Disproven issues

1. **Pepino Bidfood poison row** — deleted; conserva chain clean (pepino-live-validation)
2. **Per-invoice history insert math** — `computePriceHistoryDelta` recomputes exactly for all rows
3. **Pepino/Arroz cx normalization** — `6X720g`, `12x1kg` paths mathematically correct
4. **Anchovas alias persistence paradox** — match/recall issue, **not** pricing pipeline corruption
5. **Phase 5B subtractive reassign** — lifecycle reversible; not root cause of VL pricing defects above

## Highest-risk pricing defects

| Rank | Defect | Impact |
|---|---|---|
| 1 | Multi-`un` qty denominator | Systematic **50–6× undercost** on multi-unit lines |
| 2 | Atum cross-base history chain | **316% false spike**; recipe cost swings |
| 3 | Mozzarella cross-SKU history | Wrong `current_price` revert; mixed pack intelligence |
| 4 | `created_at` ordering | Wrong trends, alerts, revert on 4/6 samples |
| 5 | Suggested-match backfill | Unconfirmed lines write history |

## Recommended fix order

1. **Data repair:** Fix corrupted `created_at` on May-2026 rows; dedupe Mozzarella Aviludo; delete or orphan IL BOCCONCINO suggested history
2. **Ordering:** Use `resolveInvoiceChronology` everywhere `fetchLatestHistoryNewPrice`, priceActivity, alerts sort
3. **Cost semantics:** Fix `resolveCountablePurchaseQuantityForCost` — don't divide by row qty when `unit_price` is per item; route `1 Kg`/weight-in-name through g/ml denominator
4. **History labels:** Store operational base unit in `ingredient_unit` (or new column)
5. **Gate backfill/sync:** Require `confirmed` matches (align with extract gate)
6. **Chain guard:** Block history insert when pack contract changes (2kg block vs 125g×8)

## Deliverables

| File | Status |
|---|---|
| `PIPELINE_TRACE.md` | Written |
| `INGREDIENT_AUDIT.md` | Written |
| `EQUIVALENCE_CHECKS.md` | Written |
| `OPPORTUNITY_AUDIT.md` | Written |
| `CURRENT_PRICE_AUDIT.md` | Written |
| `FINAL_VERDICT.md` | Written |
| `scripts/validate-historical-pricing.mts` | Written (optional, read-only) |

## Re-run validation

```bash
npx vite-node scripts/validate-historical-pricing.mts
```

Requires `.env.local` with VL Supabase service role credentials.
