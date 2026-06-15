# Match Lifecycle Audit — Nata Culinária

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Ingredient:** Nata culinária `3d1af48c-be3c-494a-9e0f-be267fc9388b`  
**Mode:** Read-only

---

## Timeline

| When | Event |
|---|---|
| ~2026-06-07–09 | Confirmed aliases seeded (Reny Picot AVILUDO; Remy/Peny Picot Avijudo variants) |
| 2026-04-17 | April invoice `c2f52357` ingested — line `c871ece9` alias-matched → **confirmed**; catalog + history `2767b722` written |
| 2026-05-19 | May invoice `3b4cb21f` ingested — line `1826cbe9` semantically matched → history `14330aad` written via backfill; **no catalog update** |
| Phase 4B | `created_at` on `14330aad` repaired (2023→2026); row **retained** |
| 2026-06-14 | MLS dual-write: `invoice_item_matches` populated — April **confirmed**, May **suggested/semantic** |
| 2026-06-15 | Foundation readiness audit: blocker identified — suggested history without confirm |

---

## `invoice_item_matches` state (live)

| Item ID | Invoice | Line description | Status | Kind | Created |
|---|---|---|---|---|---|
| `c871ece9` | `c2f52357` April | Nata Reny Picot 22% 6x1L | **confirmed** | `confirmed-override` | 2026-06-14 (MLS dual-write) |
| `1826cbe9` | `3b4cb21f` May | Nata Culinaria 22% Reny Picot 6x1 Lt | **suggested** | `semantic` | 2026-06-14 (MLS dual-write) |

---

## Was Nata confirmed or suggested?

| Purchase | Verdict |
|---|---|
| **April 2026** | **Confirmed** — alias-backed (`confirmed-override`) |
| **May 2026** | **Suggested** — semantic match only; never confirmed by user |

---

## MLS involvement

- **Phase 4 dual-write** created persisted `invoice_item_matches` records on **2026-06-14**
- MLS did **not** create the history row `14330aad` — that predates the persisted match record
- MLS correctly reflects current match state: April confirmed, May suggested

---

## Re-read

**Not applicable.** No user confirm/reject action occurred on the May line. The suggested match has remained unconfirmed since ingest.

---

## Backfill

**Yes — root write path for `14330aad`.**

`backfillIngredientPriceHistoryFromInvoices` ran against May invoice lines and wrote history for the semantically matched Nata line without requiring confirmation. Backfill is history-only, so catalog was not updated.

---

## Extract sync (gate ON) — contrast

When `isMatchLifecycleExtractGateEnabled()` is ON, live extract sync **blocks** unauthorized matches:

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

Semantic/suggested matches are skipped by extract sync when the gate is ON. **Backfill has no equivalent gate** — this is the lifecycle gap that produced the orphan row.

---

## Comparison to Mozzarella (pre-4A)

| Aspect | Mozzarella (pre-4A) | Nata (now) |
|---|---|---|
| Contamination class | Suggested/backfill history without confirm | Same |
| History row | Poison row existed | `14330aad` exists |
| Catalog updated? | No (history-only backfill) | No |
| 4A repair | Deleted poison rows | Nata row **not in 4A scope** |
| 4B repair | created_at fixed | created_at fixed, row retained |
| Suggested match today | Mozzarella Bocconcino — no history ✅ | Nata — history exists ⚠️ |

---

## Lifecycle verdict

The May Nata purchase followed the same broken lifecycle as pre-4A Mozzarella: **semantic match → backfill writes history → no confirm → catalog stale → latest-history contamination.** Phase 4B repaired timestamp ordering but did not remove the orphan row.
