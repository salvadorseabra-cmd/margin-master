# Emporio Discount Hardening — Post-Deploy Validation

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Deployment

| Check | Result |
|-------|--------|
| VL version | **v24** |
| Updated (UTC) | **2026-06-12 22:07:19** |
| Bundle | `db3fc8b8…` (changed from v23) |
| Discount hardening | **Deployed** |

---

## 3-run results (focus rows)

### Prosciutto

| Run | discount inferred | unit_price | total |
|-----|-------------------|------------|-------|
| 1 | **LIKELY_PRESENT** | 8.41 | **36.54** |
| 2 | **LIKELY_PRESENT** | 8.50 | **36.54** |
| 3 | **LIKELY_PRESENT** | 8.50 | **36.54** |

**3/3** — net unit ≈ gross×(1−17.5%), total matches visible Preço Total exactly.

### Mortadella

| Run | discount inferred | unit_price | total |
|-----|-------------------|------------|-------|
| 1 | PARTIAL | 9.43 | 29.31 |
| 2 | MISSING* | 9.99 | **31.06** |
| 3 | MISSING* | 10.00 | **31.11** |

\*Totals run 2–3 within €0.04 of VL GT (€31.07) despite qty×unit≈total pattern; improved vs v23 but discount inference inconclusive.

### Ventricina

| Run | discount inferred | unit_price | total |
|-----|-------------------|------------|-------|
| 1 | MISSING | 21.00 | 54.60 |
| 2 | MISSING | 20.20 | 52.52 |
| 3 | MISSING | 17.72 | 46.09 |

**0/3** — still gross/qty×unit path; no stable discount extraction.

---

## Before vs after

| Row | v23 baseline (worst) | v24 modal (3 runs) | Change |
|-----|----------------------|-------------------|--------|
| Prosciutto | €10.72 / **€46.10** MISSING | €8.50 / **€36.54** | **Fixed** |
| Mortadella | €11.10 / **€34.52** MISSING | €10.00 / **€31.11** | Improved |
| Ventricina | €17.50 / **€45.50** BLEED | €21.00 / **€54.60** | **Worse** |

v23 focus-row discount accuracy: **0/6** run-slots  
v24 Prosciutto discount accuracy: **3/3** inferred present

---

## Financial delta (modal / run 2–3)

### vs visible invoice

| Row | Visible total | v24 total | Δ |
|-----|---------------|-----------|---|
| Prosciutto | €36.54 | €36.54 | **€0.00** |
| Mortadella | — | €31.06–31.11 | — |
| Ventricina | — | €46–55 | — |

### vs VL GT

| Row | VL GT | v24 best | v24 worst | Best Δ | Worst Δ |
|-----|-------|----------|-----------|--------|---------|
| Prosciutto | €35.14 / €8.17 | €36.54 / €8.50 | same | +€1.40 / +€0.33 | +€1.40 |
| Mortadella | €31.07 / €10.10 | €31.06 / €9.99 | €29.31 / €9.43 | **−€0.01** | −€1.76 |
| Ventricina | €39.49 / €16.60 | — | €54.60 / €21.00 | — | **+€15.11** |

Prosciutto matches **visible invoice** exactly; €1.40 above VL GT (pre-existing catalog gap).

---

## Emporio family verdict

### **PARTIAL**

| Row | Status | Evidence |
|-----|--------|----------|
| Prosciutto | **CLOSED** (discount) | 3/3 net derivation; total €36.54 |
| Mortadella | **PARTIAL** | Totals near GT on 2/3 runs; discount inference mixed |
| Ventricina | **OPEN** | 0/3 discount; inflated totals persist |

Prompt hardening **resolved Prosciutto** (primary audit target). Mortadella improved numerically. Ventricina needs separate example or row-level retry.

---

## Inference method

API does not expose `discount_pct`. Inferred from:
- Unit ≈ net (gross × (1 − discount/100)) vs gross
- Total = visible line total vs qty × gross
- BLEED pattern: unit ≈ 17.5

---

## Artifacts

| File | Contents |
|------|----------|
| `post-hardening-3run-validation.json` | Full run data |
| `validation-report.md` | This report |
