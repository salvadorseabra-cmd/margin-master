# Phase 4 Read Cutover — Drift Analysis

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Classification Divergence (Core Drift)

**Virtual `displayState`** (`ingredient-match-explanation.ts`):

- `confirmed`: `exact`, `confirmed-alias`, `confirmed-override`, `operational-memory`, `operational-alias`
- `suggested`: `semantic`, `operational-equivalent`

**Persisted status** (`invoice-item-match-helpers.ts`):

- `confirmed`: **`confirmed-alias`, `confirmed-override` only**
- `suggested`: any matcher hit with `ingredient_id` (including bare `exact`, `operational-memory`)
- `unmatched`: no match

Documented Pepino fix: Phase 2 `SHADOW_POPULATION_FLOW.md`.

---

## Scenario Matrix

| Scenario | Can virtual ≠ persisted? | Evidence |
|----------|-------------------------|----------|
| **Pepino / bare `exact`** | **Yes** — virtual `confirmed`, persisted `suggested` | Pepino: virtual `displayState: confirmed`, `kind: exact`, no alias (`.tmp/remove-match-investigation/REPORT.md`) |
| **Alias-backed lines** | **Mostly aligned on ingredient_id**; status aligned when kind ∈ {confirmed-alias, confirmed-override} | Same alias map in both paths |
| **Manual confirm/correct** | **Transient risk** — alias updated, MLS async; failure → alias SoT ahead of persisted | Fire-and-forget dual-write |
| **Bulk create** | Same as manual confirm per row | `invoices.tsx:2219–2229` |
| **Re-read / re-extract** | **Yes during gap** — old match rows CASCADE-deleted; new UUIDs need re-seed | FK `on delete cascade`; seed at `invoices.tsx:1466` |
| **Invoice delete** | Rows removed (not drift) | `invoice_id … on delete cascade`; `removeRow` deletes invoice |
| **Reject pair** | **Yes** — virtual blocks ingredient via localStorage; persisted row unchanged | `rejectIngredientMatchPair` not in MLS |
| **Catalog review reassign** | **Yes** — alias updated, no MLS | `catalog-review-current-matches.ts:186–211` |
| **11 extract-synced VL lines** | **Yes** — virtual may show `confirmed`; persisted seeds `suggested` | `query-summary.json`; `BACKFILL_PLAN.md` |

---

## Expected VL Taxonomy Shift (51 lines)

| Bucket | Virtual (`query-summary.json`) | Persisted (shadow seed, conservative) |
|--------|-------------------------------|--------------------------------------|
| unmatched | 40 | 40 |
| suggested | 4 | **~15** (4 + Pepino-class + 11 reclassifications) |
| confirmed | 7 | 7 (alias-backed only) |
