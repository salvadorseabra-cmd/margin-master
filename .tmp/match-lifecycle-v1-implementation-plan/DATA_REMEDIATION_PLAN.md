# Match Lifecycle V1 — Data Remediation Plan

**Mode:** READ-ONLY implementation planning · **Generated:** 2026-06-14  
**Answers:** Questions 7 (historical migrations), 8 (pre-rollout), 9 (post-rollout)

---

## Summary

Option B requires aligning materialized pricing (`ingredient_price_history`, `ingredients.current_price`) with new authority: **only confirmed match records authorize rows**. Known poison: Pepino `a689bd91`, Mozzarella cross-format chain, 11 VL extract-synced lines, 14/20 ghost history rows.

---

## Question 7 — Historical Data Migrations Required

| Migration | Type | When | Reversible? |
|-----------|------|------|:-----------:|
| Seed `invoice_item_matches` (51 VL + production) | INSERT | Phase 2 | DELETE rows |
| Reclassify 11 extract-synced → `suggested` | UPDATE match records | Phase 2 | UPDATE back |
| DELETE Pepino `a689bd91` | DELETE history | Phase 6 | **No** — requires backup |
| DELETE Mozzarella wrong-attribution rows | DELETE history | Phase 6 | **No** |
| DELETE suggested-line ghost history (≤11 rows) | DELETE history | Phase 2 or 6 | **No** |
| `reconcileIngredientPriceHistoryChain` per affected ingredient | UPDATE history chain | Phase 6 | Re-run reconcile |
| Promote localStorage rejects → server | INSERT | Phase 7 | Keep both during migration |
| Optional: `invoice_item_id` backfill on history | UPDATE | V1.1 | Low priority |

**Not required:** `invoice_items` migration (unchanged). **Not required:** Event log reconstruction (Option C deferred).

### VL seed taxonomy (from audits)

| Bucket | Count | Source |
|--------|------:|--------|
| unmatched | 40 | `.tmp/remove-match-investigation/query-summary.json` |
| suggested | 4 | same |
| confirmed (alias-backed) | 7 | same |
| extract-synced (remediate) | 11 | same |
| price_history rows on VL invoices | 20 | same |

---

## Question 8 — Remediation BEFORE Rollout

### Must complete before Phase 4 (read cutover)

| Item | Action | Why |
|------|--------|-----|
| Shadow seed script dry-run | Validate 51 classifications | Wrong Pepino `confirmed` breaks UI |
| Backup `ingredient_price_history` | Snapshot affected rows | Subtractive DELETE irreversible |
| Document baseline counts | 20 history rows, 32 aliases | Regression detection |

### Must complete before Phase 5 (subtractive UI) — optional fast path

| Item | Action | Why |
|------|--------|-----|
| Phase 1 extract gate enabled | Stop new poison | Remediation race prevention |

### NOT required before Phase 1 (extract gate)

- Pepino DELETE — gate prevents new writes; existing `a689bd91` remains until Phase 6
- Mozzarella cleanup — P0 guard blocks OI reads
- Full alias audit — can proceed in parallel

### Before OI production (Phase 8 gate)

| Item | Action | Blocking? |
|------|--------|:---------:|
| DELETE `a689bd91` | Pepino orphan | **YES** |
| Mozzarella chain repair | DELETE Bocconcino row or reassign match | **YES** |
| Ghost history cleanup | 14/20 stale rows | **YES** |
| All match records seeded | 100% line coverage | **YES** |
| `confirmed`-only backfill gate | Prevent re-poison | **YES** |

---

## Question 9 — Remediation AFTER Rollout

| Item | Trigger | Action |
|------|---------|--------|
| VL re-read audit | Phase 8 | `.tmp/final-validation-lab-rerun-v30/run-audit.mts` |
| Identity contamination re-run | Phase 8 | `.tmp/identity-contamination-audit/run-audit.mts` — target 0 HIGH |
| Orphan history detector | Ongoing | New lines: suggested + history row = alert |
| Alias integrity audit | Phase 6+ | `ingredient-alias-integrity-audit.ts` — wrong wording→ingredient |
| `current_price` drift check | Post-reconcile | Compare to `fetchLatestHistoryNewPrice` |
| localStorage reject migration verification | Phase 7 | Cross-device block works |
| Mammafiore unmatched mozzarella | Latent | When matched, must land `suggested` not auto-confirmed |

---

## Case 1: Pepino (`635a1189`)

### Facts

