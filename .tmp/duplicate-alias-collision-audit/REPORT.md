# Duplicate Alias Collision Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT READ-ONLY

## Verdict: **C) Alias persistence bug**

Two **legitimate distinct products** (fior di latte block vs julienne 3kg bags). One **stale alias row** on the wrong ingredient. **Not safe to merge ingredients.**

**Confidence: 93%**

---

## The collision

| | Stale (wrong) | Correct |
|---|---------------|---------|
| Ingredient | Mozzarella fior di latte | Mozzarella julienne |
| Alias ID | `5ec7b0f7…` | `26ff7bd7…` |
| Key | `Mammafiore::mozzarella fior di latte expet julienne simonetta` | Same |

---

## Root cause

Premature confirm (2026-06-15) before julienne ingredient existed. Review&Create (2026-06-16) added correct alias but did not remove stale row — `upsertConfirmedAlias` dedupes per `ingredient_id` only.

---

## Catalog scan

69 aliases, **1 collision**, **0** other multi-ingredient mappings.

---

## Model D readiness

| Action | Risk |
|--------|------|
| Delete stale alias `5ec7b0f7…` | **SAFE** |
| Merge ingredients | **CRITICAL — do not** |
| Model D deploy | **After one-row cleanup** |

---

## Final answers

1. Actually duplicated? **No** — distinct SKUs
2. Why? **Alias persistence bug**
3. Safe to merge? **No**
4. Recipe risk? **None**
5. Purchase history risk? **None if alias cleanup only**
6. Additional collisions? **0**
7. Model D wait? **Yes — delete stale alias first**
8. Confidence: **93%**

---

## Sequence

1. Delete stale alias from fior di latte
2. Re-run collision scan (expect 0)
3. Proceed with Model D Phase 1
