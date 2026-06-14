# Target Lifecycle Architecture Options

**Mode:** READ-ONLY architecture analysis · **Generated:** 2026-06-14

Compares four approaches to a fully reversible match lifecycle. All options preserve Marginly principles: simple UX, no ERP complexity, human review when needed, reliable historical pricing, reliable operational intelligence.

---

## Option 1 — Gate Extract Sync Only (Minimal Workflow Fix)

### Description

No new persisted match table. Change extract behavior and add missing UI handlers:

- `syncOperationalIngredientCostsFromInvoiceLines` skips until user confirms
- Add **Remove Match** UI with history DELETE + `reconcileIngredientPriceHistoryChain`
- Promote high-risk auto `exact` matches to suggested in UI

### Complexity

**Low** — primarily application logic changes; no schema migration.

### Migration Risk

**Low** — no new tables; existing poison rows need manual remediation.

### Rebuildability

**Partial** — still no per-line SoT; alias/reject state scattered across Supabase + localStorage; reassignment still orphans old-target history without explicit subtractive handler.

### Operational Intelligence Impact

**High positive for new data** — stops pre-review contamination (Pepino class).

**Limited for existing data** — orphan rows and poisoned chains remain until remediated.

### Lifecycle Coverage

| State | Supported? |
|-------|------------|
| Suggested | Yes (if sync gated) |
| Confirmed | Yes |
| Corrected | Partial — forward only unless explicit cleanup added |
| Reassigned | Partial — same as correction |
| Unmatched | Yes (if Remove Match shipped) |

### Verdict

Necessary **first increment** but **insufficient** for a fully reversible lifecycle. Aligns with `remove-match-investigation` Options B+C as partial fix.

---

## Option 2 — Persisted Match Record + Gated Cost Projection ⭐

### Description

Introduce **`invoice_item_matches`** (conceptual name) as single persisted record per line:

| Field (conceptual) | Purpose |
|--------------------|---------|
| `invoice_item_id` (PK/FK) | Binds lifecycle to line |
| `ingredient_id` (nullable) | Current assignment |
| `status` | `suggested` \| `confirmed` \| `unmatched` |
| `match_kind` | Matcher output at assignment |
| `confirmed_at` / `corrected_at` | Audit timestamps |
| `previous_ingredient_id` | Reassign trail (optional) |
| `pack_variant_id` (nullable) | P1 add-on — no lifecycle rewrite |

**Behavior:**

- **Suggested:** Matcher writes record with `status=suggested`; **no cost sync**
- **Confirmed:** User confirm or policy → `status=confirmed` → **then** cost sync
- **Corrected/Reassigned:** Update record + subtractive cleanup on old `(invoice_id, old_ingredient_id)` + `reconcileIngredientPriceHistoryChain` on old and new targets
- **Unmatched:** `ingredient_id=null`, `status=unmatched` + history delete + price revert via reconcile

### Complexity

**Medium** — one new table, lifecycle service layer, wire existing reconcile/backfill.

### Migration Risk

**Medium** — seed match records from live matcher for existing invoices; remediate ~11 VL lines with extract-synced cost (`remove-match-investigation`); classify suggested vs confirmed retroactively from matcher kind.

### Rebuildability

**High** — match record + `backfillIngredientPriceHistoryFromInvoices` can rebuild history from confirmed assignments only; reconcile repairs delta chains.

### Operational Intelligence Impact

**High positive** — clean inputs; P0 chain guard becomes safety net, not primary fix; margin alerts and OI synthesis read confirmed-cost rows only.

### Lifecycle Coverage

| State | Supported? |
|-------|------------|
| Suggested | Yes |
| Confirmed | Yes |
| Corrected | Yes |
| Reassigned | Yes |
| Unmatched | Yes |

### Verdict

**Recommended.** Smallest **architectural** fix closing the gap in `match-lifecycle-foundations-audit/FINAL_VERDICT.md`. Reuses existing services; aligns with Marginly simplicity.

---

## Option 3 — Event-Sourced Match Lifecycle + Derived Cost Projections

### Description

