# Phase 4 Read Cutover — Validation Lab Plan

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Current VL Readiness

| Prerequisite | Status | Evidence |
|--------------|--------|----------|
| Migration on VL DB | **Unverified in repo** | Phase 2 checklist open |
| Backfill 51/51 | **Not run in CI** | Manual only (`scripts/backfill-invoice-item-matches.mts`) |
| Shadow + dual-write ON in VL | **Not documented as done** | Flags default OFF |
| Dual-read diff harness | **Missing** | No script compares persisted vs virtual |
| VL harness inventory | **Present** | 6 VL invoices, 51 lines, 20 history rows |
| 51-line taxonomy baseline | **Present** | `.tmp/remove-match-investigation/query-summary.json` |

---

## Can VL Validate Read Cutover Safely Today?

**No — not without prerequisite work:**

1. Apply migration `20260614120000_invoice_item_matches.sql` on VL.
2. Run backfill dry-run → expect 51/51 coverage, Pepino `status=suggested`.
3. Enable `VITE_MATCH_LIFECYCLE_SHADOW_SEED` + `VITE_MATCH_LIFECYCLE_DUAL_WRITE` in VL.
4. Build/run **dual-read diff report** (persisted status vs virtual `displayState` per line) — not yet implemented.
5. Phase 4 VL tests from plan: Bidfood Pepino UI, catalog-review tests, `vl-cleanup-investigation.mts`, rollback flag test.

---

## Recommended VL Sequence Before Cutover

```
1. backfill --dry-run → coverage 51/51, byStatus vs query-summary
2. backfill apply → persist conservative taxonomy
3. Enable SHADOW_SEED + DUAL_WRITE
4. Re-extract Bidfood (flag ON) → cascade + re-seed, no orphan FK rows
5. Confirm one line → dual-write updates persisted confirmed
6. Dual-read diff script → sign off known deltas (Pepino-class)
7. Enable READ flag (Phase 4) → manual UI session Bidfood + Aviludo April
8. vl-cleanup-investigation → compare pre/post attribution
```

---

## Datasets

- **Sufficient for taxonomy validation:** 51 VL lines, 6 invoices, Pepino canary, 7 confirmed-alias lines, 11 extract-sync class.
- **Insufficient for full regression:** no automated dual-read suite; catalog-review reassign path untested against persisted layer.
