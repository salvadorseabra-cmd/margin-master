# Decision Matrix — Lifecycle First vs Pack Variants First vs Hybrid

**Mode:** READ-ONLY architecture analysis · **Generated:** 2026-06-14

---

## Options Under Comparison

| Option | Description |
|--------|-------------|
| **A — Lifecycle First** | Ship persisted match record + gated cost projection + subtractive correction/unmatch before P1 pack variants |
| **B — Pack Variants First** | Ship P1 schema (pack_variants, variant-scoped history, resolver) before lifecycle gate |
| **C — Hybrid** | Parallel design; lifecycle gate must lead production; nullable `pack_variant_id` on match record from day one |

---

## Option A: Lifecycle First ⭐

### Pros

- Stops Pepino-class pre-review contamination immediately
- Enables Remove Match + full reversibility (correction subtractive cleanup)
- Reuses existing `reconcileIngredientPriceHistoryChain`, `backfillIngredientPriceHistoryFromInvoices`
- Provides `invoice_item_id` anchor P1 history requires
- Aligns with Marginly "human review when needed" — suggested does not sync cost
- Medium migration scope vs full Option E
- Simplifies subsequent P1 variant binding

### Cons

- Requires seeding match records for existing invoices (~11 VL lines with extract-synced cost)
- Remediation of existing poison rows (Pepino `a689bd91`, Mozzarella chain)
- Matcher improvements still needed to reduce wrong suggestions
- Does not alone fix multi-format catalog collapse (Mozzarella piece/block)

### Confidence

**91%** that this closes the foundational reversibility gap (pepino + foundations + correction-reversal audits).

---

## Option B: Pack Variants First

### Pros

- Fixes Mozzarella/Pepino **catalog** collapse at identity layer
- Variant-scoped history chains prevent cross-format delta poisoning
- Recipe costing clarity at scale via `default_pack_variant_id`
- Long-term north star (Option E) progress

### Cons

- Does **not** gate pre-review extract sync (`pack_variants_without_workflow_fix.safe: false`)
- Larger schema migration (new tables, backfill, resolver)
- Lifecycle reversibility still broken — correction orphans history, unmatch undefined
- Dual problem persists: wrong link + wrong format
- Higher ERP-complexity risk before workflow is stable
- OI production enablement still blocked by eager writes

### Confidence that this alone closes foundation

**~35%** (pepino recommendation + identity-expansion simulation).

---

## Option C: Hybrid

### Pros

- Match record designed with nullable `pack_variant_id` — no second lifecycle rewrite at P1
- Single coordinated design doc across teams
- Potential to reduce total calendar time if lifecycle gate ships before variant auto-sync

### Cons

- Two workstreams = coordination overhead and scope creep risk
- Largest combined migration if cutover is simultaneous
- Violates "smallest change" principle if both ship together
- Failure mode: P1 auto-sync enabled before lifecycle gate → poison at variant level

### Viability Condition

Hybrid is viable **only if** lifecycle gate ships in production **before** any P1 cost sync to `pack_variant_id`. Parallel prep (types, design docs) acceptable; simultaneous production cutover is not.

---

## Multi-Criteria Matrix

| Criterion | A Lifecycle First | B Variants First | C Hybrid |
|-----------|:-----------------:|:----------------:|:--------:|
| Stops pre-review poison | ✅ | ❌ | ✅ if lifecycle leads |
| Reversible correction/unmatch | ✅ | ❌ | ✅ if lifecycle leads |
| Fixes multi-format catalog collapse | Partial | ✅ | ✅ |
| Migration size | Medium | Large | Largest |
| Marginly simplicity | ✅ | ❌ ERP risk | ⚠️ |
| Reuses existing reconcile/backfill | ✅ | Partial | ✅ |
| Provides invoice_item_id anchor | ✅ | Partial | ✅ |
| VL foundation on path to CLOSED | ✅ | ❌ | ✅ (delayed) |
| OI trustworthy inputs | ✅ (after remed.) | ❌ until lifecycle | ✅ if sequenced |
| Audit trail for corrections | ✅ (Option 2) | ❌ | ✅ if lifecycle leads |

---

## Migration Risk Comparison

| Risk | A | B | C |
|------|---|---|---|
| Existing poison rows | Remediate after match seed | Remediate + variant backfill | Both |
| 46/51 VL unmatched lines | Seed as `unmatched` | N/A to variants | Same as A |
| 11/51 extract-synced lines | Retro classify suggested/confirmed | Still unclassified lifecycle | Same as A |
| Dual attribution after correction | Orphan cleanup + reconcile | Same + variant scope | Same |
| Client localStorage reject loss | Promote to server | Unchanged | Promote to server |
| Recipe cost drift | Recompute from clean history | Variant resolver + drift | Combined |
| Scope creep | Low | Medium | High |

---

## Operational Intelligence Impact

| Option | New invoice behavior | Existing contaminated data | OI production readiness |
|--------|---------------------|---------------------------|--------------------------|
| A | Clean confirmed-only inputs | Requires remediation pass | On path after remed. |
| B | Still pre-review sync risk | Variant split may add rows | Still blocked |
| C | Clean if lifecycle leads | Remediation + variant backfill | On path if sequenced |

P0 chain guard remains useful under all options as read-path safety net (`.tmp/identity-contamination-audit/REPORT.md`).

---

## Winner

**Option A — Lifecycle First**, with P1 pack variants immediately after lifecycle gate + matcher guards.

Option C is acceptable **only** as coordinated design with A leading production. Option B alone does not close the reversibility gap established across all prior investigations.
