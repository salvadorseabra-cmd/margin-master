# Monetary Column Binding — Final Validation Report

Generated: 2026-06-11  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Executive Summary

**Hybrid H Phase 1+2 is deployed** to VL `extract-invoice` **v21** (commit `65452a9`, 2026-06-11 23:19 UTC).

**Bocconcino Pomodor 5-run stability: 0/5 correct vs VL GT (0%).** Extraction is now **fully deterministic** but **stable-wrong**: all 5 runs return qty **1**, unit_price **€22.05**, total **€22.05** — VALOR LÍQUIDO copied into both monetary fields. Pre-hybrid DESC €20 bleed is **gone**; variance is **gone**; VL GT (qty 2, €25/€50) is **not** achieved.

**Phase 3 binder: YES — still required.**

---

## Deployment Verification

| Check | Result |
|-------|--------|
| VL `extract-invoice` version | **v21** (was v20) |
| Deployed commit | `65452a9` — *feat: hybrid h phase 1 and phase 2* |
| Phase 1 (`TABLE_TOP_MARGIN=36`) | In deployed commit |
| Phase 2 (structured schema in Pass C) | In deployed commit |
| Structured fields in API response | **NO** — `gross_unit_price`, `discount_pct`, `line_total_net` stripped by `index.ts`; only legacy `unit_price`/`total` returned |
| GPT raw exposed | **NO** |

---

## Bocconcino Pomodor — 5-Run Stability (v21)

**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968`  
**Image source:** VL storage signed URL  
**Product:** POMODORI PELATI (CX 2,5KG*6)

| Run | qty | gross_unit_price | discount_pct | line_total_net | unit_price | total | vs VL GT |
|-----|-----|------------------|--------------|----------------|------------|-------|----------|
| 1 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 2 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 3 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 4 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 5 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |

**Structured fields:** Not available in HTTP response (limitation documented in `pomodor-5run-stability.json`).

### Results

| Metric | Value |
|--------|-------|
| Correct runs | **0** (none) |
| Incorrect runs | **5** (runs 1–5) |
| Stability % vs VL GT | **0%** (0/5) |
| Run-to-run deterministic | **YES** (100% identical) |
| DESC €20 bleed (pre-hybrid) | **0/5** (eliminated) |

### Failure pattern (v21)

**VALOR_net_as_unit_and_total** — GPT copies visible VALOR LÍQUIDO **€22.05** into both `unit_price` and `total`, with qty **1** (visible invoice quantity, not VL GT qty 2). This matches the **visible invoice net row** but not **VL catalog GT** (qty 2, unit €25, total €50).

---

## Comparison to Baselines

| Source | qty | unit_price | total | Pattern |
|--------|-----|------------|-------|---------|
| Visible invoice | 1 | 27.56 gross / 22.05 net | 22.05 | Ground truth on paper |
| VL catalog GT | 2 | 25 | 50 | Validation target |
| Pre-hybrid refined | 2 | 20 | 40 | DESC 20% bleed |
| Pre-hybrid 5-run | 2 | 20, 27.56, 25.9 | 40, 54.2, … | Non-deterministic |
| **Phase 1+2 v21 (5-run)** | **1** | **22.05** | **22.05** | **Stable VALOR bleed** |

**Phase 1+2 impact:** Eliminated GPT variance and DESC-as-unit error. Introduced new **stable** column mis-binding (net line total → unit_price). Did **not** close the monetary column binding family vs VL GT.

---

## Monetary Error Estimate

| Measure | € |
|---------|---|
| Line total error vs VL GT (€50 − €22.05) | **€27.95** |
| Unit price error vs VL GT (€25 − €22.05) | €2.95 |
| Prior pre-hybrid modal error (€50 − €40) | €10 |

Residual stable financial error on Pomodor vs VL GT: **~€27.95** on total (worse than pre-hybrid €10 modal, but now deterministic).

---

## Phase 3 Binder Required?

**YES**

1. **0/5** correct vs VL GT after Phase 1+2 deploy.
2. Error is **deterministic** — prompt/schema alone did not bind columns correctly; `normalizeItems` derives from wrong GPT column reads.
3. Structured fields exist internally but are **not exposed** — Phase 3 `bindMonetaryColumns` + Rule B/E still needed to correct gross/discount/net mapping.
4. Qty regression (1 vs VL GT 2) is a separate geometry/interpretation issue; monetary binding remains open.

---

## Artifacts

| File | Contents |
|------|----------|
| `deployment-state.json` | Prior deploy verification (v20 era) |
| `pomodor-5run-stability.json` | Full 5-run results + deployment metadata |
| `pomodor-comparison.json` | Pre-deploy comparison (v20 baseline) |
| `remaining-column-shift.json` | Family residual estimate |

---

## Recommendation

1. **Do not close** Monetary Column Binding family.
2. **Implement Phase 3** binder (`invoice-monetary-binding.ts`) with Rule B/E and row retry.
3. **Optional:** Extend `index.ts` to expose structured fields in debug/validation mode for future audits.
4. Re-run 5-run stability after Phase 3 deploy.

---

## Phase 3 Validation (2026-06-11) — see `phase3-validation-report.md`

| Check | Result |
|-------|--------|
| Phase 3 deployed to VL | **NO** — still **v21**; local `de556e0` not on edge |
| 5-run vs VL GT | **0/5 (0%)** — identical to Phase 1+2 v21 |
| Modal Pomodor | qty 1, €22.05 / €22.05 |
| Structured fields in API | Absent |
| Δ vs Phase 1+2 | **€0** — no change |
| Family closed? | **NO** |
