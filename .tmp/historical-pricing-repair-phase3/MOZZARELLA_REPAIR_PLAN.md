# Mozzarella Contamination Repair Plan — Historical Pricing Repair Phase 3

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-14  
**Mode:** Repair plan only (no data changes, no commits)

**Ingredient:** Mozzarella fior di latte · `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`  
**Catalog:** `current_price=13.69`, `purchase_quantity=1`, unit `un` → operational **€13.69** ✅

---

## Row classification

| History ID | Invoice | Date | Match | Line | Op € | Class | Action |
|---|---|---|---|---|---|---|---|
| `3c508a43-68bd-4b69-9205-61ddbbfb26a7` | `c2f52357` | 2026-04-17 | **confirmed** | Mozzarella Flor di Latte **2Kg** @ 13.69 | 13.69 | **VALID** | KEEP |
| `9ee1b793-974d-4a6b-b656-c7b5e8febfaa` | `c2f52357` | 2026-04-17 | **confirmed** | same | 13.69 (Δ=0%) | **DUPLICATE** | DELETE |
| `18bdb0c5-0370-4bc7-878d-85957b8ba946` | `f0aa5a08` | 2026-05-08 | **suggested/semantic** | MOZZARELLA 125GR×8 qty 10 @ 8.12 | **0.812** | **POISON** | DELETE |

---

## Origins

### DUPLICATE (`9ee1b793`)

- Same `(invoice_id=c2f52357, ingredient_id)` — **no unique constraint** on `(invoice_id, ingredient_id)`.
- `3c508a43`: bootstrap (`prev=null`).
- `9ee1b793`: second insert (`prev=13.69`, `delta=0`) — likely second backfill or confirm pass before dedup saw first row.
- **Should exist:** exactly **one** row for Aviludo April. Keep `3c508a43`; delete `9ee1b793`.

### POISON (`18bdb0c5`)

| Field | Value |
|---|---|
| Invoice item | `ec1932a2` |
| Persisted match | `status=suggested`, `match_kind=semantic` (created 2026-06-14) |
| Line | 125g×8 balls, qty **10**, unit_price **€8.12** |
| Pipeline | `purchase_qty=10` → `8.12/10 = **0.812**` |
| Pack contract | 125g×8 balls ≠ 2kg block on same canonical ID |

`backfillIngredientPriceHistoryFromInvoices` gates only `unmatched`, not `suggested`:

```168:171:src/lib/ingredient-price-history-backfill.ts
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") {
      result.skippedUnmatched += 1;
      continue;
    }
```

Live extract with `VITE_MATCH_LIFECYCLE_EXTRACT_GATE=ON` would skip this line.

**Economically:** €8.12/pack-of-8 → €1.015/ball or ~€8.12/kg-equivalent — not comparable to €13.69/2kg block.

### Phase 5B reassign

**Not the cause** — no reassign on these lines. **Safe to ignore.**

---

## Repair SQL (document only — DO NOT EXECUTE)

```sql
-- MOZZARELLA CLEANUP — delete DUPLICATE + POISON; keep VALID
DELETE FROM ingredient_price_history
WHERE id IN (
  '9ee1b793-974d-4a6b-b656-c7b5e8febfaa',  -- DUPLICATE
  '18bdb0c5-0370-4bc7-878d-85957b8ba946'   -- POISON (suggested match)
)
AND ingredient_id = '2a99cecd-08fb-48d5-87cf-cc9ea5282a6d';
```

**Post-delete:** `fetchLatestHistoryNewPrice` → `13.69` from `3c508a43`. Catalog unchanged. No `reconcileIngredientPriceHistoryChain` needed (single surviving row).

**Validate:** Confirm 1 history row remains; `current_price` still 13.69; latest history op = 13.69.

**Rollback:** Re-insert from backup if needed (no catalog impact).
