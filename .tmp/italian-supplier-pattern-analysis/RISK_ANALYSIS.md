# Risk Analysis — Italian Supplier Automation

**Date:** 2026-06-15

---

## Per-automation risk classification

| Automation | Identity loss | Matching harm | Invoice reconciliation | Recipe clarity | Overall |
|------------|---------------|---------------|------------------------|----------------|---------|
| **Rule Set A** (Rovagnati/Rigamonti/Arrigoni) | LOW — brand→alias | LOW | LOW | **Improves** | **LOW** |
| **Rule Set B** (wheel fractions) | LOW | LOW | LOW | **Improves** | **LOW** |
| **Rule Set C** (HC, PNA, Assaporami) | LOW | LOW | LOW | **Improves** | **LOW** |
| Arrigoni Castello strip | MED — multi-SKU | MED | LOW | Neutral | **MEDIUM** |
| Mancini strip | MED — if multi-brand paccheri | MED | LOW | Neutral | **MEDIUM** |
| San Pellegrino brand strip | **HIGH** | HIGH | — | Bad | **DO NOT** |

---

## Safe to automate

- Rovagnati, Rigamonti, Arrigoni Formaggi prefix removal
- Wheel fractions 1/2, 1/8
- HC codes, Assaporami marketing line
- Pellegrino pack debris (15ud) — **keep brand**
- Peroni PNA strip — **keep brand + line**

---

## Defer to manual review

- Arrigoni `Linea Castello` (OCR varies; multi-SKU context)
- Mancini (only strip if single paccheri brand)
- Guanciale casing artifacts
- Farina `do` OCR typo

---

## Critical guardrails

1. **Never strip** San Pellegrino or Peroni from beverage canonicals.
2. **Never collapse** fior di latte to generic Mozzarella.
3. **Preserve** DOP/IGP designations.
4. Brand stripped from charcuterie → route to alias layer, not deleted.
