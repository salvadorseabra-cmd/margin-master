# Identity Expansion Simulation

**Mode:** READ-ONLY · **Generated:** 2026-06-13

---

## Executive Answer

**Would improving matching make the system better OR expose more identity problems?**

**EXPOSE_MORE_IDENTITY_PROBLEMS** — Better matching improves coverage but surfaces latent cross-format collapse — net trust decreases without P1 pack variants. (89% confidence)

**Critical: Is current architecture trustworthy if matching becomes excellent?**

**NO** (87% confidence)

---

## Facts

| Metric | Value |
|--------|-------|
| Total VL invoice lines | 51 |
| Persisted matched (history/alias) | 18 |
| Unpersisted / expansion surface | 33 |
| Post-P0 audit claim (46 unmatched) | verified **33** unpersisted |
| Canonical matcher (today) | 11/51 |
| Expanded matcher (tomorrow) | +1 on unpersisted surface |
| Total new matches if improved | 1/33 unpersisted |
| **New latent contamination if matched** | **1** |
| **New Mozzarella/Pepino-style** | **1** |
| Safe new auto-matches | 0 |
| Unsafe new auto-matches | 1 |
| % unpersisted unsafe to auto-match | **3%** |
| % predicted matches unsafe | **100%** |

## Observations

- Current contamination (2 ingredients) is **hidden** by low persist rate — not absence of risk.
- Expanded-tier fuzzy matcher predicts **1** additional attachments canonical pipeline rejects today.
- P0 guard would block OI on new breaks, but **catalog collapse** and purchase-panel fallback would worsen.
- Proven Mozzarella/Pepino cases remain; simulation adds **1** net-new guard-break scenarios.

## Calculations

- Unpersisted surface: 51 − 18 = **33** lines
- Unsafe rate among matchable unpersisted: 1 / 1 ≈ **100%**

## Hypotheses

- At scale, contamination rate among **newly matched** lines will exceed current 2/9 catalog rate.
- Pack Variant (P1) is **required** before auto-persist expansion — not optional polish.

---

## Explicit Answers

1. **New Mozzarella/Pepino situations if matching improves?** → **1** (MOZZA Fior di Latte Expet Julienne 3kg Simonetta)
2. **Current contamination isolated?** → **NO** (structural; latent in 33 unpersisted lines)
3. **Pack Variant architecture justified?** → **YES** (91% confidence)
4. **% unmatched lines unsafe to auto-match** → **3%** of unpersisted; **100%** of matcher predictions
5. **Largest future risks** → Mozzarella fior di latte, Pepino conserva
6. **Most dangerous concepts** → Mozzarella fior di latte, Pepino conserva, Nata culinária

---

## Top Ingredient Concept Risks (ranked)

- **#1 Mozzarella fior di latte** (HIGH) — 1 latent contamination lines, 2 existing
- **#2 Pepino conserva** (HIGH) — 0 latent contamination lines, 3 existing
- **#3 Nata culinária** (LOW) — 0 latent contamination lines, 3 existing
- **#4 Gema líquida** (LOW) — 0 latent contamination lines, 2 existing
- **#5 Atum em óleo** (LOW) — 0 latent contamination lines, 2 existing
- **#6 Arroz agulha** (LOW) — 0 latent contamination lines, 2 existing
- **#7 Açúcar branco** (LOW) — 0 latent contamination lines, 2 existing
- **#8 Chocolate culinária** (LOW) — 0 latent contamination lines, 1 existing
- **#9 Anchoas** (LOW) — 0 latent contamination lines, 1 existing

---

## Latent Contamination Detail

- **MOZZA Fior di Latte Expet Julienne 3kg Simonetta** (Mammafiore) → Mozzarella fior di latte [77%] — signals A

---

## Artifacts

| File | Contents |
|------|----------|
| `executive-summary.json` | Answers + critical question |
| `latent-contamination.json` | Predicted guard-break lines |
| `matching-expansion-risk.json` | Safe vs unsafe expansion |
| `ingredient-risk-ranking.json` | Top 20 concepts |
| `all-line-simulations.json` | Per-line predictions |
| `run-simulation.mts` | Harness (run via `npx vite-node`) |