Append-only `match_lifecycle_events` table. Every transition (suggest, confirm, correct, unmatch, reassign) is an immutable event. `ingredient_price_history` and `ingredients.current_price` are **fully recomputed** from event log via backfill/reconcile on every transition.

### Complexity

**High** — event schema design, replay engine, idempotency, snapshot optimization.

### Migration Risk

**High** — replay all historical invoices; reconstruct event log from current DB state is lossy without audit trail.

### Rebuildability

**Maximum** — by design; any projection rebuildable from event log.

### Operational Intelligence Impact

**High positive once stable** — audit-grade inputs; full correction history.

**Risk during migration** — dual-write or read-cutover window; recipe cost drift if replay ordering wrong.

### Lifecycle Coverage

All five states native with full audit trail.

### Verdict

Correct **long-term shape** but **over-engineered** for Marginly principles ("Simple UX", "No ERP complexity"). Option 2 is the pragmatic subset; Option 3 is a future evolution if audit requirements grow.

---

## Option 4 — Virtual Match + Server Reject Log (No Match Table)

### Description

Keep virtual resolution as primary model. Persist rejections and confirmed aliases server-side (Supabase). Gate cost sync on alias existence or server-side confirm flag per line.

### Complexity

**Medium** — localStorage → Supabase migration for reject pairs; server reject API.

### Migration Risk

**Medium** — cross-device reject sync; no line-level binding for bare-word auto matches.

### Rebuildability

**Low** — still no `invoice_item_id` → ingredient binding; Pepino bare "Pepino" had **no alias** and `exact` kind bypasses Confirm UI.

### Operational Intelligence Impact

**Partial** — auto `exact` still syncs without alias under this model unless additionally gated by match kind policy.

### Lifecycle Coverage

| State | Supported? |
|-------|------------|
| Suggested | Partial |
| Confirmed | Partial (alias-dependent) |
| Corrected | Partial |
| Reassigned | Partial |
| Unmatched | Partial |

### Verdict

**Insufficient.** Pepino proves alias miss + exact promotion bypasses confirm gate (`.tmp/pepino-contamination-timeline/`, `.tmp/remove-match-investigation/`).

---

## Comparison Matrix

| Option | Complexity | Migration Risk | Rebuildability | OI Impact | Full Lifecycle |
|--------|------------|----------------|----------------|-----------|----------------|
| 1 Gate only | Low | Low | Partial | ++ (new data) | No |
| **2 Match record** | **Medium** | **Medium** | **High** | **+++** | **Yes** |
| 3 Event-sourced | High | High | Maximum | +++ (when stable) | Yes |
| 4 Virtual + reject log | Medium | Medium | Low | + | No |

---

## Answers to Design Questions (Cross-Option)

### Smallest change for all five states

**Option 2** — persisted per-line match record gating cost projection and enabling subtractive transitions.

### What becomes source of truth?

**Option 2/3:** `invoice_item_matches` or event log as primary SoT for line → ingredient + status.  
**Option 1/4:** Still fragmented — not recommended for full lifecycle.

### Could `ingredient_price_history` become fully derived?

**Yes (Option 3 immediately; Option 2 eventually)** — via `backfillIngredientPriceHistoryFromInvoices` gated on confirmed match records. Caveat: backfill replays matcher; match SoT must gate what counts as confirmed (`.tmp/match-lifecycle-foundations-audit/REBUILDABILITY_MATRIX.json`).

### Could `current_price` become fully derived?

**Yes** — `fetchLatestHistoryNewPrice` + reconcile after lifecycle events. Today: last-write-wins with no revert on old target (Pepino `635a1189`).

### Services reusable (all viable options)

`resolveInvoiceTableRowIngredientMatch`, `syncOperationalIngredientCostsFromInvoiceLines` (gated), `appendIngredientPriceHistoryFromInvoiceLine`, `reconcileIngredientPriceHistoryChain`, `backfillIngredientPriceHistoryFromInvoices`, `persistManualIngredientCorrection`, `dispatchOperationalIngredientCostChanged`.

### Services redundant or demoted

Extract-time cost sync for suggested/unconfirmed; virtual match as implicit SoT; client-only reject blocklist as primary authority; unwired `rejectIngredientMatchSuggestion`; direct manual edits to history/current_price.
