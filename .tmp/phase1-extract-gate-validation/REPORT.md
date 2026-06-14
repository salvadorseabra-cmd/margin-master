# Phase 1 Extract Cost Gate — Validation Report

**Mode:** READ-ONLY validation · **Generated:** 2026-06-14  
**Reference case:** Bidfood Pepino → Pepino conserva (`635a1189`)  
**Verdict code:** **2 — Partial protection**

---

## Executive Summary

Phase 1 extract gate **correctly blocks** the Pepino pre-review contamination path in **local code and unit tests** when `VITE_MATCH_LIFECYCLE_EXTRACT_GATE` is enabled (default ON). However, the **latest live Bidfood re-read** (2026-06-14T10:39Z) still updated `ingredients.current_price` for Pepino conserva — indicating the gate was **not active** in the running build. Existing poison row `a689bd91` remains. Ungated bypass paths (flag rollback, admin backfill, intentional manual confirm) still exist.

---

## Ten Questions — Evidence

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Did `syncOperationalIngredientCostsFromInvoiceLines` execute for Pepino on latest re-read? | **Inferred YES** (live) / **YES but skips Pepino** (simulated gate ON) | Live: `ingredients.updated_at` = `2026-06-14T10:39:06Z` matches re-insert `invoice_items` at `10:39:05Z`. Simulated: vitest invokes sync; Pepino line hits gate skip. |
| 2 | Did `isExtractCostSyncAuthorizedMatch` evaluate true/false? | **FALSE** | `kind: exact`, `displayState: confirmed` — `.tmp/pepino-contamination-timeline/query-raw.json` + vitest matcher logs. |
| 3 | Was `logExtractCostGateSkipped` emitted? | **YES (simulated)** / **Not observable (live)** | Vitest stdout: `[match-lifecycle-extract-gate] { action: "skipped", itemName: "PEPINO", matchKind: "exact", reason: "extract_gate_not_authorized" }`. No server log store. |
| 4 | Was `persistOperationalIngredientCostFromInvoiceLine` called? | **NO (gate ON test)** / **YES (live re-read)** | `persistSpy.not.toHaveBeenCalled()` in extract-gate test; live `current_price` 21.99 → 1.77 at re-read timestamp. |
| 5 | Was `appendIngredientPriceHistoryFromInvoiceLine` called? | **NO (gate ON test)** / **No new row (live)** | Gate blocks before persist; live history count still 3. |
| 6 | Any `ingredient_price_history` row created/updated/modified? | **NO on latest re-read** | 3 rows unchanged; `a689bd91` still `new_price: 0.00177`. |
| 7 | Was `ingredients.current_price` modified? | **YES on live re-read** / **NO when gate ON** | Live: 1.77, `purchase_quantity` 1000 at `10:39:06Z`. Test: `updatedIngredientIds: []`. |
| 8 | Before vs after re-read | See `before-after-comparison.json` | History: 3→3 unchanged. `current_price`: 21.99→1.77 (re-contaminated). Item id rotated `8e9e727a`→`dd539785`. |
| 9 | Does gate fully block Pepino contamination path? | **Code: YES (gate ON)** / **Live deployment: NO** | Gate at `ingredient-operational-intelligence.ts:967-975` skips `exact` kinds. Live re-read bypassed gate. |
| 10 | Remaining write paths bypassing gate? | **YES** | See `bypass-risk-audit.json` — flag off, backfill, manual confirm/correct. |

---

## Implementation Trace (Gate ON — Simulated Pepino Re-read)

```
invoices.tsx:1358  syncOperationalIngredientCostsFromInvoiceLines(...)
  → resolveInvoiceTableRowIngredientMatch("Pepino") → kind: exact
  → isMatchLifecycleExtractGateEnabled() === true
  → isExtractCostSyncAuthorizedMatch(exact) === false
  → logExtractCostGateSkipped("Pepino", "exact", "confirmed")
  → continue (NO persistOperationalIngredientCostFromInvoiceLine)
```

**Authorized kinds** (`ingredient-match-explanation.ts:48-64`): `confirmed-alias`, `confirmed-override`, and (when alias auto-confirm ON) `operational-memory`, `operational-alias`. Bare `exact` is explicitly excluded.

**Flag defaults** (`match-lifecycle-flags.ts`): extract gate ON unless `VITE_MATCH_LIFECYCLE_EXTRACT_GATE=false|0|off`.

---

## Live Observation (2026-06-14 Re-read — Gate NOT Active)

Readonly Supabase query at `10:42Z` after re-extract at `10:39Z`:

| Field | Before (2026-06-13 audit) | After (live) |
|-------|---------------------------|--------------|
| `history_count` | 3 | 3 |
| Latest history row | `a689bd91` (0.00177) | unchanged |
| `current_price` | 21.99 | **1.77** |
| `purchase_quantity` | 6 | **1000** |
| `updated_at` | 2026-06-13T21:54Z | **2026-06-14T10:39:06Z** |
| Pepino `invoice_item` id | `8e9e727a` | `dd539785` (new insert) |

**Interpretation:** Extract sync ran in legacy mode (gate not deployed). `current_price` re-poisoned; history row from original 2026-06-09 contamination persists.

---

## Tests Executed

```
npx vitest run src/lib/ingredient-operational-intelligence-extract-gate.test.ts \
               src/lib/ingredient-match-explanation.test.ts
→ 22 passed
```

Key Pepino test: `PEPINO` + Bidfood + gate ON → `updatedIngredientIds: []`, `persistSpy` not called, gate skip log emitted.

Legacy rollback test: gate OFF → Pepino exact **does** persist (proves flag bypass risk).

---

## Bypass Risk Summary

| Path | Gated? | Pepino risk |
|------|--------|-------------|
| Extract sync (`syncOperationalIngredientCostsFromInvoiceLines`) | **YES** when flag ON | Blocked |
| Extract sync with `VITE_MATCH_LIFECYCLE_EXTRACT_GATE=false` | NO | **Critical** — reproduces contamination |
| Manual confirm/correct (`persistIngredientCorrectionForItem`) | NO (intentional) | Low — requires human action |
| `backfillIngredientPriceHistoryFromInvoices` | NO | Medium — admin replay of matcher |
| Operational-memory auto-confirm | Conditional | **N/A for Pepino** — no Bidfood alias/memory hit |

---

## Verdict

| Code | Meaning |
|------|---------|
| **2** | **Partial protection** |

**Rationale:** Implementation validates for Pepino when gate is ON, but live re-read demonstrates gate not yet protecting production data; existing poison and bypass paths remain.

---

## Artifacts

| File | Status |
|------|--------|
| `verdict.json` | Written |
| `pepino-reread-trace.json` | Written |
| `persistence-check.json` | Written |
| `before-after-comparison.json` | Written |
| `bypass-risk-audit.json` | Written |
| `REPORT.md` | This file |

---

## Prior Context Cross-References

- [pepino-contamination-timeline](../pepino-contamination-timeline/REPORT.md) — original contamination before review
- [match-correction-reversal-audit](../match-correction-reversal-audit/REPORT.md) — correction does not revert poison
- [match-lifecycle-v1-implementation-plan](../match-lifecycle-v1-implementation-plan/IMPLEMENTATION_PHASES.md) — Phase 1 scope
