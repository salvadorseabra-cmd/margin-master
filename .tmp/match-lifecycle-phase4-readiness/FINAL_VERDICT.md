# Phase 4 Read Cutover — Final Verdict

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Verdict Code

**3 — NOT READY**

---

## Critical Blockers

### P0 (must resolve before Phase 4)

| # | Blocker | Evidence |
|---|---------|----------|
| 1 | **No read-path implementation** — 0 production reads from `invoice_item_matches` | Phase 0 audit; grep shows reads only in repository/MLS/shadow-seed |
| 2 | **Write flags default OFF → 0% persisted coverage in production** | `match-lifecycle-flags.ts` |
| 3 | **Phase 2 VL manual sign-off incomplete** | `phase2-validation/VALIDATION_REPORT.md` |
| 4 | **No dual-read validation harness** | `VALIDATION_PLAN.md` describes tests; none compare persisted vs virtual |
| 5 | **Conservative classification will change UI on cutover** — must be validated, not surprised | Pepino virtual `confirmed` vs persisted `suggested`; 51-line taxonomy shift |

### P1

| # | Issue |
|---|-------|
| 1 | Catalog review reassign bypasses MLS |
| 2 | `markUnmatched` / Remove Match unwired — reject state not persisted |
| 3 | Dual-write errors silent to user (console only) |
| 4 | Re-extract confirmed-preserve policy (T8) not implemented |
| 5 | 11 VL lines have history but would seed `suggested` — pricing/history incoherence until Phase 6 |

### P2

| # | Issue |
|---|-------|
| 1 | Backfill does not delete orphan match rows |
| 2 | `markSuggested` unwired for non-extract matcher alignment |
| 3 | Shadow-seed uses virtual resolver — refactor needed post-cutover |

---

## Answers to All 7 Questions

| # | Answer |
|---|--------|
| 1 | **Coverage:** 0% production default; ~100% lines at extract + user actions when both flags ON + backfill; gaps: reject, unmatch, catalog review reassign |
| 2 | **Drift:** Yes — Pepino, bare exact, operational-memory, reject pair, catalog reassign, MLS failure, re-extract window |
| 3 | **Missing lifecycle states:** reject pair, session suppress, remove match, catalog reassign, alias/catalog changes without re-seed |
| 4 | **Cutover impact:** 8+ UI/projection surfaces change immediately (see CUTOVER_IMPACT.md) |
| 5 | **VL readiness:** Harness exists; prerequisites (migration, backfill, flags, dual-read script) not met |
| 6 | **Blockers:** 5 P0, 5 P1, 3 P2 above |
| 7 | **Recommendation:** **Verdict 3 — NOT READY** |

---

## Rationale

Phase 3 dual-write and Phase 2 shadow seed are structurally sound for a *shadow* authority, but Phase 4 read cutover requires:

- (a) populated persisted data
- (b) completed VL backfill sign-off
- (c) read-path + flag implementation
- (d) dual-read validation
- (e) resolution of catalog-review / reject coverage gaps

Enabling read preference tomorrow with default flags would either no-op (no rows) or, with backfill only, immediately reclassify Pepino-class lines without validated UX acceptance.

---

## Cross-References

- `.tmp/match-lifecycle-phase2-validation/`
- `.tmp/match-lifecycle-phase3-validation/`
- `.tmp/match-lifecycle-v1-implementation-plan/VALIDATION_PLAN.md`
- `.tmp/remove-match-investigation/query-summary.json`
