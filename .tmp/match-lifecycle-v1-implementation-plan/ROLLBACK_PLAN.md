# Match Lifecycle V1 — Rollback Plan

**Mode:** READ-ONLY implementation planning · **Generated:** 2026-06-14  
**Answers:** Question 12 — Rollback strategy per phase

---

## Rollback Principles

1. **Feature flags first** — every behavioral phase reversible via flag off
2. **Additive schema** — `invoice_item_matches` can be ignored on rollback
3. **Backup before DELETE** — remediation rollback requires history snapshot
4. **VL always runnable** — extraction path never blocked by rollback
5. **Dual-read window** — maintain virtual match fallback until Phase 8 sign-off

No centralized feature-flag infra exists today; use `localStorage` + `import.meta.env.VITE_*` pattern (`.tmp/ingredient-identity-future-design/migration-strategy.json` references flags conceptually).

---

## Phase 0 — Schema Foundation

### Failure modes
| Failure | Likelihood |
|---------|:----------:|
| RLS blocks legitimate reads | Low |
| Migration deploy error | Low |
| FK constraint violation on seed | Medium (if seed run immediately) |

### Rollback procedure
1. App unchanged — no rollback needed for behavior
2. If RLS broken: hotfix policy or disable RLS temporarily
3. Nuclear: drop table (only if empty and no seed)

### Data safety
- **Fully safe** — no app writes to table

### Recovery time
- < 1 hour

---

## Phase 1 — Extract Cost Gate

### Failure modes
| Failure | Impact |
|---------|--------|
| Over-gating: alias-confirmed lines stop syncing | 7 VL lines lose auto-history |
| Under-gating: bare exact still syncs | Pepino class recurs |
| User confusion: more "Suggested" lines | UX friction |

### Rollback procedure
1. Set `MATCH_LIFECYCLE_EXTRACT_GATE=off`
2. Restore `syncOperationalIngredientCostsFromInvoiceLines` line 933 to skip-unmatched-only
3. Re-extract affected invoices if history missing

### Data safety
- Lines that missed sync: backfill after rollback (existing path)
- No DELETE required

### Recovery time
- < 30 minutes (flag flip)

**Evidence:** Gate is pure application logic (Option A component — `.tmp/match-lifecycle-v1-design/MIGRATION_OPTIONS.md`).

---

## Phase 2 — Shadow Seed

### Failure modes
| Failure | Impact |
|---------|--------|
| Misclassified Pepino as `confirmed` | Wrong data in table (not read yet) |
| Duplicate seed on re-run | Constraint violation |
| Script marks wrong 11 lines | Remediation target wrong |

### Rollback procedure
1. `DELETE FROM invoice_item_matches` (full truncate per user)
2. Fix classification logic
3. Re-run seed

### Data safety
- Match records only — no pricing impact if shadow mode

### Recovery time
- < 2 hours

---

## Phase 3 — MLS Write Path

### Failure modes
| Failure | Impact |
|---------|--------|
| Dual-write drift (MLS vs virtual) | Inconsistent records |
| Transition ordering bug | Duplicate history |
| Extract creates wrong status | Suggested lines show wrong |

### Rollback procedure
1. `MATCH_LIFECYCLE_MLS_WRITES=off`
2. Revert `invoices.tsx` to direct `persistIngredientCorrectionForItem`
3. Keep match records (orphaned but harmless) OR truncate
4. If duplicate history: admin DELETE + reconcile per ingredient

### Data safety
- Duplicate history possible — use `appendIngredientPriceHistoryFromInvoiceLine` refresh detection
- Backup history before enabling MLS in production

### Recovery time
- 2–4 hours

---

## Phase 4 — Read-Path Cutover

### Failure modes
| Failure | Impact |
|---------|--------|
| Suggested shown as confirmed | UX trust loss |
| Confirmed shown as suggested | Users re-confirm unnecessarily |
| Purchase scan under-counts | OI input gap |
| Catalog review count wrong | Review queue broken |

### Rollback procedure
1. `MATCH_LIFECYCLE_READ_FROM_RECORD=off` — immediate virtual match restore
2. No data migration needed
3. Investigate seed misclassification if drift

### Data safety
- **Fully safe** — read-only flag toggle

### Recovery time
- < 15 minutes

**Evidence:** Option B supports virtual fallback during canary (`.tmp/match-lifecycle-v1-design/MIGRATION_OPTIONS.md` §Rollback strategy).

---

## Phase 5 — Subtractive Correct + Remove Match

