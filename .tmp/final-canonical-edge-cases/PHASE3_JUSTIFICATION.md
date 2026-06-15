# Phase 3 Justification

**Date:** 2026-06-15  
**Principle:** Optimize catalog quality, not score.

---

## Would removing brands improve or harm the catalog?

| Row | Strip brands? | Effect |
|-----|---------------|--------|
| Rulo + Simonetta | Yes | **Improves** — cleaner cheese identity |
| Farina + Caputo | Yes | **Improves** — flour type preserved |
| MOZZA + Simonetta | Yes (keep fior di latte, julienne) | **Improves** — reduces contamination risk |
| Aceto + Toschi | Yes (keep IGP) | **Improves** — IGP is meaningful discriminator |
| De Cecco Paccheri | Yes (keep paccheri lisci) | **Improves** — shape is kitchen identity |
| Baladin Ginger Beer | Yes (strip prefix) | **Neutral/improves** unless multi-brand bar |
| ACQUA S.PELLEGRINO | **No — normalize, don't strip** | **Would harm** if reduced to generic `Água` |
| Recargo | N/A | Exclude from workflow |

---

## Acqua: Água vs Água San Pellegrino?

**Recommendation: `Água San Pellegrino 75cl`** — not generic `Água mineral`.

Reasoning:
- PT foodservice treats mineral water brands as substitution boundaries.
- Generic `Água` collapses Pellegrino, Luso, Pedras into one catalog row — breaks costing where multiple waters are stocked.
- Pack `(CX 75CL*15)` belongs in purchase layer; `75cl` serving format is legitimately kept.
- Emporio sibling row is already ACCEPTABLE with brand — Bocconcino format should converge to same identity.

---

## Per-row Phase 3 justification

| Row | Justified? | Mechanism |
|-----|------------|-----------|
| 4 WEAK | **Yes** | Extend Phase 2 token pattern — zero identity loss |
| De Cecco | **Yes** | Small `Brand - Product` seed rule |
| Baladin | **Yes** | Same dash-prefix template |
| ACQUA | **Yes** | Beverage shorthand normalization — **keep brand** |
| Recargo | **Yes (eligibility)** | Workflow blocklist, not canonical |
| MOZZA shorthand | **Yes** | Operational expansion with fior di latte protection |

---

## What Phase 3 should NOT do

- Strip San Pellegrino to generic água (quality harm)
- Collapse MOZZA fior di latte to generic Mozzarella (contamination)
- Build full culinary ontology for 8 edge rows
- Sync rules into matcher pipeline
