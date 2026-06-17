# Purchase Unit Corruption — Final Verdict

## One-line summary

Corruption is **systemic in specific parser/pricing patterns**, not isolated DB noise. Two failure families: **(1) decimal-cl misparse** (Ginger Beer) and **(2) reverse pack grammar + case-price ÷ bottle-ml** (San Pellegrino). Confirmed multipacks (Arroz, Pantagruel, Nata, Gorgonzola) parse correctly.

## Root cause categories

| Cat | Finding | Confidence | Key location |
|-----|---------|------------|--------------|
| **A** OCR | Faithful bad source (`0.20cl`); qty/unit swap on some Emporio lines | Medium–High | extract-invoice |
| **B** Packaging parser | No `SIZE x Nud`; `*24` tail ignored; decimal-cl bare_measure | **High** | `parsePurchaseStructureFromText` |
| **C** Unit conversion | `0.20cl` → 0.2×10 = 2 ml | **High** | `detectVolume` |
| **D** Canonicalization | Display-only — not costing bug | Low | display name |
| **E** Operational pricing | Case € ÷ bottle ml (750) not ÷ 15 bottles | **High** | `recipeOperationalCostFieldsFromInvoiceLine` |
| **F** UI presentation | pq=750 inferred as `un` | Medium–High | `inferIngredientCostBaseUnit` |

## Blast radius

| Feature | Affected? |
|---------|-----------|
| Operational Cost panel | **Yes** |
| `current_price` / `ingredients` on confirm | **Yes** |
| `ingredient_price_history` | **Yes** |
| Best Buy / Highest Paid | **Partial** (comparable unit economics) |
| Recipe costing / gross margin | **Yes** |
| Unmatched invoice preview | **Yes** |

**Not UI-only** — bad `purchase_quantity` persists on confirm.

## Recommended fix direction (describe only)

1. Decimal-cl guard for beverage tokens (`0.XXcl`)
2. Reverse pack tier: `75cl x 15ud`, add `ud` to inner-unit tokens
3. Case beverage pricing: divide case € by bottle count, not ml scalar
4. UI base-unit: never infer `un` when unit is `ml`
5. Emporio confirm gate on integer qty + row unit g/ml without structure validation
6. Regression pack: Ginger Beer, San Pellegrino, Peroni, Paccheri + Arroz/Nata controls

## Related investigations

- [Ginger beer parsing](f7a30e64-25df-420b-a436-844d4923a409) — decimal-cl → 2 ml
- [Purchase unit corruption audit](89601376-9953-4ae0-96e9-ca028a5253df) — systemic classification
- `.tmp/ginger-beer-audit/` — detailed Ginger Beer traces