### Failure modes
| Failure | Impact | Severity |
|---------|--------|:--------:|
| DELETE wrong history row | Legitimate price data lost | **Critical** |
| DELETE fails (RLS) | Orphan remains; user thinks removed | High |
| Reconcile error after DELETE | Broken delta chain | High |
| Remove Match on wrong line | Unintended unmatch | Medium |
| Alias deleted incorrectly | Matcher re-suggests wrong | Medium |

### Rollback procedure
1. `MATCH_LIFECYCLE_REMOVE_MATCH=off` — hide UI
2. `MATCH_LIFECYCLE_MLS_WRITES=off` — disable subtractive path
3. **Restore history from pre-Phase-5 backup** (required)
4. Re-run `reconcileIngredientPriceHistoryChain` per affected ingredient
5. Re-seed match records from virtual state

### Data safety
- **Requires backup** — DELETE is irreversible without snapshot
- Test on Bidfood only before broad enablement

### Recovery time
- 4–8 hours (depends on backup quality)

**Evidence:** History keyed `(invoice_id, ingredient_id)` without `invoice_item_id` — attribution risk highest here (`.tmp/match-lifecycle-foundations-audit/SOURCE_OF_TRUTH_MATRIX.json`).

---

## Phase 6 — Data Remediation

### Failure modes
| Failure | Impact |
|---------|--------|
| Over-delete jar history on Pepino | Legitimate April/May rows lost |
| Under-delete a689bd91 | Contamination persists |
| Mozzarella wrong row deleted | Aviludo block history lost |
| Reconcile after bad DELETE | Wrong current_price |

### Rollback procedure
1. Restore `ingredient_price_history` from pre-remediation snapshot
2. Restore `ingredients.current_price` from snapshot
3. Re-run reconcile on all 9 VL ingredients
4. Re-seed match records

### Data safety
- **Mandatory backup** before batch DELETE
- Idempotent reconcile after restore

### Recovery time
- 2–4 hours with backup; **days** without

---

## Phase 7 — Backfill Gate + Server Reject

### Failure modes
| Failure | Impact |
|---------|--------|
| Backfill skips legit confirmed lines | Missing history |
| Server reject blocks valid match | User stuck unmatched |
| localStorage migration drops pairs | Re-suggest wrong target |

### Rollback procedure
1. `MATCH_LIFECYCLE_BACKFILL_CONFIRMED_ONLY=off`
2. `MATCH_LIFECYCLE_SERVER_REJECT_LOG=off` — localStorage only
3. Re-run backfill with legacy matcher replay
4. DELETE erroneous server reject rows

### Data safety
- Backfill is additive — rollback may leave gaps, not orphans
- Server rejects: DELETE per row

### Recovery time
- 1–2 hours

---

## Phase 8 — VL Sign-off

### Failure modes
| Failure | Impact |
|---------|--------|
| False green on stale harness | OI enabled on dirty data |
| Missed contamination | Production alerts wrong |

### Rollback procedure
- N/A — validation only
- If sign-off wrong: revert to Phase 6 remediation + re-audit
- Block OI production enablement flag

### Data safety
- Fully safe

---

## Cross-Phase Emergency Rollback (nuclear)

Use if multiple phases fail in production:

```
1. ALL flags OFF (virtual match + extract sync restored)
2. STOP batch remediation scripts
3. Restore ingredient_price_history from latest backup
4. TRUNCATE invoice_item_matches (optional)
5. reconcileIngredientPriceHistoryChain for all catalog ingredients
6. VL full re-read to establish baseline
```

### Data safety checklist
- [ ] History backup < 24h old
- [ ] Match record export saved
- [ ] localStorage reject export saved
- [ ] Alias snapshot saved

---

## Rollback Decision Matrix

| Phase | Flag rollback sufficient? | Backup required? | VL usable during rollback? |
|:-----:|:-------------------------:|:----------------:|:----------------------------:|
| 0 | N/A | No | Yes |
| 1 | **Yes** | No | Yes |
| 2 | N/A (truncate) | No | Yes |
| 3 | **Yes** | Recommended | Yes |
| 4 | **Yes** | No | Yes |
| 5 | Partial | **Required** | Yes (minus Remove Match) |
| 6 | No | **Required** | Yes |
| 7 | **Yes** | Recommended | Yes |
| 8 | N/A | No | Yes |

---

## Evidence Index

| Rollback fact | Source |
|---------------|--------|
| Option B canary + fallback | `.tmp/match-lifecycle-v1-design/MIGRATION_OPTIONS.md` |
| Option A trivial rollback | Same |
| DELETE RLS exists | `supabase/migrations/20260609120000_*.sql` |
| History not rebuildable without DELETE | `.tmp/match-lifecycle-foundations-audit/REBUILDABILITY_MATRIX.json` |
