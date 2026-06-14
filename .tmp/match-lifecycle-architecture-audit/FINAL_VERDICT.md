# Match Lifecycle Architecture — Final Verdict

**Mode:** READ-ONLY · **Generated:** 2026-06-14

---

## Question

Does the system have a **complete Match Lifecycle model**?

---

## Verdict: **2 — PARTIAL**

**Confidence:** 91%

The system persists **cost side-effects** of match assignment and **optional alias memory** for user-confirmed links, but does **not** model match lifecycle as a coherent, reversible state per invoice line.

---

## Evidence summary

### What exists

| Capability | Status |
|------------|--------|
| Virtual match resolution at read time | Yes — `resolveInvoiceTableRowIngredientMatch` |
| Persist cost on extract (confirmed + suggested) | Yes — `syncOperationalIngredientCostsFromInvoiceLines` |
| Persist alias on manual confirm/correct | Yes — `upsertConfirmedAlias` |
| Block wrong pair on rematch | Partial — `rejectIngredientMatchPair` (localStorage) |
| History chain reconcile | Partial — `reconcileIngredientPriceHistoryChain` (invoice delete / re-extract UPDATE only) |
| Suggested vs confirmed UI distinction | Yes — runtime + Confirm button |
| Downstream derived intelligence | Yes — from history + live scan |

### What is missing

| Capability | Status |
|------------|--------|
| Persisted match status per invoice line | **No** — no `ingredient_id` on `invoice_items` |
| Unmatch | **No** production path |
| Subtractive correction (delete orphan history) | **No** |
| Revert `current_price` on old ingredient | **No** |
| Rebuild history chain on correction | **No** invoke |
| Extract sync gate for suggested/auto | **No** — both sync before review |
| Cross-device rejection memory | **No** — localStorage only |
| Match correction audit trail | **No** |

---

## Pepino case proof

1. **Assignment (pre-review):** `exact` match → history `a689bd91` + `current_price` — no alias, no user action ([pepino-contamination-timeline](../pepino-contamination-timeline/REPORT.md)).

2. **Correction (review):** Rematch writes new-target state + reject pair; **a689bd91 untouched** ([match-correction-reversal-audit](../match-correction-reversal-audit/verdict.json) code 2).

3. **Unmatch:** No handler; contamination fully persists ([match-correction-reversal-audit](../match-correction-reversal-audit/verdict.json) scenario B code 3).

---

## Twelve questions — condensed answers

| # | Answer |
|---|--------|
| 1 | Artifacts: history, current_price, optional alias, client mirrors, virtual match (ephemeral) |
| 2 | SoT: `invoice_items`, `ingredient_aliases`, `ingredient_price_history`, `ingredients`; derived: virtual match, OI, purchase scan |
| 3 | Derived: matcher output, purchase memory, alerts, OI, caches |
| 4 | History mostly append; aliases upsert; match state not stored |
| 5 | Recalculable: virtual match, scans, caches, OI if inputs clean |
| 6 | Not recalculable without delete: wrong history row, poisoned deltas, current_price without revert |
| 7 | Unmatch should delete history + revert price + rechain — **nothing happens today** |
| 8 | Reassign upserts new alias/cost; **orphans old history** |
| 9 | Rebuild services exist but **not wired to correction** |
| 10 | No reversal path: wrong-target `ingredient_price_history`, old `current_price` |
| 11 | Suggested/confirmed: runtime + UI; **both sync on extract** |
| 12 | Unmatch **no**; Reassign **partial**; Rebuild history **partial** (delete/re-extract only) |

---

## Verdict codes

| Code | Meaning | Applies |
|------|---------|---------|
| 1 | Complete lifecycle model | — |
| **2** | **Partial lifecycle model** | **System overall** |
| 3 | No lifecycle model | Unmatch path only |

---

## Architectural characterization (facts only)

Match assignment is implemented as **three decoupled writes** without a binding lifecycle record:

1. **Line fact** — `invoice_items` (no ingredient linkage)
2. **Confirmation memory** — `ingredient_aliases` (optional, manual)
3. **Cost projection** — `ingredient_price_history` + `ingredients.current_price` (automatic on extract for matched/suggested)

Correction mutates (2) forward and adds (3) for a new target; it does **not** retract (3) from the old target. Unmatch is **undefined** in production code.

---

## Artifact index

| File | Contents |
|------|----------|
| `MATCH_LIFECYCLE_MAP.md` | State transitions actual behavior |
| `ARTIFACT_INVENTORY.json` | Every persistence artifact |
| `REVERSIBILITY_MATRIX.json` | Reversal completeness per artifact |
| `SERVICES_AND_DEPENDENCIES.json` | Services + downstream consumers |
| `FINAL_VERDICT.md` | This document |
