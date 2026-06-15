# Canonical Identity Principles

**Investigation date:** 2026-06-15  
**Type:** Design & architecture — read-only, no implementation  
**Builds on:** `.tmp/canonical-ingredient-identity-audit/`

---

## What is a Canonical Ingredient in Marginly?

A **Canonical Ingredient** is the restaurant's stable catalog identity for a purchasable food product. It is the anchor that connects supplier invoices, kitchen operations, and financial margin.

It answers: **"What is this in my kitchen?"** — not **"How did this supplier label it on the invoice?"**

---

## Domains served

| Domain | Role of canonical | Code evidence |
|--------|-------------------|---------------|
| **Invoice matching** | Match pipeline compares invoice lines to `ingredients.name` / `normalized_name` via token families, forms, semantic similarity | `findCanonicalIngredientMatch` — `src/lib/ingredient-canonical.ts` |
| **Alias memory** | Invoice wording stored separately when it differs from catalog display | `recordInvoiceLineAliasMemory` — `src/lib/ingredient-match-alias-memory.ts` |
| **Purchasing** | `purchase_quantity`, `purchase_unit`, `current_price` derived from invoice lines | `buildIngredientInsertPayload` — `src/lib/ingredient-auto-persist.ts` |
| **Recipe costing** | Recipes reference canonical ingredients; prep recipes consume them as sub-components | `src/routes/recipes.tsx`, prep recipe logic in `src/lib/recipe-selling-price.ts` |
| **Historical pricing** | Price history keyed to canonical ingredient ID | Auto-persist / price history pipeline |
| **Supplier intelligence** | Supplier-specific shorthand expands via operational aliases, not catalog names | `ingredient-operational-aliases.ts`, `normalizeSupplierShorthand` |

---

## What a canonical is NOT

| Layer | Example | Belongs to |
|-------|---------|------------|
| Raw invoice text | `Manteiga Coimbra s/Sal EMB 1 Kg` | Invoice line + alias memory |
| Matcher identity | family/form/core tokens | `canonicalizeIngredientIdentity()` — `src/lib/ingredient-identity.ts` |
| Pack descriptor | 1 Kg, Cx.15, 12x1kg | Purchase fields — `src/lib/invoice-purchase-format.ts` |
| Supplier SKU | FSTK, EMB, Nr. 125 | Always remove from catalog name |

---

## Three-layer invariant (already implicit in codebase)

```
1. Raw invoice text     — never mutated for matching keys
2. Matcher identity     — family, form, normalizedCore (ingredient-identity.ts)
3. Catalog display      — name + normalized_name (canonical-ingredient-display-name.ts)
```

**Design principle:** Canonical = layer 3. Layers 1–2 serve matching; layer 3 serves human catalog quality and recipe picker UX.

---

## Problems the canonical layer must solve

1. **Deduplication** — one "Tomilho", not three variants from casing or supplier wording
2. **Cross-supplier equivalence** — Bidfood butter and a future supplier's unsalted butter map to the same catalog row
3. **Operational costing** — recipe margin depends on stable ingredient ID for price history
4. **Contamination prevention** — identity expansion simulation shows Mozzarella fior di latte / Pepino conserva collapse risk when matching improves without pack-variant architecture (`.tmp/identity-expansion-simulation/REPORT.md`)
5. **Review & Create efficiency** — today only **27.3%** usable suggestions on unmatched Validation Lab rows (prior audit)

---

## Guiding principles

1. **Human-readable first** — picker and recipe UI show natural Portuguese culinary names
2. **Supplier-independent by default** — brands and channels are aliases, not catalog identity
3. **Culinary meaning preserved** — variety and form matter when they change kitchen use (fior di latte vs generic mozzarella; butternut vs generic squash)
4. **Deterministic generation** — extend deterministic layers; do not replace with opaque models without losing testability
5. **Separation of concerns** — pack size, grade, and brand belong in purchase/attribute layers unless they define a distinct kitchen product

---

## Primary purpose statement

> A Canonical Ingredient in Marginly is the **stable culinary-operational product identity** that enables matching across suppliers, accurate recipe costing (including prep recipes), reliable historical pricing, and high-quality catalog management — independent of how any single supplier labels or packs the product.
