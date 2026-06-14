# P0 Identity Guard Validation

**Generated:** 2026-06-13T20:50:31Z  
**Scope:** Cross-format chain guard (Option E P0) — no schema changes

---

## Verdict Summary

| Area | Status | Notes |
|------|--------|-------|
| Historical Pricing | **PARTIAL** | Pipeline math trusted; stale DB rows remain until re-read/reconcile |
| Operational Intelligence | **PARTIAL** | VL false positives suppressed on read path; mock `/` dashboard unchanged |
| VL Mozzarella +1341% | **Gone** | No price_increase alert, no owner-review inflation row |
| VL Pepino −99% | **Gone** | No price_decrease alert |
| VL Ginger Beer €/L | **Blocked** | R7 blocks history insert; line unmatched in catalog |
| Cross-format supplier recs | **Gone** | `betterSupplierLine` null for Mozzarella/Pepino |

**Pack Variant still required for P1?** **Yes** — clean multi-variant history, alias binding, recipe default variant costing.

**Recommendation:** **Continue Identity (P1 pack variants)** — P0 guard is sufficient to stop VL opportunity poisoning; pack-variant architecture removes heuristic dependence.

---

## Tests

- `ingredient-price-chain-guard.test.ts` — 5/5 VL design cases
- `ingredient-price-history-persistence.test.ts` — append/refresh/reconcile wiring
- `ingredient-price-history-reconcile.test.ts` — guard-aware rechaining

---

## VL Guard Replay

| Case | Expected | Result |
|------|----------|--------|
| Mozzarella piece vs block | break chain | PASS |
| Pepino fresco vs conserva | break chain | PASS |
| Ginger Beer 0.20cl | block insert | PASS |
| Atum trusted chain | chain | PASS |

---

## Before → After (OI surfaces)

| Signal | Before P0 | After P0 |
|--------|-----------|----------|
| Mozzarella price_increase alert | yes | no |
| Pepino price_decrease alert | yes | no |
| Owner-review cross-format opportunity | yes | no |
| Supplier betterSupplierLine +1341% | yes | no |
| Supplier watchlist +1341% note | yes | no |
| Alert items (total) | ~2 false | 0 |

---

## Remaining Risks

- **R-DB-STALE** (medium): 14/20 VL price_history rows are ghost/stale from Jun 11 extractions
- **R-GENERIC-NAME** (medium): History rows store catalog ingredient_name, not invoice line name — guard relies on unit + price ratio heuristics
- **R-GINGER-PARSE** (low): Ginger Beer 0.20cl unmatched; R7 blocks insert if matched but cl→ml parse still wrong
- **R-MOCK-DASHBOARD** (low): Home / dashboard still uses mock-data.ts
- **R-PACK-VARIANT** (high): Multi-supplier intel without false positives needs per-variant history

---

## Artifacts

| File | Contents |
|------|----------|
| `findings.json` | Structured validation results |
| `before-after.json` | Pre/post P0 comparison |
| `remaining-risks.json` | Open identity risks |
| `run-validation.mts` | Reproducible harness |
