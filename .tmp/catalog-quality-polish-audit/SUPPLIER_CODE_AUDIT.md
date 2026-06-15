# Supplier Code Audit

**Date:** 2026-06-15

---

## Occurrences

| Code/fragment | Rows | Supplier | In suggestion? |
|---------------|-----:|----------|----------------|
| **HC** (+ `4,3`) | 1 | Emporio | Yes |
| **PNA** | 1 | Mammafiore | Yes |
| **Nr. 125** | 1 invoice | Emporio | **Stripped** (handled) |
| **l1** (grade) | 1 | Aviludo | Yes (`alconfirsta l1`) |
| **Assaporami** | 1 | Emporio | Yes (marketing line) |
| **formaggi / linea castello** | 1 | Emporio | Yes |

---

## Supplier concentration

- HC / wheel / brand-dash: **100% Emporio Italia**
- PNA: **Mammafiore only**
- Not generalizable beyond Italian `Brand - Product` template

---

## Examples

- `Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG` → HC 4,3 retained
- `Birra Peroni Nastro Azzurro PNA 33cl*24` → PNA retained
- `De Cecco - Paccheri Lisci Nr. 125` → Nr. 125 correctly stripped
