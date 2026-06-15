# Attribute Classification Framework

**Investigation date:** 2026-06-15  
**Type:** Design framework — read-only

---

## Purpose

Classify every invoice token or phrase into one of four buckets **before** canonical name generation. This framework defines the target rules for a future normalization + ontology layer.

---

## ALWAYS REMOVE

| Attribute type | Examples | Justification |
|----------------|----------|---------------|
| Supplier codes | FSTK, EMB, HC, L1 | Zero culinary meaning; belongs in alias only |
| Pack/channel | Cx.15, cartão, dúzias, caixa | Purchase layer — `invoice-purchase-format.ts` |
| Bulk weights/volumes | 1 Kg, 2Kg, 12x1kg, 250g on produce/salad | Purchase fields; partially stripped by `BULK_ATTACHED_KG_RE` today |
| SKU fragments | Nr. 125, 1/8, 4,3-4,5KG ranges | Supplier catalog metadata |
| Retailer names | Continente, Auchan | Already in `CATALOG_NOISE_TOKENS` |
| OCR noise | Stray punctuation, corrupted tokens | Pre-normalization cleanup |

---

## SOMETIMES REMOVE (category rules required)

| Attribute | **Keep when** | **Remove when** |
|-----------|---------------|-----------------|
| **Brand** | Product-defining (Fior di Latte style, DOP line) | Distributor brand (Coimbra, MORENO, Hasse, Metro Chef) |
| **Grade/calibre** | Eggs classe M if kitchen tracks; olive oil grade | Generic supplier grade on commodity produce |
| **Variety** | Butternut, Abacate, Ibérica (salad mix) | Marketing adjectives (premium, gourmet) |
| **Origin** | DOP/IGP product identity | Supplier city or farm names |
| **Form** | sem sal, pelati, julienne, ralado | Redundant with separate canonical entry |

**Decision rule:** If removing the attribute would cause two kitchen-different products to collapse into one catalog row, **keep it**. If it only identifies supplier or pack, **remove it**.

---

## ALWAYS KEEP

| Attribute | Examples |
|-----------|----------|
| Core ingredient noun | Manteiga, Ovo, Tomilho, Mozzarella |
| Culinary form affecting use | sem sal, fior di latte, pelati, cherry |
| Protected operational terms | palha, corte fino, angus patty |
| Meaningful variety | butternut, abacate, ibérica (salad) |
| Serving format (beverages) | 33cl, 75cl — preserved by `isServingFormatToken` |

---

## ROUTE TO OTHER LAYERS (not canonical name)

| Attribute | Target layer |
|-----------|--------------|
| Pack count / unit price | `purchase_quantity`, `current_price`, `purchase_unit` |
| Full supplier wording | Invoice alias + `ingredient_aliases` |
| Brand preference | Supplier intelligence / future attribute tags |
| Match overrides | `ingredient-match-override.ts` |
| Pack variant identity | Future `pack_variant_id` on matches |

---

## Failure case mapping

| Invoice | Misclassified today | Correct classification |
|---------|---------------------|------------------------|
| Manteiga Coimbra s/Sal EMB 1 Kg | Coimbra KEEP, EMB KEEP, 1 Kg REMOVE | Coimbra REMOVE, s/Sal KEEP→sem sal, EMB REMOVE, 1 Kg REMOVE |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | MORENO KEEP, M KEEP, cartão KEEP | MORENO REMOVE, M SOMETIMES, cartão/dúzias/Cx REMOVE |
| Salada Ibérica FSTK EMB. 250g | All kept or nulled | Ibérica KEEP, FSTK/EMB/250g REMOVE |
| Mozzarella Fior di Latte 2Kg | fior di latte KEEP, 2Kg should REMOVE | Correct except 2Kg → purchase layer |
| Arroz Agulha Metro Chef 12x1kg | Metro Chef KEEP (wrong) | agulha KEEP, Metro Chef REMOVE, 12x1kg REMOVE |

---

## Framework application order

```
1. Detect category (ontology)
2. Apply ALWAYS REMOVE tokens (normalization)
3. Apply category-specific SOMETIMES REMOVE rules (ontology)
4. Apply ALWAYS KEEP protection (ontology + protected shorthand list)
5. Format display name (title case)
6. Route stripped attributes to purchase/alias layers
```
