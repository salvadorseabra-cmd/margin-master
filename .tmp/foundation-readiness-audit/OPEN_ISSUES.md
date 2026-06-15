# Open Issues — Foundation Readiness Audit

**Date:** 2026-06-15  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Audit scope:** 9 ingredients post Phase 4A/4B/4C

---

## Issue Summary

| Severity | Count | Blocks recipes? |
|---|---|---|
| P1 — Blocker | 1 | **Yes** |
| P2 — Systemic | 1 | Latent (future contamination risk) |
| P3 — Cosmetic / Latent | 2 | No |

---

## P1 — Blocker

### Suggested-match history without confirm (Nata culinária)

| Field | Detail |
|---|---|
| **Ingredient** | Nata culinária (`3d1af48c-be3c-494a-9e0f-be267fc9388b`) |
| **History row** | `14330aad` |
| **Invoice** | `3b4cb21f` (May 2026) |
| **Match status** | `suggested` — never confirmed |
| **Symptom** | Catalog op **3.048** vs latest history op **3.148** |
| **Class** | Active contamination — same pattern as pre-4A Mozzarella poison row |

**Recommended action (choose one):**

1. Delete orphan history row `14330aad`, or
2. Confirm the May Nata match and refresh catalog to 18.89 (op 3.148)

Until resolved, Nata is **not foundation-ready** and blocks recipe work.

---

## P2 — Systemic

### Backfill still allows suggested matches to write history

| Field | Detail |
|---|---|
| **Scope** | Code path — `ingredient-auto-persist` / backfill pipeline |
| **Risk** | Unconfirmed suggested matches can still create `ingredient_price_history` rows |
| **Evidence** | Nata row `14330aad` survived 4A–4C because it was never in repair scope |
| **Prior callout** | Flagged in Phase 4A and 4C investigation docs; **not yet deployed** |

**Recommended action:** Gate history writes on `match.status === 'confirmed'` before declaring foundation complete.

---

## P3 — Cosmetic

### `ingredient_unit=g` on €/un operational values

| Field | Detail |
|---|---|
| **Ingredients** | Anchoas, Gema líquida, Atum em óleo |
| **Symptom** | History rows stamp `ingredient_unit=g` while stored values are €/un operational |
| **Impact** | Label/display only — math is correct post-4C |
| **Action** | Optional label fix; no pricing impact |

---

## P3 — Latent

### Mozzarella Bocconcino line still `suggested`

| Field | Detail |
|---|---|
| **Ingredient** | Mozzarella fior di latte (`2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`) |
| **Match status** | Bocconcino line remains `suggested` |
| **Impact** | No history row written (safe after 4A poison delete) |
| **Action** | Confirm or reject match when convenient; not blocking |
