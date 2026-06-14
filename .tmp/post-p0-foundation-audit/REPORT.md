# Post-P0 Foundation Audit

**Generated:** 2026-06-13  
**Mode:** READ-ONLY — no code changes, no deploy, no commit  
**Scope:** Ingredients + Invoices foundation after P0 Identity Guard

---

## Final Decision

**FOUNDATION MOSTLY CLOSED** (81% confidence)

**Recommendation:** **Continue Ingredient Identity work**

P0 guard delivered its objective (VL false positives suppressed). Foundation is not fully CLOSED because identity architecture (P1 pack variants), persist coverage (46 unmatched lines), and VL DB staleness remain. Prep/Sub-Recipes graph work may proceed in parallel on concept binding; production-grade multi-format costing waits for P1.

---

## Can foundation be CLOSED after P0?

**No.** P0 closes the *symptom* (cross-format OI poisoning) without closing the *structure* (single ingredient_id per multi-format concept, stale DB rows, incomplete match→persist path).

| Pillar | Status | Conf. |
|--------|--------|-------|
| Extraction | PARTIAL (mostly closed) | 83% |
| Invoice persistence | PARTIAL | 78% |
| Re-read safety | **CLOSED** | 90% |
| Ingredient matching | PARTIAL | 72% |
| Historical pricing | PARTIAL | 84% |
| Supplier intelligence | PARTIAL | 80% |
| Opportunities | PARTIAL | 82% |
| Operational intelligence | PARTIAL | 79% |

---

## VL Live State (read-only query 2026-06-13)

| Invoice | Items | v31 count match | Stale | History rows |
|---------|-------|-----------------|-------|--------------|
| Bidfood | 11 | ✓ | no | 1 |
| Aviludo April | 9 | ✓ | no | 10 |
| Aviludo May | 8 | ✓ | yes | 8 |
| Bocconcino | 7 | ✓ | yes | 1 |
| Emporio live `ab52796d` | 8 | n/a | yes | 0 |
| Mammafiore | 8 | ✓ | yes | 0 |

- **51** invoice_items total; **46** unmatched to catalog (historical-pricing harness)
- **20** price_history rows (**14** ghost/stale in harness)
- Deleted VL Emporio `17aa3591`: 0 items (manual deletion — not extraction wipe)
- Bidfood + Aviludo April re-read post Jun-12; 4 invoices still Jun-11 era

---

## Historical Pricing Verification — **PARTIAL** (84%)

| Check | Pre-P0 | Post-P0 |
|-------|--------|---------|
| Invalid cross-format comparisons in OI | yes | **no** (guard filters) |
| Mozzarella +1341% movement | surfaced | **suppressed** |
| Pepino −99% movement | surfaced | **suppressed** |
| Raw DB poisoned deltas | yes | **yes** (still stored) |
| Math pipeline (€/base-unit) | trusted | trusted |

Harness reruns: `historical-pricing-integrity-audit` + `p0-identity-guard-validation` (2026-06-13T20:50Z).

**Verdict:** Math CLOSED; stored history PARTIAL until VL re-read + optional reconcile.

---

## Operational Intelligence Verification — **PARTIAL** (79%)

| Check | Pre-P0 | Post-P0 |
|-------|--------|---------|
| False price_increase/decrease alerts | 2 (Mozz, Pepino) | **0** |
| Owner-review false opportunities | Mozzarella −93% | **0** |
| False betterSupplierLine (+1341%) | yes | **null** |
| Poisoned watchlist spike notes | +1341% AVILUDO | **none** |
| Ginger Beer €/L in OI | latent | **blocked** at persist |
| Home `/` dashboard | mock | mock (unchanged) |

Guard wiring verified in: `ingredient-price-chain-guard.ts`, `ingredient-price-history.ts`, `margin-alert-data.ts`, `operational-intelligence-view.ts`, `operational-intelligence-synthesis.ts`.

---

## Critical Questions

### 1. Known foundation issues remaining?
**Yes** (88%): P1 pack variants, 46 unmatched lines, 4 stale invoices, 14 ghost history rows, mock dashboard.

### 2. Structural vs operational?
**Both** (85%): Extraction + re-read safety + P0 guard code = structural progress CLOSED. Identity schema + DB sync + persist coverage = operational PARTIAL.

### 3. Force recipe rewrites?
**No** (87%) — 12% major-rewrite risk if recipes bind to `ingredient_id` concept + resolver adapter (recipe-identity-compatibility-audit).

### 4. Pack Variant required before Prep/Sub-Recipes?
**Yes for costing accuracy; no for graph structure** (84%). Prep XOR, output_quantity, cascade ready. Multi-format €/line needs P1 `default_pack_variant`.

### 5. Recipe costing safely begin now?
**Partially** (82%): Safe for single-format catalogs and recipe margins. Not safe for cost alerts on multi-format concepts until P1.

### 6. Validation Lab formally closed?
**Extraction phase MOSTLY CLOSED** (83%) — pause active VL extraction work; monitor Gorgonzola + Farina. Headline v30 Class A inflated by GT/GPT variance; true residual ~€1–2.

---

## Remaining Risks (top 5)

1. **P1 pack_variant** — structural; blocks full foundation CLOSED
2. **46 unmatched VL lines** — no price_history sync
3. **4 stale VL invoices** — field drift vs v31
4. **14 ghost history rows** — filtered by P0 guard, not cleaned in DB
5. **Generic history names** — heuristics until P1 line snapshot

---

## Recommendation Justification

**Continue Ingredient Identity work** because:

- P0 guard is shipped and validated — next highest leverage is **P1 pack variants** + **VL re-read**
- OI false positives are suppressed but raw DB and matching gaps prevent CLOSED verdict
- Prep/Sub-Recipes can start structurally (recipe-identity-compatibility: 86% yes with caveats) but **must not** enable production cost alerts on multi-format SKUs until P1
- Starting Prep without P1 risks repeating Mozzarella-class costing drift on catalog `current_price`

**Not recommended now:** Treating foundation as CLOSED or skipping to Prep without P1 on the identity track.

---

## Artifacts

| File | Contents |
|------|----------|
| `executive-summary.json` | Final decision + critical Q&A |
| `foundation-status.json` | Per-pillar CLOSED/PARTIAL/OPEN |
| `historical-pricing-audit.json` | Pricing verification evidence |
| `operational-intelligence-audit.json` | OI verification evidence |
| `remaining-risks.json` | Structural vs operational risks |
| `vl-state-snapshot.json` | Live Supabase VL state |
| `query-vl-state.mts` | Reproducible read-only query |

---

## Sources Consulted

- `.tmp/p0-identity-guard-validation/`
- `.tmp/historical-pricing-integrity-audit/` (rerun 2026-06-13)
- `.tmp/operational-intelligence-integrity-audit/` (rerun 2026-06-13)
- `.tmp/vl-final-state-audit/`
- `.tmp/validation-lab-closure-audit/`
- `.tmp/ingredient-identity-future-design/`
- `.tmp/ingredient-identity-architecture-audit/`
- `.tmp/emporio-db-integrity/`
- `.tmp/final-validation-lab-rerun-v30/`
- `.tmp/farina-stability-final/`
- `.tmp/recipe-identity-compatibility-audit/`
