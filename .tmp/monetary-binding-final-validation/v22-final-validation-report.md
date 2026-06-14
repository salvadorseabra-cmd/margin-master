# v22 Final Validation — Hybrid H Phase 3 (Monetary Binder)

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Deployment verified

| Check | Result |
|-------|--------|
| VL `extract-invoice` version | **v22** |
| Updated at | **2026-06-11 23:35:30 UTC** |
| Prior version | v21 @ 23:19:43 UTC |
| Bundle changed | **YES** — `ezbr_sha256` changed |
| Local commit | `de556e0` (Phase 3 binder) |

---

## 1. Five-run stability table (Pomodor Pelati)

| Run | qty | gross | discount_pct | line_total_net | unit_price | total | vs VL GT |
|-----|-----|-------|--------------|----------------|------------|-------|----------|
| 1 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 2 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 3 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 4 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 5 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |

- **Structured fields in API:** absent (legacy keys only)
- **Deterministic:** YES — 100% identical across 5 runs
- **Item keys:** `name`, `quantity`, `unit`, `unit_price`, `total`

---

## 2. Correct runs (vs VL GT)

**0** — none.

VL GT: qty **2**, unit **€25**, total **€50**

---

## 3. Incorrect runs

**5** — runs 1–5, all identical:

- qty **1** (visible invoice qty, not VL GT 2)
- unit_price **€22.05** (VALOR LÍQUIDO net)
- total **€22.05**

---

## 4. Financial delta vs VL GT

| Field | v22 modal | VL GT | Delta |
|-------|-----------|-------|-------|
| quantity | 1 | 2 | −1 |
| unit_price | €22.05 | €25.00 | −€2.95 |
| total | €22.05 | €50.00 | **−€27.95** |

**Residual monetary error vs VL GT: €27.95** (line total)

---

## 5. Financial delta vs Phase 1+2 (v21)

| Field | v21 modal | v22 modal | Delta |
|-------|-----------|-----------|-------|
| quantity | 1 | 1 | €0 |
| unit_price | €22.05 | €22.05 | €0 |
| total | €22.05 | €22.05 | €0 |

**No change** — Phase 3 binder had no observable effect on Pomodor output.

---

## Baseline comparison

| Baseline | Pomodor | vs v22 |
|----------|---------|--------|
| Visible invoice | qty 1, P.VENDA 27.56, DESC 20%, VALOR **22.05** | **Matches** net row |
| VL catalog GT | qty **2**, unit **25**, total **50** | **0/5 match** |
| Pre-hybrid refined | qty 2, **€20/€40** (DESC bleed) | Improved (no DESC bleed) |
| Phase 1+2 v21 | qty 1, **€22.05/€22.05** × 5 | **Identical** |

---

## 6. Remaining column-shift rows

| Invoice | Product | Status | € vs VL GT | Notes |
|---------|---------|--------|------------|-------|
| IL Bocconcino | POMODOR PELATI | **OPEN** | €27.95 | VALOR bleed; binder inactive without structured GPT fields |
| Emporio Italia | Prosciutto Cotto | **NOT_RETESTED** | ~€1.4 | Prior: unit €9.17, total €36.54 vs GT €8.17/€35.14 |

---

## 7. Emporio Prosciutto status

**Not re-invoked on v22** in this audit.

Prior data (`passc-refinement-validation/reextract/17aa3591-....json`):

| Field | Extracted | VL GT | Δ |
|-------|-----------|-------|---|
| quantity | 4 | 4.3 | — |
| unit_price | €9.17 | €8.17 | €1.00 |
| total | €36.54 | €35.14 | €1.40 |

Phase 1+2 reportedly improved header visibility; Phase 3 Rule B would fix €17 Desc.(%) bleed when structured fields present.

---

## 8. Monetary Column Binding verdict

### **OPEN**

| Criterion | Result |
|-----------|--------|
| v22 deployed with Phase 3 code | **YES** |
| 5-run stability vs VL GT | **0%** (0/5) |
| Improvement vs Phase 1+2 | **None** (€0 delta) |
| Improvement vs pre-hybrid | **Partial** (variance + DESC bleed eliminated) |
| Binder observable in output | **No** — structured fields not in API; GPT legacy-only |

### Evidence

1. **v22 bundle changed** — deploy succeeded; not a cache issue.
2. **Output unchanged from v21** — binder requires `gross_unit_price`, `discount_pct`, `line_total_net` from Pass C; GPT returns only `unit_price`/`total`.
3. **Deterministic VALOR bleed** — qty 1, €22.05/€22.05 matches visible invoice net, not VL GT.
4. **Unit tests show binder works** when structured fields are supplied (Rule B/E fix DESC €20 and neighbour €27.56).
5. **Emporio Prosciutto** untested on v22; ~€1.4 prior residual.

### Why Phase 3 had no effect on Pomodor

The binder runs after Pass C but **cannot correct** rows where GPT omits structured columns. v22 Pomodor GPT output (inferred): `unit_price=22.05, total=22.05` with no `gross_unit_price=27.56` or `discount_pct=20` — Rule B and Rule E do not trigger; legacy-only path passes through unchanged.

---

## Artifacts

| File | Description |
|------|-------------|
| `pomodor-5run-v22-stability.json` | Full 5-run invoke data |
| `v22-final-validation-report.md` | This report |
| `pomodor-5run-stability.json` | Phase 1+2 v21 baseline |
| `deployment-audit.json` | Why v21 lacked Phase 3 |

---

## Recommendation

**Do not close** Monetary Column Binding family.

Next steps (in priority order):

1. **Diagnose Pass C structured field population** — does GPT return gross/discount/net in raw JSON before binder strips them?
2. **Optional:** Expose structured fields in API for validation
3. **Phase 4 row retry** for legacy-only GPT rows
4. Re-test Emporio Prosciutto on v22
5. Reconcile VL GT qty=2 vs visible qty=1 for Pomodor (separate from column binding)
