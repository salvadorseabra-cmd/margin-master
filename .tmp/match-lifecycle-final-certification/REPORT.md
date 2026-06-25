# Match Lifecycle Final Certification

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-25T14:25:59.343Z

## Certification Decision

### 🟡 CONDITIONAL

**Subsystem closure:** Match Lifecycle V1 **write path is RC-ready** (100% item coverage, dual-write on). **Read path is not closed** — `READ_CUTOVER` off, recipe overlay unwired, dual authority (aliases + persisted + virtual). Official closure requires enabling read cutover + wiring recipe overlay + resolving Prosciutto extract-gate architecture.

## Phase 1 — Architecture Map

```
Invoice PDF → OCR extract → invoice_items
  → shadow seed (SHADOW_SEED) → invoice_item_matches [suggested|confirmed|unmatched]
  → syncOperationalIngredientCostsFromInvoiceLines (virtual matcher + EXTRACT_GATE)
  → ingredient_price_history + ingredients.current_price
User Confirm/Correct → ingredient_aliases + confirmMatch/correctMatch (DUAL_WRITE)
  → invoice_item_matches status transition
Invoice Review read → buildConfirmedAliasMapFromRows → resolveInvoiceTableRowIngredientMatch
  → virtual matcher first; READ_CUTOVER → persisted wins
Recipe costing → loadOperationalIngredientCostOverlay (virtual only — no persisted map)
Catalog Review → loadCatalogReviewInvoiceItemScan (persisted when READ_CUTOVER)
```

## Phase 2 — Read vs Write Paths

| Operation | Storage | Flag gate |
|-----------|---------|-----------|
| Shadow seed on extract | invoice_item_matches | SHADOW_SEED |
| Confirm/correct/reassign | aliases + invoice_item_matches | DUAL_WRITE |
| Unmatch | invoice_item_matches + pricing cleanup | always (markUnmatched skips dual-write gate) |
| Invoice Review display | virtual → optional persisted | READ_CUTOVER |
| Validation findings | matchDisplayState from UI resolver | inherits READ_CUTOVER |
| Recipe cost overlay | virtual matcher scan | **no READ_CUTOVER wiring** |
| Extract cost sync | virtual matcher | EXTRACT_GATE |

## Phase 3 — Environment Flags

| Flag | Audit process | VL (prior audits) | Required? |
|------|---------------|-------------------|-----------|
| READ_CUTOVER | false | off | Yes until all reads wired |
| DUAL_WRITE | true | on | Yes for persisted writes |
| SHADOW_SEED | true | on | Removable after backfill |
| EXTRACT_GATE | true | on | Yes — blocks suggested→catalog sync |
| ALIAS_AUTO_CONFIRM | true | default on | Config only |
| DUAL_READ_LOG | off | off | Dev diagnostics only |
| SUBTRACTIVE_PRICING | default on | default on | Keep for unmatch/reassign |

## Phase 4 — Source of Truth

| Layer | Authority | Evidence |
|-------|-----------|----------|
| Match assignment (target) | invoice_item_matches | Dual-write on confirm; shadow seed on extract |
| Match assignment (current read) | Virtual matcher + aliases | READ_CUTOVER off in VL |
| Confirmation memory | ingredient_aliases | Manual confirm still writes alias |
| Economics / recipe | Invoice line overlay | resolveOperationalIngredientCost — not match table |
| Price history | ingredient_price_history | Gated imperfectly on extract (Prosciutto orphan) |

**Hybrid, not single:** persisted table is authoritative for writes; reads and recipe overlay still virtual-first.

## Phase 5 — VL Key Case Replay

| Case | Persisted | Virtual | Cutover | Val(virtual) | Score |
|------|-----------|---------|---------|--------------|-------|
| gorgonzola | confirmed | confirmed | confirmed | [] | 🟢 |
| guanciale | confirmed | confirmed | confirmed | [] | 🟢 |
| aceto | confirmed | confirmed | confirmed | [] | 🟢 |
| prosciutto | suggested | confirmed | suggested | [] | 🟡 |
| peroni | confirmed | confirmed | confirmed | [] | 🟢 |
| mozzarella_fior | confirmed | confirmed | confirmed | [] | 🟢 |
| ginger_beer | confirmed | confirmed | confirmed | [] | 🟢 |
| ovo | confirmed | confirmed | confirmed | [] | 🟢 |
| tomilho | confirmed | confirmed | confirmed | [] | 🟢 |

**Prosciutto drift (only platform mismatch):** persisted `suggested` / semantic; virtual `confirmed` via confirmed alias (`assaporami prosciutto cotto sceltohc`). Cutover correctly surfaces `suggested` — intentional status drift. Virtual path would skip validation warning; cutover path emits `SUGGESTED_INGREDIENT_MATCH`. Orphan price_history from pre-confirm extract remains (foundation blocker).

**Prior 26/40 virtual≠persisted figure:** largely audit-artifact from hand-rolled alias maps + pre-backfill VL; fresh replay with `buildConfirmedAliasMapFromRows` shows 51/52 virtual alignment.

## Phase 6 — Dead Code / Legacy Audit

| Artifact | Status | Risk if removed |
|----------|--------|-----------------|
| Virtual matcher (findCanonicalIngredientMatch) | **Required** | New lines, shadow seed, recipe overlay |
| buildConfirmedAliasMapFromRows | **Required** | Virtual path breaks |
| Hand-rolled alias maps in .tmp audits | **Removable** | False certification failures |
| rejected-ingredient-matches (localStorage) | **Required** | Rematch after reject breaks |
| markUnmatched without DUAL_WRITE gate | **Intentional** | Unmatch always persists |
| loadOperationalIngredientCostOverlay sans persisted | **Gap** | READ_CUTOVER incomplete for recipes |

## Phase 7 — Production Readiness

| Area | Score | Notes |
|------|-------|-------|
| Write path (dual-write) | 🟢 | confirm/correct/reassign wired in invoices.tsx |
| Persisted table coverage | 🟢 | 100% items have match rows |
| Read cutover (Invoice Review) | 🟡 | OFF in VL; live replay 98.1% virtual↔persisted (1 drift: Prosciutto alias vs suggested row) |
| Read cutover (Recipe overlay) | 🔴 | Not wired — virtual only |
| Extract gate | 🟡 | Prosciutto history-before-confirm architectural gap |
| Unmatch/reassign pricing | 🟢 | subtractive paths implemented + tested |
| Validation alignment | 🟡 | Follows UI resolver — inherits cutover gap |
| Alias ↔ persisted coherence | 🟡 | Confirmed aliases rescue many virtual misses (Gorgonzola) |

## Return to Parent

| Field | Value |
|-------|-------|
| Certification | 🟡 CONDITIONAL |
| Single source of truth? | **No** — hybrid: persisted writes, virtual reads |
| READ_CUTOVER permanently enableable? | **Yes** — 100% cutover↔persisted alignment; recipe overlay still needs persisted map |
| Legacy matching retirable? | **No** — virtual matcher still seeds, overlays, and fills alias gaps |
| Remaining blockers | READ_CUTOVER off; recipe overlay unwired; Prosciutto extract gate; audit scripts using wrong alias map |
| Implementation order | 1) Enable READ_CUTOVER in VL 2) Wire persisted map into loadOperationalIngredientCostOverlay 3) Gate price_history on confirmed match 4) Remove shadow seed after backfill 5) Retire virtual read only after 100% coverage + alias parity |
| Confidence | **82%** |
