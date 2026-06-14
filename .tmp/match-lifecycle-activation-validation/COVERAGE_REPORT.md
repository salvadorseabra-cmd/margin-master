# Coverage Report — Post-Activation (VL)

**Generated:** 2026-06-14 · **Project:** bjhnlrgodcqoyzddbpbd

---

## Validation Method

Primary: REST via service role (`run-validation.mts queries`)

Secondary: `supabase db query --linked` (status distribution — succeeded after pooler retries)

---

## Live Counts

| Metric | Value |
|--------|------:|
| `invoice_items` | **51** |
| `invoice_item_matches` | **51** |
| Missing match records | **0** |
| Orphan match records | **0** |
| Duplicate `invoice_item_id` | **0** |

**Coverage:** **100%** (51/51)

---

## Status Distribution

| Status | Count | Notes |
|--------|------:|-------|
| `unmatched` | 40 | No matcher result |
| `suggested` | 5 | 4 semantic + 1 Pepino (`exact`) |
| `confirmed` | 6 | All `confirmed-alias` (Aviludo April) |

Matches pre-activation projection from `.tmp/match-lifecycle-readiness-validation/COVERAGE_REPORT.md`.

---

## Flags Active (VL `.env.local`)

| Flag | Value |
|------|-------|
| `VITE_MATCH_LIFECYCLE_SHADOW_SEED` | `true` |
| `VITE_MATCH_LIFECYCLE_DUAL_WRITE` | `true` |
| `VITE_MATCH_LIFECYCLE_EXTRACT_GATE` | default **ON** (unset) |

---

## Comparison to Pre-Activation

| Metric | Before | After |
|--------|-------:|------:|
| Table exists | No | Yes |
| Match rows | 0 | 51 |
| Coverage | 0% | 100% |
| Shadow seed on extract | OFF | ON |
| Dual-write on confirm | OFF | ON |

---

## Known Residual Gaps (Not Coverage Blockers for Activation)

| Path | Persisted write? |
|------|------------------|
| Extract + shadow seed | Yes (flag ON) |
| User confirm + dual-write | Yes (flag ON) |
| Reject / unmatch | No |
| Catalog review reassign | No |
| Backfill orphan cleanup | No (report only) |

These remain P1 for Phase 4 read cutover; they do not affect 51/51 backfill coverage.

---

## Outcome

**Coverage verdict:** PASS — 100% persisted rows for all VL `invoice_items`.
