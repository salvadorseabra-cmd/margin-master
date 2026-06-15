# Backfill Gate Audit — Suggested Match History

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** Read-only — `validate-repair-scope.mts` logic confirmed live via Supabase REST

---

## VL scan results

| Metric | Count |
|---|---|
| `suggested_match_history_count` | **1** (Nata `14330aad` only) |
| Total suggested matches | **2** |
| Suggested matches with history | **1** (Nata only) |

---

## All suggested matches in VL

| Ingredient | Match status | Match kind | History row | Notes |
|---|---|---|---|---|
| Nata culinária `3d1af48c` | suggested | semantic | **`14330aad` exists** ⚠️ | Active contamination |
| Mozzarella (Bocconcino) | suggested | semantic | **none** ✅ | 4A deleted poison rows |

---

## Systemic or Nata-only?

| Dimension | Verdict |
|---|---|
| **Active contamination today** | **Nata-only** — exactly 1 suggested-match history row in VL |
| **Code path** | **Systemic** — backfill treats suggested matches as eligible for history writes |
| **Latent risk** | Any future suggested match + backfill run can produce the same orphan row |

Contamination is Nata-only **today** because Mozzarella poison was deleted in 4A. The underlying gate gap remains unfixed in backfill code.

---

## Code path comparison

| Path | Checks confirm? | Writes history? | Writes catalog? |
|---|---|---|---|
| `backfillIngredientPriceHistoryFromInvoices` | ❌ (skips only `unmatched`) | ✅ suggested OK | ❌ |
| `persistOperationalIngredientCostFromInvoiceLine` | via caller | ✅ | ✅ |
| `syncOperationalIngredientCostsFromInvoiceLines` (gate ON) | ✅ authorized kinds only | ✅ | ✅ |

The gap is exclusively in **backfill** — the same gap that produced Mozzarella poison before 4A, now surviving on Nata because 4A–4C never scoped this row for deletion.

---

## Backfill gate (current behavior)

```168:171:src/lib/ingredient-price-history-backfill.ts
    if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") {
      result.skippedUnmatched += 1;
      continue;
    }
```

Suggested matches pass: `"suggested"` ≠ `"unmatched"`.

---

## Extract sync gate (contrast — gate ON)

```983:994:src/lib/ingredient-operational-intelligence.ts
    if (isMatchLifecycleExtractGateEnabled()) {
      if (
        !isExtractCostSyncAuthorizedMatch(match, {
          aliasAutoConfirm: isMatchLifecycleAliasAutoConfirmEnabled(),
        })
      ) {
        logExtractCostGateSkipped(item.name, match.kind, state.displayState);
        continue;
      }
    } else if (invoiceRowMatchSummaryBucket(state.displayState) === "unmatched") {
      continue;
    }
```

Live extract sync **blocks** semantic matches when gate is ON. **Backfill has no equivalent gate.**

---

## Match lifecycle flags

`isMatchLifecycleExtractGateEnabled()` controls extract-time cost sync but does **not** apply to `backfillIngredientPriceHistoryFromInvoices`. Backfill runs independently and uses only the `unmatched` bucket check.

---

## Required code fix (P2 — prevent recurrence)

Add confirmed-only gate to backfill, mirroring extract sync:

- Skip rows where `invoice_item_matches.status !== 'confirmed'` (when persisted match exists)
- Skip semantic/suggested matches in display state (when no confirmed match)
- Align with `isExtractCostSyncAuthorizedMatch` logic

Until deployed, any backfill run against invoices with suggested matches risks new orphan history rows.

---

## Post-repair validation targets

After deleting `14330aad` and deploying backfill gate:

| Check | Expected |
|---|---|
| `suggested_match_history_count` | **0** |
| Nata `current_price_from_latest_history` | **true** |
| New backfill runs | No history for suggested matches |
