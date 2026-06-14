# Match Lifecycle V1 — Validation Plan

**Mode:** READ-ONLY implementation planning · **Generated:** 2026-06-14  
**Answers:** Question 10 — Validation Lab tests after each phase

---

## VL Harness Inventory

| Harness | Path | Purpose |
|---------|------|---------|
| VL cleanup investigation | `scripts/vl-cleanup-investigation.mts` | Line-level match + history audit |
| Wave 2a validation | `scripts/validate-wave2a.mts` | Match bucket + history alignment |
| Wave 2b origin audit | `scripts/audit-wave2b-origin.mts` | History row provenance |
| Wave 2b prioritization | `scripts/vl-wave2b-prioritization.mts` | Remediation targeting |
| Remove match investigation | `.tmp/remove-match-investigation/run-investigation.mts` | displayState counts |
| Pepino timeline | `.tmp/pepino-contamination-timeline/run-timeline.mts` | Pre-review write trace |
| Identity contamination | `.tmp/identity-contamination-audit/run-audit.mts` | 9-ingredient chain audit |
| VL final state | `.tmp/vl-final-state-audit/run-audit.mts` | End-state snapshot |
| Final VL rerun v30 | `.tmp/final-validation-lab-rerun-v30/run-audit.mts` | Extraction + financial |
| Validation lab closure | `.tmp/validation-lab-closure-audit/REPORT.md` | Extraction phase status |

**VL invoices (6):** Bidfood, Aviludo April/May, Emporio, Bocconcino, Mammafiore (`.tmp/validation-lab-closure-audit/executive-summary.json`).

**Unit tests:** `ingredient-operational-intelligence.test.ts`, `ingredient-price-history-persistence.test.ts`, `ingredient-price-history-reconcile.test.ts`, `ingredient-correction-memory.test.ts`, `invoice-ingredient-row-display.test.ts`, `catalog-review-current-matches.test.ts`.

---

## Phase 0 — Schema Foundation

### VL tests
- `scripts/vl-cleanup-investigation.mts` — baseline run; save snapshot
- App smoke: upload + extract on Emporio (unchanged behavior)

### Expected outcomes
| Metric | Before | After |
|--------|--------|-------|
| Extract financial accuracy | 96.8% headline | **Same** |
| displayState counts | 40/4/7 | **Same** |
| price_history rows | 20 | **Same** |

### Success criteria
- [ ] Zero app references to `invoice_item_matches`
- [ ] VL closure criteria still met (`.tmp/validation-lab-closure-audit/closure-metrics.json`)

---

## Phase 1 — Extract Cost Gate

### VL tests
- Re-extract **Bidfood** invoice (`da472b7f`)
- `run-timeline.mts` equivalent — verify no new history without confirm
- `validate-wave2a.mts` — history row count should not increase on re-extract
- Unit: `ingredient-operational-intelligence.test.ts` — suggested lines skip sync

### Expected outcomes
| Scenario | Before gate | After gate |
|----------|-------------|------------|
| Bidfood Pepino re-extract | History refresh/update | **No history write** |
| Aviludo April alias-confirmed | Sync continues | **Sync continues** (alias policy) |
| Emporio unmatched Ginger Beer | No sync | **No sync** |
| New invoice bare `exact` match | Auto history | **No history** until Confirm |

### Success criteria
- [ ] `a689bd91` row count ≤ 1 (no duplicate on re-extract)
- [ ] 7 confirmed-alias lines still have history after re-extract
- [ ] Extraction metrics unchanged (OCR not in scope)
- [ ] `syncOperationalIngredientCostsFromInvoiceLines` test: suggested → `updatedIngredientIds = []`

---

## Phase 2 — Shadow Seed

### VL tests
- Admin seed script dry-run + apply
- `remove-match-investigation.mts` — compare seeded status vs virtual
- Custom diff report: flag mismatches

### Expected outcomes
| Check | Expected |
|-------|----------|
| Total match records | 51 |
| Pepino line status | `suggested` |
| unmatched count | 40 |
| suggested count | 4 + Pepino-class reclassifications |
| confirmed count | 7 |

### Success criteria
- [ ] 100% `invoice_item` coverage
- [ ] Pepino `8e9e727a` NOT `confirmed`
- [ ] Zero app read from table (shadow only)
- [ ] Diff report reviewed and signed off

---

## Phase 3 — MLS Write Path

### VL tests
- New test invoice upload (dev only) — full lifecycle
- Unit tests per transition T1–T3
- `ingredient-price-history-persistence.test.ts` — first write on confirm only

### Expected outcomes
| Action | Match record | History |
|--------|--------------|---------|
| Extract new line (exact, no alias) | `suggested` | 0 rows |
| User Confirm | `confirmed` | +1 row |
| Re-extract confirmed | `confirmed` preserved | refresh only |

### Success criteria
- [ ] MLS unit coverage ≥ 8 transitions
- [ ] Dual-write: shadow record matches MLS output
- [ ] No direct `syncOperationalIngredientCostsFromInvoiceLines` at extract

---

## Phase 4 — Read-Path Cutover

### VL tests
- Manual review UI on Bidfood — Pepino shows **Suggested**
- `catalog-review-current-matches.test.ts`
- `vl-cleanup-investigation.mts` — purchase scan attribution
- Bidfood + Aviludo April full review session

