# Edge Case Product Analysis

**Date:** 2026-06-15  
**Scope:** 8 remaining failures after Phase 2 (75.8% usable)

---

## WEAK (4)

### Rulo Di Capra 1kg*2 Simonetta

| Field | Value |
|-------|-------|
| Supplier | Mammafiore Portugal |
| Invoice | `Rulo Di Capra 1kg*2 Simonetta` |
| Current suggested | `Rulo di capra *2 simonetta` |
| Desired canonical | `Rulo di capra` |
| Classification | Normalization gap — distributor brand + multipack debris |

**Simonetta:** Distributor noise on Mammafiore lines, not culinary identity. Kitchen stocks goat-cheese roll form, not "Simonetta" as a category.

---

### Farina do pasta fresca e gnocchi25kg Caputo

| Field | Value |
|-------|-------|
| Supplier | Mammafiore Portugal |
| Invoice | `Farina do pasta fresca e gnocchi25kg Caputo` |
| Current suggested | `Farina do pasta fresca e gnocchi caputo` |
| Desired canonical | `Farina pasta fresca e gnocchi` |
| Classification | Normalization gap — brand suffix + fused OCR weight |

**Caputo:** On this invoice, trailing mill/distributor suffix. Flour *type* is identity; Caputo can be product-defining in specialist contexts but here describes generic pasta/gnocchi flour.

---

### MOZZA Fior di Latte Expet Julienne 3kg Simonetta

| Field | Value |
|-------|-------|
| Supplier | Mammafiore Portugal |
| Invoice | `MOZZA Fior di Latte Expet Julienne 3kg Simonetta` |
| Current suggested | `Mozza fior di latte expet julienne simonetta` |
| Desired canonical | `Mozzarella fior di latte julienne` |
| Classification | Normalization + shorthand gap; high identity sensitivity |

**Keep:** `fior di latte`, `julienne`. **Strip:** Simonetta, expet (OCR). **Expand:** MOZZA → Mozzarella. Must not collapse to generic Mozzarella (expansion sim contamination risk).

---

### Aceto balsamico di modena IGP pet 5l*2 Toschi

| Field | Value |
|-------|-------|
| Supplier | Mammafiore Portugal |
| Invoice | `Aceto balsamico di modena IGP pet 5l*2 Toschi` |
| Current suggested | `Aceto balsamico di modena IGP pet *2 toschi` |
| Desired canonical | `Aceto balsamico di Modena IGP` |
| Classification | Normalization gap — brand + pack + multipack |

**Toschi:** Condiment brand suffix — remove. **IGP:** protected product identity. **pet:** pack channel, not identity.

---

## EMPTY (4)

### De Cecco - Paccheri Lisci Nr. 125 - 500g

| Field | Value |
|-------|-------|
| Supplier | Emporio Italia |
| Invoice | `De Cecco - Paccheri Lisci Nr. 125 - 500g` |
| Current suggested | `null` |
| Desired canonical | `Paccheri lisci` |
| Classification | Fixable catalog problem — alias guard after insufficient cleanup |

---

### Baladin - Ginger Beer 0.20cl

| Field | Value |
|-------|-------|
| Supplier | Emporio Italia |
| Invoice | `Baladin - Ginger Beer 0.20cl` |
| Current suggested | `null` |
| Desired canonical | `Ginger beer` |
| Classification | Fixable — brand-prefix strip needed |

---

### ACQUA S.PELLEGRINO (CX 75CL*15)

| Field | Value |
|-------|-------|
| Supplier | IL BOCCONCINO Distribuição ALIMENTAR |
| Invoice | `ACQUA S.PELLEGRINO (CX 75CL*15)` |
| Current suggested | `null` |
| Desired canonical | `Água San Pellegrino 75cl` |
| Classification | Fixable — pack parenthetical + shorthand brand normalization |

Emporio sibling `SanPellegrino - Acqua in vitro 75cl x 15ud` is already ACCEPTABLE with brand retained.

---

### Recargo por combustibili

| Field | Value |
|-------|-------|
| Supplier | Mammafiore Portugal |
| Invoice | `Recargo por combustibili` |
| Current suggested | `null` |
| Desired canonical | **None** — exclude from ingredient catalog |
| Classification | Legitimate exclusion — fuel surcharge, not food |

---

## Simonetta summary

Simonetta is **distributor/supplier-line noise** on Mammafiore (like Coimbra, MORENO, Metro Chef). Not a culinary category. Strip from canonical; preserve on invoice alias.
