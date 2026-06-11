# Bocconcino Hybrid H Phase 1+2 — Validation Report

Generated: 2026-06-11  
Invoice: **IL Bocconcino** · `f0aa5a08-86a3-4938-99f0-711e86073968`  
Mode: **READ-ONLY validation**

---

## Executive Summary

**Pomodor verdict: PARTIAL / NOT RESOLVED**

Hybrid H Phase 1+2 is **not deployed** to the VL edge function (changes exist only as **local uncommitted** edits). Validation against the **currently deployed** code (`214e864` / `04c0d88` Pass C) shows Pomodor **still fails on stability runs** (2/3 invokes: unit **€20** = DESC bleed, total **€40**). A **single lucky invoke** returned VL GT (**€25 / €50**) and is what the DB currently holds — this is **GPT run variance**, not a structural fix.

**Phase 3 binder: YES — still required.**

---

## Deploy State

| Check | Result |
|-------|--------|
| `git HEAD` | `214e864` (checkpoint before Hybrid H) |
| Phase 1+2 in working tree | **Modified** `invoice-crop-geometry.ts`, `invoice-table-extraction.ts` |
| Phase 1+2 on VL edge | **NO** — invoke returns legacy schema (`unit_price`, `total` only; no `gross_unit_price`) |
| Bocconcino Phase 1 impact | **Minimal** — headers already in crop per column-selection-deep-dive |

---

## Pomodor Row Comparison

### Reference values

| Source | Qty | Unit € | Total € |
|--------|-----|--------|---------|
| **Visible invoice** (image) | **1.000** | 22.05 (VALOR) / 27.56 gross | **22.05** |
| **VL catalog GT** | 2 | **25** | **50** |
| **Pre-Hybrid refined** (`passc-refinement-validation`) | 2 | **20** | **40** |
| **5-run stability pre-audit** | 2 | 20, 27.56, 25.9 | 40, 54.2, 42.2, 20.02 |

### Current (deployed extract-invoice, 2026-06-11)

| Probe | Qty | Unit € | Total € | vs VL GT | vs Visible |
|-------|-----|--------|---------|----------|------------|
| Audit invoke #1 | 2 | **25** | **50** | ✅ Correct | ❌ Wrong qty/total |
| Stability run 1 | 2 | **20** | **40** | ❌ | ❌ |
| Stability run 2 | 2 | **25.9** | **40** | ❌ | ❌ |
| Stability run 3 | 2 | **20** | **40** | ❌ | ❌ |
| **DB (re-read 22:44)** | 2 | **25** | **50** | ✅ | ❌ |

**Better / Same / Worse vs pre-Hybrid refined (€20/€40):**
- Stability: **Same** (majority runs still €20/€40)
- Single run: **Better** (lucky €25/€50) — not reproducible 3/3

### Column-shift mechanism (unchanged)

| Wrong unit | Source column | Still observed? |
|------------|---------------|---------------|
| €20.00 | DESC 20% | **YES** (runs 1, 3) |
| €27.56 | P.VENDA / Mezzi neighbour | In pre-audit 5-run |
| €25.00 | VL GT (correct list/net interpretation) | **1/4 invokes only** |

---

## Other Bocconcino Rows (column-shift audit scope)

Only **POMODOR PELATI** is flagged as column-shift in `root-cause-consolidation`. Other rows on current deploy:

| Product | VL GT | Current extract | Verdict |
|---------|-------|-----------------|---------|
| Mozzarella (discounted) | 9.5×10≠81.23 | 9.5 / 81.23 | ✅ Correct |
| Mezzi Paccheri | 27.56 / 27.3 | 27.56 / 27.3 | ✅ Correct |
| Stracciatella | 4.141 / 74.54 | 4.141 / 74.54 | ✅ Correct |

**Remaining column-shift rows on Bocconcino: 1 (Pomodor only).**

---

## Phase 3 Binder Required?

**YES.**

| Reason | Evidence |
|--------|----------|
| Phase 1+2 not deployed | Cannot validate structured schema or net derivation |
| Bocconcino crop already unambiguous | column-selection-deep-dive — headers visible; GPT still fails |
| Stability still shows DESC-as-unit | €20 on 2/3 invokes |
| Rule B (unit ≈ discount %) untested without Phase 3 | Would catch €20; 0 FP in validation audit |
| Self-consistent 2×20=40 undetectable without binder | monetary-column-validation-audit 25% residual |

Phase 2 alone (schema + `normalizeItems` derivation) may help when GPT populates `gross_unit_price`/`discount_pct`/`line_total_net` correctly, but **Phase 3 gate is still needed** for mis-populated and self-consistent wrong triples.

---

## Artifacts

| File | Contents |
|------|----------|
| `row-comparison.json` | Per-row before/after/current |
| `pomodor-verdict.json` | Verdict + Phase 3 recommendation |
| `deployed-extract.json` | Full invoke + git deploy state |
| `run-audit.mts` | Reproducible script |

---

## Return Summary

| Field | Value |
|-------|-------|
| **Pomodor verdict** | **PARTIAL — not resolved** (stable column-shift persists; lucky single-run ✅) |
| **Remaining column-shift rows** | **POMODOR PELATI only** (~€10) |
| **Phase 3 binder required?** | **YES** |
| **Phase 1+2 deployed?** | **NO** (local uncommitted only) |