### Expected outcomes
| UI element | Before | After |
|------------|--------|-------|
| Pepino chip | "Matched to: Pepino conserva" (confirmed) | **Suggested** + Confirm button |
| Jar lines (Aviludo) | Confirmed | **Confirmed** (unchanged) |
| Catalog review counts | Virtual | Match-record sourced |

### Success criteria
- [ ] `MATCH_LIFECYCLE_READ_FROM_RECORD=on` passes all UI tests
- [ ] Flag off restores legacy behavior (rollback test)
- [ ] `buildMatchedInvoiceProductsFromScan` excludes suggested from confirmed bucket

---

## Phase 5 — Subtractive Correct + Remove Match

### VL tests
- **Primary:** Bidfood Pepino Remove Match flow
- **Secondary:** Mozzarella correct Bocconcino → Aviludo block
- `match-correction-reversal-audit` scenario replay
- `ingredient-price-history-reconcile.test.ts` — invoked on correction
- Unit: `rejectIngredientMatchSuggestion` wired

### Expected outcomes
| Action | Pepino conserva history | Events |
|--------|-------------------------|--------|
| Remove Match on Pepino line | `a689bd91` **deleted** | cost-changed(635a1189) |
| Correct A→B | DELETE A row; APPEND B | cost-changed(A) + cost-changed(B) |
| Re-suggest after reject | Blocked | — |

### Success criteria
- [ ] `a689bd91` absent after Remove Match
- [ ] `reconcileIngredientPriceHistoryChain` called on correction (mock/spy)
- [ ] No dual `(invoice_id, *)` history for same line
- [ ] `verdict.json` scenario A would pass code 1 (full reversal)

---

## Phase 6 — Data Remediation

### VL tests
- `identity-contamination-audit/run-audit.mts` — full re-run
- `validate-wave2a.mts`
- `audit-wave2b-origin.mts` — ghost row count
- Ingredient detail panel manual check (Mozzarella, Pepino)

### Expected outcomes
| Metric | Before | After |
|--------|--------|-------|
| HIGH contamination | 2 | **0** |
| Pepino history rows | 3 | **2** (jars) |
| Ghost/stale history | 14/20 | **≤4** |
| P0 guard blocks on Pepino/Mozzarella | Yes | **No** |

### Success criteria
- [ ] `purchaseContractsChainCompatible` true for all 9 VL ingredients' purchase pairs
- [ ] `current_price` matches latest reconciled history per ingredient
- [ ] Backup verified before DELETE batch

---

## Phase 7 — Backfill Gate + Server Reject

### VL tests
- Run `backfillIngredientPriceHistoryFromInvoices` (admin) on VL
- Cross-browser reject pair (Pepino→conserva)
- `vl-wave2b-prioritization.mts`

### Expected outcomes
| Action | Result |
|--------|--------|
| Backfill on VL | 0 new rows for suggested lines |
| Re-extract Bidfood after unmatch | Matcher skips conserva |
| localStorage → server migration | Pairs preserved |

### Success criteria
- [ ] `historyRowsCreated = 0` for unconfirmed lines in backfill report
- [ ] Server reject blocks matcher even with cleared localStorage
- [ ] No re-insertion of `a689bd91`

---

## Phase 8 — VL Sign-off (Stable Historical Pricing)

### VL tests (full suite)
1. `.tmp/final-validation-lab-rerun-v30/run-audit.mts`
2. `.tmp/identity-contamination-audit/run-audit.mts`
3. `.tmp/vl-final-state-audit/run-audit.mts`
4. `scripts/vl-cleanup-investigation.mts`
5. Manual: 6 VL invoices review session
6. Recipe cost spot-check (`recipes.tsx`)

### Expected outcomes
| Criterion | Target | Source |
|-----------|--------|--------|
| Extraction phase | CLOSED / MOSTLY CLOSED | validation-lab-closure-audit |
| Identity contamination | 0 HIGH | identity-contamination-audit |
| Pre-review poison | Impossible | New extract on test invoice |
| Pepino reversible | Remove Match clean | pepino timeline |
| History without confirmed match | 0 rows | MLS invariant |
| Financial accuracy | ≥96% (unchanged) | VL closure |

### Success criteria (OI / Pack Variants gate)
- [ ] All Phase 8 checks green
- [ ] `ingredient-price-chain-guard` rarely fires (safety net only)
- [ ] Pack Variants P1 schema design unlocked (nullable column populated later)
- [ ] Sign-off document in `.tmp/match-lifecycle-v1-implementation-plan/`

---

## Continuous Monitoring (all phases)

| Signal | Threshold | Action |
|--------|-----------|--------|
| suggested + history row exists | 0 | Alert — gate violation |
| confirmed + no history (priced line) | 0 after 24h | Missing confirm side-effect |
| `reconcileIngredientPriceHistoryChain` errors | 0 | Block promotion |
| VL extraction Class A euro | < €2 avg | Unchanged from closure audit |

---

## Evidence Index

| VL fact | Source |
|---------|--------|
| 51 lines, 20 history | `.tmp/remove-match-investigation/query-summary.json` |
| Extraction CLOSED | `.tmp/validation-lab-closure-audit/executive-summary.json` |
| 2 contaminated | `.tmp/identity-contamination-audit/REPORT.md` |
| Bidfood CLOSED | `.tmp/validation-lab-closure-audit/executive-summary.json` perInvoiceStatus |
