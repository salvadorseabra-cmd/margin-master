# Final Recommendation — Catalog Quality Polish Audit

**Date:** 2026-06-15

---

## Top catalog-quality problems remaining

1. Emporio charcuterie/cheese lines retain **brand + purchase debris** (no strip rules like De Cecco/Baladin)
2. **Wheel fractions and supplier codes** survive cleanup
3. **Beverage path inconsistency** — Bocconcino Pellegrino OK; Emporio retains 15ud/OCR; Peroni has duplicate + PNA

---

## How many items affected

- **15/32 food rows** with polish debris in suggestions
- **8–10 rows** benefit from scoped automation
- **3 WEAK** rows today (Gorgonzola, Peroni, Anchovas)

---

## What to implement next

| Phase 4 (~2–3 days) | Leave alone |
|---------------------|-------------|
| Charcuterie brand prefix strip | Stracciatella 250gr (kitchen practice) |
| Wheel fraction strip | Mancini (multi-SKU dependent) |
| HC, Assaporami, PNA, 15ud strip | Farina `do`→`da` (speculative OCR) |
| Peroni duplicate token removal | Full Italian ontology (~2+ weeks) |
| San Pellegrino title case + Emporio pack cleanup | Score-chasing at current volume |

---

## Verdict

### **MANUAL_REVIEW_SUFFICIENT** for launch

Review & Create is operational at 87.9%. Remaining issues are **catalog browse quality**, not pipeline failures. Manual edit of ~8–10 suggestions is feasible at current volume.

### **Optional Phase 4** when Italian invoice volume grows

Narrow deterministic strip lists — same family as Phase 2/3. No matching/pricing/schema changes. Prioritize catalog quality over score; do not strip San Pellegrino/Peroni or collapse fior di latte.

---

## Objective

Build a catalog that remains clean and understandable after thousands of ingredients — not just Validation Lab success. Polish automation pays off when supplier volume justifies ~2–3 days of work; until then, manual review at create time is sufficient.
