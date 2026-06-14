# Match Lifecycle V1 — Final Implementation Recommendation

**Mode:** READ-ONLY implementation planning · **Generated:** 2026-06-14  
**Approved design:** Option B per `.tmp/match-lifecycle-v1-design/FINAL_RECOMMENDATION.md`  
**Confidence:** 91% — consistent across 7 audits

---

## Executive Recommendation

Ship **Option B** in **9 incremental phases** (0–8), prioritizing **extract cost gate (Phase 1) as first production deploy** to stop Pepino-class pre-review poison within days, while schema and MLS follow in parallel.

**Do not** wait for Pack Variants P1. **Do not** ship Option A alone as final state. **Do not** combine lifecycle with full Option E schema cutover.

---

## Sequence: Current → V1 → Stable Historical Pricing → Pack Variants Ready

```mermaid
flowchart LR
  subgraph now["NOW — Current"]
    A1[Virtual match SoT]
    A2[Extract sync suggested+confirmed]
    A3[No Remove Match]
    A4[2/9 VL contaminated]
  end

  subgraph v1["V1 — Match Lifecycle"]
    B1[invoice_item_matches]
    B2[Confirmed-only cost gate]
    B3[MLS transitions]
    B4[Subtractive correct/unmatch]
  end

  subgraph stable["Stable Historical Pricing"]
    C1[0 HIGH contamination]
    C2[0 ghost history]
    C3[Backfill gated]
    C4[VL sign-off green]
  end

  subgraph p1["Pack Variants Ready"]
    D1[pack_variant_id populated]
    D2[Variant-scoped chains]
    D3[Matcher guards]
    D4[OI production enablement]
  end

  now --> v1 --> stable --> p1
```

---

## Timeline Recommendation (engineering weeks)

| Week | Phase | Deliverable | Production risk |
|:----:|-------|-------------|:---------------:|
| 1 | 0 + 1 | Schema + **extract gate LIVE** | **Low** — highest ROI |
| 2 | 2 | Shadow seed + classification report | None (shadow) |
| 3–4 | 3 + 4 | MLS + read cutover (flagged) | Medium |
| 5 | 5 | Remove Match + subtractive correct | **High** — Bidfood canary |
| 6 | 6 | Pepino/Mozzarella/ghost remediation | Medium |
| 7 | 7 | Backfill gate + server reject | Low |
| 8 | 8 | VL sign-off → stable pricing | None |
| 9+ | — | Matcher guards → Pack Variants P1 | Separate workstream |

Aligns with design gantt: Lifecycle 3w → Remediation 1w → Matcher 2w → Pack Variants 3w (`.tmp/match-lifecycle-v1-design/FINAL_RECOMMENDATION.md`).

---

## Answers to All 12 Planning Questions

### 1. Safest implementation order
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (see `IMPLEMENTATION_PHASES.md`). **Phase 1 can ship before Phase 0** if needed for urgency.

### 2. What can ship independently
- Extract gate (Phase 1) — **ship immediately**
- Schema (Phase 0)
- Server reject table (Phase 7 schema)
- P0 guard — unchanged, always on

### 3. Prerequisites
Schema before seed; seed before read cutover; read cutover before subtractive UI; remediation before OI; lifecycle before Pack Variants P1.

### 4. Feature flags
8 flags defined in `IMPLEMENTATION_PHASES.md` §4. No existing flag infra — add `VITE_MATCH_LIFECYCLE_*` env vars.

### 5. Services reusable without modification
`reconcileIngredientPriceHistoryChain`, `appendIngredientPriceHistoryFromInvoiceLine`, `reconcileAfterInvoiceDelete`, `persistOperationalIngredientCostFromInvoiceLine`, `dispatchOperationalIngredientCostChanged`, `ingredient-price-chain-guard`, matcher core (see `SERVICE_IMPACT_ANALYSIS.md`).

### 6. Services requiring refactoring
`resolveInvoiceTableRowIngredientMatch` (MAJOR), `invoices.tsx` extract + review handlers (MAJOR), `syncOperationalIngredientCostsFromInvoiceLines` (MINOR), `backfillIngredientPriceHistoryFromInvoices` (MINOR), `catalog-review-current-matches` (MAJOR).

### 7. Historical data migrations
Seed 51 match records; reclassify 11 extract-synced; DELETE Pepino `a689bd91` + Mozzarella wrong rows; reconcile 2 contaminated ingredients; promote rejects (see `DATA_REMEDIATION_PLAN.md`).

### 8. Remediation before rollout
Backup before Phase 5+; seed validation before Phase 4; **no poison cleanup required before Phase 1 gate**.

### 9. Remediation after rollout
VL re-read; identity re-audit; ghost history cleanup; alias audit; Mammafiore latent mozzarella watch.

