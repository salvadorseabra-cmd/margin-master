# Example Transformations

**Investigation date:** 2026-06-15  
**Type:** Design reference — read-only  
**Source:** Validation Lab extracts + prior audit live execution

---

## Transformation table

| Invoice (VL) | Current suggestion | Ideal canonical | Confidence | Reasoning |
|--------------|-------------------|-----------------|------------|-----------|
| Tomilho | *(empty)* | **Tomilho** | HIGH | Already perfect; pre-fill, do not null |
| Manjericão | *(empty)* | **Manjericão** | HIGH | Pass-through herb |
| Hortelã | *(empty)* | **Hortelã** | HIGH | Pass-through herb |
| Alho Francês | *(empty)* | **Alho francês** | HIGH | Title case only; culinary identity complete |
| Courgettes | *(empty)* | **Courgette** | HIGH | Pick one PT convention; not a separate product from curgete |
| Abóbora Butternut | *(empty)* | **Abóbora butternut** | HIGH | Variety is culinary identity |
| Pêra Abacate Hasse | *(empty)* | **Pêra abacate** | MEDIUM | Strip brand Hasse; keep variety abacate |
| Manteiga Coimbra s/Sal EMB 1 Kg | Manteiga coimbra s/sal emb | **Manteiga sem sal** | MEDIUM | Strip Coimbra/EMB/1 Kg; expand s/Sal → sem sal |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | Ovo moreno classe M dúzias cartão | **Ovo classe M** | MEDIUM | Strip MORENO/cartão/dúzias/Cx; keep grade if kitchen tracks |
| Salada Ibérica FSTK EMB. 250g | *(empty after guard)* | **Salada ibérica** | MEDIUM | Keep mix name; strip FSTK/EMB/250g |
| Mozzarella Fior di Latte 2Kg | Mozzarella fior di latte | **Mozzarella fior di latte** | HIGH | Type is identity; 2Kg → purchase layer only |
| Arroz Agulha Metro Chef 12x1kg | Arroz agulha metro cheddar 12g x *(corrupt)* | **Arroz agulha** | MEDIUM | Strip Metro Chef; pack to purchase; fix tokenization separately |

---

## Detailed traces

### Tomilho (EMPTY → Tomilho)

- **Category:** Fresh herb
- **Attributes stripped:** none
- **Attributes kept:** Tomilho
- **Why empty today:** Alias guard nulls title-case-only cleanup
- **Target UX:** Badge "Invoice name is catalog-ready"; pre-fill confirmed field

### Manteiga Coimbra s/Sal EMB 1 Kg (WEAK → Manteiga sem sal)

- **Category:** Dairy — butter
- **Attributes stripped:** Coimbra (brand), EMB (pack code), 1 Kg (bulk weight)
- **Attributes kept:** sem sal (form — unsalted)
- **Transform:** s/Sal → sem sal (ontology rule)
- **Purchase layer:** 1 kg, €8.90 from invoice

### Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) (WEAK → Ovo classe M)

- **Category:** Eggs
- **Attributes stripped:** MORENO (brand), Cx.15 (pack count), dúzias (channel), cartão (channel)
- **Attributes kept:** classe M (grade — SOMETIMES per kitchen policy)
- **Alternative if kitchen does not track grade:** Ovo (Option A within category)
- **Purchase layer:** 1 cx, €38.44

### Salada Ibérica FSTK EMB. 250g (EMPTY → Salada ibérica)

- **Category:** Fresh produce — prepared salad
- **Attributes stripped:** FSTK (supplier code), EMB (pack code), 250g (pack weight)
- **Attributes kept:** ibérica (mix variety)
- **Why empty today:** Intermediate suggestion folds to same normalized key as invoice

### Mozzarella Fior di Latte 2Kg (ACCEPTABLE — keep)

- **Category:** Dairy — cheese
- **Attributes stripped:** 2Kg → purchase only
- **Attributes kept:** fior di latte (product type — prevents collapse with generic Mozzarella)
- **Contamination note:** Identity expansion simulation flags this family; do not fold to generic Mozzarella

### Arroz Agulha Metro Chef 12x1kg (WEAK/corrupt → Arroz agulha)

- **Category:** Dry goods — rice
- **Attributes stripped:** Metro Chef (brand), 12x1kg (pack)
- **Attributes kept:** agulha (rice grade — meaningful culinary distinction)
- **Note:** Current system corrupts tokenization (metro cheddar, 12g x) — normalization bug separate from design

---

## Confidence tier definitions (for future UX)

| Tier | Meaning | Bulk action |
|------|---------|-------------|
| **HIGH** | Ontology pass-through or clean strip; safe one-click accept | Auto-select in bulk Review & Create |
| **MEDIUM** | Category rule applied; quick human review recommended | Pre-fill, show reasoning |
| **LOW** | Multi-brand cured meats, ambiguous variety; needs human decision | Flag with warning; do not auto-select |

---

## Rows requiring human judgment even with ontology

- Emporio Rovagnati cured meat lines (brand + cut + weight range)
- Guanciale with supplier suffix (Sorrentino)
- Whether Ovo classe M vs generic Ovo for a given kitchen

Design should support **suggested + reasoning + easy edit**, not 100% automation.
