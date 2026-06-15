# Phase 3 Scope Recommendation

**Date:** 2026-06-15  
**Based on:** 8 remaining failures (4 EMPTY + 4 WEAK) on 33-row VL corpus

---

## Options

### Option A — Tiny targeted rules (RECOMMENDED)

| Item | Detail |
|------|--------|
| **Scope** | Add tokens: `simonetta`, `caputo`, `toschi`, `baladin`, `de cecco` (phrase). Strip `pet`, `*N` debris. Fused token fix `gnocchi25kg`. Shorthand `MOZZA`→`Mozzarella`. Non-food blocklist: `recargo`. Beverage: strip `S.PELLEGRINO` pack to suggest `Água` / brand handling. |
| **Effort** | **3–5 days** |
| **Expected gain** | **+3 to +5 usable** → **85–91%** (28–30/33) |
| **Risk** | Low — extends Phase 2 pattern |

### Option B — Small ontology seed (5–10 rules)

| Item | Detail |
|------|--------|
| **Scope** | Option A + category templates: `brand - product` → `product`; pasta shape extraction; `s/Sal` → `sem sal` (Manteiga already ACCEPTABLE) |
| **Effort** | **1–2 weeks** |
| **Expected gain** | **+4 to +6 usable** → **88–94%** |
| **Risk** | Medium — wrong template on edge cases |

### Option C — Broader ontology framework

| Item | Detail |
|------|--------|
| **Scope** | Full category taxonomy, matcher integration, confidence tiers |
| **Effort** | **3–5 weeks** |
| **Expected gain** | Diminishing returns on 33-row corpus |
| **Risk** | Medium–high |
| **Verdict** | **Not justified** by remaining 8 rows |

---

## What Phase 3 does NOT need (yet)

- Full herb/produce ontology (cleared in Phase 1)
- Bidfood noise tokens (cleared in Phase 2)
- Matcher / `ingredient-identity.ts` sync
- Pack variant schema
- LLM generation

---

## Recommended scope: **Option A + minimal Option B**

Hybrid smallest path:

1. **Normalization batch** — simonetta, caputo, toschi, baladin, pet, expet strip
2. **3 ontology seeds** — `MOZZA`→Mozzarella; `Brand - Product` dash split for Emporio; beverage pack parenthetical
3. **Eligibility** — exclude `recargo` from Review & Create

Skip: full taxonomy, `sem sal` transform (Manteiga already ACCEPTABLE at `s/sal`).

---

## 85% gate math

| Target | Rows needed | Path |
|--------|-------------|------|
| 85% = 28/33 | +3 from 25 | Fix 3 WEAK (Simonetta/Caputo/Toschi brands) |
| 90% = 30/33 | +5 | Above + De Cecco + ACQUA or Baladin |
| 100% | +8 | Includes Recargo exclusion (not canonical fix) |

**Smallest change to 85%:** Add **simonetta**, **caputo**, **toschi** to noise tokens + strip `*2`/`pet` → flips 3–4 WEAK to ACCEPTABLE.
