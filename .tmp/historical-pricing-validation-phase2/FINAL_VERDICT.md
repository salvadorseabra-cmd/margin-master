# Final Verdict — Historical Pricing Validation Phase 2

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Read-only validation (no code fixes, no commits)

**Phase 1 reference:** `.tmp/historical-pricing-validation-phase1/`

---

## Executive summary

Phase 2 deep-dives the two **INCORRECT** ingredients flagged in Phase 1:

| Ingredient | ID | Phase 2 outcome |
|---|---|---|
| Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` | **INCORRECT** history chain; catalog OK |
| Mozzarella fior di latte | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` | **INCORRECT** duplicates + poison row; catalog OK |

Per-invoice insert math is pipeline-consistent. Defects are systemic: wrong denominators, corrupted timestamps, cross-base comparisons, and ungated suggested-match backfill.

---

## Per-issue verdict

Tags: **Historical artifact** · **Active contamination** · **Requires fix** · **Safe to ignore**

| Issue | Ingredient | Verdict | Priority |
|---|---|---|---|
| +316% false spike | Atum | **Requires fix** | P1 |
| Multi-`un` denominator | Atum (systemic) | **Requires fix** | P1 |
| Cross-base history chain | Atum | **Requires fix** | P1 |
| Duplicate Aviludo rows | Mozzarella | **Requires fix** | P1 |
| Suggested-match backfill poison | Mozzarella | **Active contamination** · **Requires fix** | P1 |
| Cross-SKU on one canonical ID | Mozzarella | **Requires fix** | P2 |
| `created_at` 2023 frozen (4 May rows) | Atum + 3 others | **Historical artifact** · ordering **Active contamination** · **Requires fix** | P2 |
| `ingredient_unit` mislabel | Atum (`g` on €/un) | **Requires fix** | P3 |
| Catalog `current_price` | Both | **Safe to ignore** (correct today) | — |
| Phase 5B reassign | Both | **Safe to ignore** (not root cause) | — |
| Per-invoice insert math | Both | **Safe to ignore** (pipeline-consistent) | — |

---

## Confirmed root causes

1. **Atum +316% spike** — Apr row stores 3.145 (6.29÷2 wrong) vs May 13.10; cross-base chain; true kg move +108%.
2. **Mozzarella duplicates** — Two Aviludo rows (`3c508a43` + `9ee1b793`) for same invoice; no unique constraint.
3. **Mozzarella poison row** — Bocconcino suggested backfill (`18bdb0c5` @ 0.812) on 2kg canonical ID.
4. **`created_at` corruption** — 4 May rows stamped 2023-05-19 vs invoice 2026-05-19; historical artifact + active ordering contamination.
5. **`current_price`** — Catalog OK for both; history queries wrong.

---

## Recommended fix order (guidance only — no implementation)

1. **Data repair:** Fix 4 `created_at` rows → `2026-05-19`; delete Mozzarella `9ee1b793` + `18bdb0c5`.
2. **Gate backfill:** Require `confirmed` matches (align with extract gate).
3. **DB constraint:** Unique on `(invoice_id, ingredient_id)` where not null.
4. **Ordering:** Use invoice chronology in `fetchLatestHistoryNewPrice`, revert, `priceActivity`.
5. **Cost semantics:** Fix multi-`un` denominator; route `1 Kg`-in-name through weight/`g`.
6. **Chain guard:** Block cross-pack inserts (2kg block vs 125g×8).

---

## Deliverables

| File | Contents |
|---|---|
| [ATUM_AUDIT.md](./ATUM_AUDIT.md) | Row-by-row trace, +316% spike, equivalence |
| [MOZZARELLA_AUDIT.md](./MOZZARELLA_AUDIT.md) | Duplicates, poison row, match lifecycle |
| [CREATED_AT_CORRUPTION.md](./CREATED_AT_CORRUPTION.md) | 4 corrupted May rows, creation path |
| [CURRENT_PRICE_AUDIT.md](./CURRENT_PRICE_AUDIT.md) | Catalog vs history divergence |
| [ROOT_CAUSE_SUMMARY.md](./ROOT_CAUSE_SUMMARY.md) | Issue matrix + code paths |

---

## Re-run validation

```bash
npx vite-node scripts/validate-historical-pricing.mts
```
