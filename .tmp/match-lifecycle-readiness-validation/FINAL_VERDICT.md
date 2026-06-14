# Final Verdict — invoice_item_matches as VL Source of Truth

**Generated:** 2026-06-14 · **Verdict:** NOT READY

---

## Readiness Scorecard

| Dimension | Weight | Score | Notes |
|-----------|--------|------:|-------|
| Coverage | 30% | 0 | Table absent; 0/51 rows |
| Classification consistency | 30% | 45 | 50/51 aligned; 1 intentional Pepino drift |
| Alias consistency | 20% | 100 | 6/6 alias lines projected aligned |
| Re-read resilience | 20% | 30 | FK+seed designed; not deployed/tested on VL |
| **Weighted total** | | **33** | |

---

## Verdict: NOT READY

### P0 Blockers

1. **Migration not applied on VL** — `to_regclass('invoice_item_matches')` = null
2. **0% persisted coverage** — flags default OFF; no backfill run
3. **No read-path implementation** — virtual matcher still sole display authority
4. **Phase 2 VL sign-off incomplete** — backfill dry-run never executed (no `SUPABASE_SERVICE_ROLE_KEY`)
5. **Pepino drift unvalidated for UX** — cutover would demote confirmed → suggested without sign-off

### P1 Risks (if forced early)

- Re-extract without shadow seed → persisted gap window
- Dual-write fire-and-forget → alias ahead of persisted on MLS failure
- Reject/unmatch/catalog-review paths don't write persisted layer
- 11 extract-synced lines have price history but would seed `suggested`

---

## Path to READY WITH RISKS

1. Apply migration on VL
2. Run backfill dry-run → confirm 51/51, Pepino=suggested
3. Enable SHADOW_SEED + DUAL_WRITE on VL
4. Build dual-read diff harness; sign off Pepino UX
5. Re-extract Bidfood with flags ON → verify 51/51 + CASCADE + re-seed

---

## Path to READY

Above + implement read-path cutover + close reject/unmatch/catalog gaps + Phase 6 history remediation for Pepino-class lines.

---

## Can invoice_item_matches Become Trustworthy?

**Architecturally yes** — conservative classification, idempotent upsert, FK cascade, and alias alignment are sound.

**Operationally no today** — empty table, no reads, no VL validation run, and known taxonomy shift unresolved.

---

## Cross-References

- `COVERAGE_REPORT.md` + `coverage.json`
- `CLASSIFICATION_DIFF.md` + `classification-matrix.json`
- `PEPINO_TRACE.md`
- `ALIAS_AUDIT.md`
- `REREAD_AUDIT.md`
- `.tmp/match-lifecycle-phase4-readiness/FINAL_VERDICT.md`
