# Phase 3 Validation Report — Bocconcino Pomodor 5-Run Stability

Generated: 2026-06-11  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Deployment Verification

| Check | Result |
|-------|--------|
| User claim: Phase 3 deployed | **Not confirmed** |
| VL `extract-invoice` version | **v21** (unchanged from Phase 1+2 deploy) |
| VL updated at | 2026-06-11 23:19:43 UTC |
| Local git HEAD | `de556e0` — *feat: implement hybrid h phase 3 monetary binder* |
| Phase 3 on VL edge | **NO** — version did not increment past 21; ezbr SHA unchanged from Phase 1+2 era |

**Conclusion:** Phase 3 exists locally at `de556e0` but **was not observed on VL** at time of validation. Five invokes likely executed **Phase 1+2 code (v21)** without `bindMonetaryColumns`.

---

## 5-Run Results (Pomodor Pelati)

**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968`  
**Image:** VL storage signed URL

| Run | qty | gross_unit_price | discount_pct | line_total_net | unit_price | total | vs VL GT |
|-----|-----|------------------|--------------|----------------|------------|-------|----------|
| 1 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 2 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 3 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 4 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 5 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |

- **Structured fields in API:** absent (legacy keys only)
- **Deterministic:** YES — 5/5 identical
- **Correct vs VL GT:** **0/5 (0%)**

---

## Comparison to Baselines

| Baseline | Pomodor values | vs current 5-run |
|----------|----------------|------------------|
| Visible invoice | qty 1, P.VENDA 27.56, DESC 20%, VALOR **22.05** | **Matches** net/qty |
| VL catalog GT | qty **2**, unit **25**, total **50** | **0/5 match** |
| Pre-hybrid refined | qty 2, **€20/€40** (DESC bleed) | Improved — no longer €20/€40 |
| Phase 1+2 v21 (5-run) | qty 1, **€22.05/€22.05** × 5 | **Identical** — no delta |

### Financial accuracy delta vs Phase 1+2

| Metric | Phase 1+2 v21 | Phase 3 invoke (v21) | Delta |
|--------|---------------|----------------------|-------|
| Stability % vs VL GT | 0% | 0% | 0 |
| Modal unit_price | €22.05 | €22.05 | €0 |
| Modal total | €22.05 | €22.05 | €0 |
| Residual € vs VL GT total | €27.95 | €27.95 | €0 |

**No improvement observed** — output unchanged because Phase 3 binder not on deployed edge.

---

## Remaining Column-Shift Rows

| Invoice | Product | Status | € vs VL GT |
|---------|---------|--------|------------|
| IL Bocconcino | POMODOR PELATI | **OPEN** | €27.95 (total) |
| Emporio Italia | Prosciutto Cotto | **NOT_RETESTED** | ~€1.4 (pre-hybrid) |

---

## Can Monetary Column Binding Be Closed?

### Verdict: **NO**

**Evidence:**

1. **Phase 3 not deployed to VL** — functions list shows v21, not v22+.
2. **0/5 correct vs VL GT** (qty 2, unit €25, total €50).
3. **5/5 deterministic wrong** — same as Phase 1+2 v21 baseline; binder had no effect.
4. **Structured fields not in API** — cannot verify gross/discount/net binding post-binder.
5. **Matches visible invoice net (€22.05)** but not VL GT — qty and unit interpretation remain open.

### If Phase 3 were deployed

Binder fixes require GPT to return `gross_unit_price`, `discount_pct`, `line_total_net` in Pass C raw output. v21 5-run shows **null structured fields in response** — legacy-only GPT rows pass through binder unchanged per unit tests.

**To close family would need:**
- Deploy Phase 3 to VL (v22+)
- GPT consistently returning structured monetary columns
- 5-run stability ≥ target vs VL GT (or documented GT reconciliation)
- Emporio Prosciutto re-validation

---

## Artifacts

| File | Description |
|------|-------------|
| `pomodor-5run-phase3-stability.json` | Full 5-run invoke data |
| `pomodor-5run-stability.json` | Phase 1+2 v21 baseline |
| `phase3-validation-report.md` | This report |

---

## Next Action

```bash
supabase functions deploy extract-invoice --project-ref bjhnlrgodcqoyzddbpbd
```

Then re-run 5-invoke stability and confirm version ≥ 22.