### 10. VL tests per phase
Full matrix in `VALIDATION_PLAN.md` — harnesses: `scripts/vl-cleanup-investigation.mts`, `validate-wave2a.mts`, `identity-contamination-audit/run-audit.mts`, Bidfood Pepino manual flows.

### 11. Highest-risk areas
| Rank | Area | Phase | Why |
|:----:|------|:-----:|-----|
| 1 | Subtractive DELETE attribution | 5 | No `invoice_item_id` on history |
| 2 | Read-path cutover UI | 4 | suggested/confirmed confusion |
| 3 | Dual-write drift | 3 | MLS + legacy parallel |
| 4 | Seed misclassification | 2 | Pepino as confirmed |
| 5 | Remediation over-delete | 6 | Irreversible without backup |

### 12. Rollback per phase
Flag-first for Phases 1, 3, 4, 7; backup-required for Phases 5, 6; see `ROLLBACK_PLAN.md`.

---

## What NOT to Do

| Anti-pattern | Evidence |
|--------------|----------|
| Pack Variants P1 before lifecycle | `pack_variants_without_workflow_fix.safe: false` |
| P0 guard as primary fix | Bandage only — does not stop extract writes |
| Big-bang migration | 51 lines incremental; VL must stay usable |
| Option C event store | Over-engineered for V1 |
| Auto-confirm bare `exact` | Pepino root cause |

---

## Success Criteria (V1 Complete)

| Criterion | Measurement | Source |
|-----------|-------------|--------|
| Pre-review poison stopped | 0 history without confirmed match | Pepino timeline |
| Pepino reversible | Remove Match deletes equivalent of `a689bd91` | correction-reversal audit |
| Correction subtractive | Old-target deleted; both ids reconciled | verdict.json |
| Per-line attribution | Match record authoritative | foundations audit |
| VL identity clean | 0/9 HIGH contamination | identity audit |
| P1 ready | `pack_variant_id` column exists, NULL | PACK_VARIANT_INTEGRATION |

---

## Post-V1 Roadmap

| Order | Workstream | Dependency |
|:-----:|------------|------------|
| 1 | **Stable Historical Pricing** (Phase 6–8) | V1 complete |
| 2 | Matcher guards (preservation class, token-subset) | Clean match records |
| 3 | Pack Variants P1 schema + `pack_variant_id` binding | Lifecycle gate in production |
| 4 | Supplier product layer (P2) | Variants |
| 5 | OI production enablement | Stable pricing sign-off |

---

## Smallest-Risk Path Summary

```
Day 1–3:   Phase 1 extract gate (stop new poison) ← SHIP FIRST
Week 1:    Phase 0 schema (parallel)
Week 2:    Phase 2 shadow seed (validate, no user impact)
Week 3–4:  Phase 3–4 MLS + flagged read cutover
Week 5:    Phase 5 Bidfood-only canary (Remove Match)
Week 6:    Phase 6 remediation (Pepino + Mozzarella)
Week 7–8:  Phase 7–8 backfill gate + VL sign-off
Then:      Matcher guards → Pack Variants P1
```

**Marginly principles preserved:**
- Simple UX: Confirm / Correct / Remove Match = 3 actions
- No ERP complexity: one match table, not event store
- Human review when needed: suggested blocks cost
- VL usable throughout: extraction CLOSED, identity workstream separate

---

## Deliverable Index

| File | Contents |
|------|----------|
| `IMPLEMENTATION_PHASES.md` | Phases 0–8, Q1–4, risks |
| `DATABASE_PLAN.md` | Schema design, seed taxonomy |
| `SERVICE_IMPACT_ANALYSIS.md` | Q5–6, reuse/major/replace |
| `DATA_REMEDIATION_PLAN.md` | Q7–9, Pepino/Mozzarella |
| `VALIDATION_PLAN.md` | Q10, VL harness per phase |
| `ROLLBACK_PLAN.md` | Q12, failure modes per phase |
| `FINAL_IMPLEMENTATION_RECOMMENDATION.md` | This document |

---

## Evidence Cross-References

| Audit | Path |
|-------|------|
| V1 design (7 files) | `.tmp/match-lifecycle-v1-design/` |
| Design investigation | `.tmp/match-lifecycle-design-investigation/` |
| Foundations audit | `.tmp/match-lifecycle-foundations-audit/` |
| Pepino timeline | `.tmp/pepino-contamination-timeline/` |
| Correction reversal | `.tmp/match-correction-reversal-audit/` |
| Remove match | `.tmp/remove-match-investigation/` |
| Identity contamination | `.tmp/identity-contamination-audit/` |
| VL closure | `.tmp/validation-lab-closure-audit/` |
| Extract sync gate | `src/lib/ingredient-operational-intelligence.ts:933` |
| Post-extract sync | `src/routes/invoices.tsx:1358` |
| Reconcile service | `src/lib/ingredient-price-history-reconcile.ts:124` |
