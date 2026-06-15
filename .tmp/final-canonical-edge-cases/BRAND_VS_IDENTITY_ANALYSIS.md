# Brand vs Identity Analysis

**Date:** 2026-06-15

---

## Classification framework

| Type | Example | Canonical action |
|------|---------|------------------|
| Pure noise | Metro Chef, Simonetta, Coimbra | REMOVE |
| Product-defining | Coca-Cola, San Pellegrino, DOP/IGP | KEEP |
| Context-dependent | De Cecco, Caputo, Baladin, Toschi | REMOVE from name; optional brand tag |

---

## Per-brand verdict

| Brand | Verdict | Reasoning |
|-------|---------|-----------|
| **Simonetta** | **REMOVE** | Mammafiore distributor suffix. Zero kitchen differentiation. Same pattern as Phase 2 Coimbra/MORENO fixes. |
| **Caputo** | **DEPENDS → REMOVE on Mammafiore** | Respected mill brand, but here is trailing token on generic flour description. Canonical = flour type; brand in alias if needed. |
| **Toschi** | **REMOVE** | Vinegar line identified by `Aceto balsamico di Modena IGP`. IGP is culinary discriminator. |
| **De Cecco** | **DEPENDS → REMOVE prefix** | Product-defining in procurement, but canonical should be `Paccheri lisci`. Brand tracking via alias/pack variant, not canonical pollution. |
| **Baladin** | **DEPENDS → REMOVE prefix** | Craft beer brand matters only if multiple ginger beers stocked. Default: `Ginger beer`; brand in alias. |
| **S. Pellegrino / San Pellegrino** | **KEEP** | Brand is the product in PT foodservice. Kitchens order Pellegrino vs Luso vs Pedras — not generic "água". |
| **Recargo** | N/A | Not a brand — non-food line. |

---

## Decision rules

1. **REMOVE** when brand appears as distributor suffix on commodity product (Simonetta, Toschi on Mammafiore).
2. **KEEP** when brand is substitution boundary for kitchen ordering (San Pellegrino).
3. **DEPENDS** when brand can matter for procurement but canonical layer should hold culinary noun (De Cecco, Caputo, Baladin) — default strip, route brand to alias layer per Hybrid D design.

---

## Not safe to strip

- San Pellegrino (would harm catalog — collapses distinct waters)
- IGP / DOP designations
- `fior di latte`, `julienne`, pasta shapes
