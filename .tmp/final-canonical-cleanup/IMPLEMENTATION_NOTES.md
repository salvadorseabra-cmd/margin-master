# Implementation Notes — Final Canonical Cleanup

**Date:** 2026-06-15

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/canonical-ingredient-display-name.ts` | Noise tokens, brand-prefix strip, beverage shorthand, fused weights, SKU/pack regex |
| `src/lib/ingredient-operational-aliases.ts` | `mozza` → `mozzarella` |
| `src/lib/canonical-ingredient-create.ts` | `isNonFoodInvoiceLine`, recargo exclusion |
| `src/lib/bulk-canonical-ingredient-create.ts` | Filter recargo from bulk create eligibility |
| `src/lib/canonical-ingredient-display-name.test.ts` | Final cleanup display tests |
| `src/lib/canonical-ingredient-create.test.ts` | Integration + recargo exclusion tests |
| `src/lib/canonical-ingredient-operational-name.test.ts` | MOZZA expansion test |

---

## Rules added

### Distributor / brand noise (strip trailing tokens)

**Tokens:** `simonetta`, `caputo`, `toschi`, `pet`, `expet`, `nr`

**Patterns:**
- `*N` multipack debris on kg/l volumes (`5l*2`, `1kg*2`) via `MULTIPACK_STAR_RE`
- Standalone `*N` tokens (e.g. `*2`)
- Fused OCR weights (`gnocchi25kg` → split then strip weight)
- Pasta SKU fragments (`Nr. 125`) via `PASTA_SKU_NR_RE`
- Trailing dash-pack weights (`- 500g`) via `DASH_PACK_WEIGHT_RE`
- Sub-10cl OCR serving noise (e.g. `0.20cl` on Baladin) — serving format kept only when ≥10cl

### Shorthand

- `MOZZA` → `Mozzarella` in `OPERATIONAL_ALIASES`
- `fior di latte`, `julienne` preserved (not collapsed to generic Mozzarella)

### Invoice brand-prefix strip (commodity only)

- `De Cecco - Product` → `Product`
- `Baladin - Product` → `Product`
- Rovagnati / Rigamonti / Arrigoni lines **not** stripped (brand-defining cured meats)

### Beverage — keep brand

- `S.PELLEGRINO` / `SanPellegrino` → `san pellegrino`
- `ACQUA` + Pellegrino → `água san pellegrino`
- `(CX 75CL*15)` → extract `75cl`, strip case count
- `33cl*24` → keep `33cl`, strip `*24`

### Non-food exclusion

- `isNonFoodInvoiceLine`: `/\brecarg[ao]\b.*\bcombustib/i`
- Used in `buildCanonicalIngredientCreateDefaults`, `validateCanonicalIngredientName`, `isCatalogReadyInvoiceName`, bulk create eligibility

### Cleanup order fix

- Brand/pack preprocessing runs **before** operational gram preservation (prevents `500g` pack weights being stashed as identity)

---

## Validated edge-case outputs

| Invoice | Output |
|---------|--------|
| Rulo Di Capra 1kg*2 Simonetta | Rulo di capra |
| Farina do pasta fresca e gnocchi25kg Caputo | Farina do pasta fresca e gnocchi |
| MOZZA Fior di Latte Expet Julienne 3kg Simonetta | Mozzarella fior di latte julienne |
| Aceto balsamico di modena IGP pet 5l*2 Toschi | Aceto balsamico di modena IGP |
| De Cecco - Paccheri Lisci Nr. 125 - 500g | Paccheri lisci |
| Baladin - Ginger Beer 0.20cl | Ginger beer |
| ACQUA S.PELLEGRINO (CX 75CL*15) | Água san pellegrino 75cl |
| Recargo por combustibili | *(excluded — no suggestion)* |

---

## Scope boundaries

- No schema / migration / matcher / pricing / purchase-unit changes
- No broad ontology — seed rules only for the 8 audited edge cases
- No changes to Rovagnati-style brand-retaining cured-meat lines
