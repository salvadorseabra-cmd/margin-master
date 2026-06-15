# Purchase Unit Classification — VL (51 items)

**Mode:** Read-only · **VL:** `bjhnlrgodcqoyzddbpbd` · **Queried:** 2026-06-15 (live)  
**Scope:** All invoice items across 6 VL invoices (Bidfood 11, Aviludo April 9, Aviludo May 8, Bocconcino 7, Emporio 8, Mammafiore 8)

---

## Classification summary

| Class | Count | Definition used |
|---|---:|---|
| **WEIGHTED** | 16 | `kg`/`g`/`l`/`ml` rows or `weight_or_volume` kind |
| **COUNTABLE** | 19 | `un` rows or `unit_count` kind |
| **MULTIPACK** | 11 | `NxM` in name or `multi_unit_pack` kind |
| **CASE** | 3 | `cx`/case row unit or embedded `CX` in name |
| **OTHER** | 2 | `mo` (manjericão/tomilho bunch) |

**Logic:** `resolveInvoiceLinePurchaseFormat` + `recipeOperationalCostFieldsFromInvoiceLine` replay on live VL data.

---

## Full classification table (51 items)

| Invoice | Product | Qty | Unit | Classification |
|---|---|---:|---|---|
| Aviludo April | Arroz Agulha Metro Chef 12x1kg | 1 | cx | MULTIPACK |
| Aviludo April | Atum Óleo Bolsa Nau Catrineta 1 Kg | 2 | un | COUNTABLE |
| Aviludo April | Açúcar Branco Metro Chef 10x1Kg | 1 | cx | MULTIPACK |
| Aviludo April | Chocolate Pantagruel 10x200g | 2 | cx | MULTIPACK |
| Aviludo April | Filete de Anchovas Alconfrista Lt 495 g | 2 | un | COUNTABLE |
| Aviludo April | Mozzarella Flor di Latte 2Kg | 1 | un | COUNTABLE |
| Aviludo April | Nata Reny Picot 22% 6x1L | 5 | cx | MULTIPACK |
| Aviludo April | Ovo Líquido Past.Gema Dovo 1kg | 6 | un | COUNTABLE |
| Aviludo April | Pepinos Extra II Frasco 6X720g | 1 | cx | MULTIPACK |
| Aviludo May | Arroz Agulha Metro Chef 12x1 kg | 1 | cx | MULTIPACK |
| Aviludo May | Atum Oleo Bolsa Nau Catrineta 1 Kg | 1 | un | COUNTABLE |
| Aviludo May | Açucar Branco METRO Chef 10x1 Kg | 1 | cx | MULTIPACK |
| Aviludo May | Chocolate Culinaria Pantagruel 10x200 g | 2 | cx | MULTIPACK |
| Aviludo May | Filete de Anchoas Alconfirosa LI 495 g | 2 | un | COUNTABLE |
| Aviludo May | Nata Culinaria 22% Reny Picot 6x1 Lt | 5 | cx | MULTIPACK |
| Aviludo May | Ovo Líquido Past.Gema Dovo 1 Kg | 6 | un | COUNTABLE |
| Aviludo May | Pepinos Extra Uli Frasco 6x720 g | 1 | cx | MULTIPACK |
| Bidfood | Abóbora Butternut | 5.64 | kg | WEIGHTED |
| Bidfood | Alho Francês | 5.42 | kg | WEIGHTED |
| Bidfood | Courgettes | 3.3 | kg | WEIGHTED |
| Bidfood | Hortelã | 0.5 | kg | WEIGHTED |
| Bidfood | Manjericão | 5 | mo | OTHER |
| Bidfood | Manteiga Coimbra s/Sal EMB 1 Kg | 8 | kg | WEIGHTED |
| Bidfood | Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | 1 | cx | CASE |
| Bidfood | Pepino | 3.36 | kg | WEIGHTED |
| Bidfood | Pêra Abacate Hasse | 3.28 | kg | WEIGHTED |
| Bidfood | Salada Ibérica FSTK EMB. 250g | 4 | em | WEIGHTED |
| Bidfood | Tomilho | 1 | mo | OTHER |
| Bocconcino | ACQUA S.PELLEGRINO (CX 75CL*15) | 2 | un | CASE |
| Bocconcino | MEZZI PACCHERI MANCINI (CX 1KG*6) | 2 | un | CASE |
| Bocconcino | MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8 | 10 | un | COUNTABLE |
| Bocconcino | POMODORI PELATI (CX 2,5KG*6) | 1 | un | MULTIPACK |
| Bocconcino | RICOTTA TREVIGIANA 1,5KG | 2 | un | COUNTABLE |
| Bocconcino | ROLO DE CABRA E VACA 1KG | 1 | un | COUNTABLE |
| Bocconcino | STRACCIATELLA 250 GR | 24 | un | COUNTABLE |
| Emporio live | Arrigoni Formaggi - Gorgonzola DOP Dolce… | 2 | g | WEIGHTED |
| Emporio live | Baladin - Ginger Beer 0.20cl | 24 | ml | WEIGHTED |
| Emporio live | De Cecco - Paccheri Lisci Nr. 125 - 500g | 24 | g | WEIGHTED |
| Emporio live | Rigamonti - Bresaola Punta d'Anca Oro 1/2… | 1.83 | g | WEIGHTED |
| Emporio live | Rovagnati - Assaporami Prosciutto Cotto… | 4.3 | g | WEIGHTED |
| Emporio live | Rovagnati - Mortadella IGP 'Massima'… | 3.11 | g | WEIGHTED |
| Emporio live | Rovagnati - Salame Ventricina 2,5 Kg | 2.6 | g | WEIGHTED |
| Emporio live | SanPellegrino - Acqua in vitro 75cl x 15ud | 2 | ml | WEIGHTED |
| Mammafiore | Aceto balsamico di modena IGP pet 5l*2 Toschi | 1 | un | COUNTABLE |
| Mammafiore | Birra Peroni Nastro Azzurro PNA 33cl*24… | 24 | un | COUNTABLE |
| Mammafiore | Farina do pasta fresca e gnocchi25kg Caputo | 1 | un | COUNTABLE |
| Mammafiore | Farine Speciale pizza 25kg Amoruso | 1 | un | COUNTABLE |
| Mammafiore | Guanciale di suino stagionato +/- 1,5kg*7… | 5.996 | un | COUNTABLE |
| Mammafiore | MOZZA Fior di Latte Expet Julienne 3kg… | 10 | un | COUNTABLE |
| Mammafiore | Recargo por combustibili | 1 | un | COUNTABLE |
| Mammafiore | Rulo Di Capra 1kg*2 Simonetta | 1 | un | COUNTABLE |

---

## Invoice IDs

| Label | Invoice ID |
|---|---|
| Bidfood | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| Aviludo April | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| Aviludo May | `3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2` |
| Bocconcino | `f0aa5a08-86a3-4938-99f0-711e86073968` |
| Emporio live | `ab52796d-de1d-418d-86e7-230c8f056f09` |
| Mammafiore | `36c99d19-6f9f-413f-8c2d-ae3526291a2d` |