| Entity | ID |
|--------|-----|
| Ingredient | `635a1189-36ea-4ff2-9012-8172ab1ab81d` |
| Bidfood invoice | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| Line | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` |
| Poison row | `a689bd91-5b83-41d9-b060-b5a63ccfb3b4` |
| Wrong price | `0.00177` €/g (fresh €1.77/kg) |

### Remediation steps

1. Seed match record: `status=suggested`, `match_kind=exact`, `ingredient_id=635a1189`
2. DELETE `ingredient_price_history` WHERE `id = a689bd91`
3. `reconcileIngredientPriceHistoryChain(client, '635a1189')` — chain should be jar-only (April + May)
4. Verify `ingredients.current_price` reflects latest jar row
5. Insert server reject: `(pepino, 635a1189, Bidfood Portugal)`
6. **Validation:** Remove Match UI test — unmatch → unmatched, no history, reject blocks re-suggest

### Post-remediation expected state

- 2 history rows on conserva (Aviludo April + May jars only)
- `purchaseContractsChainCompatible` = true for jar pairs
- Bidfood fresh line: `unmatched` or `suggested` to new "Pepino fresco" concept (user action)

**Evidence:** `.tmp/pepino-contamination-timeline/REPORT.md`, `.tmp/identity-contamination-audit/contaminated-ingredients.json`

---

## Case 2: Mozzarella (`2a99cecd`)

### Facts

| Purchase | Invoice | Format | Op price |
|----------|---------|--------|----------|
| Aviludo April | `c2f52357` | 2Kg block | €13.69/un |
| Bocconcino | `f0aa5a08` | 125GR×8 tray | €0.812/un |

Signals: A (pack_weight_magnitude), F (extreme ratio). Guard: `pack_weight_magnitude` (`.tmp/identity-contamination-audit/contaminated-ingredients.json`).

### Remediation steps

1. Determine authoritative match per line from match records + aliases
2. Bocconcino line (`efb979b3`): likely `suggested` — DELETE extract-synced history if present without confirm
3. Aviludo April line (`cf79d75e`): `confirmed` (alias_exact) — **keep** history
4. DELETE cross-format history row attributable to wrong line (matcher used `price_history` method on Bocconcino — verify row ids in DB)
5. `reconcileIngredientPriceHistoryChain(client, '2a99cecd')`
6. Reject pair if Bocconcino was wrong auto-match

### Post-remediation expected state

- Single-format chain OR broken chain with explicit gap (acceptable until P1 variants)
- P0 guard stops firing on clean pairs
- Mammafiore 3kg (unmatched) — no action until matched

**Evidence:** `.tmp/identity-contamination-audit/REPORT.md` §Proven Cases

---

## Case 3: VL 11 Extract-Synced Lines

### Identification logic

For each VL line where:
- `displayState` ∈ {suggested, confirmed}
- NO `ingredient_aliases` entry with `confirmed_by_user` for that wording
- `ingredient_price_history` row exists for `(invoice_id, ingredient_id)`

→ Seed `status=suggested`; DELETE history row.

### Expected impact

- Reduce 20 VL history rows toward ~7–9 (confirmed-alias only)
- Aligns with "14/20 ghost/stale" observation (`.tmp/identity-contamination-audit/REPORT.md`)

### Lines to preserve (7 confirmed)

Alias-backed confirmations — keep history. Verify via `ingredient_aliases.confirmed_by_user = true`.

---

## Case 4: Alias Cleanup

| Scenario | Action |
|----------|--------|
| Alias written by erroneous correction | Review UPSERT from `persistManualIngredientCorrection` |
| Bare Pepino → conserva | No alias exists (correct) — reject log only |
| Jar aliases on conserva | **Keep** — human confirmed Jun 7–9 |
| Orphan alias after unmatch | DELETE if sole confirmer was removed line (policy T5) |

No `deleteConfirmedAlias` app helper today (`.tmp/remove-match-investigation/REPORT.md` §TASK 2).

---

## Validation Queries (conceptual — no SQL)

| Check | Expected |
|-------|----------|
| History rows without confirmed match | 0 |
| Confirmed match without history (non-zero price line) | 0 after confirm |
| Pepino conserva history count | 2 (jars only) |
| Mozzarella guard-broken pairs | 0 |
| VL extract-sync would run (old metric) | 0 with gate on |

---

## Rollback of remediation

| Action | Recovery |
|--------|----------|
| DELETE history | Restore from pre-remediation snapshot (required backup) |
| Seed match records | DELETE all `invoice_item_matches` + re-seed |
| Reconcile | Idempotent — re-run after restore |

---

## Evidence Index

| Finding | Source |
|---------|--------|
| 2/9 contaminated | `.tmp/identity-contamination-audit/executive-summary.json` |
| 14/20 ghost history | `.tmp/identity-contamination-audit/REPORT.md` |
| Pepino row a689bd91 | `.tmp/pepino-contamination-timeline/REPORT.md` |
| 11 extract-sync | `.tmp/remove-match-investigation/query-summary.json` |
| Correction leaves orphan | `.tmp/match-correction-reversal-audit/verdict.json` Q9 |
